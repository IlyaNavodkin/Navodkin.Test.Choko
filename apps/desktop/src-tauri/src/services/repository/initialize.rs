//! Casewright-compatible initialization, based on the MIT upstream repo-metadata contract.
//! Existing metadata is never replaced or merged implicitly.
use super::{
    OpenRepositoryDto, RepoRoot, RepositoryError, RepositoryErrorCode, RepositoryService, atomic,
    invalid_session, load_open_metadata, registry_error, root_name,
};

impl RepositoryService {
    /// Creates a fresh compatible metadata directory only after explicit UI confirmation.
    /// # Errors
    /// Refuses existing metadata, changed Git roots and disk errors without overwriting data.
    pub fn initialize_repository(&self, token: &str) -> Result<OpenRepositoryDto, RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        let verified = RepoRoot::open(&session.root.0)?;
        if verified != session.root || !load_open_metadata(&verified)?.needs_initialization {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InitializationUnavailable,
                "Репозиторий уже инициализирован или его root изменился.",
            ));
        }
        let name = serde_json::to_string(&root_name(&verified)).map_err(|_| registry_error())?;
        let config = format!("version: 1\nname: {name}\nworkspaces:\n  - .\n");
        atomic::initialize(&verified.0, config.as_bytes()).map_err(|error| RepositoryError::new(
            if error.kind() == std::io::ErrorKind::AlreadyExists { RepositoryErrorCode::InitializationUnavailable } else { RepositoryErrorCode::InitializationFailed },
            "Не удалось создать структуру; существующий каталог .casewright не перезаписывается.",
        ))?;
        let metadata = load_open_metadata(&verified)?;
        let watcher_warning = session
            .opened
            .warnings
            .iter()
            .find(|warning| warning.code == super::RepositoryWarningCode::WatcherUnavailable)
            .cloned();
        session.opened = OpenRepositoryDto {
            session_id: token.to_owned(),
            display_name: metadata.display_name,
            needs_initialization: false,
            preferred_workspace_path: metadata
                .workspaces
                .first()
                .map(|workspace| workspace.path.clone()),
            workspaces: metadata.workspaces,
            warnings: metadata.warnings,
        };
        if let Some(warning) = watcher_warning {
            session.opened.warnings.push(warning);
        }
        session.resources.clear();
        Ok(session.opened.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Command};
    fn git_repo(path: &std::path::Path) {
        assert!(
            Command::new("git")
                .args(["init", "--quiet"])
                .current_dir(path)
                .status()
                .unwrap()
                .success()
        );
        fs::write(path.join("foreign.txt"), "Keep").unwrap();
        assert!(
            Command::new("git")
                .args(["add", "--", "foreign.txt"])
                .current_dir(path)
                .status()
                .unwrap()
                .success()
        );
    }
    #[test]
    fn explicit_initialization_creates_compatible_root_and_leaves_git_index_unchanged() {
        let temp = tempfile::tempdir().unwrap();
        git_repo(temp.path());
        let index = fs::read(temp.path().join(".git/index")).unwrap();
        let service = RepositoryService::default();
        let opened = service.open(temp.path()).unwrap();
        assert!(opened.needs_initialization);
        assert!(!temp.path().join(".casewright").exists());
        let initialized = service.initialize_repository(&opened.session_id).unwrap();
        assert!(!initialized.needs_initialization);
        assert_eq!(initialized.session_id, opened.session_id);
        assert_eq!(initialized.workspaces[0].path, "");
        assert!(temp.path().join(".casewright/runs/.gitkeep").is_file());
        assert!(
            fs::read_to_string(temp.path().join(".casewright/.gitignore"))
                .unwrap()
                .contains("cache/")
        );
        assert_eq!(index, fs::read(temp.path().join(".git/index")).unwrap());
        let config = fs::read(temp.path().join(".casewright/config.yaml")).unwrap();
        assert!(service.initialize_repository(&opened.session_id).is_err());
        assert_eq!(
            config,
            fs::read(temp.path().join(".casewright/config.yaml")).unwrap()
        );
        assert!(!fs::read_dir(temp.path()).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".testoritto-init-")
        }));
    }
    #[test]
    fn existing_metadata_without_config_is_refused_without_modifying_unknown_files() {
        let temp = tempfile::tempdir().unwrap();
        git_repo(temp.path());
        fs::create_dir(temp.path().join(".casewright")).unwrap();
        fs::write(temp.path().join(".casewright/unknown.txt"), "unknown").unwrap();
        let service = RepositoryService::default();
        let opened = service.open(temp.path()).unwrap();
        assert_eq!(
            service
                .initialize_repository(&opened.session_id)
                .unwrap_err()
                .code,
            RepositoryErrorCode::InitializationUnavailable
        );
        assert!(!temp.path().join(".casewright/config.yaml").exists());
        assert_eq!(
            fs::read_to_string(temp.path().join(".casewright/unknown.txt")).unwrap(),
            "unknown"
        );
        assert_eq!(
            fs::read_dir(temp.path().join(".casewright"))
                .unwrap()
                .count(),
            1
        );
    }
}
