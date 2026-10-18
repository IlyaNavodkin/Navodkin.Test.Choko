//! Portable single-component product names, deliberately stricter than native filesystem names.
pub(super) fn portable_name(name: &str) -> bool {
    if name.is_empty()
        || name.len() > 180
        || name.trim() != name
        || name.starts_with('.')
        || name.ends_with('.')
        || name.chars().any(|c| {
            c.is_control() || matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*')
        })
    {
        return false;
    }
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_ascii_uppercase();
    !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|suffix| {
                matches!(
                    suffix,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        })
}
pub(super) fn case_filename(name: &str) -> bool {
    portable_name(name)
        && name.strip_suffix(".md").is_some_and(portable_name)
        && !matches!(name.to_ascii_lowercase().as_str(), "_suite.md" | "_run.md")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_nonportable_components_and_system_filenames() {
        for name in [
            "",
            ".",
            "..",
            ".git",
            "../case",
            "a/b",
            "a\\b",
            "name:stream",
            "con",
            "NUL.txt",
            "COM1",
            "LPT².md",
            "trailing.",
            "space ",
            " leading",
            "bad?",
            "line\nfeed",
        ] {
            assert!(!portable_name(name), "{name:?}");
        }
        for name in [
            ".md",
            "_run.md",
            "_suite.md",
            "case.MD",
            "case.txt",
            "con.md",
        ] {
            assert!(!case_filename(name), "{name:?}");
        }
        assert!(portable_name("Оплата — smoke"));
        assert!(case_filename("PAY-0042-payment.md"));
    }
}
