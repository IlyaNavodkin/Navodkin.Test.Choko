use serde::{Deserialize, Serialize};
use serde_norway::{Mapping, Value};

use super::super::run::{
    MAX_RUN_DETAILS_BYTES, MAX_RUN_FRONTMATTER_BYTES, RunApproval, RunFrontmatter, RunSectionSpan,
    RunStatus, RunWarning, RunWarningCode, edit_frontmatter, front_value, map_value,
    normalize_section_content, scalar, scan_sections, section_edit, split_frontmatter, warning,
};
use super::super::{FormatError, FormatErrorCode};

const RESERVED: [&str; 2] = ["Summary", "Notes"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunDetailsModel {
    pub name: String,
    pub status: RunStatus,
    pub created: String,
    pub test_date: String,
    pub scope: String,
    pub tester_approval: Option<RunApproval>,
    pub reviewer_approval: Option<RunApproval>,
    pub summary: String,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RunDetailsDocument {
    original: String,
    front: Option<RunFrontmatter>,
    original_model: RunDetailsModel,
    model: RunDetailsModel,
    warnings: Vec<RunWarning>,
    spans: Vec<RunSectionSpan>,
}

impl RunDetailsDocument {
    /// Parses `_run.md` while retaining exact source bytes for a no-op round trip.
    ///
    /// # Errors
    /// Returns a diagnostic for malformed YAML/frontmatter or an oversized sidecar.
    pub fn parse(text: &str) -> Result<Self, FormatError> {
        if text.len() > MAX_RUN_DETAILS_BYTES {
            return Err(FormatError::too_large(MAX_RUN_DETAILS_BYTES));
        }
        let front = split_frontmatter(text)?;
        if let Some(front) = &front
            && front.yaml.len() > MAX_RUN_FRONTMATTER_BYTES
        {
            return Err(FormatError::too_large(MAX_RUN_FRONTMATTER_BYTES));
        }
        let mut warnings = Vec::new();
        let front_value = match &front {
            Some(front) => front_value(&front.yaml)?,
            None => Value::Mapping(Mapping::new()),
        };
        let Value::Mapping(map) = front_value else {
            return Err(FormatError::invalid_yaml(
                "Run frontmatter должен быть YAML mapping.",
            ));
        };
        let status = match scalar(map_value(&map, "status"))
            .as_deref()
            .unwrap_or("open")
        {
            "open" => RunStatus::Open,
            "closed" => RunStatus::Closed,
            _ => {
                warnings.push(warning(
                    RunWarningCode::InvalidFrontmatter,
                    "Неизвестный run status; показан open, исходное значение сохранено.",
                    None,
                ));
                RunStatus::Open
            }
        };
        let tester_approval = parse_approval(
            map_value(&map, "tester_approval"),
            &mut warnings,
            "tester_approval",
        );
        let reviewer_approval = parse_approval(
            map_value(&map, "reviewer_approval"),
            &mut warnings,
            "reviewer_approval",
        );
        let mut model = RunDetailsModel {
            name: scalar(map_value(&map, "name")).unwrap_or_default(),
            status,
            created: scalar(map_value(&map, "created")).unwrap_or_default(),
            test_date: scalar(map_value(&map, "test_date")).unwrap_or_default(),
            scope: scalar(map_value(&map, "scope")).unwrap_or_default(),
            tester_approval,
            reviewer_approval,
            ..RunDetailsModel::default()
        };
        let body = front.as_ref().map_or(text, |front| front.body.as_str());
        let spans = scan_sections(body);
        warn_unknown_and_duplicates(&spans, &mut warnings);
        model.summary = read_section(body, &spans, "Summary");
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

    #[must_use]
    pub fn model(&self) -> &RunDetailsModel {
        &self.model
    }
    #[must_use]
    pub fn warnings(&self) -> &[RunWarning] {
        &self.warnings
    }

    pub fn set_name(&mut self, value: String) {
        self.model.name = value;
    }
    pub fn set_status(&mut self, value: RunStatus) {
        self.model.status = value;
    }
    pub fn set_created(&mut self, value: String) {
        self.model.created = value;
    }
    pub fn set_test_date(&mut self, value: String) {
        self.model.test_date = value;
    }
    pub fn set_scope(&mut self, value: String) {
        self.model.scope = value;
    }
    pub fn set_tester_approval(&mut self, value: Option<RunApproval>) {
        self.model.tester_approval = value;
    }
    pub fn set_reviewer_approval(&mut self, value: Option<RunApproval>) {
        self.model.reviewer_approval = value;
    }
    /// # Errors
    /// Fails if Summary is duplicated or the rendered section would change its parsed value.
    pub fn set_summary(&mut self, value: String) -> Result<(), FormatError> {
        unique_section(&self.spans, "Summary")?;
        self.model.summary = value;
        Ok(())
    }
    /// # Errors
    /// Fails if Notes is duplicated or the rendered section would change its parsed value.
    pub fn set_notes(&mut self, value: String) -> Result<(), FormatError> {
        unique_section(&self.spans, "Notes")?;
        self.model.notes = value;
        Ok(())
    }

    /// Serializes only fields explicitly changed from the parsed view.
    ///
    /// # Errors
    /// Returns an error when comments cannot be safely retained or output exceeds the limit.
    #[allow(clippy::too_many_lines)]
    pub fn to_text(&self) -> Result<String, FormatError> {
        if self.model == self.original_model {
            return Ok(self.original.clone());
        }
        let mut output = self.original.clone();
        if front_changed(&self.model, &self.original_model) {
            let front = self.front.as_ref().ok_or_else(|| {
                FormatError::new(
                    FormatErrorCode::InvalidFrontMatter,
                    "Нельзя менять metadata без исходного frontmatter.",
                )
            })?;
            let mut value = front_value(&front.yaml)?;
            let Value::Mapping(map) = &mut value else {
                return Err(FormatError::invalid_yaml(
                    "Run frontmatter должен быть YAML mapping.",
                ));
            };
            update_scalar(map, "name", &self.original_model.name, &self.model.name);
            update_scalar(
                map,
                "status",
                self.original_model.status.as_str(),
                self.model.status.as_str(),
            );
            update_scalar(
                map,
                "created",
                &self.original_model.created,
                &self.model.created,
            );
            update_scalar(
                map,
                "test_date",
                &self.original_model.test_date,
                &self.model.test_date,
            );
            update_scalar(map, "scope", &self.original_model.scope, &self.model.scope);
            if self.model.tester_approval != self.original_model.tester_approval {
                update_approval(
                    map,
                    "tester_approval",
                    self.original_model.tester_approval.as_ref(),
                    self.model.tester_approval.as_ref(),
                );
            }
            if self.model.reviewer_approval != self.original_model.reviewer_approval {
                update_approval(
                    map,
                    "reviewer_approval",
                    self.original_model.reviewer_approval.as_ref(),
                    self.model.reviewer_approval.as_ref(),
                );
            }
            let yaml = edit_frontmatter(front, map.clone())?;
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
        let body_edits = [
            (
                "Summary",
                self.model.summary.trim(),
                self.original_model.summary.trim(),
            ),
            (
                "Notes",
                self.model.notes.trim(),
                self.original_model.notes.trim(),
            ),
        ];
        for (heading, value, old) in body_edits {
            if value != old {
                let current = Self::parse(&output)?;
                output = section_edit(
                    &output,
                    current.front.as_ref(),
                    &current.spans,
                    heading,
                    value,
                )?;
            }
        }
        if output.len() > MAX_RUN_DETAILS_BYTES {
            return Err(FormatError::too_large(MAX_RUN_DETAILS_BYTES));
        }
        let reparsed = Self::parse(&output)?;
        if reparsed.model.summary != self.model.summary.trim()
            || reparsed.model.notes != self.model.notes.trim()
        {
            return Err(FormatError::new(
                FormatErrorCode::InvalidDocument,
                "Правка run-details изменила структуру секции.",
            ));
        }
        Ok(output)
    }
}

fn parse_approval(
    value: Option<&Value>,
    warnings: &mut Vec<RunWarning>,
    field: &str,
) -> Option<RunApproval> {
    match value {
        None | Some(Value::Null) => None,
        Some(Value::Mapping(map)) => {
            let name = scalar(map_value(map, "name")).unwrap_or_default();
            let at = scalar(map_value(map, "at")).unwrap_or_default();
            (!name.trim().is_empty()).then_some(RunApproval { name, at })
        }
        Some(_) => {
            warnings.push(warning(
                RunWarningCode::InvalidApproval,
                format!("{field} имеет неверный тип и показан как отсутствующий."),
                None,
            ));
            None
        }
    }
}

fn front_changed(current: &RunDetailsModel, original: &RunDetailsModel) -> bool {
    current.name != original.name
        || current.status != original.status
        || current.created != original.created
        || current.test_date != original.test_date
        || current.scope != original.scope
        || current.tester_approval != original.tester_approval
        || current.reviewer_approval != original.reviewer_approval
}

fn update_scalar(map: &mut Mapping, key: &str, old: &str, new: &str) {
    if old != new {
        map.insert(Value::String(key.into()), Value::String(new.into()));
    }
}

fn update_approval(
    map: &mut Mapping,
    key: &str,
    original: Option<&RunApproval>,
    approval: Option<&RunApproval>,
) {
    let key_value = Value::String(key.into());
    let Some(approval) = approval else {
        map.remove(key_value);
        return;
    };
    let mut nested = match map_value(map, key).cloned() {
        Some(Value::Mapping(map)) => map,
        _ => Mapping::new(),
    };
    if original.is_none_or(|old| old.name != approval.name) {
        nested.insert(
            Value::String("name".into()),
            Value::String(approval.name.clone()),
        );
    }
    if original.is_none_or(|old| old.at != approval.at) {
        nested.insert(
            Value::String("at".into()),
            Value::String(approval.at.clone()),
        );
    }
    map.insert(key_value, Value::Mapping(nested));
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
        let matches: Vec<_> = spans
            .iter()
            .filter(|span| span.heading == heading)
            .collect();
        if matches.len() > 1 {
            warnings.push(warning(
                RunWarningCode::DuplicateSection,
                format!("Секция {heading} встречается несколько раз."),
                matches.first().map(|span| span.line),
            ));
        }
    }
}

const _: () = {
    fn check<T: Send + Sync>() {}
    let _ = check::<RunDetailsModel>;
    let _ = check::<RunDetailsDocument>;
};
