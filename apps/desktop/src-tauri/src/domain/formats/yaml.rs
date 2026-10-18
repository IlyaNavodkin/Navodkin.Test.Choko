use std::collections::BTreeMap;
use std::panic::{AssertUnwindSafe, catch_unwind};

use serde::{Serialize, de::DeserializeOwned};
use serde_norway::Value;
use yaml_edit::{SyntaxKind, lex};
use yaml_serde_edit::YamlObject;

use super::FormatError;
mod bounded;

pub(super) fn parse_model<T>(text: &str) -> Result<T, FormatError>
where
    T: Serialize + DeserializeOwned + Clone + PartialEq,
{
    let value = parse_value(text)?;
    let model = catch_unwind(AssertUnwindSafe(|| serde_norway::from_value::<T>(value)))
        .map_err(|_| {
            FormatError::invalid_yaml("YAML содержит неподдерживаемую или повреждённую структуру.")
        })?
        .map_err(|_| FormatError::invalid_yaml("Не удалось разобрать YAML-документ."))?;

    Ok(model)
}

pub(super) fn parse_value(text: &str) -> Result<Value, FormatError> {
    bounded::parse_value(text)
}

pub(super) fn edit_value(text: &str, value: Value) -> Result<String, FormatError> {
    edit_model(text, value)
}

pub(super) fn edit_model<T>(text: &str, model: T) -> Result<String, FormatError>
where
    T: Serialize + DeserializeOwned + Clone + PartialEq,
{
    parse_value(text)?;
    bounded::validate_serializable(&model)?;
    let rendered = catch_unwind(AssertUnwindSafe(|| {
        let mut document = YamlObject::<T>::parse(text)?;
        document.set(model)?;
        Ok::<String, yaml_serde_edit::Error>(document.get_string().to_owned())
    }))
    .map_err(|_| FormatError::invalid_yaml("YAML edit не прошёл проверку структуры."))?
    .map_err(|_| FormatError::invalid_yaml("Не удалось безопасно сериализовать YAML-изменение."))?;

    if !preserves_comments(text, &rendered) {
        return Err(FormatError::invalid_yaml(
            "Не удалось доказать сохранность комментариев и YAML-ссылок; документ оставлен без изменений.",
        ));
    }
    if rendered.len() > super::MAX_YAML_BYTES {
        return Err(FormatError::too_large(super::MAX_YAML_BYTES));
    }
    Ok(rendered)
}

fn preserves_comments(original: &str, rendered: &str) -> bool {
    fn protected_tokens(text: &str) -> BTreeMap<(SyntaxKind, String), usize> {
        let mut tokens = BTreeMap::new();
        for (kind, token) in lex(text) {
            if matches!(
                kind,
                SyntaxKind::COMMENT
                    | SyntaxKind::ANCHOR
                    | SyntaxKind::ALIAS
                    | SyntaxKind::UNTERMINATED_STRING
            ) {
                *tokens.entry((kind, token.to_owned())).or_insert(0) += 1;
            }
        }
        tokens
    }

    let before = protected_tokens(original);
    let after = protected_tokens(rendered);
    before
        .iter()
        .all(|(token, count)| after.get(token).copied().unwrap_or(0) >= *count)
}
