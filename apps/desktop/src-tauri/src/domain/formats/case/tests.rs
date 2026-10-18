use super::*;
const CANONICAL: &str = "---\nid: 9f3a7c1e8b\ndisplayId: PAY-0042\ntitle: User can reset password from the login screen\nstatus: active\ntags: [auth, smoke, regression]\n---\n\n## Objective\n\nVerify a registered user can reset their password and regain access via the\n**self-service** flow; no admin involvement required.\n\n## Systems in Scope\n\n- Login web app\n- Auth service\n- Transactional email gateway\n\n## Setup\n\n### Test account\n\nA registered user with a verified email and a **known** current password.\n\n### Inbox access\n\nAccess to the account inbox so the reset email can be opened.\n\n## Steps\n\n1. Navigate to the login screen.\n2. Click \"Forgot password\".\n  1. Confirm the recovery form is shown.\n3. Enter the account email and submit.\n\n## Acceptance Criteria\n\n- A reset email is delivered within one minute.\n- The reset link allows setting a new password.\n- The user can log in with the new password.\n";

#[test]
fn reads_upstream_canonical_case_and_round_trips_lf_and_crlf_exactly() {
    let parsed = CaseDocument::parse(CANONICAL).expect("canonical case");
    assert_eq!(parsed.model().id.as_deref(), Some("9f3a7c1e8b"));
    assert_eq!(parsed.model().display_id, "PAY-0042");
    assert_eq!(parsed.model().status, CaseStatus::Active);
    assert_eq!(
        parsed.model().steps[2],
        CaseStep {
            text: "Confirm the recovery form is shown.".into(),
            depth: 1
        }
    );
    assert!(parsed.warnings().is_empty());
    assert_eq!(parsed.to_text().expect("no-op"), CANONICAL);
    let crlf = CANONICAL.replace('\n', "\r\n");
    let parsed_crlf = CaseDocument::parse(&crlf).expect("CRLF case");
    assert_eq!(parsed_crlf.model().title, parsed.model().title);
    assert_eq!(parsed_crlf.to_text().expect("no-op"), crlf);
}

#[test]
fn frontmatter_edit_preserves_unknown_fields_comments_and_unedited_raw_values() {
    let raw = CANONICAL
        .replace(
            "id: 9f3a7c1e8b\n",
            "id: 9f3a7c1e8b\ncustom: {enabled: true} # keep this\n# retain comment\n",
        )
        .replace("tags: [auth, smoke, regression]", "tags: [true, 123, null]");
    let mut document = CaseDocument::parse(&raw).expect("case");
    document.set_title("Reset: #1 東京".into());
    let output = document.to_text().expect("safe edit");
    assert!(output.contains("custom: {enabled: true} # keep this"));
    assert!(output.contains("# retain comment"));
    assert!(output.contains("tags: [true, 123, null]"));
    assert_eq!(
        CaseDocument::parse(&output)
            .expect("edited document")
            .model()
            .title,
        "Reset: #1 東京"
    );
    assert!(output.ends_with(CANONICAL.split("---\n\n").nth(1).expect("markdown body")));
}

#[test]
fn edits_status_and_tags_but_never_changes_id_and_missing_id_blocks_metadata_write() {
    let mut document = CaseDocument::parse(CANONICAL).expect("case");
    document.set_status(CaseStatus::Deprecated);
    document.set_tags(vec!["smoke test".into(), "東京".into()]);
    let output = document.to_text().expect("metadata edit");
    let reparsed = CaseDocument::parse(&output).expect("edited case");
    assert_eq!(reparsed.model().id.as_deref(), Some("9f3a7c1e8b"));
    assert_eq!(reparsed.model().status, CaseStatus::Deprecated);
    assert_eq!(reparsed.model().tags, ["smoke test", "東京"]);

    let mut missing = CaseDocument::parse("---\ntitle: no id\n---\n").expect("missing id");
    missing.set_title("Attempted identity-less write".into());
    assert!(missing.to_text().is_err());
}

