use std::{fmt, panic::AssertUnwindSafe};

use serde::Serialize;
use serde::de::{self, DeserializeSeed, EnumAccess, MapAccess, SeqAccess, VariantAccess, Visitor};
use serde_norway::{
    Mapping, Number, Value,
    value::{Tag, TaggedValue},
};

use crate::domain::formats::FormatError;

pub(super) const MAX_YAML_NODES: usize = 100_000;
pub(super) const MAX_YAML_SCALAR_BYTES: usize = 8 * 1024 * 1024;
const MAX_YAML_DEPTH: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BudgetFailure {
    Nodes,
    Depth,
    ScalarBytes,
}

#[derive(Debug)]
struct Budget {
    nodes: usize,
    limit: usize,
    scalar_bytes: usize,
    scalar_byte_limit: usize,
    failure: Option<BudgetFailure>,
}

impl Budget {
    fn enter(&mut self, depth: usize) -> Result<(), BudgetFailure> {
        if depth > MAX_YAML_DEPTH {
            self.failure = Some(BudgetFailure::Depth);
            return Err(BudgetFailure::Depth);
        }
        if self.nodes >= self.limit {
            self.failure = Some(BudgetFailure::Nodes);
            return Err(BudgetFailure::Nodes);
        }
        self.nodes += 1;
        Ok(())
    }

    fn add_scalar_bytes(&mut self, bytes: usize) -> Result<(), BudgetFailure> {
        let Some(total) = self.scalar_bytes.checked_add(bytes) else {
            self.failure = Some(BudgetFailure::ScalarBytes);
            return Err(BudgetFailure::ScalarBytes);
        };
        if total > self.scalar_byte_limit {
            self.failure = Some(BudgetFailure::ScalarBytes);
            return Err(BudgetFailure::ScalarBytes);
        }
        self.scalar_bytes = total;
        Ok(())
    }
}

struct Seed<'a> {
    budget: &'a mut Budget,
    depth: usize,
}

impl<'de> DeserializeSeed<'de> for Seed<'_> {
    type Value = Value;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        self.budget
            .enter(self.depth)
            .map_err(|failure| de::Error::custom(format!("YAML limit exceeded: {failure:?}")))?;
        deserializer.deserialize_any(ValueVisitor {
            budget: self.budget,
            depth: self.depth,
        })
    }
}

struct ValueVisitor<'a> {
    budget: &'a mut Budget,
    depth: usize,
}

impl ValueVisitor<'_> {
    fn child(&mut self) -> Seed<'_> {
        Seed {
            budget: self.budget,
            depth: self.depth + 1,
        }
    }
}

impl<'de> Visitor<'de> for ValueVisitor<'_> {
    type Value = Value;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a YAML value within configured node and depth limits")
    }

    fn visit_bool<E>(self, value: bool) -> Result<Value, E> {
        Ok(Value::Bool(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Value, E> {
        Ok(Value::Number(Number::from(value)))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Value, E> {
        Ok(Value::Number(Number::from(value)))
    }

    fn visit_f64<E>(self, value: f64) -> Result<Value, E> {
        Ok(Value::Number(Number::from(value)))
    }

    fn visit_str<E>(self, value: &str) -> Result<Value, E>
    where
        E: de::Error,
    {
        self.budget
            .add_scalar_bytes(value.len())
            .map_err(|failure| E::custom(format!("YAML limit exceeded: {failure:?}")))?;
        Ok(Value::String(value.to_owned()))
    }

    fn visit_string<E>(self, value: String) -> Result<Value, E>
    where
        E: de::Error,
    {
        self.budget
            .add_scalar_bytes(value.len())
            .map_err(|failure| E::custom(format!("YAML limit exceeded: {failure:?}")))?;
        Ok(Value::String(value))
    }

    fn visit_unit<E>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }

    fn visit_none<E>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(ValueVisitor {
            budget: self.budget,
            depth: self.depth,
        })
    }

    fn visit_newtype_struct<D>(self, deserializer: D) -> Result<Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(ValueVisitor {
            budget: self.budget,
            depth: self.depth,
        })
    }

    fn visit_seq<A>(mut self, mut sequence: A) -> Result<Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element_seed(self.child())? {
            values.push(value);
        }
        Ok(Value::Sequence(values))
    }

    fn visit_map<A>(mut self, mut access: A) -> Result<Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut values = Mapping::new();
        while let Some(key) = access.next_key_seed(self.child())? {
            if values.contains_key(&key) {
                return Err(de::Error::custom("duplicate YAML mapping key"));
            }
            let value = access.next_value_seed(self.child())?;
            values.insert(key, value);
        }
        Ok(Value::Mapping(values))
    }

    fn visit_enum<A>(mut self, access: A) -> Result<Value, A::Error>
    where
        A: EnumAccess<'de>,
    {
        let (tag, variant) = access.variant::<String>()?;
        if tag.is_empty() {
            return Err(de::Error::custom("empty YAML tag"));
        }
        self.budget
            .add_scalar_bytes(tag.len().saturating_add(1))
            .map_err(|failure| de::Error::custom(format!("YAML limit exceeded: {failure:?}")))?;
        let value = variant.newtype_variant_seed(self.child())?;
        Ok(Value::Tagged(Box::new(TaggedValue {
            tag: Tag::new(tag),
            value,
        })))
    }
}

