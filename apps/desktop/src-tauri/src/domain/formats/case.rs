use serde::{Deserialize, Serialize};
use serde_norway::{Mapping, Value};

mod body;
#[cfg(test)]
mod tests;
use body::{
    Section, Span, bullets, content, index, render_section, scan, section_name, setup, steps,
};

use super::{FormatError, FormatErrorCode, yaml};

const MAX_CASE_BYTES: usize = 2 * 1024 * 1024;
const MAX_CASE_FRONTMATTER_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CaseStatus {
    #[default]
    Draft,
    Active,
    Deprecated,
}

impl CaseStatus {
    fn text(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Active => "active",
            Self::Deprecated => "deprecated",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseStep {
    pub text: String,
    pub depth: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseSetupItem {
    pub name: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CaseModel {
    pub id: Option<String>,
    pub display_id: String,
    pub title: String,
    pub slug: Option<String>,
    pub status: CaseStatus,
    pub tags: Vec<String>,
    pub objective: String,
    pub systems: Vec<String>,
    pub setup: Vec<CaseSetupItem>,
    pub steps: Vec<CaseStep>,
    pub acceptance_criteria: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CaseWarningCode {
    MissingId,
    InvalidId,
    InvalidTags,
    InvalidStatus,
    ExtraContent,
    DuplicateSection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseWarning {
    pub code: CaseWarningCode,
    pub message: String,
    pub line: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Front {
    opening: String,
    yaml: String,
    closing: String,
    body: String,
}

/// Typed, loss-preserving view/editor of a case Markdown document.
#[derive(Debug, Clone, PartialEq)]
pub struct CaseDocument {
    original: String,
    front: Option<Front>,
    original_model: CaseModel,
    model: CaseModel,
    warnings: Vec<CaseWarning>,
    front_dirty: bool,
    dirty: Vec<Section>,
    spans: Vec<Span>,
}

impl CaseDocument {
    /// Creates a separate source-preserving document with a fresh identity.
    /// Existing document identity remains immutable through all editing methods.
    pub(crate) fn duplicate(&self, id: &str) -> Result<Self, FormatError> {
        let front = self
            .front
            .as_ref()
            .ok_or_else(|| FormatError::invalid_yaml("Нет frontmatter для копирования."))?;
        let mut value = yaml::parse_value(&front.yaml)?;
        let Value::Mapping(map) = &mut value else {
            return Err(FormatError::invalid_yaml(
                "Frontmatter должен быть mapping.",
            ));
        };
        map.insert(Value::String("id".into()), Value::String(id.into()));
        let rendered = yaml::edit_value(&front.yaml, value)?;
        Self::parse(&format!(
            "{}{}{}{}",
            front.opening, rendered, front.closing, front.body
        ))
    }
    /// Reads a case without synthesizing identity or normalizing source bytes.
    ///
    /// # Errors
    /// Returns a diagnostic for invalid YAML/frontmatter or input beyond configured limits.
    pub fn parse(text: &str) -> Result<Self, FormatError> {
        if text.len() > MAX_CASE_BYTES {
            return Err(FormatError::too_large(MAX_CASE_BYTES));
        }
        let front = split_front(text)?;
        let (mut model, mut warnings) = if let Some(front) = &front {
            if front.yaml.len() > MAX_CASE_FRONTMATTER_BYTES {
                return Err(FormatError::too_large(MAX_CASE_FRONTMATTER_BYTES));
            }
            parse_front(&front.yaml)?
        } else {
            (CaseModel::default(), Vec::new())
        };
        if model.id.as_deref().is_none_or(str::is_empty) {
            warnings.push(warn(
                CaseWarningCode::MissingId,
                "У кейса отсутствует стабильный id.",
            ));
        }
        let raw_body = front.as_ref().map_or(text, |fm| fm.body.as_str());
        let spans = scan(raw_body);
        let mut counts = [0_u8; 5];
        for span in &spans {
            if let Some(kind) = span.kind {
                counts[index(kind)] = counts[index(kind)].saturating_add(1);
            } else {
                warnings.push(CaseWarning {
                    code: CaseWarningCode::ExtraContent,
                    message: format!("Неизвестная Markdown-секция ## {} сохранена.", span.heading),
                    line: Some(span.line),
                });
            }
        }
        for kind in [
            Section::Objective,
            Section::Systems,
            Section::Setup,
            Section::Steps,
            Section::Acceptance,
        ] {
            if counts[index(kind)] > 1 {
                warnings.push(CaseWarning {
                    code: CaseWarningCode::DuplicateSection,
                    message: format!("Секция {} встречается несколько раз.", section_name(kind)),
                    line: spans
                        .iter()
                        .find(|span| span.kind == Some(kind))
                        .map(|span| span.line),
                });
            }
        }
        let objective = content(raw_body, &spans, Section::Objective);
        objective.trim().clone_into(&mut model.objective);
        model.systems = bullets(&content(raw_body, &spans, Section::Systems));
        model.setup = setup(&content(raw_body, &spans, Section::Setup));
        model.steps = steps(&content(raw_body, &spans, Section::Steps));
        model.acceptance_criteria = bullets(&content(raw_body, &spans, Section::Acceptance));
        Ok(Self {
            original: text.to_owned(),
            front,
            original_model: model.clone(),
            model,
            warnings,
            front_dirty: false,
            dirty: Vec::new(),
            spans,
        })
    }

    #[must_use]
    pub fn model(&self) -> &CaseModel {
        &self.model
    }
    #[must_use]
    pub fn warnings(&self) -> &[CaseWarning] {
        &self.warnings
    }

    pub fn set_title(&mut self, value: String) {
        self.model.title = value;
        self.front_dirty = true;
    }
    pub fn set_status(&mut self, value: CaseStatus) {
        self.model.status = value;
        self.front_dirty = true;
    }
    pub fn set_tags(&mut self, value: Vec<String>) {
        self.model.tags = value;
        self.front_dirty = true;
    }
    pub fn set_display_id(&mut self, value: String) {
        self.model.display_id = value;
        self.front_dirty = true;
    }
    pub fn set_slug(&mut self, value: Option<String>) {
        self.model.slug = value;
        self.front_dirty = true;
    }
    /// # Errors
    /// Fails when the Objective section is duplicated.
    pub fn set_objective(&mut self, value: String) -> Result<(), FormatError> {
        self.set_section(Section::Objective, |m| m.objective = value)
    }
    /// # Errors
    /// Fails when the Systems in Scope section is duplicated.
    pub fn set_systems(&mut self, value: Vec<String>) -> Result<(), FormatError> {
        self.set_section(Section::Systems, |m| m.systems = value)
    }
    /// # Errors
    /// Fails when the Setup section is duplicated.
    pub fn set_setup(&mut self, value: Vec<CaseSetupItem>) -> Result<(), FormatError> {
        self.set_section(Section::Setup, |m| m.setup = value)
    }
    /// # Errors
    /// Fails when the Steps section is duplicated.
    pub fn set_steps(&mut self, value: Vec<CaseStep>) -> Result<(), FormatError> {
        self.set_section(Section::Steps, |m| m.steps = value)
    }
    /// # Errors
    /// Fails when Acceptance Criteria or its legacy alias is duplicated.
    pub fn set_acceptance_criteria(&mut self, value: Vec<String>) -> Result<(), FormatError> {
        self.set_section(Section::Acceptance, |m| m.acceptance_criteria = value)
    }

    fn set_section(
        &mut self,
        kind: Section,
        update: impl FnOnce(&mut CaseModel),
    ) -> Result<(), FormatError> {
        if self
            .spans
            .iter()
            .filter(|span| span.kind == Some(kind))
            .count()
            > 1
        {
            return Err(FormatError::new(
                FormatErrorCode::InvalidDocument,
                "Редактирование дублирующейся секции небезопасно.",
            ));
        }
        update(&mut self.model);
        if !self.dirty.contains(&kind) {
            self.dirty.push(kind);
        }
        Ok(())
    }

    /// Applies only explicitly selected edits; unknown sections and metadata remain source-backed.
    ///
    /// # Errors
    /// Returns a diagnostic when preservation cannot be established or output exceeds its limit.
    pub fn to_text(&self) -> Result<String, FormatError> {
        if self.model == self.original_model {
            return Ok(self.original.clone());
        }
        let active_dirty: Vec<_> = self
            .dirty
            .iter()
            .copied()
            .filter(|kind| !same_section(*kind, &self.original_model, &self.model))
            .collect();
        if ((self.front_dirty && self.model != self.original_model) || !active_dirty.is_empty())
            && self.original_model.id.as_deref().is_none_or(str::is_empty)
        {
            return Err(FormatError::new(
                FormatErrorCode::InvalidField,
                "Нельзя изменять кейс без непустого стабильного id.",
            ));
        }
        if !self.front_dirty && self.dirty.is_empty() {
            return Ok(self.original.clone());
        }
        let mut output = self.original.clone();
        if self.front_dirty {
            let Some(front) = &self.front else {
                return Err(FormatError::new(
                    FormatErrorCode::InvalidFrontMatter,
                    "Нельзя менять metadata без исходного frontmatter.",
                ));
            };
            let rendered = edit_front(&front.yaml, &self.original_model, &self.model)?;
            let old = format!("{}{}{}", front.opening, front.yaml, front.closing);
            output = output.replacen(
                &old,
                &format!("{}{}{}", front.opening, rendered, front.closing),
                1,
            );
        }
        if !active_dirty.is_empty() {
            let original_body = self
                .front
                .as_ref()
                .map_or(self.original.as_str(), |front| front.body.as_str());
            let eol = if original_body.contains("\r\n") {
                "\r\n"
            } else {
                "\n"
            };
            let mut edits = Vec::new();
            for kind in &active_dirty {
                let section = render_section(*kind, &self.model, eol);
                if section.len() > MAX_CASE_BYTES {
                    return Err(FormatError::too_large(MAX_CASE_BYTES));
                }
                if let Some(span) = self.spans.iter().find(|span| span.kind == Some(*kind)) {
                    let heading_prefix = format!("## {}{eol}{eol}", section_name(*kind));
                    let replacement = section.strip_prefix(&heading_prefix).unwrap_or_default();
                    edits.push((
                        span.start,
                        span.end,
                        format!("{eol}{replacement}{eol}{eol}"),
                    ));
                } else {
                    edits.push((
                        original_body.len(),
                        original_body.len(),
                        format!("{eol}{}{eol}{eol}", section.trim_start_matches(eol)),
                    ));
                }
            }
            edits.sort_by_key(|edit| std::cmp::Reverse(edit.0));
            let mut body = original_body.to_owned();
            for (start, end, replacement) in edits {
                body.replace_range(start..end, &replacement);
            }
            if self.front.is_some() {
                let offset = output.len() - original_body.len();
                output.replace_range(offset.., &body);
            } else {
                output = body;
            }
        }
        if !active_dirty.is_empty() {
            let reparsed = Self::parse(&output)?;
            if active_dirty
                .iter()
                .any(|kind| !same_section(*kind, &self.model, &reparsed.model))
            {
                return Err(FormatError::new(
                    FormatErrorCode::InvalidDocument,
                    "Правка секции изменила бы структуру Markdown; исходный документ не затронут.",
                ));
            }
        }
        if output.len() > MAX_CASE_BYTES {
            return Err(FormatError::too_large(MAX_CASE_BYTES));
        }
        Ok(output)
    }
}

fn parse_front(source: &str) -> Result<(CaseModel, Vec<CaseWarning>), FormatError> {
    if source.trim().is_empty() {
        return Ok((CaseModel::default(), Vec::new()));
    }
    let value = yaml::parse_value(source)?;
    let Value::Mapping(map) = &value else {
        return Err(FormatError::invalid_yaml(
            "Frontmatter должен быть YAML mapping.",
        ));
    };
    let mut warnings = Vec::new();
    let status_text = scalar(map, "status").unwrap_or_else(|| "draft".into());
    let status = match status_text.as_str() {
        "draft" => CaseStatus::Draft,
        "active" => CaseStatus::Active,
        "deprecated" => CaseStatus::Deprecated,
        _ => {
            warnings.push(warn(
                CaseWarningCode::InvalidStatus,
                "Неизвестный status; показан draft.",
            ));
            CaseStatus::Draft
        }
    };
    let id = match map.get(Value::String("id".into())) {
        None => None,
        Some(Value::String(value)) => Some(value.clone()),
        Some(_) => {
            warnings.push(warn(
                CaseWarningCode::InvalidId,
                "id должен быть строкой; значение сохранено, но не используется как identity.",
            ));
            None
        }
    };
    let tags = match map.get(Value::String("tags".into())) {
        None => Vec::new(),
        Some(Value::Null) => {
            warnings.push(warn(
                CaseWarningCode::InvalidTags,
                "tags не является массивом; исходное значение сохранено.",
            ));
            Vec::new()
        }
        Some(Value::Sequence(values)) => {
            if values.iter().any(|value| value_string(value).is_none()) {
                warnings.push(warn(
                    CaseWarningCode::InvalidTags,
                    "В tags есть нес scalar-значение; исходный список оставлен без интерпретации.",
                ));
                Vec::new()
            } else {
                values.iter().filter_map(value_string).collect()
            }
        }
        Some(_) => {
            warnings.push(warn(
                CaseWarningCode::InvalidTags,
                "tags не соответствует массиву строк; исходное значение сохранено.",
            ));
            Vec::new()
        }
    };
    Ok((
        CaseModel {
            id,
            display_id: scalar(map, "displayId").unwrap_or_default(),
            title: scalar(map, "title").unwrap_or_default(),
            slug: scalar(map, "slug").filter(|s| !s.trim().is_empty()),
            status,
            tags,
            ..CaseModel::default()
        },
        warnings,
    ))
}

fn scalar(map: &Mapping, key: &str) -> Option<String> {
    map.get(Value::String(key.into())).and_then(value_string)
}
fn value_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Bool(v) => Some(v.to_string()),
        Value::Number(v) => Some(v.to_string()),
        Value::Null => Some("null".into()),
        _ => None,
    }
}
fn edit_front(
    source: &str,
    original: &CaseModel,
    model: &CaseModel,
) -> Result<String, FormatError> {
    let mut value = yaml::parse_value(source)?;
    let Value::Mapping(map) = &mut value else {
        return Err(FormatError::invalid_yaml(
            "Frontmatter должен быть YAML mapping.",
        ));
    };
    if model.display_id != original.display_id {
        map.insert(
            Value::String("displayId".into()),
            Value::String(model.display_id.clone()),
        );
    }
    if model.title != original.title {
        map.insert(
            Value::String("title".into()),
            Value::String(model.title.clone()),
        );
    }
    if model.status != original.status {
        map.insert(
            Value::String("status".into()),
            Value::String(model.status.text().into()),
        );
    }
    if model.tags != original.tags {
        map.insert(
            Value::String("tags".into()),
            Value::Sequence(model.tags.iter().cloned().map(Value::String).collect()),
        );
    }
    if model.slug != original.slug {
        if let Some(slug) = &model.slug {
            map.insert(Value::String("slug".into()), Value::String(slug.clone()));
        } else {
            map.remove(Value::String("slug".into()));
        }
    }
    let output = yaml::edit_value(source, value)?;
    if output.len() > MAX_CASE_FRONTMATTER_BYTES {
        return Err(FormatError::too_large(MAX_CASE_FRONTMATTER_BYTES));
    }
    Ok(output)
}

fn warn(code: CaseWarningCode, message: &str) -> CaseWarning {
    CaseWarning {
        code,
        message: message.into(),
        line: None,
    }
}

fn same_section(kind: Section, expected: &CaseModel, actual: &CaseModel) -> bool {
    match kind {
        Section::Objective => expected.objective == actual.objective,
        Section::Systems => expected.systems == actual.systems,
        Section::Setup => expected.setup == actual.setup,
        Section::Steps => expected.steps == actual.steps,
        Section::Acceptance => expected.acceptance_criteria == actual.acceptance_criteria,
    }
}

fn split_front(text: &str) -> Result<Option<Front>, FormatError> {
    let Some((opening, start)) = line(text, 0) else {
        return Ok(None);
    };
    if opening.trim_end_matches(['\r', '\n']) != "---" {
        return Ok(None);
    }
    let mut cursor = start;
    while let Some((current, end)) = line(text, cursor) {
        let current = current.trim_end_matches(['\r', '\n']);
        if current == "---" || current == "..." {
            return Ok(Some(Front {
                opening: text[..start].to_owned(),
                yaml: text[start..cursor].to_owned(),
                closing: text[cursor..end].to_owned(),
                body: text[end..].to_owned(),
            }));
        }
        cursor = end;
    }
    Err(FormatError::new(
        FormatErrorCode::InvalidFrontMatter,
        "Frontmatter открыт, но не закрыт.",
    ))
}
fn line(text: &str, start: usize) -> Option<(&str, usize)> {
    if start >= text.len() {
        return None;
    }
    let end = text[start..]
        .find('\n')
        .map_or(text.len(), |at| start + at + 1);
    Some((&text[start..end], end))
}
