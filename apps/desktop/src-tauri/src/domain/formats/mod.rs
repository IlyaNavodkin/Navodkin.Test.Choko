mod case;
mod config;
mod folder_note;
mod glossary;
mod order;
mod run;
mod yaml;

pub use case::{
    CaseDocument, CaseModel, CaseSetupItem, CaseStatus, CaseStep, CaseWarning, CaseWarningCode,
};
pub use config::{ConfigDocument, ConfigModel};
pub use folder_note::{FolderNoteDocument, FolderNoteFront, MarkdownBody};
pub use glossary::{
    GlossaryDocument, GlossaryFront, GlossaryKind, GlossaryValue, MAX_GLOSSARY_ALIASES,
    MAX_GLOSSARY_BYTES, MAX_GLOSSARY_DESCRIPTION, MAX_GLOSSARY_TITLE, MAX_GLOSSARY_VALUE_BYTES,
    MAX_GLOSSARY_VALUES,
};
pub use order::OrderDocument;
pub use run::{
    RunApproval, RunCaseDocument, RunCaseModel, RunCheckState, RunChecklistItem,
    RunDetailsDocument, RunDetailsModel, RunResult, RunStatus, RunWarning, RunWarningCode,
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FormatErrorCode {
    InvalidYaml,
    InvalidDocument,
    InvalidField,
    InvalidFrontMatter,
    InvalidOrderKey,
    InputTooLarge,
    UnsupportedVersion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatError {
    pub code: FormatErrorCode,
    pub message: String,
    pub line: Option<usize>,
}

impl FormatError {
    pub(super) fn new(code: FormatErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            line: None,
        }
    }

    pub(super) fn invalid_yaml(message: impl Into<String>) -> Self {
        Self::new(FormatErrorCode::InvalidYaml, message)
    }

    pub(super) fn too_large(limit: usize) -> Self {
        Self::new(
            FormatErrorCode::InputTooLarge,
            format!("Формат превышает допустимый размер {limit} байт."),
        )
    }
}

impl std::fmt::Display for FormatError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for FormatError {}

const MAX_YAML_BYTES: usize = 256 * 1024;
const MAX_FRONT_MATTER_BYTES: usize = 64 * 1024;
const MAX_ORDER_BYTES: usize = 256 * 1024;
const MAX_FOLDER_NOTE_BYTES: usize = 1024 * 1024;

const _: () = {
    fn assert_send_sync<T: Send + Sync>() {}
    let _ = assert_send_sync::<FormatError>;
};
