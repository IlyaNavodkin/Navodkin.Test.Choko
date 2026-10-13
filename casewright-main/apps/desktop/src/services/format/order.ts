// ---------------------------------------------------------------------------
// `.order` files — the Azure DevOps wiki ordering format. A folder's `.order`
// lists its direct children in display order, one key per line (the child's
// filename without the `.md` extension, or a subfolder's basename). Blank lines
// are tolerated and ignored; the loader appends any on-disk child missing from
// `.order` after the listed ones.
// ---------------------------------------------------------------------------

/** Parse a `.order` file into its ordered list of child keys (blank lines dropped). */
export function parseOrder(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Serialize an ordered list of child keys to `.order` text (one per line, trailing newline). */
export function serializeOrder(keys: string[]): string {
  return keys.join('\n') + '\n';
}
