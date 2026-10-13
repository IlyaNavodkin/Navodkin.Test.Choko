import { node } from '@/lib/node';
import { CaseFrontMatterSchema, type LintWarning } from '@/schemas';
import type { Case, SetupItem, Step } from '@/types';
import { caseStem } from '@/services/format/filename';
import { randomId, slug } from '@/utils/ids';
import { numberSteps } from '@/utils/steps';

/** A case parsed from disk — everything except the suite-derived/runtime fields. */
export type ParsedCase = Omit<Case, 'suite' | 'modified'>;

export interface ParseCaseResult {
  case: ParsedCase;
  /** Out-of-schema content captured verbatim (re-appended on serialize). */
  extra: string;
  warnings: LintWarning[];
}

const RESERVED = ['Objective', 'Systems in Scope', 'Setup', 'Steps', 'Acceptance Criteria'] as const;

// Legacy headings that map onto a current reserved section. Files written before a rename keep
// their content (and migrate to the new heading on the next save). 'Expected Results' was the
// original name of the 'Acceptance Criteria' section.
const HEADING_ALIASES: Record<string, string> = { 'Expected Results': 'Acceptance Criteria' };

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/** True when a YAML scalar can't be emitted plain (must be double-quoted). */
function needsQuote(s: string): boolean {
  if (s === '' || s !== s.trim()) return true;
  if (/:( |$)/.test(s) || /\s#/.test(s) || /^#/.test(s)) return true;
  if (/^[!&*?{}[\]|>@`"'%,\-]/.test(s)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^[\d.+-]+$/.test(s)) return true; // numeric-looking
  return false;
}
const yamlScalar = (s: string): string => (needsQuote(s) ? JSON.stringify(s) : s);

function serializeSteps(steps: Step[]): string {
  const nums = numberSteps(steps);
  return steps.map((s, i) => '  '.repeat(s.depth) + (nums[i].split('.').pop() ?? '1') + '. ' + s.text).join('\n');
}

/** Each setup item becomes a `### name` heading with its (optional) multi-line body. */
function serializeSetup(items: SetupItem[]): string {
  return items
    .map((it) => {
      const head = it.name ? `### ${it.name}` : '###';
      // Trim only surrounding blank lines — never the first/last line's own
      // indentation, which is significant markdown (code blocks, nested lists).
      const body = trimBlank(it.body.split('\n')).join('\n');
      return body ? `${head}\n\n${body}` : head;
    })
    .join('\n\n');
}

const sectionBlock = (heading: string, content: string): string => (content ? `${heading}\n\n${content}` : heading);

/**
 * Serialize a Case to its canonical markdown form (PRD §5.2): stable front-matter
 * key order, inline `tags` array, the four reserved `##` sections in fixed order
 * (even when empty), 2-space-per-depth ordered Steps, and a single trailing newline.
 * Any captured out-of-schema `extra` is re-appended.
 */
export function serializeCase(c: ParsedCase, extra = ''): string {
  // Persist `slug` only when it actually overrides the title-derived stem — keeps default
  // files free of a redundant key, and drops a stale override once it matches the title again.
  const stem = c.slug ? caseStem(c.slug) : '';
  const front = [
    '---',
    `id: ${yamlScalar(c.id)}`,
    `displayId: ${yamlScalar(c.displayId)}`,
    `title: ${yamlScalar(c.title)}`,
    ...(stem && stem !== slug(c.title) ? [`slug: ${yamlScalar(stem)}`] : []),
    `status: ${c.status}`,
    `tags: [${c.tags.map(yamlScalar).join(', ')}]`,
    '---',
  ].join('\n');

  const blocks = [
    sectionBlock('## Objective', c.objective.trim()),
    sectionBlock('## Systems in Scope', c.systems.map((s) => `- ${s}`).join('\n')),
    sectionBlock('## Setup', serializeSetup(c.setup)),
    sectionBlock('## Steps', serializeSteps(c.steps)),
    sectionBlock('## Acceptance Criteria', c.expected.map((s) => `- ${s}`).join('\n')),
  ];

  let body = blocks.join('\n\n');
  const tail = extra.trim();
  if (tail) body += `\n\n${tail}`;

  return `${front}\n\n${body}\n`;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function trimBlank(lines: string[]): string[] {
  let s = 0;
  let e = lines.length;
  while (s < e && lines[s].trim() === '') s++;
  while (e > s && lines[e - 1].trim() === '') e--;
  return lines.slice(s, e);
}

function splitSections(content: string, warnings: LintWarning[]): { sections: Record<string, string>; extra: string } {
  const lines = content.split('\n');
  const acc: Record<string, string[]> = {};
  const extra: string[] = [];
  let current: string | null = null;
  let sawUnknown = false;

  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const raw = h[1].trim();
      const name = HEADING_ALIASES[raw] ?? raw;
      if ((RESERVED as readonly string[]).includes(name)) {
        current = name;
        acc[name] ??= [];
        continue;
      }
      current = null;
      sawUnknown = true;
      extra.push(line);
      continue;
    }
    if (current) acc[current].push(line);
    else if (sawUnknown || line.trim() !== '') extra.push(line);
  }

  const trimmedExtra = trimBlank(extra).join('\n');
  if (trimmedExtra) {
    warnings.push({ code: 'extra-content', message: 'Out-of-schema content was preserved verbatim.' });
  }
  const sections: Record<string, string> = {};
  for (const k of Object.keys(acc)) sections[k] = trimBlank(acc[k]).join('\n');
  return { sections, extra: trimmedExtra };
}

function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*+]\s+/, ''));
}

