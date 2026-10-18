use super::*;

const SAMPLE_CASE: &str = "---\ncase_id: 9f3a7c1e8b\ndisplay_id: PAY-0042\ntitle: User can reset password — from the login screen\nresult: fail\ntester: amartin\nexecuted_at: 2026-06-01 09:14\n---\n\n## Setup\n\n- [x] Confirm Auth service is available and reachable.\n\n## Steps\n\n- [x] Navigate to the login screen\n- [-] Click \"Forgot password\" !! button 500s, no email sent\n- [ ] Enter the emailed token\n\n## Acceptance Criteria\n\n- [-] A reset email arrives within 60s !! never arrived\n\n## Notes\n\nSee defect DEF-2291.\n";

const SAMPLE_DETAILS: &str = "---\nname: Regression — Sprint 13\nstatus: open\ncreated: \"2026-06-09\"\ntest_date: \"2026-06-09\"\nscope: custom (4 cases)\ntester_approval:\n  name: amartin\n  at: \"2026-06-09 14:22\"\nreviewer_approval:\n  name: okeefe\n  at: \"2026-06-09 16:01\"\n---\n\n## Summary\n\nAll payment flows verified.\n\n## Notes\n\nGateway sandbox was flaky.\n";

#[test]
fn parses_source_sample_run_case_and_keeps_exact_lf_crlf_bytes() {
    let parsed = RunCaseDocument::parse(SAMPLE_CASE).expect("upstream sample case");
    assert_eq!(parsed.model().case_id, "9f3a7c1e8b");
    assert_eq!(parsed.model().display_id, "PAY-0042");
    assert_eq!(
        parsed.model().title,
        "User can reset password — from the login screen"
    );
    assert_eq!(parsed.model().result, RunResult::Fail);
    assert_eq!(parsed.model().tester, "amartin");
    assert_eq!(parsed.model().executed_at, "2026-06-01 09:14");
    assert_eq!(parsed.model().test_date, None);
    assert_eq!(parsed.model().notes, "See defect DEF-2291.");
    assert_eq!(parsed.model().setup.len(), 1);
    assert_eq!(parsed.model().setup[0].key, "setup:0");
    assert_eq!(
        parsed.model().setup[0].text,
        "Confirm Auth service is available and reachable."
    );
    assert_eq!(parsed.model().setup[0].state, RunCheckState::Pass);
    assert_eq!(parsed.model().setup[0].fail_note, "");
    assert_eq!(parsed.model().steps.len(), 3);
    assert_eq!(parsed.model().steps[0].key, "step:0");
    assert_eq!(parsed.model().steps[0].text, "Navigate to the login screen");
    assert_eq!(parsed.model().steps[0].state, RunCheckState::Pass);
    assert_eq!(parsed.model().steps[0].fail_note, "");
    assert_eq!(parsed.model().steps[1].state, RunCheckState::Fail);
    assert_eq!(
        parsed.model().steps[1].fail_note,
        "button 500s, no email sent"
    );
    assert_eq!(parsed.model().steps[1].key, "step:1");
    assert_eq!(parsed.model().steps[2].key, "step:2");
    assert_eq!(parsed.model().steps[2].text, "Enter the emailed token");
    assert_eq!(parsed.model().steps[2].state, RunCheckState::None);
    assert_eq!(parsed.model().steps[2].fail_note, "");
    assert_eq!(parsed.model().accept.len(), 1);
    assert_eq!(parsed.model().accept[0].key, "accept:0");
    assert_eq!(
        parsed.model().accept[0].text,
        "A reset email arrives within 60s"
    );
    assert_eq!(parsed.model().accept[0].state, RunCheckState::Fail);
    assert_eq!(parsed.model().accept[0].fail_note, "never arrived");
    assert!(parsed.warnings().is_empty());
    assert_eq!(parsed.to_text().expect("no-op"), SAMPLE_CASE);
    let crlf = SAMPLE_CASE.replace('\n', "\r\n");
    assert_eq!(
        RunCaseDocument::parse(&crlf)
            .expect("CRLF")
            .to_text()
            .expect("no-op"),
        crlf
    );
}

