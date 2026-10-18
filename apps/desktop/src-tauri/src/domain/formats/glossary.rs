use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_norway::Value;

use super::{FormatError, FormatErrorCode, config::ScalarField, yaml};

pub const MAX_GLOSSARY_BYTES: usize = 256 * 1024;
pub const MAX_GLOSSARY_TITLE: usize = 200;
pub const MAX_GLOSSARY_DESCRIPTION: usize = 4096;
pub const MAX_GLOSSARY_ALIASES: usize = 100;
pub const MAX_GLOSSARY_VALUES: usize = 100;
pub const MAX_GLOSSARY_VALUE_BYTES: usize = 64 * 1024;
const MAX_VALUE_KEY: usize = 64;
const MAX_VALUE_TEXT: usize = 4096;
const MAX_REVISION_UNITS: usize = 128;

/// Тип записи справочника; `environment` несёт типизированные values для аргументов автотестов.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GlossaryKind {
    Term,
    Abbreviation,
    Document,
    Environment,
}

impl GlossaryKind {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "term" => Some(Self::Term),
            "abbreviation" => Some(Self::Abbreviation),
            "document" => Some(Self::Document),
            "environment" => Some(Self::Environment),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Term => "term",
            Self::Abbreviation => "abbreviation",
            Self::Document => "document",
            Self::Environment => "environment",
        }
    }
}

/// JSON-примитив значения окружения: строка, число или boolean.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum GlossaryValue {
    Bool(bool),
    Number(f64),
    Text(String),
}

impl GlossaryValue {
    fn valid(&self) -> bool {
        match self {
            Self::Text(value) => value.encode_utf16().count() <= MAX_VALUE_TEXT,
            Self::Number(value) => value.is_finite(),
            Self::Bool(_) => true,
        }
    }
}

fn value_key_valid(key: &str) -> bool {
    !key.is_empty()
        && key.encode_utf16().count() <= MAX_VALUE_KEY
        && !key.chars().any(char::is_control)
        && !matches!(key, "__proto__" | "prototype" | "constructor")
}

fn http_url(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    let Some(rest) = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))
    else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
    !host.is_empty() && !host.contains('@') && !host.starts_with(':')
}

fn uuid_valid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|parsed| parsed.to_string() == value)
}

/// Typed frontmatter записи справочника; неизвестные поля сохраняются.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct GlossaryFront {
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    schema_version: ScalarField,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    id: ScalarField,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    kind: ScalarField,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    title: ScalarField,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    archived: ScalarField,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    revision: ScalarField,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    url: ScalarField,
    #[serde(default)]
    values: BTreeMap<String, GlossaryValue>,
    #[serde(flatten)]
    unknown: BTreeMap<String, Value>,
}

impl GlossaryFront {
    #[must_use]
    pub fn kind(&self) -> Option<GlossaryKind> {
        self.kind
            .as_string()
            .and_then(|value| GlossaryKind::parse(&value))
    }

    #[must_use]
    pub fn title(&self) -> String {
        self.title.as_string().unwrap_or_default()
    }

    #[must_use]
    pub fn id(&self) -> Option<String> {
        self.id.as_string()
    }

    #[must_use]
    pub fn aliases(&self) -> &[String] {
        &self.aliases
    }

    #[must_use]
    pub fn archived(&self) -> bool {
        self.archived
            .as_string()
            .is_some_and(|value| value == "true")
    }

    #[must_use]
    pub fn revision(&self) -> String {
        self.revision.as_string().unwrap_or_default()
    }

    #[must_use]
    pub fn url(&self) -> String {
        self.url.as_string().unwrap_or_default()
    }

    #[must_use]
    pub fn values(&self) -> &BTreeMap<String, GlossaryValue> {
        &self.values
    }

    #[must_use]
    pub fn unknown_fields(&self) -> &BTreeMap<String, Value> {
        &self.unknown
    }

    pub fn set_kind(&mut self, kind: GlossaryKind) {
        self.kind.set_string(Some(kind.as_str().into()));
    }

    pub fn set_title(&mut self, title: String) {
        self.title.set_string(Some(title));
    }

    pub fn set_id(&mut self, id: String) {
        self.id.set_string(Some(id));
    }

    pub fn set_aliases(&mut self, aliases: Vec<String>) {
        self.aliases = aliases;
    }

