//! Version 2: автотесты, привязки кейсов, аргументы, окружения и invocation-снимки.
//!
//! Семантика совпадает с browser-safe контрактом `tools/playwright-automation/src/catalog.ts`:
//! приоритет `schema → autotest → binding → run`, явные ссылки на окружение и типизированные
//! диагностики. Rust проверяет границу IPC независимо от JSON parser.
use super::{
    Result,
    contracts::{
        Attachment, Attempt, ErrorRecord, Expected, Logs, Operation, Outcome, Source, State, check,
        hash, id, outcome, relative, units, uuid,
    },
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

pub const MAX_ARGUMENTS: usize = 100;
pub const MAX_ARGUMENT_KEY: usize = 64;
pub const MAX_ARGUMENT_VALUE: usize = 4096;
pub const MAX_PAYLOAD: usize = 64 * 1024;
pub const MAX_AUTOTESTS: usize = 10_000;
pub const MAX_BINDINGS: usize = 10_000;
pub const MAX_ENVIRONMENTS: usize = 100;
pub const MAX_REVISION: usize = 128;
pub const MAX_TITLE: usize = 200;
pub const MAX_DESCRIPTION: usize = 4096;

/// JSON-примитив значения аргумента.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Primitive {
    Bool(bool),
    Number(f64),
    Text(String),
}
impl Primitive {
    pub fn valid(&self) -> bool {
        match self {
            Self::Text(value) => units(value) <= MAX_ARGUMENT_VALUE,
            Self::Number(value) => value.is_finite(),
            Self::Bool(_) => true,
        }
    }
    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text(value) => Some(value),
            Self::Number(_) | Self::Bool(_) => None,
        }
    }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ArgumentType {
    String,
    Number,
    Boolean,
    Enum,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StringFormat {
    Url,
    Ip,
}
pub fn argument_key(value: &str) -> bool {
    !value.is_empty()
        && units(value) <= MAX_ARGUMENT_KEY
        && !value.chars().any(char::is_control)
        && !matches!(value, "__proto__" | "prototype" | "constructor")
}
fn http_url(value: &str) -> bool {
    let Some(rest) = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))
    else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
    !host.is_empty() && !host.contains('@') && !host.starts_with(':')
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArgumentDefinition {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
    pub required: bool,
    #[serde(rename = "type")]
    pub kind: ArgumentType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<StringFormat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Primitive>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
}
impl ArgumentDefinition {
    pub fn validate(&self) -> Result<()> {
        let numbers = match (self.min, self.max) {
            (Some(min), Some(max)) => min.is_finite() && max.is_finite() && min <= max,
            (Some(value), None) | (None, Some(value)) => value.is_finite(),
            (None, None) => true,
        };
        let enum_options = self.options.as_ref().is_none_or(|options| {
            !options.is_empty()
                && options.len() <= 100
                && options
                    .iter()
                    .all(|value| units(value) <= MAX_ARGUMENT_VALUE)
                && options.iter().collect::<HashSet<_>>().len() == options.len()
        });
        check(
            argument_key(&self.key)
                && !self.label.is_empty()
                && units(&self.label) <= MAX_TITLE
                && units(&self.description) <= MAX_DESCRIPTION
                && numbers
                && enum_options
                && (self.kind == ArgumentType::String || self.format.is_none())
                && (self.kind == ArgumentType::Enum || self.options.is_none())
                && (self.kind == ArgumentType::Number
                    || (self.min.is_none() && self.max.is_none()))
                && self
                    .default
                    .as_ref()
                    .is_none_or(|value| self.accepts(value)),
        )
    }
    /// Проверяет значение против типа, формата, диапазона и списка вариантов.
    pub fn accepts(&self, value: &Primitive) -> bool {
        match self.kind {
            ArgumentType::Boolean => matches!(value, Primitive::Bool(_)),
            ArgumentType::Number => {
                let Primitive::Number(number) = value else {
                    return false;
                };
                number.is_finite()
                    && self.min.is_none_or(|min| *number >= min)
                    && self.max.is_none_or(|max| *number <= max)
            }
            ArgumentType::Enum => {
                let Some(text) = value.as_text() else {
                    return false;
                };
                self.options
                    .as_ref()
                    .is_some_and(|options| options.iter().any(|option| option == text))
            }
            ArgumentType::String => {
                let Some(text) = value.as_text() else {
                    return false;
                };
                if units(text) > MAX_ARGUMENT_VALUE {
                    return false;
                }
                match self.format {
                    Some(StringFormat::Url) => http_url(text),
                    Some(StringFormat::Ip) => text.parse::<std::net::IpAddr>().is_ok(),
                    None => true,
                }
            }
        }
    }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ValueSource {
    Literal,
    Environment,
}
/// Значение аргумента: литерал или явная ссылка на запись окружения.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArgumentValue {
    pub kind: ValueSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<Primitive>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}
