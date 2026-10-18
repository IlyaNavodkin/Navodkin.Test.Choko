//! Guarded directory relocation and manifest-only postorder deletion. No recursive path deletion.
use super::{read, revision};
use std::io::{Seek, SeekFrom};
use std::{
    fs::File,
    io,
    path::{Path, PathBuf},
};
fn hash(file: &File) -> io::Result<String> {
    let mut copy = file.try_clone()?;
    copy.seek(SeekFrom::Start(0))?;
    Ok(revision(&read(copy)?))
}
#[derive(Debug)]
pub(crate) struct DeleteEntry {
    pub path: PathBuf,
    pub revision: Option<String>,
    pub directory_revision: Option<String>,
}
struct Captured {
    path: PathBuf,
    file: Option<File>,
    directory: bool,
}
pub(crate) struct DeleteBatch {
    entries: Vec<Captured>,
    #[cfg(windows)]
    _guards: Vec<File>,
}
fn parent(path: &Path) -> io::Result<&Path> {
    path.parent()
        .ok_or_else(|| io::Error::other("missing parent"))
}

pub(crate) fn relocate(
    source: &Path,
    destination: &Path,
    verify: impl FnOnce() -> io::Result<bool>,
) -> io::Result<bool> {
    #[cfg(windows)]
    {
        use std::{
            fs::OpenOptions,
            os::windows::fs::{MetadataExt, OpenOptionsExt},
        };
        let _source = super::platform::lock_parent(parent(source)?)?;
        let _destination = super::platform::lock_parent(parent(destination)?)?;
        let inspection = OpenOptions::new()
            .read(true)
            .access_mode(0x81)
            .share_mode(0x1 | 0x2 | 0x4)
            .custom_flags(0x0200_0000 | 0x0020_0000)
            .open(source)?;
        let metadata = inspection.metadata()?;
        if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("unsafe directory"));
        }
        if !verify()? {
            return Ok(false);
        }
        let file = OpenOptions::new()
            .read(true)
            .access_mode(0x10081)
            .share_mode(0x1 | 0x2 | 0x4)
            .custom_flags(0x0200_0000 | 0x0020_0000)
            .open(source)?;
        if super::security::identity(&inspection)? != super::security::identity(&file)? {
            return Ok(false);
        }
        super::security::rename(&file, destination)?;
    }
    #[cfg(unix)]
    {
        use rustix::fs::{self, Mode, OFlags};
        let source_parent = super::platform::open_parent(parent(source)?)?;
        let destination_parent = super::platform::open_parent(parent(destination)?)?;
        let name = source
            .file_name()
            .ok_or_else(|| io::Error::other("missing name"))?;
        let directory = File::from(fs::openat(
            &source_parent,
            name,
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )?);
        if !verify()? {
            return Ok(false);
        }
        use std::os::unix::fs::MetadataExt;
        let current = fs::statat(&source_parent, name, fs::AtFlags::SYMLINK_NOFOLLOW)?;
        let opened = directory.metadata()?;
        if current.st_dev != opened.dev() || current.st_ino != opened.ino() {
            return Ok(false);
        }
        fs::renameat_with(
            &source_parent,
            name,
            &destination_parent,
            destination
                .file_name()
                .ok_or_else(|| io::Error::other("missing target"))?,
            fs::RenameFlags::NOREPLACE,
        )?;
    }
    Ok(true)
}
impl DeleteBatch {
    /// Captures every confirmed object before deletion; files remain open and immutable on Windows.
    pub(crate) fn capture(entries: &[DeleteEntry]) -> io::Result<Self> {
        let mut captured = Vec::with_capacity(entries.len());
        #[cfg(windows)]
        let guards = if let Some(first) = entries.first() {
            super::platform::lock_parent(parent(&first.path)?)?
        } else {
            Vec::new()
        };
        for entry in entries {
            #[cfg(windows)]
            let file = {
                use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt};
                OpenOptions::new()
                    .read(true)
                    .access_mode(if entry.revision.is_some() {
                        0x8001_0080
                    } else {
                        0x10081
                    })
                    .share_mode(if entry.revision.is_some() {
                        0x1
                    } else {
                        0x1 | 0x2
                    })
                    .custom_flags(0x0200_0000 | 0x0020_0000)
                    .open(&entry.path)?
            };
            #[cfg(unix)]
            let file = {
                use rustix::fs::{self, Mode, OFlags};
                let directory = super::platform::open_parent(parent(&entry.path)?)?;
                File::from(fs::openat(
                    &directory,
                    entry
                        .path
                        .file_name()
                        .ok_or_else(|| io::Error::other("missing name"))?,
                    OFlags::RDONLY
                        | OFlags::NOFOLLOW
                        | OFlags::NONBLOCK
                        | OFlags::CLOEXEC
                        | if entry.revision.is_none() {
                            OFlags::DIRECTORY
                        } else {
                            OFlags::empty()
                        },
                    Mode::empty(),
                )?)
            };
            let metadata = file.metadata()?;
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return Err(io::Error::other("reparse point"));
                }
            }
            if metadata.permissions().readonly() && entry.revision.is_some() {
                return Err(io::Error::other("read-only file"));
            }
            if let Some(expected) = &entry.revision {
                if !metadata.is_file() || hash(&file)? != *expected {
                    return Err(io::Error::other("file changed"));
                }
            } else if !metadata.is_dir() {
                return Err(io::Error::other("not directory"));
            } else if let Some(expected) = &entry.directory_revision {
                // Ancestor directory handles above pin this path; do not reopen incompatible DELETE guards.
                let mut names = Vec::new();
                for item in std::fs::read_dir(&entry.path)? {
                    if names.len() >= 1000 {
                        return Err(io::Error::other("entry limit"));
                    }
                    names.push(
                        item?
                            .file_name()
                            .into_string()
                            .map_err(|_| io::Error::other("non UTF-8 name"))?,
                    );
                }
                names.sort();
                let stamp = format!("{:?}:{names:?}", metadata.modified().ok());
                if revision(stamp.as_bytes()) != *expected {
                    return Err(io::Error::other("directory changed"));
                }
            }
            captured.push(Captured {
                path: entry.path.clone(),
                file: Some(file),
                directory: entry.revision.is_none(),
            });
        }
        Ok(Self {
            entries: captured,
            #[cfg(windows)]
            _guards: guards,
        })
    }
    pub(crate) fn remove(&mut self, index: usize, expected: Option<&str>) -> io::Result<()> {
        let entry = &mut self.entries[index];
        let file = entry
            .file
            .as_ref()
            .ok_or_else(|| io::Error::other("already removed"))?;
        if let Some(expected) = expected
            && hash(file)? != expected
        {
            return Err(io::Error::other("changed file"));
        }
        #[cfg(windows)]
        super::security::delete(file)?;
        #[cfg(unix)]
        {
            use rustix::fs::{self, AtFlags};
            use std::os::unix::fs::MetadataExt;
            let directory = super::platform::open_parent(parent(&entry.path)?)?;
            let name = entry
                .path
                .file_name()
                .ok_or_else(|| io::Error::other("missing name"))?;
            let current = fs::statat(&directory, name, AtFlags::SYMLINK_NOFOLLOW)?;
            let captured = file.metadata()?;
            if current.st_dev != captured.dev() || current.st_ino != captured.ino() {
                return Err(io::Error::other("entry replaced"));
            }
            fs::unlinkat(
                &directory,
                name,
                if entry.directory {
                    AtFlags::REMOVEDIR
                } else {
                    AtFlags::empty()
                },
            )?;
        }
        #[cfg(windows)]
        {
            let _ = entry.directory;
            let _ = &entry.path;
        }
        entry.file.take();
        Ok(())
    }
}
pub(crate) fn remove_empty(path: &Path) -> io::Result<()> {
    let mut batch = DeleteBatch::capture(&[DeleteEntry {
        path: path.to_path_buf(),
        revision: None,
        directory_revision: None,
    }])?;
    batch.remove(0, None)
}