#[test]
fn parses_all_six_result_states_and_checklist_marks() {
    for (text, result) in [
        ("not_run", RunResult::NotRun),
        ("pass", RunResult::Pass),
        ("fail", RunResult::Fail),
        ("blocked", RunResult::Blocked),
        ("in_progress", RunResult::InProgress),
        ("skipped", RunResult::Skipped),
    ] {
        let source = SAMPLE_CASE.replace("result: fail", &format!("result: {text}"));
        assert_eq!(
            RunCaseDocument::parse(&source)
                .expect("valid status")
                .model()
                .result,
            result
        );
    }
    assert_eq!(
        RunCaseDocument::parse(SAMPLE_CASE)
            .expect("case")
            .model()
            .setup[0]
            .state,
        RunCheckState::Pass
    );
    assert_eq!(
        RunCaseDocument::parse(SAMPLE_CASE)
            .expect("case")
            .model()
            .steps[2]
            .state,
        RunCheckState::None
    );
}

#[test]
fn ordinals_before_or_after_mark_and_last_failure_separator_match_source() {
    let source = "---\ncase_id: x1\n---\n\n## Steps\n\n1. [x] First\n- [x] 2. Second\n- [-] Tap Save !! Confirm !! crashed on save\n";
    let parsed = RunCaseDocument::parse(source).expect("numbered checklist");
    assert_eq!(parsed.model().steps[0].text, "First");
    assert_eq!(parsed.model().steps[1].text, "Second");
    assert_eq!(parsed.model().steps[2].text, "Tap Save !! Confirm");
    assert_eq!(parsed.model().steps[2].fail_note, "crashed on save");
}

#[test]
fn unknown_check_marks_warn_and_default_to_none_without_losing_item_text() {
    let source = "---\ncase_id: x1\n---\n\n## Steps\n\n- [?] Mystery\n";
    let parsed = RunCaseDocument::parse(source).expect("unknown mark remains readable");
    assert_eq!(parsed.model().steps[0].text, "Mystery");
    assert_eq!(parsed.model().steps[0].state, RunCheckState::None);
    assert!(
        parsed
            .warnings()
            .iter()
            .any(|warning| warning.code == RunWarningCode::InvalidChecklistMark)
    );
}

#[test]
fn case_metadata_edits_keep_unknown_frontmatter_and_all_body_sections() {
    let source = SAMPLE_CASE.replace(
        "case_id: 9f3a7c1e8b\n",
        "case_id: 9f3a7c1e8b\nvariable: \"{{today}}\"\ncustom:\n  nested: true # retain\n",
    ) + "\n## Custom\n\nUnknown section remains.\n";
    let mut parsed = RunCaseDocument::parse(&source).expect("extended case");
    parsed.set_test_date(Some("2026-07-01".into()));
    parsed.set_result(RunResult::Blocked);
    let output = parsed.to_text().expect("metadata edit");
    assert!(output.contains("variable: \"{{today}}\""));
    assert!(output.contains("nested: true # retain"));
    assert_eq!(
        RunCaseDocument::parse(&output)
            .expect("date updated")
            .model()
            .test_date
            .as_deref(),
        Some("2026-07-01")
    );
    assert!(output.contains("## Custom\n\nUnknown section remains."));
    assert!(output.contains("## Notes\n\nSee defect DEF-2291."));
}

#[test]
fn case_notes_edit_and_checklist_edit_preserve_other_sections_and_crlf() {
    let mut parsed =
        RunCaseDocument::parse(&SAMPLE_CASE.replace('\n', "\r\n")).expect("CRLF sample");
    let mut steps = parsed.model().steps.clone();
    steps[0].state = RunCheckState::Fail;
    steps[0].fail_note = "network timeout".into();
    let mut setup = parsed.model().setup.clone();
    setup[0].text = "Auth service responds".into();
    let mut accept = parsed.model().accept.clone();
    accept[0].state = RunCheckState::Pass;
    accept[0].fail_note.clear();
    parsed.set_setup(setup).expect("unique Setup");
    parsed.set_steps(steps).expect("unique Steps");
    parsed
        .set_accept(accept)
        .expect("unique Acceptance Criteria");
    parsed
        .set_notes("New note — проверено".into())
        .expect("unique Notes");
    let output = parsed.to_text().expect("edited CRLF sidecar");
    assert!(output.contains("- [-] Navigate to the login screen !! network timeout\r\n"));
    assert!(output.contains("- [x] Auth service responds\r\n"));
    assert!(output.contains("- [x] A reset email arrives within 60s\r\n"));
    assert!(output.contains("## Notes\r\n\r\nNew note — проверено\r\n"));
    assert!(
        output.contains("## Acceptance Criteria\r\n\r\n- [x] A reset email arrives within 60s\r\n")
    );
    assert!(!output.replace("\r\n", "").contains('\n'));
}