pub(super) fn parse_value(text: &str) -> Result<Value, FormatError> {
    parse_value_with_limit(text, MAX_YAML_NODES)
}

fn parse_value_with_limit(text: &str, node_limit: usize) -> Result<Value, FormatError> {
    parse_value_with_limits(text, node_limit, MAX_YAML_SCALAR_BYTES)
}

fn parse_value_with_limits(
    text: &str,
    node_limit: usize,
    scalar_byte_limit: usize,
) -> Result<Value, FormatError> {
    let mut budget = Budget {
        nodes: 0,
        limit: node_limit,
        scalar_bytes: 0,
        scalar_byte_limit,
        failure: None,
    };
    let parsed = std::panic::catch_unwind(AssertUnwindSafe(|| {
        Seed {
            budget: &mut budget,
            depth: 1,
        }
        .deserialize(serde_norway::Deserializer::from_str(text))
    }));
    let parsed = parsed.map_err(|_| {
        FormatError::invalid_yaml("YAML содержит неподдерживаемую или повреждённую структуру.")
    })?;
    parsed.map_err(|_| budget_error(budget.failure, node_limit, scalar_byte_limit))
}

pub(super) fn validate_serializable<T: Serialize>(value: &T) -> Result<(), FormatError> {
    validate_serializable_with_limits(value, MAX_YAML_NODES, MAX_YAML_SCALAR_BYTES)
}

fn validate_serializable_with_limits<T: Serialize>(
    value: &T,
    node_limit: usize,
    scalar_byte_limit: usize,
) -> Result<(), FormatError> {
    let serialized = std::panic::catch_unwind(AssertUnwindSafe(|| serde_norway::to_value(value)))
        .map_err(|_| FormatError::invalid_yaml("YAML edit содержит неподдерживаемую структуру."))?
        .map_err(|_| FormatError::invalid_yaml("Не удалось проверить YAML edit."))?;
    validate_value_with_limits(&serialized, node_limit, scalar_byte_limit)
}

fn validate_value_with_limits(
    value: &Value,
    node_limit: usize,
    scalar_byte_limit: usize,
) -> Result<(), FormatError> {
    fn visit(value: &Value, depth: usize, budget: &mut Budget) -> Result<(), BudgetFailure> {
        budget.enter(depth)?;
        match value {
            Value::String(value) => budget.add_scalar_bytes(value.len())?,
            Value::Sequence(items) => {
                for item in items {
                    visit(item, depth + 1, budget)?;
                }
            }
            Value::Mapping(items) => {
                for (key, value) in items {
                    visit(key, depth + 1, budget)?;
                    visit(value, depth + 1, budget)?;
                }
            }
            Value::Tagged(tagged) => {
                budget.add_scalar_bytes(displayed_len(&tagged.tag))?;
                visit(&tagged.value, depth + 1, budget)?;
            }
            Value::Null | Value::Bool(_) | Value::Number(_) => {}
        }
        Ok(())
    }

    let mut budget = Budget {
        nodes: 0,
        limit: node_limit,
        scalar_bytes: 0,
        scalar_byte_limit,
        failure: None,
    };
    visit(value, 1, &mut budget)
        .map_err(|failure| budget_error(Some(failure), node_limit, scalar_byte_limit))
}

