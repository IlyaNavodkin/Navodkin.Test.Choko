//! Repo-scoped atomic publication with no Git writes or replacement of existing metadata.
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

pub(super) struct StagedFile {
    pub name: String,
    pub bytes: Vec<u8>,
    pub source: Option<std::path::PathBuf>,
}

#[cfg(windows)]
mod security;

pub(super) fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(super) fn read(mut file: File) -> io::Result<Vec<u8>> {
    if !file.metadata()?.is_file() {
        return Err(io::Error::other("not a regular file"));
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(io::Error::other("file too large"));
    }
    Ok(bytes)
}

#[cfg(windows)]
mod platform {
    use super::{File, Path, io, read, revision};
    use std::{
        fs::OpenOptions,
        io::Write,
        os::windows::fs::{MetadataExt, OpenOptionsExt},
        path::{Component, PathBuf},
    };

    // Deny DELETE sharing while holding each ancestor; do not follow reparse points.
    pub(super) fn lock_parent(parent: &Path) -> io::Result<Vec<File>> {
        let mut guards = Vec::new();
        let mut path = PathBuf::new();
        for part in parent.components() {
            path.push(part);
            if matches!(part, Component::Prefix(_)) {
                continue;
            }
            let file = OpenOptions::new()
                .read(true)
                .access_mode(0x80)
                .share_mode(0x1 | 0x2)
                .custom_flags(0x0200_0000 | 0x0020_0000)
                .open(&path)
                .map_err(|error| {
                    io::Error::new(
                        error.kind(),
                        format!("ancestor {}: {error}", path.display()),
                    )
                })?;
            let metadata = file.metadata()?;
            if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 {
                return Err(io::Error::other("unsafe ancestor"));
            }
            guards.push(file);
        }
        Ok(guards)
    }

    pub(super) fn organize(
        path: &Path,
        expected: &str,
        destination: Option<&Path>,
    ) -> io::Result<bool> {
        let _source_guards = lock_parent(
            path.parent()
                .ok_or_else(|| io::Error::other("missing parent"))?,
        )?;
        let _destination_guards = destination
            .map(|target| {
                lock_parent(
                    target
                        .parent()
                        .ok_or_else(|| io::Error::other("missing destination parent"))?,
                )
            })
            .transpose()?;
        let file = OpenOptions::new()
            .read(true)
            .access_mode(0x8001_0000)
            .share_mode(0x1)
            .custom_flags(0x0020_0000)
            .open(path)?;
        let metadata = file.metadata()?;
        if !metadata.is_file()
            || metadata.file_attributes() & 0x400 != 0
            || metadata.permissions().readonly()
        {
            return Err(io::Error::other("unsafe or read-only source"));
        }
        if revision(&read(file.try_clone()?)?) != expected {
            return Ok(false);
        }
        if let Some(destination) = destination {
            super::security::rename(&file, destination)?;
        } else {
            super::security::delete(&file)?;
        }
        Ok(true)
    }

    pub(super) fn create(path: &Path, bytes: &[u8], source: Option<&Path>) -> io::Result<()> {
        let parent = path
            .parent()
            .ok_or_else(|| io::Error::other("missing parent"))?;
        let _guards = lock_parent(parent)?;
        let mut source_guards = Vec::new();
        let original = if let Some(source) = source {
            source_guards = lock_parent(
                source
                    .parent()
                    .ok_or_else(|| io::Error::other("missing source parent"))?,
            )?;
            let file = OpenOptions::new()
                .read(true)
                .custom_flags(0x0020_0000)
                .open(source)?;
            let metadata = file.metadata()?;
            if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 {
                return Err(io::Error::other("unsafe source"));
            }
            Some(file)
        } else {
            None
        };
        let mut temporary = tempfile::Builder::new()
            .prefix(".testoritto-create-")
            .make_in(parent, |name| {
                if let Some(source) = &original {
                    super::security::create_replacement(name, source)
                } else {
                    OpenOptions::new()
                        .read(true)
                        .write(true)
                        .create_new(true)
                        .open(name)
                }
            })?;
        temporary.write_all(bytes)?;
        temporary.as_file().sync_all()?;
        temporary
            .persist_noclobber(path)
            .map_err(|error| error.error)?;
        drop(source_guards);
        Ok(())
    }