#[test]
fn missing_or_invalid_case_id_is_read_only_and_never_generated() {
    for raw in [
        "---\ntitle: missing\n---\n\n## Notes\nN\n",
        "---\ncase_id: 42\n---\n\n## Notes\nN\n",
        "---\ncase_id: \"\"\n---\n",
    ] {
        let mut parsed = RunCaseDocument::parse(raw).expect("readable invalid id");
        assert!(parsed.model().case_id.is_empty());
        assert!(parsed.warnings().iter().any(|warning| matches!(
            warning.code,
            RunWarningCode::MissingCaseId | RunWarningCode::InvalidCaseId
        )));
        parsed
            .set_notes("edited".into())
            .expect("setter retains draft");
        assert!(parsed.to_text().is_err());
    }
}

#[test]
fn duplicate_sections_warn_and_refuse_only_the_ambiguous_edit() {
    let source = "---\ncase_id: x1\n---\n\n## Notes\nA\n\n## Notes\nB\n";
    let mut parsed = RunCaseDocument::parse(source).expect("duplicates remain readable");
    assert!(
        parsed
            .warnings()
            .iter()
            .any(|warning| warning.code == RunWarningCode::DuplicateSection)
    );
    assert!(parsed.set_notes("new".into()).is_err());
}

#[test]
fn case_section_setter_noop_and_revert_keep_source_bytes() {
    let mut parsed = RunCaseDocument::parse(SAMPLE_CASE).expect("sample");
    parsed
        .set_notes(parsed.model().notes.clone())
        .expect("no-op setter");
    assert_eq!(parsed.to_text().expect("no-op"), SAMPLE_CASE);
    let mut parsed = RunCaseDocument::parse(SAMPLE_CASE).expect("sample");
    parsed.set_notes("temporary".into()).expect("edit");
    parsed
        .set_notes("See defect DEF-2291.".into())
        .expect("revert");
    parsed.set_title("new title".into());
    assert_eq!(
        parsed.to_text().expect("metadata change"),
        SAMPLE_CASE.replace(
            "title: User can reset password — from the login screen",
            "title: new title"
        )
    );
}

#[test]
fn parses_source_sample_run_details_and_preserves_exact_bytes() {
    let parsed = RunDetailsDocument::parse(SAMPLE_DETAILS).expect("upstream details");
    assert_eq!(parsed.model().name, "Regression — Sprint 13");
    assert_eq!(parsed.model().status, RunStatus::Open);
    assert_eq!(parsed.model().created, "2026-06-09");
    assert_eq!(parsed.model().test_date, "2026-06-09");
    assert_eq!(parsed.model().scope, "custom (4 cases)");
    assert_eq!(
        parsed.model().tester_approval,
        Some(RunApproval {
            name: "amartin".into(),
            at: "2026-06-09 14:22".into()
        })
    );
    assert_eq!(
        parsed
            .model()
            .reviewer_approval
            .as_ref()
            .map(|approval| approval.name.as_str()),
        Some("okeefe")
    );
    assert_eq!(
        parsed
            .model()
            .reviewer_approval
            .as_ref()
            .map(|a| a.at.as_str()),
        Some("2026-06-09 16:01")
    );
    assert_eq!(parsed.model().summary, "All payment flows verified.");
    assert_eq!(parsed.model().notes, "Gateway sandbox was flaky.");
    assert_eq!(parsed.to_text().expect("no-op"), SAMPLE_DETAILS);
}

