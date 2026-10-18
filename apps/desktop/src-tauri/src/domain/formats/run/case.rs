use serde::{Deserialize, Serialize};
use serde_norway::{Mapping, Value};

use super::super::run::{
    MAX_RUN_CASE_BYTES, MAX_RUN_FRONTMATTER_BYTES, RunCheckState, RunChecklistItem, RunFrontmatter,
    RunResult, RunSectionSpan, RunWarning, RunWarningCode, edit_frontmatter, front_value,
    map_value, normalize_section_content, scalar, scan_sections, section_edit, split_frontmatter,
    warning,
};
use super::super::{FormatError, FormatErrorCode};

const RESERVED: [&str; 4] = ["Setup", "Steps", "Acceptance Criteria", "Notes"];
const FAIL_SEPARATOR: &str = " !! ";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunCaseModel {
    pub case_id: String,
    pub display_id: String,
    pub title: String,
    pub result: RunResult,
    pub tester: String,
    pub executed_at: String,
    pub test_date: Option<String>,
    pub notes: String,
    pub setup: Vec<RunChecklistItem>,
    pub steps: Vec<RunChecklistItem>,
    pub accept: Vec<RunChecklistItem>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RunCaseDocument {
    original: String,
    front: Option<RunFrontmatter>,
    original_model: RunCaseModel,
    model: RunCaseModel,
    warnings: Vec<RunWarning>,
    spans: Vec<RunSectionSpan>,
}

impl RunCaseDocument {
    /// Parses a run snapshot sidecar without generating or changing its case identity.
    ///
    /// # Errors
    /// Returns a diagnostic for malformed YAML/frontmatter or an oversized sidecar.
    pub fn parse(text: &str) -> Result<Self, FormatError> {
        if text.len() > MAX_RUN_CASE_BYTES {
            return Err(FormatError::too_large(MAX_RUN_CASE_BYTES));
        }
        let front = split_frontmatter(text)?;
        if let Some(front) = &front
            && front.yaml.len() > MAX_RUN_FRONTMATTER_BYTES
        {
            return Err(FormatError::too_large(MAX_RUN_FRONTMATTER_BYTES));
        }
        let value = match &front {
            Some(front) => front_value(&front.yaml)?,
            None => Value::Mapping(Mapping::new()),
        };
        let Value::Mapping(map) = value else {
            return Err(FormatError::invalid_yaml(
                "Run-case frontmatter должен быть YAML mapping.",
            ));
        };
        let mut warnings = Vec::new();
        let case_id = match map_value(&map, "case_id") {
            None => {
                warnings.push(warning(
                    RunWarningCode::MissingCaseId,
                    "Run-case sidecar не содержит стабильный case_id.",
                    None,
                ));
                String::new()
            }
            Some(Value::String(value)) if !value.trim().is_empty() => value.clone(),
            Some(_) => {
                warnings.push(warning(
                    RunWarningCode::InvalidCaseId,
                    "case_id должен быть непустой строкой; sidecar доступен только для чтения.",
                    None,
                ));
                String::new()
            }
        };
        let result_text = scalar(map_value(&map, "result")).unwrap_or_else(|| "not_run".into());
        let result = match result_text.as_str() {
            "not_run" => RunResult::NotRun,
            "pass" => RunResult::Pass,
            "fail" => RunResult::Fail,
            "blocked" => RunResult::Blocked,
            "in_progress" => RunResult::InProgress,
            "skipped" => RunResult::Skipped,
            _ => {
                warnings.push(warning(
                    RunWarningCode::InvalidFrontmatter,
                    "Неизвестный result; показан not_run, исходное значение сохранено.",
                    None,
                ));
                RunResult::NotRun
            }
        };
        let test_date = scalar(map_value(&map, "test_date")).filter(|value| !value.is_empty());
        let mut model = RunCaseModel {
            case_id,
            display_id: scalar(map_value(&map, "display_id")).unwrap_or_default(),
            title: scalar(map_value(&map, "title")).unwrap_or_default(),
            result,
            tester: scalar(map_value(&map, "tester")).unwrap_or_default(),
            executed_at: scalar(map_value(&map, "executed_at")).unwrap_or_default(),
            test_date,
            ..RunCaseModel::default()
        };
        let body = front.as_ref().map_or(text, |front| front.body.as_str());
        let spans = scan_sections(body);
        warn_unknown_and_duplicates(&spans, &mut warnings);
        model.setup = parse_items(body, &spans, "Setup", "setup", &mut warnings);
        model.steps = parse_items(body, &spans, "Steps", "step", &mut warnings);
        model.accept = parse_items(body, &spans, "Acceptance Criteria", "accept", &mut warnings);
        model.notes = read_section(body, &spans, "Notes");
        Ok(Self {
            original: text.into(),
            front,
            original_model: model.clone(),
            model,
            warnings,
            spans,
        })
    }

    pub(crate) fn snapshot_reference(&self) -> Result<Option<(String, String)>, FormatError> {
        let Some(front) = &self.front else {
            return Ok(None);
        };
        let Value::Mapping(map) = front_value(&front.yaml)? else {
            return Ok(None);
        };
        match (
            map_value(&map, "source_snapshot"),
            map_value(&map, "source_sha256"),
        ) {
            (None, None) => Ok(None),
            (Some(Value::String(name)), Some(Value::String(revision))) => {
                Ok(Some((name.clone(), revision.clone())))
            }
            _ => Err(FormatError::new(
                FormatErrorCode::InvalidField,
                "Некорректная ссылка на snapshot исходника.",
            )),
        }
    }

    #[must_use]
    pub fn model(&self) -> &RunCaseModel {
        &self.model
    }
    #[must_use]
    pub fn warnings(&self) -> &[RunWarning] {
        &self.warnings
    }

    pub fn set_display_id(&mut self, value: String) {
        self.model.display_id = value;
    }
    pub fn set_title(&mut self, value: String) {
        self.model.title = value;
    }
    pub fn set_result(&mut self, value: RunResult) {
        self.model.result = value;
    }
    pub fn set_tester(&mut self, value: String) {
        self.model.tester = value;
    }
    pub fn set_executed_at(&mut self, value: String) {
        self.model.executed_at = value;
    }
    pub fn set_test_date(&mut self, value: Option<String>) {
        self.model.test_date = value;
    }
    /// # Errors
    /// Fails if the Setup section is duplicated.
    pub fn set_setup(&mut self, value: Vec<RunChecklistItem>) -> Result<(), FormatError> {
        unique_section(&self.spans, "Setup")?;
        self.model.setup = normalize_items(value);
        Ok(())
    }
    /// # Errors
    /// Fails if the Steps section is duplicated.
    pub fn set_steps(&mut self, value: Vec<RunChecklistItem>) -> Result<(), FormatError> {
        unique_section(&self.spans, "Steps")?;
        self.model.steps = normalize_items(value);
        Ok(())
    }
    /// # Errors
    /// Fails if Acceptance Criteria is duplicated.
    pub fn set_accept(&mut self, value: Vec<RunChecklistItem>) -> Result<(), FormatError> {
        unique_section(&self.spans, "Acceptance Criteria")?;
        self.model.accept = normalize_items(value);
        Ok(())
    }
    /// # Errors
    /// Fails if Notes is duplicated.
    pub fn set_notes(&mut self, value: String) -> Result<(), FormatError> {
        unique_section(&self.spans, "Notes")?;
        self.model.notes = value;
        Ok(())
    }

    /// Applies explicit metadata/section edits while retaining all unknown content.
    ///
    /// # Errors
    /// Returns an error if identity is invalid, content cannot be preserved, or output is oversized.
    #[allow(clippy::too_many_lines)]
    pub fn to_text(&self) -> Result<String, FormatError> {
        if self.model == self.original_model {
            return Ok(self.original.clone());
        }
        if self.original_model.case_id.trim().is_empty() {
            return Err(FormatError::new(
                FormatErrorCode::InvalidField,
                "Нельзя изменять run-case без непустого стабильного case_id.",
            ));
        }
        let mut output = self.original.clone();
        if front_changed(&self.model, &self.original_model) {
            let front = self.front.as_ref().ok_or_else(|| {
                FormatError::new(
                    FormatErrorCode::InvalidFrontMatter,
                    "Нельзя менять metadata без исходного frontmatter.",
                )
            })?;
            let value = front_value(&front.yaml)?;
            let Value::Mapping(mut map) = value else {
                return Err(FormatError::invalid_yaml(
                    "Run-case frontmatter должен быть YAML mapping.",
                ));
            };
            update_string(
                &mut map,
                "display_id",
                &self.original_model.display_id,
                &self.model.display_id,
            );
            update_string(
                &mut map,
                "title",
                &self.original_model.title,
                &self.model.title,
            );
            update_string(
                &mut map,
                "result",
                self.original_model.result.as_str(),
                self.model.result.as_str(),
            );
            update_string(
                &mut map,
                "tester",
                &self.original_model.tester,
                &self.model.tester,
            );
            update_string(
                &mut map,
                "executed_at",
                &self.original_model.executed_at,
                &self.model.executed_at,
            );
            if self.model.test_date != self.original_model.test_date {
                let key = Value::String("test_date".into());
                if let Some(date) = &self.model.test_date {
                    map.insert(key, Value::String(date.clone()));
                } else {
                    map.remove(key);
                }
            }
            let yaml = edit_frontmatter(front, map)?;
            if yaml.len() > MAX_RUN_FRONTMATTER_BYTES {
                return Err(FormatError::too_large(MAX_RUN_FRONTMATTER_BYTES));
            }
            let old = format!("{}{}{}", front.opening, front.yaml, front.closing);
            output = output.replacen(
                &old,
                &format!("{}{}{}", front.opening, yaml, front.closing),
                1,
            );
        }
        for (heading, current, original) in [
            ("Setup", &self.model.setup, &self.original_model.setup),
            ("Steps", &self.model.steps, &self.original_model.steps),
            (
                "Acceptance Criteria",
                &self.model.accept,
                &self.original_model.accept,
            ),
        ] {
            if current != original {
                let content = serialize_items(current);
                if content.len() > MAX_RUN_CASE_BYTES {
                    return Err(FormatError::too_large(MAX_RUN_CASE_BYTES));
                }
                let parsed = Self::parse(&output)?;
                output = section_edit(
                    &output,
                    parsed.front.as_ref(),
                    &parsed.spans,
                    heading,
                    &content,
                )?;
            }
        }
        if self.model.notes.trim() != self.original_model.notes.trim() {
            let parsed = Self::parse(&output)?;
            output = section_edit(
                &output,
                parsed.front.as_ref(),
                &parsed.spans,
                "Notes",
                self.model.notes.trim(),
            )?;
        }
        if output.len() > MAX_RUN_CASE_BYTES {
            return Err(FormatError::too_large(MAX_RUN_CASE_BYTES));
        }
        let parsed = Self::parse(&output)?;
        if parsed.model.setup != self.model.setup
            || parsed.model.steps != self.model.steps
            || parsed.model.accept != self.model.accept
            || parsed.model.notes != self.model.notes.trim()
        {
            return Err(FormatError::new(
                FormatErrorCode::InvalidDocument,
                format!(
                    "Правка run-case изменила структуру: setup={}, steps={}, accept={}, notes={}.",
                    parsed.model.setup == self.model.setup,
                    parsed.model.steps == self.model.steps,
                    parsed.model.accept == self.model.accept,
                    parsed.model.notes == self.model.notes.trim()
                ),
            ));
        }
        Ok(output)
    }
}

fn parse_items(
    body: &str,
    spans: &[RunSectionSpan],
    heading: &str,
    prefix: &str,
    warnings: &mut Vec<RunWarning>,
) -> Vec<RunChecklistItem> {
    let text = spans
        .iter()
        .filter(|span| span.heading == heading)
        .map(|span| normalize_section_content(body, span))
        .collect::<Vec<_>>()
        .join("\n");
    let mut items = Vec::new();
    for raw in text.lines() {
        if raw.trim().is_empty() {
            continue;
        }
        let mut line = raw.trim();
        if let Some(rest) = line
            .strip_prefix("- ")
            .or_else(|| line.strip_prefix("* "))
            .or_else(|| line.strip_prefix("+ "))
        {
            line = rest;
        }
        if let Some((ordinal, rest)) = line.split_once(". ")
            && !ordinal.is_empty()
            && ordinal.bytes().all(|byte| byte.is_ascii_digit())
        {
            line = rest;
        }
        let key = format!("{prefix}:{}", items.len());
        let (state, mut text) = if let Some(after_open) = line.strip_prefix('[') {
            if let Some((glyph, rest)) = after_open.split_once(']') {
                if glyph.len() == 1 && matches!(glyph.as_bytes()[0], b' ' | b'x' | b'X' | b'-') {
                    let state = match glyph {
                        "x" | "X" => RunCheckState::Pass,
                        "-" => RunCheckState::Fail,
                        _ => RunCheckState::None,
                    };
                    (state, rest.strip_prefix(' ').unwrap_or(rest).to_owned())
                } else {
                    warnings.push(warning(
                        RunWarningCode::InvalidChecklistMark,
                        format!("Неизвестная отметка checklist: {}.", raw.trim()),
                        None,
                    ));
                    (RunCheckState::None, loose_text(line))
                }
            } else {
                warnings.push(warning(
                    RunWarningCode::InvalidChecklistMark,
                    format!("Не распознана строка checklist: {}.", raw.trim()),
                    None,
                ));
                (RunCheckState::None, loose_text(line))
            }
        } else {
            warnings.push(warning(
                RunWarningCode::InvalidChecklistMark,
                format!("Не распознана строка checklist: {}.", raw.trim()),
                None,
            ));
            (RunCheckState::None, loose_text(line))
        };
        if let Some((ordinal, rest)) = text.split_once(". ")
            && !ordinal.is_empty()
            && ordinal.bytes().all(|byte| byte.is_ascii_digit())
        {
            text = rest.to_owned();
        }
        let mut fail_note = String::new();
        if state == RunCheckState::Fail
            && let Some(position) = text.rfind(FAIL_SEPARATOR)
        {
            fail_note = text[position + FAIL_SEPARATOR.len()..].trim().into();
            text = text[..position].trim().into();
        }
        items.push(RunChecklistItem {
            key,
            text: text.trim().into(),
            state,
            fail_note,
        });
    }
    items
}

fn loose_text(line: &str) -> String {
    let line = line
        .strip_prefix("[")
        .and_then(|line| line.split_once(']').map(|(_, rest)| rest))
        .unwrap_or(line);
    line.trim().to_owned()
}

fn serialize_items(items: &[RunChecklistItem]) -> String {
    items
        .iter()
        .map(|item| {
            let glyph = match item.state {
                RunCheckState::None => ' ',
                RunCheckState::Pass => 'x',
                RunCheckState::Fail => '-',
            };
            let numeric_prefix = item.text.split_once(". ").is_some_and(|(prefix, _)| {
                !prefix.is_empty() && prefix.bytes().all(|byte| byte.is_ascii_digit())
            });
            let text = if numeric_prefix {
                format!("1. {}", item.text)
            } else {
                item.text.clone()
            };
            let mut line = format!("- [{glyph}] {text}").trim_end().to_owned();
            if item.state == RunCheckState::Fail && !item.fail_note.trim().is_empty() {
                line.push_str(FAIL_SEPARATOR);
                line.push_str(item.fail_note.trim());
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn normalize_items(mut items: Vec<RunChecklistItem>) -> Vec<RunChecklistItem> {
    for item in &mut items {
        if item.state != RunCheckState::Fail {
            item.fail_note.clear();
        }
    }
    items
}

fn read_section(body: &str, spans: &[RunSectionSpan], heading: &str) -> String {
    spans
        .iter()
        .filter(|span| span.heading == heading)
        .map(|span| normalize_section_content(body, span))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

fn front_changed(current: &RunCaseModel, original: &RunCaseModel) -> bool {
    current.display_id != original.display_id
        || current.title != original.title
        || current.result != original.result
        || current.tester != original.tester
        || current.executed_at != original.executed_at
        || current.test_date != original.test_date
}

fn update_string(map: &mut Mapping, key: &str, old: &str, new: &str) {
    if old != new {
        map.insert(Value::String(key.into()), Value::String(new.into()));
    }
}

fn unique_section(spans: &[RunSectionSpan], heading: &str) -> Result<(), FormatError> {
    if spans.iter().filter(|span| span.heading == heading).count() > 1 {
        return Err(FormatError::new(
            FormatErrorCode::InvalidDocument,
            "Редактирование дублирующейся Markdown-секции неоднозначно.",
        ));
    }
    Ok(())
}

fn warn_unknown_and_duplicates(spans: &[RunSectionSpan], warnings: &mut Vec<RunWarning>) {
    for span in spans {
        if !RESERVED.contains(&span.heading.as_str()) {
            warnings.push(warning(
                RunWarningCode::ExtraContent,
                format!("Неизвестная секция ## {} сохранена.", span.heading),
                Some(span.line),
            ));
        }
    }
    for heading in RESERVED {
        let found: Vec<_> = spans
            .iter()
            .filter(|span| span.heading == heading)
            .collect();
        if found.len() > 1 {
            warnings.push(warning(
                RunWarningCode::DuplicateSection,
                format!("Секция {heading} встречается несколько раз."),
                found.first().map(|span| span.line),
            ));
        }
    }
}

const _: () = {
    fn check<T: Send + Sync>() {}
    let _ = check::<RunCaseModel>;
    let _ = check::<RunCaseDocument>;
};
