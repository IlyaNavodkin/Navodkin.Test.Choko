import { node } from '@/lib/node';
import { FolderNoteFrontSchema, type FolderNoteFront, type LintWarning } from '@/schemas';
import { yamlScalar } from './workspace';

/** The editable fields of a folder note — a workspace's or suite's metadata. */
export interface FolderNoteMeta {
  name: string;
  /** Inheritable display-ID prefix; omitted from the note when blank. */
  prefix?: string;
  /** Free-text description, serialized as the markdown body. */
  description?: string;
}

/**
 * Serialize an (optional) folder note: front matter `name` (+ `displayIdPrefix` when set),
 * then the description as the markdown body. Mirrors `serializeCase`'s front-matter-then-body
 * shape so the note is itself a valid wiki page.
 */
export function serializeFolderNote(meta: FolderNoteMeta): string {
  const front = ['---', `name: ${yamlScalar(meta.name)}`];
  if (meta.prefix && meta.prefix.trim()) front.push(`displayIdPrefix: ${yamlScalar(meta.prefix.trim())}`);
  front.push('---', '');
  const body = (meta.description ?? '').trim();
  return body ? `${front.join('\n')}\n${body}\n` : front.join('\n');
}

export interface ParseFolderNoteResult {
  meta: FolderNoteFront;
  /** The markdown body (the description), trimmed. */
  description: string;
  warnings: LintWarning[];
}

/** Parse a folder note → front-matter metadata + body description (tolerant). */
export function parseFolderNote(text: string): ParseFolderNoteResult {
  const warnings: LintWarning[] = [];
  const parsed = node.matter()(text.replace(/\r\n/g, '\n'));
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const fm = FolderNoteFrontSchema.safeParse(data);
  if (!fm.success) warnings.push({ code: 'folder-note', message: 'Folder note metadata was invalid; coerced to defaults.' });
  const meta = fm.success ? fm.data : FolderNoteFrontSchema.parse({});
  return { meta, description: (parsed.content ?? '').trim(), warnings };
}