#[test]
fn editing_run_notes_preserves_approvals_extra_metadata_and_variable_text() {
    let source = SAMPLE_DETAILS
        .replace(
            "tester_approval:\n",
            "variable: \"{{today}}\"\ncustom: {owner: qa}\ntester_approval:\n",
        )
        .replace(
            "  at: \"2026-06-09 14:22\"\n",
            "  at: \"2026-06-09 14:22\"\n  ticket: QA-41\n",
        );
    let mut parsed = RunDetailsDocument::parse(&source).expect("extended run details");
    parsed
        .set_notes("New note — оставить summary".into())
        .expect("notes edit");
    parsed
        .set_summary("Summary updated too".into())
        .expect("summary edit");
    parsed.set_test_date("2026-07-02".into());
    let output = parsed.to_text().expect("edit");
    assert!(output.contains("variable: \"{{today}}\""));
    assert!(output.contains("custom: {owner: qa}"));
    assert!(output.contains("ticket: QA-41"));
    assert_eq!(
        RunDetailsDocument::parse(&output)
            .expect("date updated")
            .model()
            .test_date,
        "2026-07-02"
    );
    assert!(output.contains("## Summary\n\nSummary updated too"));
    assert!(output.contains("## Notes\n\nNew note — оставить summary"));
}

#[test]
fn run_details_crlf_edit_duplicate_and_approval_diagnostics() {
    let crlf = SAMPLE_DETAILS.replace('\n', "\r\n");
    let mut parsed = RunDetailsDocument::parse(&crlf).expect("CRLF details");
    parsed.set_notes("CRLF update".into()).expect("notes edit");
    let output = parsed.to_text().expect("serialize");
    assert!(output.contains("## Notes\r\n\r\nCRLF update\r\n"));
    assert!(!output.replace("\r\n", "").contains('\n'));

    let duplicate = "---\nname: x\n---\n\n## Notes\nA\n\n## Notes\nB\n";
    let mut duplicate = RunDetailsDocument::parse(duplicate).expect("duplicate sections");
    assert!(duplicate.set_notes("changed".into()).is_err());

    let malformed = RunDetailsDocument::parse("---\nname: X\ntester_approval: invalid\n---\n")
        .expect("bad approval tolerated");
    assert_eq!(malformed.model().tester_approval, None);
    assert!(
        malformed
            .warnings()
            .iter()
            .any(|warning| warning.code == RunWarningCode::InvalidApproval)
    );
}

#[test]
fn approval_edit_changes_only_modified_nested_scalar_and_keeps_extra_keys() {
    let source = "---\nname: run\ntester_approval:\n  name: old\n  at: 123\n  ticket: QA-99\n---\n";
    let mut parsed = RunDetailsDocument::parse(source).expect("approval with extension fields");
    parsed.set_tester_approval(Some(RunApproval {
        name: "new".into(),
        at: "123".into(),
    }));
    let output = parsed.to_text().expect("change approval name only");
    assert!(output.contains("name: new"));
    assert!(
        output.contains("at: 123"),
        "unchanged raw scalar stays numeric: {output}"
    );
    assert!(output.contains("ticket: QA-99"));
}

#[test]
fn run_details_setter_noop_and_revert_keep_source_bytes_and_closed_status_reads() {
    let mut parsed = RunDetailsDocument::parse(SAMPLE_DETAILS).expect("details");
    parsed
        .set_notes(parsed.model().notes.clone())
        .expect("no-op setter");
    assert_eq!(parsed.to_text().expect("no-op"), SAMPLE_DETAILS);
    parsed.set_notes("temporary".into()).expect("edit");
    parsed
        .set_notes("Gateway sandbox was flaky.".into())
        .expect("revert");
    assert_eq!(parsed.to_text().expect("reverted"), SAMPLE_DETAILS);
    let closed = SAMPLE_DETAILS.replace("status: open", "status: closed");
    assert_eq!(
        RunDetailsDocument::parse(&closed)
            .expect("closed")
            .model()
            .status,
        RunStatus::Closed
    );
}

#[test]
fn malformed_and_oversized_run_documents_are_diagnostics() {
    assert!(RunCaseDocument::parse("---\ncase_id: [\n").is_err());
    assert!(RunDetailsDocument::parse("---\nname: [\n").is_err());
    assert!(RunCaseDocument::parse(&"x".repeat(MAX_RUN_CASE_BYTES + 1)).is_err());
    assert!(RunDetailsDocument::parse(&"x".repeat(MAX_RUN_DETAILS_BYTES + 1)).is_err());
    let front = format!("---\n{}\n---\n", " ".repeat(MAX_RUN_FRONTMATTER_BYTES));
    assert!(RunCaseDocument::parse(&front).is_err());
}