    pub fn set_archived(&mut self, archived: bool) {
        self.archived.set_string(Some(archived.to_string()));
    }

    pub fn set_revision(&mut self, revision: String) {
        self.revision.set_string(Some(revision));
    }

    pub fn set_url(&mut self, url: String) {
        self.url
            .set_string(if url.is_empty() { None } else { Some(url) });
    }

    pub fn set_values(&mut self, values: BTreeMap<String, GlossaryValue>) {
        self.values = values;
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FrontMatterLayout {
    opening_line: String,
    yaml: String,
    closing_line: String,
}

/// Lossless запись справочника `.testoritto/glossary/<uuid>.md`.
#[derive(Debug, Clone, PartialEq)]
pub struct GlossaryDocument {
    original: String,
    original_body: String,
    layout: Option<FrontMatterLayout>,
    original_front: GlossaryFront,
    front: GlossaryFront,
    body: String,
}

impl GlossaryDocument {
    /// # Errors
    /// Возвращает ошибку для oversize, malformed frontmatter, неверной версии,
    /// невалидного id/kind/title/url/values.
    pub fn parse(text: &str) -> Result<Self, FormatError> {
        if text.len() > MAX_GLOSSARY_BYTES {
            return Err(FormatError::too_large(MAX_GLOSSARY_BYTES));
        }
        let (layout, body) = split_front_matter(text)?;
        let front = match &layout {
            Some(layout) if !layout.yaml.trim().is_empty() => {
                if layout.yaml.len() > super::MAX_FRONT_MATTER_BYTES {
                    return Err(FormatError::too_large(super::MAX_FRONT_MATTER_BYTES));
                }
                yaml::parse_model(&layout.yaml)?
            }
            Some(_) | None => GlossaryFront::default(),
        };
        let document = Self {
            original: text.to_owned(),
            original_body: body.to_owned(),
            layout,
            original_front: front.clone(),
            front,
            body: body.to_owned(),
        };
        document.validate()?;
        Ok(document)
    }

    fn validate(&self) -> Result<(), FormatError> {
        let invalid = |message: &str| FormatError::new(FormatErrorCode::InvalidField, message);
        let version = self.front.schema_version.as_string();
        if version.as_deref() != Some("1") {
            return Err(invalid("Поле glossary.schema_version должно быть 1."));
        }
        let Some(id) = self.front.id() else {
            return Err(invalid("Поле glossary.id обязательно и должно быть UUID."));
        };
        if !uuid_valid(&id) {
            return Err(invalid("Поле glossary.id должно быть UUID."));
        }
        let Some(kind) = self.front.kind() else {
            return Err(invalid(
                "Поле glossary.kind должно быть term, abbreviation, document или environment.",
            ));
        };
        let title = self.front.title();
        if title.trim().is_empty() || title.encode_utf16().count() > MAX_GLOSSARY_TITLE {
            return Err(invalid(
                "Поле glossary.title обязательно, до 200 UTF-16 единиц.",
            ));
        }
        if self.front.aliases.len() > MAX_GLOSSARY_ALIASES
            || self.front.aliases.iter().any(|alias| {
                alias.trim().is_empty() || alias.encode_utf16().count() > MAX_GLOSSARY_TITLE
            })
        {
            return Err(invalid("Поле glossary.aliases: до 100 непустых строк."));
        }
        if self
            .front
            .archived
            .as_string()
            .is_some_and(|value| !matches!(value.as_str(), "true" | "false"))
        {
            return Err(invalid("Поле glossary.archived должно быть boolean."));
        }
        let revision = self.front.revision.as_string().unwrap_or_default();
        if revision.is_empty() || revision.encode_utf16().count() > MAX_REVISION_UNITS {
            return Err(invalid(
                "Поле glossary.revision обязательно, до 128 единиц.",
            ));
        }
        let url = self.front.url.as_string().unwrap_or_default();
        if url.encode_utf16().count() > MAX_GLOSSARY_DESCRIPTION || !http_url(&url) {
            return Err(invalid(
                "Поле glossary.url должно быть пустым или http(s) URL.",
            ));
        }
        let description = self.body.trim();
        if kind != GlossaryKind::Environment {
            if !self.front.values.is_empty() {
                return Err(invalid(
                    "Поле glossary.values допустимо только для environment.",
                ));
            }
            if description.is_empty() && url.is_empty() {
                return Err(invalid(
                    "Нужно описание или URL: заполните текст записи либо ссылку.",
                ));
            }
        }
        if kind == GlossaryKind::Environment
            && (self.front.values.is_empty()
                || self.front.values.len() > MAX_GLOSSARY_VALUES
                || self
                    .front
                    .values
                    .iter()
                    .any(|(key, value)| !value_key_valid(key) || !value.valid())
                || serde_json::to_vec(&self.front.values)
                    .is_ok_and(|bytes| bytes.len() > MAX_GLOSSARY_VALUE_BYTES))
        {
            return Err(invalid(
                "Поле glossary.values: 1–100 уникальных keys, JSON-примитивы без секретов.",
            ));
        }
        if description.encode_utf16().count() > MAX_GLOSSARY_DESCRIPTION {
            return Err(invalid("Описание записи — до 4096 UTF-16 единиц."));
        }
        Ok(())
    }

    #[must_use]
    pub fn front(&self) -> &GlossaryFront {
        &self.front
    }

    pub fn front_mut(&mut self) -> &mut GlossaryFront {
        &mut self.front
    }

    #[must_use]
    pub fn body(&self) -> &str {
        &self.body
    }

    pub fn set_body(&mut self, body: String) {
        self.body = body;
    }

    /// # Errors
    /// Возвращает ошибку, если YAML-комментарии/ссылки нельзя сохранить или вывод превышает лимит.
    pub fn to_text(&self) -> Result<String, FormatError> {
        if self.front == self.original_front && self.body == self.original_body {
            return Ok(self.original.clone());
        }
        self.validate()?;

        let front_changed = self.front != self.original_front;
        let layout = self.layout.as_ref();
        let yaml = if front_changed {
            let seed = layout
                .map(|layout| layout.yaml.as_str())
                .filter(|yaml| !yaml.trim().is_empty())
                .unwrap_or("schema_version: 1\n");
            yaml::edit_model(seed, self.front.clone())?
        } else {
            layout.map_or_else(String::new, |layout| layout.yaml.clone())
        };
        if yaml.len() > super::MAX_FRONT_MATTER_BYTES {
            return Err(FormatError::too_large(super::MAX_FRONT_MATTER_BYTES));
        }

        let mut text = String::new();
        if let Some(layout) = layout {
            text.push_str(&layout.opening_line);
            text.push_str(&yaml);
            text.push_str(&layout.closing_line);
            text.push_str(&self.body);
        } else {
            text.push_str("---\n");
            text.push_str(&yaml);
            if yaml.is_empty() {
                text.push_str("schema_version: 1\n");
            } else if !yaml.ends_with('\r') && !yaml.ends_with('\n') {
                text.push('\n');
            }
            text.push_str("---\n\n");
            text.push_str(&self.body);
        }
        if text.len() > MAX_GLOSSARY_BYTES {
            return Err(FormatError::too_large(MAX_GLOSSARY_BYTES));
        }
        Ok(text)
    }
}

fn split_front_matter(text: &str) -> Result<(Option<FrontMatterLayout>, &str), FormatError> {
    let Some((first_line, first_end)) = next_line(text, 0) else {
        return Ok((None, text));
    };
    if first_line != "---" {
        return Ok((None, text));
    }
    let mut cursor = first_end;
    while cursor <= text.len() {
        let Some((line, end)) = next_line(text, cursor) else {
            return Err(FormatError::new(
                FormatErrorCode::InvalidFrontMatter,
                "YAML frontmatter открыт, но не закрыт разделителем.",
            ));
        };
        if line == "---" || line == "..." {
            let yaml = &text[first_end..cursor];
            if yaml.len() > super::MAX_FRONT_MATTER_BYTES {
                return Err(FormatError::too_large(super::MAX_FRONT_MATTER_BYTES));
            }
            return Ok((
                Some(FrontMatterLayout {
                    opening_line: text[..first_end].to_owned(),
                    yaml: yaml.to_owned(),
                    closing_line: text[cursor..end].to_owned(),
                }),
                &text[end..],
            ));
        }
        cursor = end;
        if cursor == text.len() {
            break;
        }
    }
    Err(FormatError::new(
        FormatErrorCode::InvalidFrontMatter,
        "YAML frontmatter открыт, но не закрыт разделителем.",
    ))
}

fn next_line(text: &str, start: usize) -> Option<(&str, usize)> {
    if start >= text.len() {
        return None;
    }
    let end = text[start..]
        .find('\n')
        .map_or(text.len(), |relative| start + relative + 1);
    let line_end = if text[..end].ends_with("\r\n") {
        end - 2
    } else if text[..end].ends_with('\n') {
        end - 1
    } else {
        end
    };
    Some((&text[start..line_end], end))
}

const _: () = {
    fn assert_send_sync<T: Send + Sync>() {}
    let _ = assert_send_sync::<GlossaryFront>;
    let _ = assert_send_sync::<GlossaryDocument>;
};

#[cfg(test)]
mod tests {
    use super::GlossaryDocument;

    fn valid_front(id: &str) -> String {
        format!(
            "---\nschema_version: 1\nid: {id}\nkind: term\ntitle: SLA\nrevision: rev-1\n---\n\nСогласованные показатели.\n"
        )
    }

    #[test]
    fn parses_term_and_returns_original_bytes_when_unchanged() {
        let id = "11111111-1111-4111-8111-000000000001";
        let raw = format!(
            "---\n# glossary entry\nschema_version: 1\nid: {id}\nkind: term\ntitle: SLA\nrevision: rev-1\naliases:\n  - Service Level Agreement\ncustom:\n  owner: qa # retained\n---\n\nСогласованные показатели.\n"
        );
        let document = GlossaryDocument::parse(&raw).expect("valid glossary entry");
        assert_eq!(document.front().title(), "SLA");
        assert_eq!(document.to_text().expect("no-op bytes"), raw);
    }

    #[test]
    fn validates_required_fields_and_rejects_bad_url() {
        let id = "11111111-1111-4111-8111-000000000001";
        assert!(GlossaryDocument::parse("без frontmatter вообще\n").is_err());
        assert!(
            GlossaryDocument::parse(&valid_front("not-a-uuid").replace("not-a-uuid", "bad"))
                .is_err()
        );
        let bad_url = valid_front(id).replace("title: SLA", "title: SLA\nurl: javascript:alert(1)");
        assert!(GlossaryDocument::parse(&bad_url).is_err());
        let no_content = format!(
            "---\nschema_version: 1\nid: {id}\nkind: term\ntitle: SLA\nrevision: rev-1\n---\n\n   \n"
        );
        assert!(GlossaryDocument::parse(&no_content).is_err());
    }

    #[test]
    fn environment_values_round_trip_with_typed_primitives() {
        let id = "22222222-2222-4222-8222-000000000002";
        let raw = format!(
            "---\nschema_version: 1\nid: {id}\nkind: environment\ntitle: Prod\nrevision: rev-1\nvalues:\n  baseUrl: https://pay.example.com\n  retries: 1\n  verbose: true\n---\n\nБоевой стенд.\n"
        );
        let document = GlossaryDocument::parse(&raw).expect("valid environment");
        assert_eq!(document.to_text().expect("no-op"), raw);
        assert_eq!(
            document.front().kind().map(|kind| kind.as_str()),
            Some("environment")
        );
    }

    #[test]
    fn editing_preserves_unknown_yaml_and_crlf_body() {
        let id = "33333333-3333-4333-8333-000000000003";
        let raw = format!(
            "---\r\nschema_version: 1\r\nid: {id}\r\nkind: abbreviation\r\ntitle: API\r\nrevision: rev-1\r\ncustom: keep # note\r\n---\r\n\r\nКонтракт.\r\n"
        );
        let mut document = GlossaryDocument::parse(&raw).expect("CRLF entry");
        document.set_body("\r\nОбновлённый контракт.\r\n".into());
        let output = document.to_text().expect("serialize");
        assert!(output.contains("custom: keep # note"));
        assert!(output.contains("---\r\n\r\nОбновлённый контракт.\r\n"));
        assert!(output.contains("title: API"));
        let _ = id;
    }

    #[test]
    fn rejects_oversized_and_duplicate_value_keys() {
        let id = "44444444-4444-4444-8444-000000000004";
        let big = "x".repeat(super::MAX_GLOSSARY_BYTES + 1);
        assert!(GlossaryDocument::parse(&big).is_err());
        let raw = valid_front(id).replace("kind: term", "kind: environment");
        assert!(GlossaryDocument::parse(&raw).is_err());
    }
}
