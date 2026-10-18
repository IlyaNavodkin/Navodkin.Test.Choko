use serde::{Deserialize, Serialize};
use serde_norway::Value;

use super::FormatError;

mod case;
mod details;
pub use case::{RunCaseDocument, RunCaseModel};
pub use details::{RunDetailsDocument, RunDetailsModel};
#[cfg(test)]
mod tests;

const RUN_CASE_LIMIT: usize = 2 * 1024 * 1024;
const RUN_DETAILS_LIMIT: usize = 1024 * 1024;
const RUN_FRONTMATTER_LIMIT: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RunResult {
    #[default]
    NotRun,
    Pass,
    Fail,
    Blocked,
    InProgress,
    Skipped,
}

impl RunResult {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::NotRun => "not_run",
            Self::Pass => "pass",
            Self::Fail => "fail",
            Self::Blocked => "blocked",
            Self::InProgress => "in_progress",
            Self::Skipped => "skipped",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RunCheckState {
    #[default]
    None,
    Pass,
    Fail,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunChecklistItem {
    pub key: String,
    pub text: String,
    pub state: RunCheckState,
    pub fail_note: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    #[default]
    Open,
    Closed,
}

impl RunStatus {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Closed => "closed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunApproval {
    pub name: String,
    pub at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RunWarningCode {
    InvalidFrontmatter,
    MissingCaseId,
    InvalidCaseId,
    InvalidApproval,
    InvalidChecklistMark,
    ExtraContent,
    DuplicateSection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunWarning {
    pub code: RunWarningCode,
    pub message: String,
    pub line: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RunFrontmatter {
    pub opening: String,
    pub yaml: String,
    pub closing: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RunSectionSpan {
    pub heading: String,
    pub heading_start: usize,
    pub content_start: usize,
    pub end: usize,
    pub line: usize,
}

pub(super) fn split_frontmatter(text: &str) -> Result<Option<RunFrontmatter>, FormatError> {
    let Some((opening, start)) = next_line(text, 0) else {
        return Ok(None);
    };
    if opening.trim_end_matches(['\r', '\n']) != "---" {
        return Ok(None);
    }
    let mut cursor = start;
    while let Some((line, end)) = next_line(text, cursor) {
        let marker = line.trim_end_matches(['\r', '\n']);
        if marker == "---" || marker == "..." {
            let yaml = text[start..cursor].to_owned();
            if yaml.len() > MAX_RUN_FRONTMATTER_BYTES {
                return Err(FormatError::too_large(MAX_RUN_FRONTMATTER_BYTES));
            }
            return Ok(Some(RunFrontmatter {
                opening: text[..start].to_owned(),
                yaml,
                closing: text[cursor..end].to_owned(),
                body: text[end..].to_owned(),
            }));
        }
        cursor = end;
    }
    Err(FormatError::new(
        super::FormatErrorCode::InvalidFrontMatter,
        "YAML frontmatter открыт, но не закрыт.",
    ))
}

fn next_line(text: &str, start: usize) -> Option<(&str, usize)> {
    if start >= text.len() {
        return None;
    }
    let end = text[start..]
        .find('\n')
        .map_or(text.len(), |at| start + at + 1);
    Some((&text[start..end], end))
}

pub(super) fn scan_sections(text: &str) -> Vec<RunSectionSpan> {
    let mut found = Vec::new();
    let mut fence: Option<(u8, usize)> = None;
    let mut offset = 0;
    for (line_no, raw) in (1..).zip(text.split_inclusive('\n')) {
        let line = raw.trim_end_matches(['\r', '\n']);
        let trimmed = line.trim_start_matches(' ');
        let indent = line.len() - trimmed.len();
        if indent <= 3 {
            if let Some((ch, size)) = fence {
                let count = trimmed.bytes().take_while(|byte| *byte == ch).count();
                if count >= size && trimmed[count..].trim().is_empty() {
                    fence = None;
                }
            } else {
                let ch = trimmed.as_bytes().first().copied();
                let count = ch.map_or(0, |ch| {
                    trimmed.bytes().take_while(|byte| *byte == ch).count()
                });
                if matches!(ch, Some(b'`' | b'~')) && count >= 3 {
                    fence = ch.map(|ch| (ch, count));
                } else if let Some(heading) = trimmed
                    .strip_prefix("##")
                    .filter(|rest| rest.starts_with([' ', '\t']))
                {
                    let heading = heading.trim();
                    if !heading.is_empty() {
                        found.push((offset, offset + raw.len(), heading.to_owned(), line_no));
                    }
                }
            }
        }
        offset += raw.len();
    }
    found
        .iter()
        .enumerate()
        .map(
            |(index, (heading_start, content_start, heading, line))| RunSectionSpan {
                heading: heading.clone(),
                heading_start: *heading_start,
                content_start: *content_start,
                end: found.get(index + 1).map_or(text.len(), |next| next.0),
                line: *line,
            },
        )
        .collect()
}

pub(super) fn normalize_section_content(text: &str, span: &RunSectionSpan) -> String {
    text.get(span.content_start..span.end)
        .unwrap_or_default()
        .replace("\r\n", "\n")
}

pub(super) fn section_edit(
    text: &str,
    front: Option<&RunFrontmatter>,
    spans: &[RunSectionSpan],
    heading: &str,
    replacement: &str,
) -> Result<String, FormatError> {
    let matches: Vec<_> = spans
        .iter()
        .filter(|span| span.heading == heading)
        .collect();
    if matches.len() > 1 {
        return Err(FormatError::new(
            super::FormatErrorCode::InvalidDocument,
            "Редактирование дублирующейся Markdown-секции неоднозначно.",
        ));
    }
    let body = front.map_or(text, |front| front.body.as_str());
    let eol = if body.contains("\r\n") { "\r\n" } else { "\n" };
    let replacement = replacement.replace("\r\n", "\n").replace('\n', eol);
    let new_body = if let Some(span) = matches.first() {
        let insert = format!("## {heading}{eol}{eol}{replacement}{eol}{eol}");
        let mut out = body.to_owned();
        out.replace_range(span.heading_start..span.end, &insert);
        out
    } else {
        let separator = if body.is_empty() {
            String::new()
        } else if body.ends_with(eol) {
            eol.to_owned()
        } else {
            format!("{eol}{eol}")
        };
        format!("{body}{separator}## {heading}{eol}{eol}{replacement}{eol}")
    };
    if let Some(front) = front {
        let offset = text.len() - front.body.len();
        let mut out = text.to_owned();
        out.replace_range(offset.., &new_body);
        Ok(out)
    } else {
        Ok(new_body)
    }
}

pub(super) fn warning(
    code: RunWarningCode,
    message: impl Into<String>,
    line: Option<usize>,
) -> RunWarning {
    RunWarning {
        code,
        message: message.into(),
        line,
    }
}

pub(super) fn scalar(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(s) => Some(s.clone()),
        Value::Bool(v) => Some(v.to_string()),
        Value::Number(v) => Some(v.to_string()),
        Value::Null => Some("null".into()),
        _ => None,
    }
}

pub(super) fn map_value<'a>(map: &'a serde_norway::Mapping, key: &str) -> Option<&'a Value> {
    map.get(Value::String(key.into()))
}

pub(super) fn front_value(yaml_text: &str) -> Result<Value, FormatError> {
    if yaml_text.trim().is_empty() {
        return Ok(Value::Mapping(serde_norway::Mapping::new()));
    }
    super::yaml::parse_value(yaml_text)
}

pub(super) fn edit_frontmatter(
    front: &RunFrontmatter,
    map: serde_norway::Mapping,
) -> Result<String, FormatError> {
    let rendered = super::yaml::edit_value(&front.yaml, Value::Mapping(map))?;
    if front.yaml.contains("\r\n") && !front.yaml.replace("\r\n", "").contains('\n') {
        Ok(rendered.replace("\r\n", "\n").replace('\n', "\r\n"))
    } else {
        Ok(rendered)
    }
}

pub(super) const MAX_RUN_CASE_BYTES: usize = RUN_CASE_LIMIT;
pub(super) const MAX_RUN_DETAILS_BYTES: usize = RUN_DETAILS_LIMIT;
pub(super) const MAX_RUN_FRONTMATTER_BYTES: usize = RUN_FRONTMATTER_LIMIT;

const _: () = {
    fn check<T: Send + Sync>() {}
    let _ = check::<RunResult>;
    let _ = check::<RunCheckState>;
    let _ = check::<RunChecklistItem>;
    let _ = check::<RunStatus>;
    let _ = check::<RunApproval>;
    let _ = check::<RunWarning>;
};