#[test]
fn section_edit_keeps_unknown_blocks_and_headings_inside_fences() {
    let raw = CANONICAL.replace(
        "## Systems in Scope\n\n",
        "## Systems in Scope\n\n```md\n## Steps\n```\n\n",
    ) + "\n## Notes\n\nUnknown content stays.\n";
    let mut document = CaseDocument::parse(&raw).expect("case");
    document
        .set_objective("Новая цель — 東京".into())
        .expect("unique objective");
    let output = document.to_text().expect("edited case");
    assert!(
        output.contains("## Objective\n\nНовая цель — 東京"),
        "{output:?}"
    );
    assert!(output.contains("## Systems in Scope\n\n```md\n## Steps\n```"));
    assert!(output.contains("## Notes\n\nUnknown content stays."));
    assert!(output.contains("- Login web app"));

    let crlf = CANONICAL.replace('\n', "\r\n");
    let mut crlf_doc = CaseDocument::parse(&crlf).expect("CRLF case");
    crlf_doc
        .set_objective("Изменено".into())
        .expect("section edit");
    let edited = crlf_doc.to_text().expect("CRLF edit");
    assert!(edited.contains("## Objective\r\n\r\nИзменено\r\n\r\n## Systems in Scope"));
    assert!(!edited.replace("\r\n", "").contains('\n'));
}

#[test]
fn setting_a_section_to_its_current_value_or_reverting_an_edit_is_byte_exact() {
    let mut document = CaseDocument::parse(CANONICAL).expect("case");
    document
        .set_objective(document.model().objective.clone())
        .expect("same value");
    assert_eq!(document.to_text().expect("no semantic change"), CANONICAL);

    let mut document = CaseDocument::parse(CANONICAL).expect("case");
    let original = document.model().objective.clone();
    document.set_objective("temporary".into()).expect("edit");
    document.set_objective(original).expect("revert");
    document.set_title("new title".into());
    assert_eq!(
        document.to_text().expect("front edit"),
        CANONICAL.replace(
            "title: User can reset password from the login screen",
            "title: new title"
        )
    );
}

#[test]
fn setup_and_step_parsing_matches_indented_nested_outline_contract() {
    let raw = "---\nid: x\n---\n\n## Setup\n\nIntro text\n\n### Account\n\n### Empty\n\n## Steps\n\n1. one\n  2. two\n    3. three\n      4. four\n        5. clamp\n";
    let parsed = CaseDocument::parse(raw).expect("edge fixture");
    assert_eq!(
        parsed.model().setup,
        [
            CaseSetupItem {
                name: String::new(),
                body: "Intro text".into()
            },
            CaseSetupItem {
                name: "Account".into(),
                body: String::new()
            },
            CaseSetupItem {
                name: "Empty".into(),
                body: String::new()
            }
        ]
    );
    assert_eq!(
        parsed
            .model()
            .steps
            .iter()
            .map(|step| step.depth)
            .collect::<Vec<_>>(),
        [0, 1, 2, 3, 3]
    );
}

#[test]
fn setup_headings_inside_fenced_code_are_retained_as_body_text() {
    let raw = "---\nid: x\n---\n\n## Setup\n\n### Script\n\n```md\n### not a setup item\n## not a section\n```\n\n## Steps\n\n1. Run it\n";
    let parsed = CaseDocument::parse(raw).expect("fenced setup");
    assert_eq!(
        parsed.model().setup,
        [CaseSetupItem {
            name: "Script".into(),
            body: "```md\n### not a setup item\n## not a section\n```".into()
        }]
    );
}

#[test]
fn setup_heading_whitespace_matches_upstream_heading_rule() {
    let raw = "---\nid: x\n---\n\n## Setup\n\n###\tInbox access\nBody\n";
    let parsed = CaseDocument::parse(raw).expect("setup heading");
    assert_eq!(
        parsed.model().setup,
        [CaseSetupItem {
            name: "Inbox access".into(),
            body: "Body".into()
        }]
    );
}