    pub(super) fn ensure_directory(path: &Path) -> io::Result<()> {
        let _guards = lock_parent(
            path.parent()
                .ok_or_else(|| io::Error::other("missing parent"))?,
        )?;
        match std::fs::create_dir(path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
        let _directory = lock_parent(path)?;
        Ok(())
    }
    pub(super) fn publish_directory(
        parent: &Path,
        name: &str,
        files: &[super::StagedFile],
        verify: impl FnOnce() -> io::Result<bool>,
    ) -> io::Result<bool> {
        let _parent_guards = lock_parent(parent)?;
        let stage = tempfile::Builder::new()
            .prefix(".testoritto-run-")
            .tempdir_in(parent)?;
        let directory = OpenOptions::new()
            .read(true)
            .access_mode(0x10080)
            .share_mode(0x1 | 0x2)
            .custom_flags(0x0200_0000 | 0x0020_0000)
            .open(stage.path())?;
        for item in files {
            let target = stage.path().join(&item.name);
            let _source_guards = item
                .source
                .as_ref()
                .map(|source| {
                    lock_parent(
                        source
                            .parent()
                            .ok_or_else(|| io::Error::other("missing source parent"))?,
                    )
                })
                .transpose()?;
            let mut file = if let Some(source) = &item.source {
                let source = OpenOptions::new()
                    .read(true)
                    .custom_flags(0x0020_0000)
                    .open(source)?;
                let metadata = source.metadata()?;
                if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 {
                    return Err(io::Error::other("unsafe source"));
                }
                super::security::create_replacement(&target, &source)?
            } else {
                OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&target)?
            };
            file.write_all(&item.bytes)?;
            file.sync_all()?;
        }
        if !verify()? {
            return Ok(false);
        }
        super::security::rename(&directory, &parent.join(name))?;
        let _ = stage.keep();
        Ok(true)
    }

    pub(super) fn initialize(root: &Path, config: &[u8]) -> io::Result<()> {
        let _root_guards = lock_parent(root)?;
        let destination = root.join(".casewright");
        match std::fs::symlink_metadata(&destination) {
            Ok(_) => return Err(io::Error::from(io::ErrorKind::AlreadyExists)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let stage = tempfile::Builder::new()
            .prefix(".testoritto-init-")
            .tempdir_in(root)?;
        {
            let _stage_guards = lock_parent(stage.path())?;
            std::fs::create_dir(stage.path().join("runs"))?;
            let _run_guards = lock_parent(&stage.path().join("runs"))?;
            for (name, bytes) in [
                ("config.yaml", config),
                (
                    ".gitignore",
                    b"# Casewright transient data\ncache/\n".as_slice(),
                ),
                ("runs/.gitkeep", b"".as_slice()),
            ] {
                let mut file = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(stage.path().join(name))?;
                file.write_all(bytes)?;
                file.sync_all()?;
            }
        }
        // Windows refuses replacing an existing directory. The whole structure publishes once.
        let directory = OpenOptions::new()
            .read(true)
            .access_mode(0x10080)
            .share_mode(0x1 | 0x2)
            .custom_flags(0x0200_0000 | 0x0020_0000)
            .open(stage.path())?;
        super::security::rename(&directory, &destination)?;
        let _ = stage.keep();
        Ok(())
    }

    pub(super) fn replace(
        path: &Path,
        expected: &str,
        bytes: &[u8],
        before_publish: impl FnOnce() -> io::Result<()>,
    ) -> io::Result<bool> {
        let parent = path
            .parent()
            .ok_or_else(|| io::Error::other("missing parent"))?;
        let _guards = lock_parent(parent)?;
        let metadata = std::fs::symlink_metadata(path)?;
        if !metadata.is_file()
            || metadata.file_attributes() & 0x400 != 0
            || metadata.permissions().readonly()
        {
            return Err(io::Error::other("unsafe or read-only target"));
        }
        let original = OpenOptions::new().read(true).write(true).open(path)?;
        if revision(&read(original.try_clone()?)?) != expected {
            return Ok(false);
        }
        let mut temporary = tempfile::Builder::new()
            .prefix(".testoritto-save-")
            .make_in(parent, |name| {
                super::security::create_replacement(name, &original)
            })?;
        drop(original);
        temporary.write_all(bytes)?;
        temporary.as_file().sync_all()?;
        before_publish()?;
        let metadata = std::fs::symlink_metadata(path)?;
        if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("target changed type"));
        }
        if revision(&read(File::open(path)?)?) != expected {
            return Ok(false);
        }
        temporary.persist(path).map_err(|error| error.error)?;
        Ok(true)
    }
}

