use std::{
    ffi::OsStr,
    fs,
    path::{Component, Path, PathBuf},
};

use super::git::{find_git_executable, run_git};
use super::{RepositoryError, RepositoryErrorCode};
/// Canonical repository root kept private to the Rust backend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RepoRoot(pub(super) PathBuf);

impl RepoRoot {
    pub(super) fn open(selected: &Path) -> Result<Self, RepositoryError> {
        let canonical = fs::canonicalize(selected).map_err(|error| {
            RepositoryError::new(
                RepositoryErrorCode::InvalidRepositoryPath,
                format!("Не удалось открыть выбранный путь: {error}"),
            )
        })?;
        if !canonical.is_dir() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRepositoryPath,
                "Выбранный путь не является каталогом.",
            ));
        }
        if canonical.components().any(|part| {
            part.as_os_str()
                .to_string_lossy()
                .chars()
                .any(char::is_control)
        }) {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRepositoryPath,
                "Путь репозитория содержит управляющие символы, которые нельзя безопасно проверить через Git.",
            ));
        }
        let git = find_git_executable(&canonical)?;
        let top = run_git(&git, &canonical, &["rev-parse", "--show-toplevel"]);
        let top = match top {
            Ok(output) => PathBuf::from(output.trim_end_matches(['\r', '\n'])),
            Err(error) => {
                if run_git(&git, &canonical, &["rev-parse", "--is-bare-repository"])
                    .is_ok_and(|output| output.trim() == "true")
                {
                    return Err(RepositoryError::new(
                        RepositoryErrorCode::BareRepository,
                        "Bare Git-репозитории нельзя открыть как рабочую область.",
                    ));
                }
                return Err(error);
            }
        };
        let git_root = fs::canonicalize(&top).map_err(|error| {
            RepositoryError::new(
                RepositoryErrorCode::NotGitRepository,
                format!("Git вернул недоступный root: {error}"),
            )
        })?;
        if !same_path(&canonical, &git_root) {
            return Err(RepositoryError::new(
                RepositoryErrorCode::SelectedSubdirectory,
                "Выберите корень Git-репозитория, а не вложенный каталог.",
            ));
        }
        let bare = run_git(&git, &canonical, &["rev-parse", "--is-bare-repository"])?;
        if bare.trim() == "true" {
            return Err(RepositoryError::new(
                RepositoryErrorCode::BareRepository,
                "Bare Git-репозитории нельзя открыть как рабочую область.",
            ));
        }
        Ok(Self(git_root))
    }

    pub(super) fn resolve_existing(&self, relative: &str) -> Result<PathBuf, RepositoryError> {
        let joined = self.resolve_lexical(relative)?;
        let canonical = fs::canonicalize(&joined).map_err(|error| {
            RepositoryError::new(
                RepositoryErrorCode::Io,
                format!("Не удалось разрешить путь репозитория: {error}"),
            )
        })?;
        if !canonical.starts_with(&self.0) {
            return Err(RepositoryError::new(
                RepositoryErrorCode::PathEscapesRepository,
                "Путь или symlink выходит за пределы репозитория.",
            ));
        }
        if canonical.strip_prefix(&self.0).is_ok_and(|relative| {
            relative
                .components()
                .any(|part| is_git_metadata_component(part.as_os_str()))
        }) {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRelativePath,
                "Git metadata не входит в область чтения файлов репозитория.",
            ));
        }
        Ok(canonical)
    }

    fn resolve_lexical(&self, relative: &str) -> Result<PathBuf, RepositoryError> {
        if relative.is_empty()
            || relative.contains('\0')
            || relative.contains(':')
            || relative.contains('\\')
        {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRelativePath,
                "Ожидался безопасный repo-relative путь.",
            ));
        }
        let path = Path::new(relative);
        if path.is_absolute() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRelativePath,
                "Абсолютные пути запрещены.",
            ));
        }
        let mut output = self.0.clone();
        for component in path.components() {
            match component {
                Component::Normal(value) if !is_git_metadata_component(value) => output.push(value),
                Component::Normal(_) => {
                    return Err(RepositoryError::new(
                        RepositoryErrorCode::InvalidRelativePath,
                        "Git metadata не входит в область чтения файлов репозитория.",
                    ));
                }
                _ => {
                    return Err(RepositoryError::new(
                        RepositoryErrorCode::InvalidRelativePath,
                        "Путь содержит запрещённый компонент.",
                    ));
                }
            }
        }
        Ok(output)
    }
}

fn is_git_metadata_component(value: &OsStr) -> bool {
    value.to_string_lossy().eq_ignore_ascii_case(".git")
}

fn same_path(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}