#[test]
fn invalid_frontmatter_fields_warn_and_are_preserved_on_unrelated_edit() {
    let raw = CANONICAL
        .replace("id: 9f3a7c1e8b", "id: 42")
        .replace("tags: [auth, smoke, regression]", "tags: [{bad: value}]")
        .replace("status: active", "status: broken");
    let mut document =
        CaseDocument::parse(&raw).expect("well-formed yaml with invalid schema values");
    assert_eq!(document.model().id, None);
    assert!(
        document
            .warnings()
            .iter()
            .any(|warning| warning.code == CaseWarningCode::InvalidId)
    );
    assert!(
        document
            .warnings()
            .iter()
            .any(|warning| warning.code == CaseWarningCode::InvalidTags)
    );
    assert!(
        document
            .warnings()
            .iter()
            .any(|warning| warning.code == CaseWarningCode::InvalidStatus)
    );
    document.set_title("Changed title".into());
    assert!(
        document.to_text().is_err(),
        "a malformed identity must not be silently rewritten"
    );
    assert!(raw.contains("id: 42\n"));
}

#[test]
fn refuses_a_section_edit_that_would_change_markdown_structure() {
    let mut document = CaseDocument::parse(CANONICAL).expect("case");
    document
        .set_objective("New objective\n\n## Steps\n\nInjected section".into())
        .expect("setter");
    assert!(document.to_text().is_err());
}

#[test]
fn legacy_acceptance_alias_is_read_and_fenced_heading_is_not_a_section() {
    let raw = "---\nid: x\n---\n\n## Expected Results\n\n- accepted\n\n## Objective\n\n~~~md\n## Steps\n~~~\nActual objective\n";
    let parsed = CaseDocument::parse(raw).expect("legacy case");
    assert_eq!(parsed.model().acceptance_criteria, ["accepted"]);
    assert_eq!(
        parsed.model().objective,
        "~~~md\n## Steps\n~~~\nActual objective"
    );
}

#[test]
fn missing_id_is_warned_without_generation_and_duplicate_edits_are_refused() {
    let missing = CaseDocument::parse("---\ntitle: no id\n---\n").expect("case");
    assert_eq!(missing.model().id, None);
    assert!(
        missing
            .warnings()
            .iter()
            .any(|warning| warning.code == CaseWarningCode::MissingId)
    );
    let mut duplicate = CaseDocument::parse(
        "---\nid: x\n---\n\n## Acceptance Criteria\nA\n\n## Expected Results\nB\n",
    )
    .expect("duplicates readable");
    assert!(
        duplicate
            .warnings()
            .iter()
            .any(|warning| warning.code == CaseWarningCode::DuplicateSection)
    );
    assert!(
        duplicate
            .set_acceptance_criteria(vec!["edited".into()])
            .is_err()
    );
}

#[test]
fn empty_frontmatter_and_empty_id_are_readable_but_read_only() {
    let empty = CaseDocument::parse("---\n---\n\n## Objective\nText\n").expect("empty frontmatter");
    assert_eq!(empty.model().id, None);
    assert!(
        empty
            .warnings()
            .iter()
            .any(|warning| warning.code == CaseWarningCode::MissingId)
    );

    let mut blank_id =
        CaseDocument::parse("---\nid: \"\"\ntitle: blank identity\n---\n\n## Objective\nText\n")
            .expect("blank id");
    blank_id
        .set_objective("changed".into())
        .expect("section edit draft");
    assert!(blank_id.to_text().is_err());

    let mut empty_fm = empty;
    empty_fm.set_title("title edit".into());
    assert!(empty_fm.to_text().is_err());
}

#[test]
fn malformed_and_oversized_documents_are_rejected() {
    assert!(CaseDocument::parse("---\ntitle: [\n").is_err());
    assert!(CaseDocument::parse(&"x".repeat(MAX_CASE_BYTES + 1)).is_err());
    let front = format!("---\n{}\n---\n", " ".repeat(MAX_CASE_FRONTMATTER_BYTES));
    assert!(CaseDocument::parse(&front).is_err());
}