#[cfg(unix)]
mod platform {
    use super::{File, Path, io, read, revision};
    use rustix::fs::{self, AtFlags, Mode, OFlags};
    use std::{ffi::OsString, io::Write, os::unix::fs::PermissionsExt, path::Component};

    // Every component is opened relative to the prior directory handle with NOFOLLOW.
    pub(super) fn open_parent(path: &Path) -> io::Result<File> {
        let mut directory = File::from(fs::open(
            "/",
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::CLOEXEC,
            Mode::empty(),
        )?);
        for component in path.components() {
            if let Component::Normal(name) = component {
                directory = File::from(fs::openat(
                    &directory,
                    name,
                    OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                    Mode::empty(),
                )?);
            }
        }
        Ok(directory)
    }
    pub(super) fn organize(
        path: &Path,
        expected: &str,
        destination: Option<&Path>,
    ) -> io::Result<bool> {
        let source_parent = open_parent(
            path.parent()
                .ok_or_else(|| io::Error::other("missing parent"))?,
        )?;
        let source_name = path
            .file_name()
            .ok_or_else(|| io::Error::other("missing source name"))?;
        let file = File::from(fs::openat(
            &source_parent,
            source_name,
            OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::empty(),
        )?);
        if !file.metadata()?.is_file() || file.metadata()?.permissions().mode() & 0o222 == 0 {
            return Err(io::Error::other("unsafe or read-only source"));
        }
        if revision(&read(file.try_clone()?)?) != expected {
            return Ok(false);
        }
        use std::os::unix::fs::MetadataExt;
        let current = fs::statat(&source_parent, source_name, AtFlags::SYMLINK_NOFOLLOW)?;
        let opened = file.metadata()?;
        if current.st_dev != opened.dev() || current.st_ino != opened.ino() {
            return Ok(false);
        }
        if let Some(destination) = destination {
            let parent = open_parent(
                destination
                    .parent()
                    .ok_or_else(|| io::Error::other("missing destination parent"))?,
            )?;
            fs::renameat_with(
                &source_parent,
                source_name,
                &parent,
                destination
                    .file_name()
                    .ok_or_else(|| io::Error::other("missing destination name"))?,
                fs::RenameFlags::NOREPLACE,
            )?;
        } else {
            fs::unlinkat(&source_parent, source_name, AtFlags::empty())?;
        }
        Ok(true)
    }