fn displayed_len(value: &impl fmt::Display) -> usize {
    struct Length(usize);

    impl fmt::Write for Length {
        fn write_str(&mut self, text: &str) -> fmt::Result {
            self.0 = self.0.saturating_add(text.len());
            Ok(())
        }
    }

    let mut length = Length(0);
    let _ = fmt::write(&mut length, format_args!("{value}"));
    length.0
}

fn budget_error(
    failure: Option<BudgetFailure>,
    node_limit: usize,
    scalar_byte_limit: usize,
) -> FormatError {
    match failure {
        Some(BudgetFailure::Nodes) => FormatError::invalid_yaml(format!(
            "YAML превышает лимит логических узлов {node_limit}."
        )),
        Some(BudgetFailure::Depth) => FormatError::invalid_yaml(format!(
            "YAML превышает лимит вложенности {MAX_YAML_DEPTH}."
        )),
        Some(BudgetFailure::ScalarBytes) => FormatError::invalid_yaml(format!(
            "YAML превышает лимит раскрытых скалярных данных {scalar_byte_limit} байт."
        )),
        None => FormatError::invalid_yaml("Не удалось разобрать YAML-документ."),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        parse_value_with_limit, parse_value_with_limits, validate_serializable_with_limits,
        validate_value_with_limits,
    };
    use serde::Serialize;
    use serde_norway::{Mapping, Value};

    #[test]
    fn rejects_expanded_alias_nodes_before_allocating_the_tree() {
        let yaml = concat!(
            "base: &a [x, x, x, x]\n",
            "level1: &b [*a, *a, *a, *a]\n",
            "level2: &c [*b, *b, *b, *b]\n",
            "level3: [*c, *c, *c, *c]\n",
        );

        let error = parse_value_with_limit(yaml, 32).expect_err("node budget must reject aliases");
        assert!(error.message.contains("узлов"));
    }

    #[test]
    fn rejects_repeated_long_alias_scalars_by_expanded_byte_budget() {
        let yaml = "base: &long '12345678'\ncopy1: *long\ncopy2: *long\n";
        let error = parse_value_with_limits(yaml, 100, 30)
            .expect_err("repeated scalar aliases must exceed byte budget");
        assert!(error.message.contains("байт"));
    }

    #[test]
    fn rejects_oversized_serialized_values_before_editing() {
        #[derive(Serialize)]
        struct SetterModel {
            name: String,
        }

        let model = SetterModel {
            name: "toolarge".into(),
        };
        let error = validate_serializable_with_limits(&model, 100, 8)
            .expect_err("serialized setter model must obey scalar byte budget");
        assert!(error.message.contains("байт"));

        let mut mapping = Mapping::new();
        mapping.insert(
            Value::String("name".into()),
            Value::String("toolarge".into()),
        );
        let value = Value::Mapping(mapping);
        assert!(validate_value_with_limits(&value, 100, 8).is_err());
    }

    #[test]
    fn accepts_scalars_unicode_tags_and_ordinary_aliases() {
        let yaml = "name: '雪 true'\nbase: &base [true, 42, null]\ncopy: *base\ntagged: !Custom {text: привет}\n";
        let value = parse_value_with_limit(yaml, 100).expect("bounded YAML parse");
        let Value::Mapping(map) = value else {
            panic!("mapping expected");
        };
        assert_eq!(map.get("name"), Some(&Value::String("雪 true".into())));
        assert_eq!(map.get("base"), map.get("copy"));
        let Some(Value::Tagged(tagged)) = map.get("tagged") else {
            panic!("unknown tag should remain represented");
        };
        assert_eq!(tagged.tag.to_string(), "!Custom");
    }

    #[test]
    fn rejects_duplicate_keys_and_multiple_documents() {
        assert!(parse_value_with_limit("key: one\nkey: two\n", 100).is_err());
        assert!(parse_value_with_limit("nested: {key: one, key: two}\n", 100).is_err());
        assert!(parse_value_with_limit("key: one\n---\nkey: two\n", 100).is_err());
    }
}
