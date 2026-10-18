use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_norway::Value;

use super::{FormatError, FormatErrorCode, config::ScalarField, yaml};

/// Typed frontmatter fields from a sibling workspace or suite markdown note.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FolderNoteFront {
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    name: ScalarField,
    #[serde(default, skip_serializing_if = "ScalarField::is_missing")]
    display_id_prefix: ScalarField,
    #[serde(flatten)]
    unknown: BTreeMap<String, Value>,
}

impl FolderNoteFront {
    #[must_use]
    pub fn name(&self) -> String {
        self.name.as_string().unwrap_or_default()
    }

    #[must_use]
    pub fn display_id_prefix(&self) -> String {
        self.display_id_prefix.as_string().unwrap_or_default()
    }

    #[must_use]
    pub fn unknown_fields(&self) -> &BTreeMap<String, Value> {
        &self.unknown
    }

    pub fn set_name(&mut self, name: String) {
        self.name.set_string(Some(name));
    }

    pub fn set_display_id_prefix(&mut self, prefix: String) {
        self.display_id_prefix.set_string(Some(prefix));
    }
}

/// Exact Markdown body of a folder note; no section or code-fence parsing is performed.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MarkdownBody(String);

impl MarkdownBody {
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FrontMatterLayout {
    opening_line: String,
    yaml: String,
    closing_line: String,
}

/// Lossless sibling folder-note parser/editor.
#[derive(Debug, Clone, PartialEq)]
pub struct FolderNoteDocument {
    original: String,
    original_body: String,
    layout: Option<FrontMatterLayout>,
    original_front: FolderNoteFront,
    front: FolderNoteFront,
    body: MarkdownBody,
}

impl FolderNoteDocument {
    /// # Errors
    /// Returns an error for malformed YAML frontmatter or oversized input.
    pub fn parse(text: &str) -> Result<Self, FormatError> {
        if text.len() > super::MAX_FOLDER_NOTE_BYTES {
            return Err(FormatError::too_large(super::MAX_FOLDER_NOTE_BYTES));
        }
        let (layout, body) = split_front_matter(text)?;
        let front = match &layout {
            Some(layout) if !layout.yaml.trim().is_empty() => {
                if layout.yaml.len() > super::MAX_FRONT_MATTER_BYTES {
                    return Err(FormatError::too_large(super::MAX_FRONT_MATTER_BYTES));
                }
                yaml::parse_model(&layout.yaml)?
            }
            Some(_) | None => FolderNoteFront::default(),
        };
        Ok(Self {
            original: text.to_owned(),
            original_body: body.to_owned(),
            layout,
            original_front: front.clone(),
            front,
            body: MarkdownBody(body.to_owned()),
        })
    }

    #[must_use]
    pub fn front(&self) -> &FolderNoteFront {
        &self.front
    }

    pub fn front_mut(&mut self) -> &mut FolderNoteFront {
        &mut self.front
    }

    #[must_use]
    pub fn body(&self) -> &MarkdownBody {
        &self.body
    }

    /// Source-compatible description view; edits retain the raw Markdown body.
    #[must_use]
    pub fn description(&self) -> String {
        self.body.0.trim().to_owned()
    }

    pub fn set_body(&mut self, body: String) {
        self.body = MarkdownBody(body);
    }