    pub(super) fn create(path: &Path, bytes: &[u8], source: Option<&Path>) -> io::Result<()> {
        let parent = open_parent(
            path.parent()
                .ok_or_else(|| io::Error::other("missing parent"))?,
        )?;
        let target = path
            .file_name()
            .ok_or_else(|| io::Error::other("missing name"))?;
        let name = format!(".testoritto-create-{}", uuid::Uuid::new_v4());
        let mode = if let Some(source) = source {
            let directory = open_parent(
                source
                    .parent()
                    .ok_or_else(|| io::Error::other("missing source parent"))?,
            )?;
            let file = File::from(fs::openat(
                &directory,
                source
                    .file_name()
                    .ok_or_else(|| io::Error::other("missing source name"))?,
                OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
                Mode::empty(),
            )?);
            if !file.metadata()?.is_file() {
                return Err(io::Error::other("unsafe source"));
            }
            Mode::from_raw_mode(file.metadata()?.permissions().mode() & 0o777)
        } else {
            Mode::RUSR | Mode::WUSR
        };
        let mut owned = false;
        let result = (|| -> io::Result<()> {
            let mut file = File::from(fs::openat(
                &parent,
                &name,
                OFlags::RDWR | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                mode,
            )?);
            owned = true;
            file.write_all(bytes)?;
            file.sync_all()?;
            fs::renameat_with(&parent, &name, &parent, target, fs::RenameFlags::NOREPLACE)?;
            Ok(())
        })();
        if result.is_err() && owned {
            let _ = fs::unlinkat(&parent, &name, AtFlags::empty());
        }
        result
    }

    pub(super) fn ensure_directory(path: &Path) -> io::Result<()> {
        let parent = open_parent(
            path.parent()
                .ok_or_else(|| io::Error::other("missing parent"))?,
        )?;
        let name = path
            .file_name()
            .ok_or_else(|| io::Error::other("missing name"))?;
        match fs::mkdirat(&parent, name, Mode::RUSR | Mode::WUSR | Mode::XUSR) {
            Ok(()) => {}
            Err(error) if error == rustix::io::Errno::EXIST => {}
            Err(error) => return Err(error.into()),
        }
        let _directory = fs::openat(
            &parent,
            name,
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )?;
        Ok(())
    }
    pub(super) fn publish_directory(
        parent_path: &Path,
        name: &str,
        files: &[super::StagedFile],
        verify: impl FnOnce() -> io::Result<bool>,
    ) -> io::Result<bool> {
        let parent = open_parent(parent_path)?;
        let temporary = format!(".testoritto-run-{}", uuid::Uuid::new_v4());
        fs::mkdirat(&parent, &temporary, Mode::RUSR | Mode::WUSR | Mode::XUSR)?;
        let stage = File::from(fs::openat(
            &parent,
            &temporary,
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )?);
        let mut owned = Vec::new();
        let result = (|| -> io::Result<bool> {
            for item in files {
                let mode = if let Some(source) = &item.source {
                    let directory = open_parent(
                        source
                            .parent()
                            .ok_or_else(|| io::Error::other("missing source parent"))?,
                    )?;
                    let source = File::from(fs::openat(
                        &directory,
                        source
                            .file_name()
                            .ok_or_else(|| io::Error::other("missing source name"))?,
                        OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
                        Mode::empty(),
                    )?);
                    if !source.metadata()?.is_file() {
                        return Err(io::Error::other("unsafe source"));
                    }
                    Mode::from_raw_mode(source.metadata()?.permissions().mode() & 0o777)
                        | Mode::WUSR
                } else {
                    Mode::RUSR | Mode::WUSR
                };
                let mut file = File::from(fs::openat(
                    &stage,
                    &item.name,
                    OFlags::WRONLY
                        | OFlags::CREATE
                        | OFlags::EXCL
                        | OFlags::NOFOLLOW
                        | OFlags::CLOEXEC,
                    mode,
                )?);
                owned.push(item.name.as_str());
                file.write_all(&item.bytes)?;
                file.sync_all()?;
            }
            stage.sync_all()?;
            if !verify()? {
                return Ok(false);
            }
            fs::renameat_with(
                &parent,
                &temporary,
                &parent,
                name,
                fs::RenameFlags::NOREPLACE,
            )?;
            let _ = parent.sync_all();
            Ok(true)
        })();
        if !matches!(&result, Ok(true)) {
            for name in owned {
                let _ = fs::unlinkat(&stage, name, AtFlags::empty());
            }
            let _ = fs::unlinkat(&parent, &temporary, AtFlags::REMOVEDIR);
        }
        result
    }