pub(crate) fn read_regular(path: &Path) -> io::Result<Vec<u8>> {
    #[cfg(windows)]
    {
        use std::{
            fs::OpenOptions,
            os::windows::fs::{MetadataExt, OpenOptionsExt},
        };
        let _guards = super::platform::lock_parent(parent(path)?)?;
        let file = OpenOptions::new()
            .read(true)
            .share_mode(0x1)
            .custom_flags(0x0020_0000)
            .open(path)?;
        if file.metadata()?.file_attributes() & 0x400 != 0 {
            return Err(io::Error::other("reparse file"));
        }
        read(file)
    }
    #[cfg(unix)]
    {
        use rustix::fs::{self, Mode, OFlags};
        let directory = super::platform::open_parent(parent(path)?)?;
        read(File::from(fs::openat(
            &directory,
            path.file_name()
                .ok_or_else(|| io::Error::other("missing name"))?,
            OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::empty(),
        )?))
    }
}
pub(crate) fn children(path: &Path) -> io::Result<Vec<String>> {
    children_matching(path, 1000, true, |_| true)
}
pub(crate) fn recovery_names(path: &Path) -> io::Result<Vec<String>> {
    children_matching(path, 20_000, false, |name| {
        name.strip_prefix(".testoritto-suite-")
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
    })
}
fn children_matching(
    path: &Path,
    limit: usize,
    strict_utf8: bool,
    keep: impl Fn(&str) -> bool,
) -> io::Result<Vec<String>> {
    let mut names = Vec::new();
    let mut count = 0;
    let mut accept = |name: std::ffi::OsString| -> io::Result<()> {
        count += 1;
        if count > limit {
            return Err(io::Error::other("entry limit"));
        }
        match name.into_string() {
            Ok(name) => {
                if keep(&name) {
                    names.push(name);
                }
            }
            Err(_) if strict_utf8 => return Err(io::Error::other("non UTF-8 name")),
            Err(_) => {}
        }
        Ok(())
    };
    #[cfg(windows)]
    {
        let _guards = super::platform::lock_parent(path)?;
        for entry in std::fs::read_dir(path)? {
            accept(entry?.file_name())?;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let directory = super::platform::open_parent(path)?;
        for entry in rustix::fs::Dir::read_from(&directory)? {
            let entry = entry?;
            let bytes = entry.file_name().to_bytes();
            if bytes != b"." && bytes != b".." {
                accept(std::ffi::OsStr::from_bytes(bytes).to_os_string())?;
            }
        }
    }
    names.sort();
    Ok(names)
}

pub(crate) fn object_identity(path: &Path, directory: bool) -> io::Result<String> {
    #[cfg(windows)]
    {
        use std::{
            fs::OpenOptions,
            os::windows::fs::{MetadataExt, OpenOptionsExt},
        };
        let _guards = super::platform::lock_parent(parent(path)?)?;
        let file = OpenOptions::new()
            .read(true)
            .access_mode(0x80)
            .share_mode(0x1 | 0x2 | 0x4)
            .custom_flags(0x0200_0000 | 0x0020_0000)
            .open(path)?;
        let meta = file.metadata()?;
        if meta.file_attributes() & 0x400 != 0
            || meta.is_dir() != directory
            || (!directory && !meta.is_file())
        {
            return Err(io::Error::other("unsafe object"));
        }
        Ok(format!("{:?}", super::security::identity(&file)?))
    }
    #[cfg(unix)]
    {
        use rustix::fs::{self, Mode, OFlags};
        use std::os::unix::fs::MetadataExt;
        let parent = super::platform::open_parent(parent(path)?)?;
        let file = File::from(fs::openat(
            &parent,
            path.file_name()
                .ok_or_else(|| io::Error::other("missing name"))?,
            OFlags::RDONLY
                | OFlags::NOFOLLOW
                | OFlags::NONBLOCK
                | OFlags::CLOEXEC
                | if directory {
                    OFlags::DIRECTORY
                } else {
                    OFlags::empty()
                },
            Mode::empty(),
        )?);
        let meta = file.metadata()?;
        if !directory && !meta.is_file() {
            return Err(io::Error::other("not file"));
        }
        Ok(format!("{}:{}", meta.dev(), meta.ino()))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn relocate_allows_guarded_verifier_and_never_overwrites_destination() {
        let temp = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(temp.path()).unwrap();
        let source = root.join("source");
        let target = root.join("target");
        std::fs::create_dir(&source).unwrap();
        std::fs::write(source.join("case.md"), b"nonempty").unwrap();
        assert!(
            relocate(&source, &target, || Ok(children(&source)? == ["case.md"]
                && read_regular(&source.join("case.md"))? == b"nonempty"))
            .unwrap()
        );
        std::fs::create_dir(&source).unwrap();
        assert!(relocate(&target, &source, || Ok(true)).is_err());
        assert_eq!(read_regular(&target.join("case.md")).unwrap(), b"nonempty");
    }
    #[test]
    fn capture_rehashes_nonempty_file_and_deletes_only_confirmed_objects() {
        let temp = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(temp.path()).unwrap();
        let tree = root.join("tree");
        std::fs::create_dir(&tree).unwrap();
        let file = tree.join("known.bin");
        std::fs::write(&file, b"nonempty bytes").unwrap();
        let expected = revision(b"nonempty bytes");
        let entries = [
            DeleteEntry {
                path: tree.clone(),
                revision: None,
                directory_revision: None,
            },
            DeleteEntry {
                path: file.clone(),
                revision: Some(expected.clone()),
                directory_revision: None,
            },
        ];
        let mut batch = DeleteBatch::capture(&entries).unwrap();
        std::fs::write(tree.join("new-foreign.bin"), b"retain").unwrap();
        batch.remove(1, Some(&expected)).unwrap();
        assert!(!file.exists());
        assert!(batch.remove(0, None).is_err());
        drop(batch);
        assert_eq!(
            read_regular(&tree.join("new-foreign.bin")).unwrap(),
            b"retain"
        );
        std::fs::remove_file(tree.join("new-foreign.bin")).unwrap();
        remove_empty(&tree).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn verifier_replacement_does_not_relocate_a_foreign_new_directory() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        std::fs::create_dir(&source).unwrap();
        let result = relocate(&source, &temp.path().join("target"), || {
            std::fs::rename(&source, temp.path().join("original")).unwrap();
            std::fs::create_dir(&source).unwrap();
            Ok(true)
        })
        .unwrap();
        assert!(!result);
        assert!(source.is_dir());
        assert!(temp.path().join("original").is_dir());
        assert!(!temp.path().join("target").exists());
    }
}