/** Split a Setup section into `### name` + body items (h1–h3 are reserved, so `###` is unambiguous). */
function parseSetup(text: string): SetupItem[] {
  const items: { name: string; body: string[] }[] = [];
  const lead: string[] = []; // any content before the first `###` heading
  for (const line of text.split('\n')) {
    const h = /^###(?:[ \t]+(.*?))?[ \t]*$/.exec(line);
    if (h) {
      items.push({ name: (h[1] ?? '').trim(), body: [] });
      continue;
    }
    (items.length ? items[items.length - 1].body : lead).push(line);
  }
  const result = items.map((it) => ({ name: it.name, body: trimBlank(it.body).join('\n') }));
  // Preserve any heading-less leading prose as an unnamed item rather than dropping it.
  const leadBody = trimBlank(lead).join('\n');
  if (leadBody) result.unshift({ name: '', body: leadBody });
  return result;
}

function parseSteps(text: string): Step[] {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((line) => {
      const indent = line.match(/^ */)?.[0].length ?? 0;
      const depth = Math.max(0, Math.min(3, Math.floor(indent / 2)));
      const stripped = line.slice(indent).replace(/^\d+\.\s+/, '');
      return { text: stripped.trim(), depth };
    });
}

/**
 * Parse case markdown → domain shape + captured extra + lint warnings (PRD §5.2).
 * Validation is non-blocking: bad front matter coerces to defaults with a warning;
 * a missing `id` is generated; step depth derives from indentation (ordinals ignored).
 */
export function parseCase(input: string): ParseCaseResult {
  const warnings: LintWarning[] = [];
  const text = input.replace(/\r\n/g, '\n'); // tolerate CRLF (e.g. git autocrlf checkout)
  const parsed = node.matter()(text);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const content = (parsed.content ?? '') as string;

  const fm = CaseFrontMatterSchema.safeParse(data);
  const front = fm.success ? fm.data : CaseFrontMatterSchema.parse({});
  if (!fm.success) warnings.push({ code: 'frontmatter', message: 'Front matter was invalid; coerced to defaults.' });

  let id = front.id;
  if (!id) {
    id = randomId();
    warnings.push({ code: 'missing-id', message: 'Case had no `id`; a new one was generated.' });
  }

  const { sections, extra } = splitSections(content, warnings);

  return {
    case: {
      id,
      displayId: front.displayId,
      title: front.title,
      slug: front.slug?.trim() ? front.slug.trim() : undefined,
      status: front.status,
      tags: front.tags,
      objective: (sections['Objective'] ?? '').trim(),
      systems: parseBullets(sections['Systems in Scope'] ?? ''),
      setup: parseSetup(sections['Setup'] ?? ''),
      steps: parseSteps(sections['Steps'] ?? ''),
      expected: parseBullets(sections['Acceptance Criteria'] ?? ''),
    },
    extra,
    warnings,
  };
}