    pub(super) fn initialize(root: &Path, config: &[u8]) -> io::Result<()> {
        let parent = open_parent(root)?;
        let name = format!(".testoritto-init-{}", uuid::Uuid::new_v4());
        fs::mkdirat(&parent, &name, Mode::RUSR | Mode::WUSR | Mode::XUSR)?;
        let result = (|| -> io::Result<()> {
            let stage = File::from(fs::openat(
                &parent,
                &name,
                OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )?);
            fs::mkdirat(&stage, "runs", Mode::RUSR | Mode::WUSR | Mode::XUSR)?;
            let runs = File::from(fs::openat(
                &stage,
                "runs",
                OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )?);
            for (directory, leaf, bytes) in [
                (&stage, "config.yaml", config),
                (
                    &stage,
                    ".gitignore",
                    b"# Casewright transient data\ncache/\n".as_slice(),
                ),
                (&runs, ".gitkeep", b"".as_slice()),
            ] {
                let mut file = File::from(fs::openat(
                    directory,
                    leaf,
                    OFlags::WRONLY
                        | OFlags::CREATE
                        | OFlags::EXCL
                        | OFlags::NOFOLLOW
                        | OFlags::CLOEXEC,
                    Mode::RUSR | Mode::WUSR,
                )?);
                file.write_all(bytes)?;
                file.sync_all()?;
            }
            fs::renameat_with(
                &parent,
                &name,
                &parent,
                ".casewright",
                fs::RenameFlags::NOREPLACE,
            )?;
            let _ = parent.sync_all();
            Ok(())
        })();
        if result.is_err() {
            if let Ok(stage) = fs::openat(
                &parent,
                &name,
                OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            ) {
                if let Ok(runs) = fs::openat(
                    &stage,
                    "runs",
                    OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                    Mode::empty(),
                ) {
                    let _ = fs::unlinkat(&runs, ".gitkeep", AtFlags::empty());
                }
                let _ = fs::unlinkat(&stage, "runs", AtFlags::REMOVEDIR);
                let _ = fs::unlinkat(&stage, "config.yaml", AtFlags::empty());
                let _ = fs::unlinkat(&stage, ".gitignore", AtFlags::empty());
            }
            let _ = fs::unlinkat(&parent, &name, AtFlags::REMOVEDIR);
        }
        result
    }
    struct Temporary<'a> {
        parent: &'a File,
        name: OsString,
    }
    impl Drop for Temporary<'_> {
        fn drop(&mut self) {
            let _ = fs::unlinkat(self.parent, &self.name, AtFlags::empty());
        }
    }
    pub(super) fn replace(
        path: &Path,
        expected: &str,
        bytes: &[u8],
        before_publish: impl FnOnce() -> io::Result<()>,
    ) -> io::Result<bool> {
        let parent = open_parent(
            path.parent()
                .ok_or_else(|| io::Error::other("missing parent"))?,
        )?;
        let name = path
            .file_name()
            .ok_or_else(|| io::Error::other("missing name"))?;
        let open_target = || {
            fs::openat(
                &parent,
                name,
                OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
                Mode::empty(),
            )
            .map(File::from)
            .map_err(io::Error::from)
        };
        let target = open_target()?;
        let permissions = target.metadata()?.permissions();
        if permissions.mode() & 0o222 == 0 {
            return Err(io::Error::other("read-only target"));
        }
        if revision(&read(target)?) != expected {
            return Ok(false);
        }
        let temporary = Temporary {
            parent: &parent,
            name: format!(".testoritto-{}.tmp", uuid::Uuid::new_v4()).into(),
        };
        let mut output = File::from(fs::openat(
            &parent,
            &temporary.name,
            OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::RUSR | Mode::WUSR,
        )?);
        output.write_all(bytes)?;
        output.set_permissions(permissions)?;
        output.sync_all()?;
        before_publish()?;
        if revision(&read(open_target()?)?) != expected {
            return Ok(false);
        }
        fs::renameat(&parent, &temporary.name, &parent, name)?;
        // Publication succeeded. A directory sync failure must not falsely report an unsaved file.
        let _ = parent.sync_all();
        Ok(true)
    }
}

