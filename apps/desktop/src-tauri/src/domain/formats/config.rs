use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_norway::{Number, Value};

use super::{FormatError, FormatErrorCode, yaml};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub(super) enum YamlScalar {
    String(String),
    Bool(bool),
    Number(Number),
    Null(()),
}

impl YamlScalar {
    pub(super) fn coerced_string(&self) -> String {
        match self {
            Self::String(value) => value.clone(),
            Self::Bool(value) => value.to_string(),
            Self::Number(value) => value.to_string(),
            Self::Null(()) => "null".into(),
        }
    }

    fn integer(&self) -> Option<i64> {
        match self {
            Self::String(value) => value.parse().ok(),
            Self::Bool(value) => Some(i64::from(*value)),
            Self::Number(value) => value.as_i64(),
            Self::Null(()) => Some(0),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
pub(super) enum ScalarField {
    #[default]
    Missing,
    Present(YamlScalar),
}

impl ScalarField {
    pub(super) fn is_missing(&self) -> bool {
        matches!(self, Self::Missing)
    }

    pub(super) fn as_string(&self) -> Option<String> {
        match self {
            Self::Missing => None,
            Self::Present(value) => Some(value.coerced_string()),
        }
    }

    pub(super) fn set_string(&mut self, value: Option<String>) {
        *self = value.map_or(Self::Missing, |value| {
            Self::Present(YamlScalar::String(value))
        });
    }

    fn set_integer(&mut self, value: i64) {
        *self = Self::Present(YamlScalar::Number(Number::from(value)));
    }
}

impl Serialize for ScalarField {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Missing => serializer.serialize_none(),
            Self::Present(value) => value.serialize(serializer),
        }
    }
}

impl<'de> Deserialize<'de> for ScalarField {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        YamlScalar::deserialize(deserializer).map(Self::Present)
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
enum WorkspacePaths {
    #[default]
    Missing,
    Present(Vec<YamlScalar>),
}

impl WorkspacePaths {
    fn is_missing(&self) -> bool {
        matches!(self, Self::Missing)
    }

    fn strings(&self) -> Vec<String> {
        match self {
            Self::Missing => Vec::new(),
            Self::Present(values) => values.iter().map(YamlScalar::coerced_string).collect(),
        }
    }

    fn set_strings(&mut self, paths: Vec<String>) {
        *self = Self::Present(paths.into_iter().map(YamlScalar::String).collect());
    }
}

impl Serialize for WorkspacePaths {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Missing => serializer.serialize_none(),
            Self::Present(paths) => paths.serialize(serializer),
        }
    }
}

impl<'de> Deserialize<'de> for WorkspacePaths {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Vec::<YamlScalar>::deserialize(deserializer).map(Self::Present)
    }
}

/// Typed view of config.yaml; unknown YAML values remain part of the model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConfigModel {
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    version: ScalarField,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    name: ScalarField,
    #[serde(default, skip_serializing_if = "WorkspacePaths::is_missing")]
    workspaces: WorkspacePaths,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    display_id_prefix: ScalarField,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    description: ScalarField,
    #[serde(flatten)]
    unknown: BTreeMap<String, Value>,
}

impl ConfigModel {
    #[must_use]
    pub fn version(&self) -> i64 {
        match &self.version {
            ScalarField::Missing => 1,
            ScalarField::Present(value) => value.integer().unwrap_or(1),
        }
    }

    #[must_use]
    pub fn name(&self) -> Option<String> {
        self.name.as_string()
    }

    #[must_use]
    pub fn workspaces(&self) -> Vec<String> {
        self.workspaces.strings()
    }

    #[must_use]
    pub fn display_id_prefix(&self) -> Option<String> {
        self.display_id_prefix.as_string()
    }

    #[must_use]
    pub fn description(&self) -> Option<String> {
        self.description.as_string()
    }

    #[must_use]
    pub fn unknown_fields(&self) -> &BTreeMap<String, Value> {
        &self.unknown
    }

    pub fn set_version(&mut self, value: i64) {
        self.version.set_integer(value);
    }

    pub fn set_name(&mut self, value: Option<String>) {
        self.name.set_string(value);
    }

    pub fn set_workspaces(&mut self, paths: Vec<String>) {
        self.workspaces.set_strings(paths);
    }

    pub fn set_display_id_prefix(&mut self, value: Option<String>) {
        self.display_id_prefix.set_string(value);
    }

    pub fn set_description(&mut self, value: Option<String>) {
        self.description.set_string(value);
    }

    fn validate(&self) -> Result<(), FormatError> {
        if let ScalarField::Present(version) = &self.version
            && version.integer().is_none()
        {
            return Err(FormatError::new(
                FormatErrorCode::InvalidField,
                "Поле config.version должно быть целым числом.",
            ));
        }
        Ok(())
    }
}

