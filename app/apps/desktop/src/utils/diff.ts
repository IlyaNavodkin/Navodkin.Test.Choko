import type { DiffToken } from '@/types';

/**
 * Word-level diff (LCS) → tokens tagged same / add / del.
 * `del` carries the left (ours) side, `add` carries the right (theirs) side.
 */
export function wordDiff(a: string, b: string): { del: DiffToken[]; add: DiffToken[] } {
  const aw = (a || '').split(/(\s+)/);
  const bw = (b || '').split(/(\s+)/);
  const n = aw.length;
  const m = bw.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let x = n - 1; x >= 0; x--)
    for (let y = m - 1; y >= 0; y--)
      dp[x][y] = aw[x] === bw[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);

  const del: DiffToken[] = [];
  const add: DiffToken[] = [];
  let x = 0;
  let y = 0;
  while (x < n && y < m) {
    if (aw[x] === bw[y]) {
      del.push({ v: aw[x], t: 'same' });
      add.push({ v: bw[y], t: 'same' });
      x++;
      y++;
    } else if (dp[x + 1][y] >= dp[x][y + 1]) {
      del.push({ v: aw[x], t: 'del' });
      x++;
    } else {
      add.push({ v: bw[y], t: 'add' });
      y++;
    }
  }
  while (x < n) del.push({ v: aw[x++], t: 'del' });
  while (y < m) add.push({ v: bw[y++], t: 'add' });
  return { del, add };
}
