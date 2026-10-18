import { node } from '@/lib/node';
import { SuiteFrontMatterSchema, type LintWarning, type SuiteFrontMatter } from '@/schemas';

function needsQuote(s: string): boolean {
  if (s === '' || s !== s.trim()) return true;
  if (/:( |$)/.test(s) || /\s#/.test(s) || /^#/.test(s)) return true;
  if (/^[!&*?{}[\]|>@`"'%,\-]/.test(s)) return true;
  return false;
}
const yamlScalar = (s: string): string => (needsQuote(s) ? JSON.stringify(s) : s);

/** Serialize `_suite.md` front matter (PRD §5.3). */
export function serializeSuite(meta: SuiteFrontMatter): string {
  const lines = ['---'];
  if (meta.title) lines.push(`title: ${yamlScalar(meta.title)}`);
  if (meta.description) lines.push(`description: ${yamlScalar(meta.description)}`);
  lines.push('---', '');
  return lines.join('\n');
}

export interface ParseSuiteResult {
  suite: SuiteFrontMatter;
  warnings: LintWarning[];
}

export function parseSuite(text: string): ParseSuiteResult {
  const warnings: LintWarning[] = [];
  const data = (node.matter()(text).data ?? {}) as Record<string, unknown>;
  const parsed = SuiteFrontMatterSchema.safeParse(data);
  if (parsed.success) return { suite: parsed.data, warnings };
  warnings.push({ code: 'suite-meta', message: 'Suite metadata was invalid; ignored.' });
  return { suite: {}, warnings };
}