/// Lossless parser and editor for config.yaml.
#[derive(Debug, Clone, PartialEq)]
pub struct ConfigDocument {
    original: String,
    original_model: ConfigModel,
    model: ConfigModel,
}

impl ConfigDocument {
    /// # Errors
    /// Returns an error for invalid YAML, an invalid version field, or oversized input.
    pub fn parse(text: &str) -> Result<Self, FormatError> {
        if text.len() > super::MAX_YAML_BYTES {
            return Err(FormatError::too_large(super::MAX_YAML_BYTES));
        }
        let model: ConfigModel = yaml::parse_model(text)?;
        model.validate()?;
        Ok(Self {
            original: text.to_owned(),
            original_model: model.clone(),
            model,
        })
    }

    #[must_use]
    pub fn model(&self) -> &ConfigModel {
        &self.model
    }

    pub fn set_name(&mut self, name: String) {
        self.model.set_name(Some(name));
    }

    pub fn set_version(&mut self, version: i64) {
        self.model.set_version(version);
    }

    pub fn set_workspaces(&mut self, workspaces: Vec<String>) {
        self.model.set_workspaces(workspaces);
    }

    pub fn set_display_id_prefix(&mut self, prefix: Option<String>) {
        self.model.set_display_id_prefix(prefix);
    }

    pub fn set_description(&mut self, description: Option<String>) {
        self.model.set_description(description);
    }

    /// # Errors
    /// Returns an error if the edited YAML cannot be safely preserved or exceeds the limit.
    pub fn to_text(&self) -> Result<String, FormatError> {
        if self.model == self.original_model {
            return Ok(self.original.clone());
        }
        let output = yaml::edit_model(&self.original, self.model.clone())?;
        if output.len() > super::MAX_YAML_BYTES {
            return Err(FormatError::too_large(super::MAX_YAML_BYTES));
        }
        Ok(output)
    }
}

const _: () = {
    fn assert_send_sync<T: Send + Sync>() {}
    let _ = assert_send_sync::<ConfigModel>;
    let _ = assert_send_sync::<ConfigDocument>;
};

#[cfg(test)]
mod tests {
    use std::fmt::Write as _;

    use super::ConfigDocument;

    #[test]
    fn parses_declared_workspaces_root_metadata_and_keeps_original_bytes() {
        let raw = concat!(
            "# Repo heading\r\n",
            "version: 1 # format version\r\n",
            "name: \"QA: #1\"\r\n",
            "displayIdPrefix: RT\r\n",
            "description: Root workspace\r\n",
            "workspaces:\r\n",
            "  - areas/payments\r\n",
            "  - \".\"\r\n",
            "custom:\r\n",
            "  nested: true # unknown comment\r\n",
        );
        let document = ConfigDocument::parse(raw).expect("valid config");

        assert_eq!(document.model().version(), 1);
        assert_eq!(document.model().name().as_deref(), Some("QA: #1"));
        assert_eq!(document.model().workspaces(), ["areas/payments", "."]);
        assert_eq!(document.model().display_id_prefix().as_deref(), Some("RT"));
        assert_eq!(
            document.model().description().as_deref(),
            Some("Root workspace")
        );
        assert_eq!(document.to_text().expect("serialize"), raw);
    }

    #[test]
    fn reads_upstream_version_two_and_root_workspace_metadata() {
        let raw = concat!(
            "version: 2\n",
            "name: Root\n",
            "displayIdPrefix: RT\n",
            "description: the root\n",
            "workspaces:\n",
            "  - .\n",
        );
        let document = ConfigDocument::parse(raw).expect("version 2 remains readable");

        assert_eq!(document.model().version(), 2);
        assert_eq!(document.model().name().as_deref(), Some("Root"));
        assert_eq!(document.model().display_id_prefix().as_deref(), Some("RT"));
        assert_eq!(document.model().description().as_deref(), Some("the root"));
        assert_eq!(document.model().workspaces(), ["."]);
        assert_eq!(document.to_text().expect("no-op bytes"), raw);
    }

    #[test]
    fn editing_known_field_preserves_unknown_nested_values_comments_and_workspace_order() {
        let raw = concat!(
            "# repo config\n",
            "version: 1\n",
            "name: QA # keep name note\n",
            "workspaces:\n",
            "  - areas/payments\n",
            "custom:\n",
            "  nested:\n",
            "    enabled: true # keep nested note\n",
        );
        let mut document = ConfigDocument::parse(raw).expect("valid config");
        document.set_name("Platform QA".into());
        let output = document.to_text().expect("serialize");

        assert!(output.contains("name: Platform QA # keep name note"));
        assert!(output.contains("enabled: true # keep nested note"));
        assert!(output.contains("  - areas/payments"));
    }

