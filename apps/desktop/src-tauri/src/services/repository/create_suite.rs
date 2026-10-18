use super::{
    RepositoryError, RepositoryErrorCode, RepositoryService, atomic, create, invalid_session,
    names::portable_name, registry_error, resolve_directory,
};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SuiteCreation {
    pub workspace_path: String,
    pub parent_resource_id: Option<String>,
    pub name: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteCreationDto {
    pub path: String,
}
impl SuiteCreation {
    pub(crate) fn validate(&self) -> Result<(), RepositoryError> {
        if !portable_name(&self.name) || self.workspace_path.len() > 1024 {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidSuiteCreation,
                "Недопустимое имя папки.",
            ));
        }
        Ok(())
    }
}
fn failure() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::SaveFailed,
        "Не удалось создать suite; существующие файлы не изменены.",
    )
}
impl RepositoryService {
    /// Creates one new empty suite without replacing any existing directory or companion note.
    /// # Errors
    /// Refuses invalid names, stale scopes/parents, collisions and unsafe filesystem access.
    pub fn create_suite(
        &self,
        token: &str,
        request: &SuiteCreation,
    ) -> Result<SuiteCreationDto, RepositoryError> {
        request.validate()?;
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        let parent = create::destination(
            session,
            &request.workspace_path,
            request.parent_resource_id.as_deref(),
        )?;
        let result_path = if parent.is_empty() {
            request.name.clone()
        } else {
            format!("{parent}/{}", request.name)
        };
        if result_path.len() > 1024 {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidSuiteCreation,
                "Путь папки превышает 1024 байта.",
            ));
        }
        let directory = if parent.is_empty() {
            session.root.0.clone()
        } else {
            resolve_directory(&session.root, &parent)?
        };
        let note = directory.join(format!("{}.md", request.name));
        let target = directory.join(&request.name);
        // A companion note may contain unknown content. Do not attach a new suite to it implicitly.
        for path in [&note, &target] {
            match fs::symlink_metadata(path) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                _ => return Err(failure()),
            }
        }
        let created = atomic::publish_directory(&directory, &request.name, &[], || {
            Ok(matches!(fs::symlink_metadata(&note), Err(error) if error.kind() == std::io::ErrorKind::NotFound))
        }).map_err(|_| failure())?;
        if !created {
            return Err(failure());
        }
        Ok(SuiteCreationDto { path: result_path })
    }
}
#[cfg(test)]
mod tests;
