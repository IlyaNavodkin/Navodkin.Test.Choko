use super::{CaseModel, CaseSetupItem, CaseStep};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Section {
    Objective,
    Systems,
    Setup,
    Steps,
    Acceptance,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Span {
    pub(super) kind: Option<Section>,
    pub(super) heading: String,
    pub(super) line: usize,
    pub(super) start: usize,
    pub(super) end: usize,
}

pub(super) fn scan(text: &str) -> Vec<Span> {
    let mut found = Vec::new();
    let mut fence: Option<(u8, usize)> = None;
    let mut offset = 0;
    for (line_no, raw) in (1..).zip(text.split_inclusive('\n')) {
        let clean = raw.trim_end_matches(['\r', '\n']);
        let trimmed = clean.trim_start_matches(' ');
        let indent = clean.len() - trimmed.len();
        if indent <= 3 {
            if let Some((ch, size)) = fence {
                let count = trimmed.bytes().take_while(|b| *b == ch).count();
                if count >= size && trimmed[count..].trim().is_empty() {
                    fence = None;
                }
            } else {
                let ch = trimmed.as_bytes().first().copied();
                let count = ch.map_or(0, |c| trimmed.bytes().take_while(|b| *b == c).count());
                if matches!(ch, Some(b'`' | b'~')) && count >= 3 {
                    fence = ch.map(|c| (c, count));
                } else if let Some((heading, kind)) = parse_heading(trimmed) {
                    found.push((offset, offset + raw.len(), heading, kind, line_no));
                }
            }
        }
        offset += raw.len();
    }
    found
        .iter()
        .enumerate()
        .map(|(i, (_start, content, heading, kind, line))| Span {
            kind: *kind,
            heading: heading.clone(),
            line: *line,
            start: *content,
            end: found.get(i + 1).map_or(text.len(), |next| next.0),
        })
        .collect()
}
fn parse_heading(line: &str) -> Option<(String, Option<Section>)> {
    let rest = line.strip_prefix("##")?;
    if !rest.starts_with([' ', '\t']) {
        return None;
    }
    let heading = rest.trim();
    let kind = match heading {
        "Objective" => Some(Section::Objective),
        "Systems in Scope" => Some(Section::Systems),
        "Setup" => Some(Section::Setup),
        "Steps" => Some(Section::Steps),
        "Acceptance Criteria" | "Expected Results" => Some(Section::Acceptance),
        _ => None,
    };
    (!heading.is_empty()).then(|| (heading.into(), kind))
}
pub(super) fn content(body: &str, spans: &[Span], kind: Section) -> String {
    spans
        .iter()
        .filter(|span| span.kind == Some(kind))
        .filter_map(|span| body.get(span.start..span.end))
        .map(|part| part.replace("\r\n", "\n"))
        .collect::<Vec<_>>()
        .join("\n")
}
fn trim_blank<'a>(lines: &'a [&'a str]) -> &'a [&'a str] {
    let mut start = 0;
    let mut end = lines.len();
    while start < end && lines[start].trim().is_empty() {
        start += 1;
    }
    while end > start && lines[end - 1].trim().is_empty() {
        end -= 1;
    }
    &lines[start..end]
}
pub(super) fn bullets(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.strip_prefix("- ")
                .or_else(|| s.strip_prefix("* "))
                .or_else(|| s.strip_prefix("+ "))
                .unwrap_or(s)
                .to_owned()
        })
        .collect()
}
pub(super) fn setup(text: &str) -> Vec<CaseSetupItem> {
    let mut result = Vec::new();
    let mut name = String::new();
    let mut body = Vec::new();
    let mut lead = Vec::new();
    let mut has_heading = false;
    let mut fence: Option<(u8, usize)> = None;
    for row in text.lines() {
        let trimmed = row.trim_start_matches(' ');
        let ch = trimmed.as_bytes().first().copied();
        let count = ch.map_or(0, |c| trimmed.bytes().take_while(|b| *b == c).count());
        if let Some((fence_char, size)) = fence {
            if ch == Some(fence_char) && count >= size && trimmed[count..].trim().is_empty() {
                fence = None;
            }
            body.push(row);
            continue;
        }
        if matches!(ch, Some(b'`' | b'~')) && count >= 3 {
            fence = ch.map(|c| (c, count));
            body.push(row);
            continue;
        }
        if let Some(heading) = row
            .strip_prefix("###")
            .filter(|suffix| suffix.is_empty() || suffix.starts_with([' ', '\t']))
        {
            if has_heading {
                result.push(CaseSetupItem {
                    name,
                    body: trim_blank(&body).join("\n"),
                });
            } else if !trim_blank(&body).is_empty() {
                lead.clone_from(&body);
            }
            name = heading.trim().into();
            body.clear();
            has_heading = true;
        } else {
            body.push(row);
        }
    }
    if has_heading {
        result.push(CaseSetupItem {
            name,
            body: trim_blank(&body).join("\n"),
        });
    } else {
        let body = trim_blank(&body).join("\n");
        if !body.is_empty() {
            result.push(CaseSetupItem {
                name: String::new(),
                body,
            });
        }
    }
    if !lead.is_empty() {
        result.insert(
            0,
            CaseSetupItem {
                name: String::new(),
                body: trim_blank(&lead).join("\n"),
            },
        );
    }
    result
}
pub(super) fn steps(text: &str) -> Vec<CaseStep> {
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let indent = line.bytes().take_while(|b| *b == b' ').count();
            let rest = line.trim_start_matches(' ');
            let text = rest
                .split_once(". ")
                .filter(|(n, _)| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
                .map_or(rest, |(_, text)| text);
            CaseStep {
                text: text.trim().into(),
                depth: u8::try_from((indent / 2).min(3)).unwrap_or(3),
            }
        })
        .collect()
}
pub(super) fn render_section(kind: Section, model: &CaseModel, eol: &str) -> String {
    let body = match kind {
        Section::Objective => model.objective.trim().replace('\n', eol),
        Section::Systems => model
            .systems
            .iter()
            .map(|s| format!("- {s}"))
            .collect::<Vec<_>>()
            .join(eol),
        Section::Setup => model
            .setup
            .iter()
            .map(|item| {
                let heading = if item.name.is_empty() {
                    "###".into()
                } else {
                    format!("### {}", item.name)
                };
                let body = trim_blank(&item.body.lines().collect::<Vec<_>>()).join(eol);
                if body.is_empty() {
                    heading
                } else {
                    format!("{heading}{eol}{eol}{body}")
                }
            })
            .collect::<Vec<_>>()
            .join(&format!("{eol}{eol}")),
        Section::Steps => {
            let mut counters = [0_u32; 4];
            model
                .steps
                .iter()
                .map(|step| {
                    let depth = usize::from(step.depth.min(3));
                    counters[depth] += 1;
                    counters[depth + 1..].fill(0);
                    format!("{}{}. {}", "  ".repeat(depth), counters[depth], step.text)
                })
                .collect::<Vec<_>>()
                .join(eol)
        }
        Section::Acceptance => model
            .acceptance_criteria
            .iter()
            .map(|s| format!("- {s}"))
            .collect::<Vec<_>>()
            .join(eol),
    };
    format!("## {}{eol}{eol}{body}", section_name(kind))
}
pub(super) fn section_name(kind: Section) -> &'static str {
    match kind {
        Section::Objective => "Objective",
        Section::Systems => "Systems in Scope",
        Section::Setup => "Setup",
        Section::Steps => "Steps",
        Section::Acceptance => "Acceptance Criteria",
    }
}
pub(super) fn index(kind: Section) -> usize {
    match kind {
        Section::Objective => 0,
        Section::Systems => 1,
        Section::Setup => 2,
        Section::Steps => 3,
        Section::Acceptance => 4,
    }
}