    #[test]
    fn coerces_upstream_scalar_strings_without_normalizing_untouched_scalar_types() {
        let raw = concat!(
            "version: 1\n",
            "name: true\n",
            "displayIdPrefix: 123\n",
            "description: null\n",
            "workspaces: [true, 123, null]\n",
        );
        let mut document = ConfigDocument::parse(raw).expect("valid scalar config");

        assert_eq!(document.model().name().as_deref(), Some("true"));
        assert_eq!(document.model().display_id_prefix().as_deref(), Some("123"));
        assert_eq!(document.model().description().as_deref(), Some("null"));
        assert_eq!(document.model().workspaces(), ["true", "123", "null"]);
        document.set_name("Renamed".into());
        let output = document.to_text().expect("serialize");

        assert!(output.contains("displayIdPrefix: 123"));
        assert!(output.contains("description: null"));
        assert!(output.contains("workspaces: [true, 123, null]"));
    }

    #[test]
    fn quoted_yaml_keyword_and_numeric_scalars_remain_strings() {
        let raw = "version: 1\nname: \"true\"\ndisplayIdPrefix: '123'\ndescription: \"null\"\n";
        let document = ConfigDocument::parse(raw).expect("quoted values are strings");

        assert_eq!(document.model().name().as_deref(), Some("true"));
        assert_eq!(document.model().display_id_prefix().as_deref(), Some("123"));
        assert_eq!(document.model().description().as_deref(), Some("null"));
        assert_eq!(document.to_text().expect("no-op preserves source"), raw);
    }

    #[test]
    fn rejects_duplicate_keys_and_refuses_edits_that_remove_anchors() {
        assert!(ConfigDocument::parse("version: 1\ncustom: first\ncustom: second\n").is_err());
        assert!(
            ConfigDocument::parse("version: 1\ncustom:\n  nested: first\n  nested: second\n")
                .is_err()
        );

        let raw = "version: 1\nname: &title QA\ncopy: *title\n";
        let mut document = ConfigDocument::parse(raw).expect("valid anchor");
        document.set_name("Updated".into());
        assert!(document.to_text().is_err());
    }

    #[test]
    fn comments_in_plain_apostrophe_and_block_scalars_survive_or_edit_is_refused() {
        let raw = concat!(
            "version: 1\n",
            "name: Bob's repo # inline owner note\n",
            "custom: |\n",
            "  # literal block content\n",
            "  Retain this text.\n",
        );
        let mut document = ConfigDocument::parse(raw).expect("valid comments and block scalar");
        document.set_name("Renamed".into());

        assert!(document.to_text().is_err());
    }

    #[test]
    fn keeps_yaml_aliases_and_anchors_when_an_unrelated_known_field_changes() {
        let raw = concat!(
            "version: 1\n",
            "name: QA\n",
            "workspaces: [areas]\n",
            "defaults: &defaults\n",
            "  labels: [smoke, unit]\n",
            "copy: *defaults\n",
        );
        let mut document = ConfigDocument::parse(raw).expect("valid aliases");
        document.set_name("Updated".into());
        let output = document.to_text().expect("serialize");

        assert!(output.contains("&defaults"));
        assert!(output.contains("*defaults"));
        assert!(output.contains("labels: [smoke, unit]"));
    }

    #[test]
    fn reports_malformed_yaml_wrong_workspace_values_and_oversized_input() {
        assert!(ConfigDocument::parse("version: [").is_err());
        assert!(ConfigDocument::parse("version: 1\nworkspaces: [{path: areas}]\n").is_err());
        let raw = format!("{}\n", "#".repeat(super::super::MAX_YAML_BYTES));
        assert!(ConfigDocument::parse(&raw).is_err());
    }

    #[test]
    fn rejects_yaml_alias_expansion_bomb_and_excessive_nesting() {
        let mut aliases = String::from("version: 1\nname: QA\nworkspaces: [areas]\nroot: &a [x]\n");
        for level in 0..16 {
            let previous = if level == 0 {
                "a".to_owned()
            } else {
                format!("a{level}")
            };
            let _ = writeln!(
                aliases,
                "node{level}: &a{} [*{} , *{}]",
                level + 1,
                previous,
                previous
            );
        }
        assert!(ConfigDocument::parse(&aliases).is_err());

        let mut nested = String::from("value: ");
        for _ in 0..140 {
            nested.push('[');
        }
        nested.push('x');
        for _ in 0..140 {
            nested.push(']');
        }
        assert!(ConfigDocument::parse(&nested).is_err());
    }
}
