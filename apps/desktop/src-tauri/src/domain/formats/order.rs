use super::{FormatError, FormatErrorCode};

/// Lossless view of an Azure DevOps wiki `.order` file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrderDocument {
    original: String,
    keys: Vec<String>,
}

impl OrderDocument {
    /// # Errors
    /// Returns an error when the document exceeds the supported size.
    pub fn parse(text: &str) -> Result<Self, FormatError> {
        if text.len() > super::MAX_ORDER_BYTES {
            return Err(FormatError::too_large(super::MAX_ORDER_BYTES));
        }
        Ok(Self {
            original: text.to_owned(),
            keys: parse_keys(text),
        })
    }

    #[must_use]
    pub fn keys(&self) -> &[String] {
        &self.keys
    }

    /// # Errors
    /// Returns an error for invalid keys or an output larger than the supported size.
    pub fn set_keys(&mut self, keys: Vec<String>) -> Result<(), FormatError> {
        if keys.iter().any(|key| {
            key.is_empty() || key.trim() != key || key.contains('\r') || key.contains('\n')
        }) {
            return Err(FormatError::new(
                FormatErrorCode::InvalidOrderKey,
                "Ключ .order должен быть непустой однострочной строкой без внешних пробелов.",
            ));
        }
        let content_size = keys
            .iter()
            .try_fold(0usize, |total, key| total.checked_add(key.len()))
            .ok_or_else(|| FormatError::too_large(super::MAX_ORDER_BYTES))?;
        let output_size = content_size
            .checked_add(keys.len().max(1))
            .ok_or_else(|| FormatError::too_large(super::MAX_ORDER_BYTES))?;
        if output_size > super::MAX_ORDER_BYTES {
            return Err(FormatError::too_large(super::MAX_ORDER_BYTES));
        }
        self.keys = keys;
        Ok(())
    }

    /// # Errors
    /// Returns an error when serialized output exceeds the supported size.
    pub fn to_text(&self) -> Result<String, FormatError> {
        if self.keys == parse_keys(&self.original) {
            return Ok(self.original.clone());
        }
        let text = format!("{}\n", self.keys.join("\n"));
        if text.len() > super::MAX_ORDER_BYTES {
            return Err(FormatError::too_large(super::MAX_ORDER_BYTES));
        }
        Ok(text)
    }
}

fn parse_keys(text: &str) -> Vec<String> {
    text.split(['\r', '\n'])
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::OrderDocument;

    #[test]
    fn parses_order_and_returns_original_bytes_when_unchanged() {
        let raw = "PAY-0002-b\r\n\r\n  Auth  \r\nPAY-0001-a\r\n";
        let document = OrderDocument::parse(raw).expect("valid order document");

        assert_eq!(document.keys(), ["PAY-0002-b", "Auth", "PAY-0001-a"]);
        assert_eq!(document.to_text().expect("no-op bytes"), raw);
    }

    #[test]
    fn serializes_changed_order_in_compatible_canonical_format() {
        let mut document = OrderDocument::parse("a\r\nb\r\n").expect("valid order document");

        document
            .set_keys(vec!["PAY-0002-b".into(), "Auth".into()])
            .expect("valid child keys");

        assert_eq!(
            document.to_text().expect("serialize order"),
            "PAY-0002-b\nAuth\n"
        );
    }

    #[test]
    fn matches_upstream_display_order_fixture() {
        let mut document = OrderDocument::parse("PAY-0002-b\n\n  Auth  \nPAY-0001-a\n")
            .expect("upstream .order fixture");

        assert_eq!(document.keys(), ["PAY-0002-b", "Auth", "PAY-0001-a"]);
        document
            .set_keys(vec![
                "PAY-0002-b".into(),
                "Auth".into(),
                "PAY-0001-a".into(),
            ])
            .expect("valid child keys");
        assert_eq!(
            document.to_text().expect("serialize order"),
            "PAY-0002-b\n\n  Auth  \nPAY-0001-a\n",
            "unchanged semantic order retains original layout"
        );
    }

    #[test]
    fn rejects_multiline_and_blank_child_keys() {
        let mut document = OrderDocument::parse("a\n").expect("valid order document");

        assert!(document.set_keys(vec![String::new()]).is_err());
        assert!(document.set_keys(vec!["one\ntwo".into()]).is_err());
        assert_eq!(document.to_text().expect("unchanged order"), "a\n");
    }

    #[test]
    fn rejects_oversized_order_file() {
        let raw = "a".repeat(super::super::MAX_ORDER_BYTES + 1);
        let error = OrderDocument::parse(&raw).expect_err("oversized input is rejected");

        assert_eq!(error.code, super::super::FormatErrorCode::InputTooLarge);
    }

    #[test]
    fn rejects_oversized_serialized_order() {
        let mut document = OrderDocument::parse("a\n").expect("small original");
        assert!(
            document
                .set_keys(vec!["x".repeat(super::super::MAX_ORDER_BYTES)])
                .is_err()
        );
        assert_eq!(document.to_text().expect("original still valid"), "a\n");
    }
}