impl ArgumentValue {
    pub fn literal(value: Primitive) -> Self {
        Self {
            kind: ValueSource::Literal,
            value: Some(value),
            entry_id: None,
            key: None,
        }
    }
    pub fn validate(&self) -> Result<()> {
        match self.kind {
            ValueSource::Literal => check(
                self.value.as_ref().is_some_and(Primitive::valid)
                    && self.entry_id.is_none()
                    && self.key.is_none(),
            ),
            ValueSource::Environment => check(
                self.value.is_none()
                    && self.entry_id.as_ref().is_some_and(|entry| uuid(entry))
                    && self.key.as_ref().is_some_and(|key| argument_key(key)),
            ),
        }
    }
    /// Канонический вид для сравнения значений и поиска дубликатов привязок.
    pub fn canonical(&self) -> String {
        match self.kind {
            ValueSource::Literal => format!(
                "literal:{}",
                serde_json::to_string(self.value.as_ref().unwrap_or(&Primitive::Bool(false)))
                    .unwrap_or_default()
            ),
            ValueSource::Environment => format!(
                "environment:{}:{}",
                self.entry_id.as_deref().unwrap_or_default(),
                self.key.as_deref().unwrap_or_default()
            ),
        }
    }
}
pub fn overrides_valid(overrides: &BTreeMap<String, ArgumentValue>) -> bool {
    overrides.len() <= MAX_ARGUMENTS
        && overrides.iter().all(|(key, value)| {
            argument_key(key)
                && value.validate().is_ok()
                && value.value.as_ref().is_none_or(Primitive::valid)
        })
        && serde_json::to_vec(overrides).is_ok_and(|bytes| bytes.len() <= MAX_PAYLOAD)
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AutotestSelector {
    pub automation_id: String,
    pub project: String,
    pub variant_id: String,
}
impl AutotestSelector {
    pub fn valid(&self) -> bool {
        [&self.automation_id, &self.project, &self.variant_id]
            .into_iter()
            .all(|value| id(value))
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Autotest {
    pub schema_version: u8,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub archived: bool,
    pub revision: String,
    pub profile_id: String,
    pub selector: AutotestSelector,
    pub argument_definitions: Vec<ArgumentDefinition>,
    #[serde(default)]
    pub defaults: BTreeMap<String, ArgumentValue>,
}
impl Autotest {
    pub fn validate(&self) -> Result<()> {
        let keys: HashSet<&String> = self
            .argument_definitions
            .iter()
            .map(|definition| &definition.key)
            .collect();
        check(
            self.schema_version == 2
                && uuid(&self.id)
                && !self.title.trim().is_empty()
                && units(&self.title) <= MAX_TITLE
                && units(&self.description) <= MAX_DESCRIPTION
                && !self.revision.is_empty()
                && units(&self.revision) <= MAX_REVISION
                && id(&self.profile_id)
                && self.selector.valid()
                && self.argument_definitions.len() <= MAX_ARGUMENTS
                && keys.len() == self.argument_definitions.len()
                && self
                    .argument_definitions
                    .iter()
                    .all(|definition| definition.validate().is_ok())
                && overrides_valid(&self.defaults)
                && self.defaults.iter().all(|(key, value)| {
                    self.argument_definitions
                        .iter()
                        .find(|definition| definition.key == *key)
                        .is_some_and(|definition| match &value.value {
                            Some(primitive) => definition.accepts(primitive),
                            None => true,
                        })
                }),
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseAutotestBinding {
    pub schema_version: u8,
    pub id: String,
    pub case_id: String,
    pub autotest_id: String,
    pub revision: String,
    pub enabled: bool,
    #[serde(default)]
    pub argument_overrides: BTreeMap<String, ArgumentValue>,
}
impl CaseAutotestBinding {
    pub fn validate(&self) -> Result<()> {
        check(
            self.schema_version == 2
                && uuid(&self.id)
                && id(&self.case_id)
                && uuid(&self.autotest_id)
                && !self.revision.is_empty()
                && units(&self.revision) <= MAX_REVISION
                && overrides_valid(&self.argument_overrides),
        )
    }
    /// Дубликатом считается та же связка кейса, автотеста и значений аргументов.
    pub fn canonical(&self) -> String {
        let overrides = self
            .argument_overrides
            .iter()
            .map(|(key, value)| format!("{key}={}", value.canonical()))
            .collect::<Vec<_>>()
            .join(",");
        format!("{}|{}|{overrides}", self.case_id, self.autotest_id)
    }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnvironmentKind {
    Environment,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnvironmentEntry {
    pub id: String,
    pub kind: EnvironmentKind,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub archived: bool,
    pub revision: String,
    pub values: BTreeMap<String, Primitive>,
}
impl EnvironmentEntry {
    pub fn validate(&self) -> Result<()> {
        check(
            uuid(&self.id)
                && !self.title.trim().is_empty()
                && units(&self.title) <= MAX_TITLE
                && units(&self.description) <= MAX_DESCRIPTION
                && !self.revision.is_empty()
                && units(&self.revision) <= MAX_REVISION
                && self.values.len() <= MAX_ARGUMENTS
                && self
                    .values
                    .iter()
                    .all(|(key, value)| argument_key(key) && value.valid())
                && serde_json::to_vec(&self.values).is_ok_and(|bytes| bytes.len() <= MAX_PAYLOAD),
        )
    }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IssueCode {
    InvalidInput,
    Unavailable,
    UnknownArgument,
    Required,
    InvalidValue,
    EnvironmentUnavailable,
    PayloadLimit,
    Stale,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Issue {
    pub code: IssueCode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}
impl Issue {
    pub const fn new(code: IssueCode) -> Self {
        Self { code, key: None }
    }
    pub fn at(code: IssueCode, key: &str) -> Self {
        Self {
            code,
            key: Some(key.into()),
        }
    }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Layer {
    Schema,
    Autotest,
    Binding,
    Run,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArgumentSource {
    pub key: String,
    pub layer: Layer,
    /// `null` вместо пропуска: browser-safe схема требует ключ с nullable-значением.
    #[serde(default)]
    pub reference: Option<ArgumentValue>,
    #[serde(default)]
    pub revision: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvocationInput {
    pub invocation_id: String,
    pub created_at: String,
    pub case_revision: String,
    pub autotest: Autotest,
    pub binding: CaseAutotestBinding,
    #[serde(default)]
    pub run_overrides: BTreeMap<String, ArgumentValue>,
    #[serde(default)]
    pub environments: Vec<EnvironmentEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvocationSnapshot {
    pub schema_version: u8,
    pub invocation_id: String,
    pub created_at: String,
    pub case_revision: String,
    pub autotest: Autotest,
    pub binding: CaseAutotestBinding,
    #[serde(default)]
    pub run_overrides: BTreeMap<String, ArgumentValue>,
    #[serde(default)]
    pub environments: Vec<EnvironmentEntry>,
    pub resolved_arguments: BTreeMap<String, Primitive>,
    pub sources: Vec<ArgumentSource>,
}
impl InvocationSnapshot {
    pub fn validate(&self) -> Result<()> {
        check(
            self.schema_version == 2
                && uuid(&self.invocation_id)
                && !self.case_revision.is_empty()
                && units(&self.case_revision) <= MAX_REVISION
                && self.autotest.validate().is_ok()
                && self.binding.validate().is_ok()
                && self.binding.autotest_id == self.autotest.id
                && overrides_valid(&self.run_overrides)
                && self.environments.len() <= MAX_ENVIRONMENTS
                && self
                    .environments
                    .iter()
                    .map(|entry| &entry.id)
                    .collect::<HashSet<_>>()
                    .len()
                    == self.environments.len()
                && self
                    .environments
                    .iter()
                    .all(|entry| entry.validate().is_ok())
                && self.sources.len() <= MAX_ARGUMENTS
                && self
                    .resolved_arguments
                    .iter()
                    .all(|(key, value)| argument_key(key) && value.valid())
                && serde_json::to_vec(&self.resolved_arguments)
                    .is_ok_and(|bytes| bytes.len() <= MAX_PAYLOAD),
        )
    }
}
fn input_valid(input: &InvocationInput) -> bool {
    input.autotest.validate().is_ok()
        && input.binding.validate().is_ok()
        && uuid(&input.invocation_id)
        && !input.case_revision.is_empty()
        && units(&input.case_revision) <= MAX_REVISION
        && chrono::DateTime::parse_from_rfc3339(&input.created_at).is_ok()
        && overrides_valid(&input.run_overrides)
        && input.environments.len() <= MAX_ENVIRONMENTS
        && input
            .environments
            .iter()
            .all(|entry| entry.validate().is_ok())
        && input
            .environments
            .iter()
            .map(|entry| &entry.id)
            .collect::<HashSet<_>>()
            .len()
            == input.environments.len()
}
/// Разрешает значения invocation по приоритету и возвращает типизированные диагностики.
#[allow(clippy::too_many_lines)] // Один проход по слоям значений и диагностикам.
pub fn create_invocation_snapshot(
    input: &InvocationInput,
) -> std::result::Result<InvocationSnapshot, Vec<Issue>> {
    if !input_valid(input) {
        return Err(vec![Issue::new(IssueCode::InvalidInput)]);
    }
    if input.autotest.archived
        || !input.binding.enabled
        || input.binding.autotest_id != input.autotest.id
    {
        return Err(vec![Issue::new(IssueCode::Unavailable)]);
    }
    let mut issues: Vec<Issue> = Vec::new();
    let mut chosen: HashMap<String, (ArgumentValue, Layer)> = HashMap::new();
    for definition in &input.autotest.argument_definitions {
        if let Some(default) = &definition.default {
            chosen.insert(
                definition.key.clone(),
                (ArgumentValue::literal(default.clone()), Layer::Schema),
            );
        }
    }
    for (layer, overrides) in [
        (Layer::Autotest, &input.autotest.defaults),
        (Layer::Binding, &input.binding.argument_overrides),
        (Layer::Run, &input.run_overrides),
    ] {
        for (key, value) in overrides {
            if !input
                .autotest
                .argument_definitions
                .iter()
                .any(|definition| definition.key == *key)
            {
                issues.push(Issue::at(IssueCode::UnknownArgument, key));
            }
            chosen.insert(key.clone(), (value.clone(), layer));
        }
    }
    let mut resolved = BTreeMap::new();
    let mut sources = Vec::new();
    let mut used: Vec<EnvironmentEntry> = Vec::new();
    for definition in &input.autotest.argument_definitions {
        let Some((value, layer)) = chosen.get(&definition.key) else {
            if definition.required {
                issues.push(Issue::at(IssueCode::Required, &definition.key));
            }
            continue;
        };
        let (primitive, reference, revision) = match value.kind {
            ValueSource::Literal => (value.value.clone(), None, None),
            ValueSource::Environment => {
                let entry_id = value.entry_id.as_deref().unwrap_or_default();
                let env_key = value.key.as_deref().unwrap_or_default();
                let entry = input
                    .environments
                    .iter()
                    .find(|entry| entry.id == entry_id && !entry.archived);
                let Some(entry) = entry else {
                    issues.push(Issue::at(
                        IssueCode::EnvironmentUnavailable,
                        &definition.key,
                    ));
                    continue;
                };
                let Some(primitive) = entry.values.get(env_key) else {
                    issues.push(Issue::at(
                        IssueCode::EnvironmentUnavailable,
                        &definition.key,
                    ));
                    continue;
                };
                if !used.iter().any(|item| item.id == entry.id) {
                    used.push(entry.clone());
                }
                (
                    Some(primitive.clone()),
                    Some(value.clone()),
                    Some(entry.revision.clone()),
                )
            }
        };
        let Some(primitive) = primitive else {
            issues.push(Issue::at(IssueCode::InvalidValue, &definition.key));
            continue;
        };
        if !definition.accepts(&primitive) {
            issues.push(Issue::at(IssueCode::InvalidValue, &definition.key));
            continue;
        }
        resolved.insert(definition.key.clone(), primitive);
        sources.push(ArgumentSource {
            key: definition.key.clone(),
            layer: *layer,
            reference,
            revision,
        });
    }
    if !serde_json::to_vec(&resolved).is_ok_and(|bytes| bytes.len() <= MAX_PAYLOAD) {
        issues.push(Issue::new(IssueCode::PayloadLimit));
    }
    if !issues.is_empty() {
        return Err(issues);
    }
    Ok(InvocationSnapshot {
        schema_version: 2,
        invocation_id: input.invocation_id.clone(),
        created_at: input.created_at.clone(),
        case_revision: input.case_revision.clone(),
        autotest: input.autotest.clone(),
        binding: input.binding.clone(),
        run_overrides: input.run_overrides.clone(),
        environments: used,
        resolved_arguments: resolved,
        sources,
    })
}
/// Сравниваются источники снимка: identity и время invocation при preview не фиксируются.
fn preview_signature(snapshot: &InvocationSnapshot) -> Option<String> {
    serde_json::to_string(&serde_json::json!({
        "autotest": snapshot.autotest,
        "binding": snapshot.binding,
        "runOverrides": snapshot.run_overrides,
        "environments": snapshot.environments,
        "resolvedArguments": snapshot.resolved_arguments,
        "sources": snapshot.sources,
    }))
    .ok()
}
/// Снимок остаётся валидным только пока источники совпадают: иначе `STALE`.
pub fn validate_invocation_preview(
    snapshot: &InvocationSnapshot,
    current: &InvocationInput,
) -> std::result::Result<(), Vec<Issue>> {
    let refreshed = create_invocation_snapshot(current)?;
    if preview_signature(&refreshed).is_some()
        && preview_signature(&refreshed) == preview_signature(snapshot)
    {
        Ok(())
    } else {
        Err(vec![Issue::new(IssueCode::Stale)])
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub schema_version: u8,
    pub autotests: Vec<Autotest>,
    pub bindings: Vec<CaseAutotestBinding>,
}
impl Default for Catalog {
    fn default() -> Self {
        Self {
            schema_version: 2,
            autotests: vec![],
            bindings: vec![],
        }
    }
}
impl Catalog {
    pub fn validate(&self) -> Result<()> {
        check(self.schema_version == 2 && self.autotests.len() <= MAX_AUTOTESTS)?;
        check(self.bindings.len() <= MAX_BINDINGS)?;
        let mut ids: HashSet<&String> = HashSet::new();
        for test in &self.autotests {
            test.validate()?;
            check(ids.insert(&test.id))?;
        }
        let mut binding_ids: HashSet<&String> = HashSet::new();
        let mut binding_keys: HashSet<String> = HashSet::new();
        for binding in &self.bindings {
            binding.validate()?;
            check(
                binding_ids.insert(&binding.id)
                    && ids.contains(&binding.autotest_id)
                    && binding_keys.insert(binding.canonical()),
            )?;
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    #[default]
    Run,
    Import,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u8,
    pub run_id: String,
    pub execution_id: String,
    pub parent_execution_id: Option<String>,
    pub profile_id: String,
    pub profile_revision: String,
    pub catalog_revision: Option<String>,
    pub created_at: String,
    pub source: Source,
    pub invocations: Vec<InvocationSnapshot>,
    pub operation: Operation,
    pub profile: super::contracts::Profile,
    pub output_root: String,
    ///  помечает execution, собранный из внешнего отчёта: discovery-каталога у него нет.
    #[serde(default)]
    pub source_kind: SourceKind,
}
impl Manifest {
    pub fn validate(&self) -> Result<()> {
        let mut ids: HashSet<&String> = HashSet::new();
        check(
            self.schema_version == 2
                && relative(&self.run_id)
                && uuid(&self.execution_id)
                && self
                    .parent_execution_id
                    .as_ref()
                    .is_none_or(|parent| uuid(parent) && parent != &self.execution_id)
                && id(&self.profile_id)
                && hash(&self.profile_revision)
                && self
                    .catalog_revision
                    .as_ref()
                    .is_none_or(|value| hash(value))
                && chrono::DateTime::parse_from_rfc3339(&self.created_at).is_ok()
                && self.invocations.len() <= MAX_AUTOTESTS
                && self.profile.validate().is_ok()
                && self.profile.profile_id == self.profile_id
                && self.invocations.iter().all(|invocation| {
                    invocation.validate().is_ok()
                        && invocation.autotest.profile_id == self.profile_id
                        && self
                            .profile
                            .projects
                            .contains(&invocation.autotest.selector.project)
                        && ids.insert(&invocation.invocation_id)
                })
                && (self.operation != Operation::Run
                    || !self.invocations.is_empty()
                    || self.source_kind == SourceKind::Import)
                && (self.source_kind != SourceKind::Run
                    || self.operation != Operation::Run
                    || self.catalog_revision.is_some())
                && (self.operation != Operation::Discover || self.invocations.is_empty()),
        )
    }
}
/// Результат одного invocation: ключ может повторяться при разных аргументах.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvocationTest {
    pub invocation_id: String,
    pub case_id: String,
    pub automation_id: String,
    pub project: String,
    pub variant_id: String,
    pub title: String,
    pub file: String,
    pub expected_status: Expected,
    pub outcome: Outcome,
    pub attempts: Vec<Attempt>,
}
impl InvocationTest {
    pub fn validate(&self) -> Result<()> {
        check(
            uuid(&self.invocation_id)
                && id(&self.case_id)
                && id(&self.automation_id)
                && id(&self.project)
                && id(&self.variant_id)
                && units(&self.title) <= MAX_DESCRIPTION
                && units(&self.file) <= 1024
                && self.attempts.len() <= 100
                && self.outcome == outcome(self.expected_status, &self.attempts),
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Report {
    pub schema_version: u8,
    pub run_id: String,
    pub execution_id: String,
    pub parent_execution_id: Option<String>,
    pub profile_id: String,
    pub profile_revision: String,
    pub catalog_revision: Option<String>,
    pub created_at: String,
    pub source: Source,
    pub state: State,
    pub reason: Option<String>,
    pub started_at: String,
    pub finished_at: String,
    pub complete: bool,
    pub tests: Vec<InvocationTest>,
    pub runner_errors: Vec<ErrorRecord>,
    pub logs: Logs,
    pub attachments: Vec<Attachment>,
}
fn attachment_ids(attachments: &[Attachment]) -> HashSet<&String> {
    attachments
        .iter()
        .map(|attachment| &attachment.id)
        .collect()
}
impl Report {
    /// Проверяет форму, лимиты и уникальность invocation без сверки с manifest.
    pub fn validate_shape(&self) -> Result<()> {
        check(
            self.schema_version == 2
                && relative(&self.run_id)
                && uuid(&self.execution_id)
                && self
                    .parent_execution_id
                    .as_ref()
                    .is_none_or(|parent| uuid(parent) && parent != &self.execution_id)
                && id(&self.profile_id)
                && hash(&self.profile_revision)
                && self
                    .catalog_revision
                    .as_ref()
                    .is_none_or(|value| hash(value))
                && chrono::DateTime::parse_from_rfc3339(&self.created_at).is_ok()
                && chrono::DateTime::parse_from_rfc3339(&self.started_at).is_ok()
                && chrono::DateTime::parse_from_rfc3339(&self.finished_at).is_ok()
                && self.complete
                && self.state != State::Running
                && self
                    .reason
                    .as_ref()
                    .is_none_or(|value| units(value) <= MAX_DESCRIPTION)
                && self.tests.len() <= MAX_AUTOTESTS
                && self.attachments.len() <= 100
                && self.runner_errors.len() <= 100
                && self.source.commit.as_ref().is_none_or(|commit| {
                    (40..=64).contains(&commit.len())
                        && commit
                            .bytes()
                            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
                })
                && self
                    .source
                    .branch
                    .as_ref()
                    .is_none_or(|branch| units(branch) <= 1024),
        )?;
        let ids = attachment_ids(&self.attachments);
        check(
            ids.len() == self.attachments.len()
                && self.attachments.iter().all(|attachment| {
                    uuid(&attachment.id)
                        && units(&attachment.name) <= 256
                        && attachment.content_type.len() <= 100
                        && attachment.size <= 25 * 1024 * 1024
                        && attachment.path.as_ref().is_none_or(|path| relative(path))
                        && attachment
                            .unavailable_reason
                            .as_ref()
                            .is_none_or(|reason| units(reason) <= 256)
                        && (attachment.path.is_some() || attachment.unavailable_reason.is_some())
                })
                && self.attachments.iter().map(|a| a.size).sum::<u64>() <= 100 * 1024 * 1024,
        )?;
        let mut seen: HashSet<&String> = HashSet::new();
        let mut logs = self.logs.stdout.len() + self.logs.stderr.len();
        for test in &self.tests {
            test.validate()?;
            check(seen.insert(&test.invocation_id))?;
            for attempt in &test.attempts {
                check(
                    attempt.errors.len() <= 100
                        && attempt.attachments.len() <= 100
                        && attempt.attachments.iter().all(|id| ids.contains(id)),
                )?;
                logs += attempt.stdout.len() + attempt.stderr.len();
            }
        }
        check(logs <= super::contracts::MAX_LOG)
    }
    /// Независимая сверка version 2 с manifest, включая каждый invocation.
    pub fn validate(&self, manifest: &Manifest) -> Result<()> {
        self.validate_shape()?;
        check(
            self.run_id == manifest.run_id
                && self.execution_id == manifest.execution_id
                && self.parent_execution_id == manifest.parent_execution_id
                && self.profile_id == manifest.profile_id
                && self.profile_revision == manifest.profile_revision
                && self.catalog_revision == manifest.catalog_revision
                && self.created_at == manifest.created_at
                && self.source == manifest.source,
        )?;
        let expected: HashSet<&String> = manifest
            .invocations
            .iter()
            .map(|invocation| &invocation.invocation_id)
            .collect();
        check(
            self.tests
                .iter()
                .all(|test| expected.contains(&test.invocation_id))
                && (self.state != State::Completed
                    || (self.runner_errors.is_empty()
                        && self.tests.len() == manifest.invocations.len()
                        && self.tests.iter().all(|test| {
                            !test.attempts.is_empty() && test.outcome != Outcome::Interrupted
                        }))),
        )
    }
}
/// Discovery-каталог версии 2: тесты профиля, найденные до исполнения.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Discovery {
    pub schema_version: u8,
    pub execution_id: String,
    pub profile_id: String,
    pub profile_revision: String,
    pub catalog_revision: String,
    pub tests: Vec<super::contracts::CatalogTest>,
    pub dependencies: Vec<String>,
}
impl Discovery {
    pub fn validate(&self, manifest: &Manifest) -> Result<()> {
        check(
            self.schema_version == 2
                && self.execution_id == manifest.execution_id
                && self.profile_id == manifest.profile_id
                && self.profile_revision == manifest.profile_revision
                && hash(&self.catalog_revision)
                && self.tests.len() <= MAX_AUTOTESTS
                && self.dependencies.len() <= 100
                && self.dependencies.iter().all(|value| id(value))
                && self
                    .tests
                    .iter()
                    .map(super::contracts::CatalogTest::key)
                    .collect::<HashSet<_>>()
                    .len()
                    == self.tests.len()
                && self.tests.iter().all(|test| {
                    test.key().valid()
                        && units(&test.title) <= MAX_DESCRIPTION
                        && units(&test.file) <= 1024
                        && manifest.profile.projects.contains(&test.project)
                }),
        )
    }
}
/// Готовая к публикации сводка отчёта для frontend: без абсолютных путей.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub state: State,
    pub started_at: String,
    pub finished_at: String,
    pub source: Source,
    pub reason: Option<String>,
    pub logs: Logs,
    pub runner_errors: Vec<ErrorRecord>,
    pub attachments: Vec<Attachment>,
    pub test_count: usize,
    pub details_truncated: bool,
}
impl Overview {
    pub fn new(report: &Report) -> Self {
        Self {
            state: report.state,
            started_at: report.started_at.clone(),
            finished_at: report.finished_at.clone(),
            source: report.source.clone(),
            reason: report.reason.clone(),
            logs: report.logs.clone(),
            runner_errors: report.runner_errors.clone(),
            attachments: report.attachments.clone(),
            test_count: report.tests.len(),
            details_truncated: false,
        }
    }
}