pub(super) fn organize(
    path: &Path,
    expected: &str,
    destination: Option<&Path>,
) -> io::Result<bool> {
    platform::organize(path, expected, destination)
}

pub(crate) fn ensure_directory(path: &Path) -> io::Result<()> {
    platform::ensure_directory(path)
}

/// Ограниченное чтение automation-owned данных без следования reparse/symlink.
pub(crate) fn read_automation(path: &Path, limit: usize) -> io::Result<Vec<u8>> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("missing parent"))?;
    #[cfg(windows)]
    let (_guards, file) = {
        use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
        let guards = platform::lock_parent(parent)?;
        let file = std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(0x0020_0000)
            .open(path)?;
        if file.metadata()?.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("unsafe file"));
        }
        (guards, file)
    };
    #[cfg(unix)]
    let file = {
        let parent = platform::open_parent(parent)?;
        File::from(rustix::fs::openat(
            &parent,
            path.file_name()
                .ok_or_else(|| io::Error::other("missing filename"))?,
            rustix::fs::OFlags::RDONLY
                | rustix::fs::OFlags::NOFOLLOW
                | rustix::fs::OFlags::NONBLOCK
                | rustix::fs::OFlags::CLOEXEC,
            rustix::fs::Mode::empty(),
        )?)
    };
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > limit as u64 {
        return Err(io::Error::other("file limit"));
    }
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(io::Error::other("file limit"));
    }
    Ok(bytes)
}
pub(super) fn publish_directory(
    parent: &Path,
    name: &str,
    files: &[StagedFile],
    verify: impl FnOnce() -> io::Result<bool>,
) -> io::Result<bool> {
    fn safe_name(value: &str) -> bool {
        !value.is_empty()
            && value != "."
            && value != ".."
            && !value.contains(['/', '\\', ':', '\0'])
    }
    if !safe_name(name) || files.iter().any(|file| !safe_name(&file.name)) {
        return Err(io::Error::other("unsafe publication name"));
    }
    platform::publish_directory(parent, name, files, verify)
}

pub(crate) fn replace(path: &Path, expected: &str, bytes: &[u8]) -> io::Result<bool> {
    platform::replace(path, expected, bytes, || Ok(()))
}

pub(super) fn initialize(root: &Path, config: &[u8]) -> io::Result<()> {
    platform::initialize(root, config)
}

pub(crate) fn create(path: &Path, bytes: &[u8], source: Option<&Path>) -> io::Result<()> {
    platform::create(path, bytes, source)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacement_failure_and_external_change_preserve_original_and_clean_temp() {
        let temp = tempfile::tempdir().unwrap();
        let path = std::fs::canonicalize(temp.path()).unwrap().join("case.md");
        std::fs::write(&path, b"old").unwrap();
        let expected = revision(b"old");
        assert!(
            platform::replace(&path, &expected, b"new", || Err(io::Error::other(
                "injected"
            )))
            .is_err()
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"old");
        assert!(
            !platform::replace(&path, &expected, b"new", || {
                std::fs::write(&path, b"external")
            })
            .unwrap()
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"external");
        assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 1);
    }
    #[cfg(windows)]
    #[test]
    fn ancestor_cannot_be_renamed_during_publication() {
        let temp = tempfile::tempdir().unwrap();
        let parent = temp.path().join("cases");
        std::fs::create_dir(&parent).unwrap();
        let parent = std::fs::canonicalize(parent).unwrap();
        let path = parent.join("case.md");
        std::fs::write(&path, b"old").unwrap();
        assert!(
            platform::replace(&path, &revision(b"old"), b"new", || {
                assert!(std::fs::rename(&parent, parent.with_file_name("moved")).is_err());
                Ok(())
            })
            .unwrap()
        );
        assert_eq!(std::fs::read(path).unwrap(), b"new");
        assert!(parent.is_dir());
    }
}

pub(super) mod suite;