    /// # Errors
    /// Returns an error if YAML comments/links cannot be preserved or output exceeds a limit.
    pub fn to_text(&self) -> Result<String, FormatError> {
        if self.front == self.original_front && self.body.0 == self.original_body {
            return Ok(self.original.clone());
        }

        let front_changed = self.front != self.original_front;
        let layout = self.layout.as_ref();
        let yaml = if front_changed {
            let seed = layout
                .map(|layout| layout.yaml.as_str())
                .filter(|yaml| !yaml.trim().is_empty())
                .unwrap_or("name: \"\"\n");
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
            text.push_str(&self.body.0);
        } else {
            if !front_changed {
                if self.body.0.len() > super::MAX_FOLDER_NOTE_BYTES {
                    return Err(FormatError::too_large(super::MAX_FOLDER_NOTE_BYTES));
                }
                return Ok(self.body.0.clone());
            }
            text.push_str("---\n");
            text.push_str(&yaml);
            if yaml.is_empty() {
                text.push_str("name: \"\"\n");
            } else if !yaml.ends_with('\r') && !yaml.ends_with('\n') {
                text.push('\n');
            }
            text.push_str("---\n\n");
            text.push_str(&self.body.0);
        }
        if text.len() > super::MAX_FOLDER_NOTE_BYTES {
            return Err(FormatError::too_large(super::MAX_FOLDER_NOTE_BYTES));
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
    let _ = assert_send_sync::<FolderNoteFront>;
    let _ = assert_send_sync::<MarkdownBody>;
    let _ = assert_send_sync::<FolderNoteDocument>;
};

#[cfg(test)]
mod tests {
    use super::FolderNoteDocument;

    fn fence() -> String {
        char::from(96).to_string().repeat(3)
    }

    #[test]
    fn parses_frontmatter_and_preserves_exact_markdown_body_and_source() {
        let fence = fence();
        let raw = format!(
            "---\r\nname: Payments\r\ndisplayIdPrefix: PAY\r\ncustom:\r\n  owner: qa # retained\r\n---\r\n\r\n## Description\r\nKeep this section.\r\n\r\n{fence}yaml\r\nname: example\r\n{fence}\r\n"
        );
        let document = FolderNoteDocument::parse(&raw).expect("valid folder note");

        assert_eq!(document.front().name(), "Payments");
        assert_eq!(document.front().display_id_prefix(), "PAY");
        assert_eq!(
            document.body().as_str(),
            format!(
                "\r\n## Description\r\nKeep this section.\r\n\r\n{fence}yaml\r\nname: example\r\n{fence}\r\n"
            )
        );
        assert_eq!(document.to_text().expect("serialize"), raw);
    }

    #[test]
    fn editing_frontmatter_preserves_unknown_yaml_comments_and_markdown_sections() {
        let fence = fence();
        let raw = format!(
            "---\n# note metadata\nname: Payments\ndisplayIdPrefix: PAY\ncustom:\n  owner: qa # keep owner\n---\n\n## Description\nKeep this section.\n\n{fence}yaml\nname: body example\n{fence}\n"
        );
        let mut document = FolderNoteDocument::parse(&raw).expect("valid folder note");
        document.front_mut().set_name("Billing".into());
        let output = document.to_text().expect("serialize");

        assert!(output.contains("name: Billing"));
        assert!(output.contains("owner: qa # keep owner"));
        assert!(output.contains("## Description\nKeep this section."));
        assert!(output.contains(&format!("{fence}yaml\nname: body example\n{fence}")));

        let raw_crlf = "---\r\nname: Payments\r\ncustom: yes\r\n---\r\n\r\nBody\r\n";
        let mut crlf = FolderNoteDocument::parse(raw_crlf).expect("CRLF front matter");
        crlf.front_mut().set_name("Billing".into());
        let crlf_output = crlf.to_text().expect("edit CRLF note");
        assert!(crlf_output.contains("name: Billing\r\n"));
        assert!(crlf_output.contains("---\r\n\r\nBody\r\n"));
    }

    #[test]
    fn supports_notes_without_frontmatter_and_edits_body_without_dropping_sections() {
        let raw = "## Existing note\n\nKeep **all** of this.\n";
        let mut document = FolderNoteDocument::parse(raw).expect("body-only note");
        assert_eq!(document.to_text().expect("no-op"), raw);
        document.set_body("## Updated note\n\nKeep **all** of this.\n".into());
        assert_eq!(
            document
                .to_text()
                .expect("body edit preserves absent frontmatter"),
            "## Updated note\n\nKeep **all** of this.\n"
        );
        document.set_body(raw.into());
        document.front_mut().set_name("Payments".into());
        let output = document.to_text().expect("serialize");

        assert!(output.starts_with("---\nname: Payments\n"));
        assert!(output.ends_with("## Existing note\n\nKeep **all** of this.\n"));
    }

    #[test]
    fn matches_upstream_folder_note_contract_while_retaining_raw_body() {
        let raw = "---\nname: Payments QA\ndisplayIdPrefix: PAY\n---\n\nBilling and payments.\n";
        let document = FolderNoteDocument::parse(raw).expect("upstream folder note fixture");

        assert_eq!(document.front().name(), "Payments QA");
        assert_eq!(document.front().display_id_prefix(), "PAY");
        assert_eq!(document.description(), "Billing and payments.");
        assert_eq!(
            document.body().as_str(),
            "\nBilling and payments.\n",
            "raw body keeps the source line endings and whitespace"
        );
        assert_eq!(document.to_text().expect("no-op bytes"), raw);

        let empty_front = FolderNoteDocument::parse("---\n---\n\nJust a body.\n")
            .expect("empty metadata defaults");
        assert_eq!(empty_front.front().name(), "");
        assert_eq!(empty_front.front().display_id_prefix(), "");
        assert_eq!(empty_front.description(), "Just a body.");
    }

    #[test]
    fn malformed_or_oversized_frontmatter_is_an_error_but_code_fences_are_body() {
        assert!(FolderNoteDocument::parse("---\nname: missing-close\n").is_err());
        let fence = fence();
        let code_fence = format!("{fence}yaml\n---\nname: body only\n---\n{fence}\n");
        let note = FolderNoteDocument::parse(&code_fence).expect("body is not frontmatter");
        assert_eq!(note.body().as_str(), code_fence);
        let raw = format!(
            "---\n{}\n---\n",
            " ".repeat(super::super::MAX_FRONT_MATTER_BYTES)
        );
        assert!(FolderNoteDocument::parse(&raw).is_err());
        let oversized_body = "x".repeat(super::super::MAX_FOLDER_NOTE_BYTES + 1);
        assert!(FolderNoteDocument::parse(&oversized_body).is_err());
    }
}
