/* ============================================================
   Casewright — seed data (NOT app data)

   The running app reads real files from disk via the repo + git services; it no
   longer imports this module. This is the canonical seed for:
     • `scripts/make-fixture.mts` — materializes it into a real Git fixture repo
       (`.casewright/` layout: config.yaml + central runs/ + per-workspace casewright.yaml)
     • `services/format/*.test.ts` — serialize/parse round-trip tests
   The `conflict` export illustrates the merge model for the deferred 3-way engine.

   Theme: manual test cases for the public RANDOM.ORG web tools (https://www.random.org/).
   ============================================================ */
import type { Case, Conflict, Recent, Run, RunRow, TreeNode, Workspace } from '@/types';
import { runCaseFileName } from '@/services/format/filename';

export const recents: Recent[] = [
  {
    name: 'random-org-tests',
    path: '~/work/qa/random-org-tests',
    branch: 'main',
    remote: 'ssh://git@github.com/acme-qa/random-org-tests.git',
    lastOpened: '2026-06-12T12:00:00.000Z',
    workspaces: 1,
    lastWorkspaceId: 'webtools',
  },
];

export const workspaces: Workspace[] = [
  {
    id: 'webtools',
    name: 'RANDOM.ORG Web Tools',
    path: 'areas/web-tools',
    description: 'Manual test cases for the public RANDOM.ORG web tools at https://www.random.org/.',
    prefix: 'RND',
  },
];

export const cases: Case[] = [
  /* ---- Number Generators ------------------------------------------------- */
  {
    id: '3f9a1c7e20',
    displayId: 'RND-0001',
    suite: 'generators',
    title: 'Integer Generator returns the requested count within an inclusive range',
    status: 'active',
    tags: ['Generators', 'Smoke', 'Regression'],
    objective:
      'Verify the [Integer Generator](https://www.random.org/integers/) returns exactly the requested quantity of integers, each within the inclusive range you specify, drawn from atmospheric noise (true random) rather than a software PRNG.',
    systems: ['Integer Generator (random.org/integers)', 'Atmospheric-noise RNG backend', 'Bit quota service'],
    setup: [
      {
        name: 'Browser session',
        body: 'A modern desktop browser with JavaScript enabled, pointed at https://www.random.org/.\nThe page must load over **HTTPS** — confirm the padlock before continuing.',
      },
      {
        name: 'Positive quota',
        body: 'Open the [quota page](https://www.random.org/quota/) and confirm the **bit balance** for your IP is positive.\nIf it is at or below zero, wait for the daily top-up before running this case.',
      },
      {
        name: 'Form parameters',
        body: 'Use these values on the generator form:\n- Generate: **20** numbers\n- Range: from **1** to **100** (both inclusive)\n- Format: **5** columns, base **10**',
      },
    ],
    steps: [
      { text: 'Open https://www.random.org/integers/.', depth: 0 },
      { text: 'Fill in the generator form.', depth: 0 },
      { text: 'Set "Generate" to 20 numbers.', depth: 1 },
      { text: 'Set the range to 1 (min) and 100 (max).', depth: 1 },
      { text: 'Leave the base as 10 and the columns as 5.', depth: 1 },
      { text: 'Press "Get Numbers".', depth: 0 },
      { text: 'Read the generated result set and the generation note below it.', depth: 0 },
    ],
    expected: [
      'Exactly 20 integers are returned.',
      'Every value is between 1 and 100 inclusive; duplicates are allowed.',
      'The result states the numbers came from atmospheric noise, with a generation timestamp.',
      'The quota page shows a reduced bit balance after the request.',
    ],
    modified: false,
  },
  {
    id: 'b8d4e6017a',
    displayId: 'RND-0002',
    suite: 'generators',
    title: 'Sequence Generator returns a complete permutation with no repeats',
    status: 'active',
    tags: ['Generators', 'Regression'],
    objective:
      'Verify the [Sequence Generator](https://www.random.org/sequences/) returns every integer in the requested range exactly once, in a randomized order — a true shuffle, not a sample with replacement.',
    systems: ['Sequence Generator (random.org/sequences)', 'Atmospheric-noise RNG backend'],
    setup: [
      {
        name: 'Browser session',
        body: 'A modern desktop browser on https://www.random.org/, loaded over **HTTPS**.',
      },
      {
        name: 'Sequence range',
        body: 'Randomize the range **1** to **50**, smallest value first.\nThe generator returns all 50 values, each appearing exactly once.',
      },
    ],
    steps: [
      { text: 'Open https://www.random.org/sequences/.', depth: 0 },
      { text: 'Enter the range to permute.', depth: 0 },
      { text: 'Set "smallest value" to 1.', depth: 1 },
      { text: 'Set "largest value" to 50.', depth: 1 },
      { text: 'Press "Get Sequence".', depth: 0 },
      { text: 'Copy the returned sequence, then run it once more to compare ordering.', depth: 0 },
    ],
    expected: [
      'The sequence contains exactly 50 entries.',
      'Each integer from 1 to 50 appears exactly once — none missing, none repeated.',
      'A second run returns the same set in a different order.',
    ],
    modified: false,
  },

  /* ---- Number Generators › Quota and Limits ------------------------------ */
  {
    id: 'd7c3e159b0',
    displayId: 'RND-0020',
    suite: 'quota',
    title: 'Daily bit quota depletes and blocks further true-random requests',
    status: 'active',
    tags: ['Quota', 'Limits', 'Regression'],
    objective:
      'Verify that once an IP exhausts its free daily bit quota on {{today}}, RANDOM.ORG stops serving true-random requests until the quota replenishes after the next midnight UTC top-up ({{today+1}}). Demonstrates the {{today}} date variable.',
    systems: ['Bit quota service (random.org/quota)', 'Integer Generator (random.org/integers)', 'Atmospheric-noise RNG backend'],
    setup: [
      {
        name: 'Browser session',
        body: 'A desktop browser on https://www.random.org/ over **HTTPS**, using a single IP address for the whole run (no VPN switching, which would change the per-IP budget).',
      },
      {
        name: 'Starting quota',
        body: 'On {{today}}, open the [quota page](https://www.random.org/quota/) and record the starting bit balance.\nThe free daily allowance is **1,000,000 bits**, topped up once per day.',
      },
      {
        name: 'Depletion method',
        body: 'Drain the quota with large Integer Generator requests:\n- Generate **10,000** numbers per request\n- Refresh the quota page between requests\n- Repeat until the balance is at or below **0**',
      },
    ],
    steps: [
      { text: 'On {{today}}, record the starting balance from the quota page.', depth: 0 },
      { text: 'Exhaust the daily quota.', depth: 0 },
      { text: 'Request 10,000 integers from the Integer Generator.', depth: 1 },
      { text: 'Refresh the quota page and note the reduced balance.', depth: 1 },
      { text: 'Repeat until the balance reaches 0 or goes negative.', depth: 1 },
      { text: 'Attempt one more true-random request once the quota is exhausted.', depth: 0 },
      { text: 'Re-check the quota page after the next daily top-up on {{today+1}}.', depth: 0 },
    ],
    expected: [
      'The bit balance decreases with every request.',
      'Once the balance is exhausted, further true-random requests are refused (or queued) with a quota message.',
      'The balance is replenished after the daily top-up on {{today+1}}, and requests succeed again.',
    ],
    modified: false,
  },

  /* ---- Games and Randomizers --------------------------------------------- */
  {
    id: 'c217ab9043',
    displayId: 'RND-0010',
    suite: 'games',
    title: 'Dice Roller rolls the requested dice and reports a valid face for each',
    status: 'active',
    tags: ['Games', 'Smoke'],
    objective:
      'Verify the [Dice Roller](https://www.random.org/dice/) rolls the requested number of standard six-sided dice and reports a face value of 1–6 for every die.',
    systems: ['Dice Roller (random.org/dice)', 'Atmospheric-noise RNG backend'],
    setup: [
      {
        name: 'Browser session',
        body: 'A desktop browser on https://www.random.org/ over **HTTPS**.',
      },
      {
        name: 'Roll configuration',
        body: 'Roll **5** dice, each with **6** sides (standard d6).\nThe roller animates the dice, then settles each on a final face.',
      },
    ],
    steps: [
      { text: 'Open https://www.random.org/dice/.', depth: 0 },
      { text: 'Choose the dice to roll.', depth: 0 },
      { text: 'Set the number of dice to 5.', depth: 1 },
      { text: 'Confirm each die has 6 sides.', depth: 1 },
      { text: 'Press "Roll the Dice!".', depth: 0 },
      { text: 'Wait for the animation to settle on a final result.', depth: 0 },
    ],
    expected: [
      'Five dice are shown.',
      'Each die reports an integer face value from 1 to 6.',
      'The pips drawn on each die match its reported numeric value.',
    ],
    modified: false,
  },
  {
    id: '5e0fa3c8d1',
    displayId: 'RND-0011',
    suite: 'games',
    title: 'Playing Card Shuffler deals a hand with no duplicate cards',
    status: 'active',
    tags: ['Games', 'Regression'],
    objective:
      'Verify the [Playing Card Shuffler](https://www.random.org/playing-cards/) shuffles a single standard 52-card deck and deals the requested hand with no duplicate cards.',
    systems: ['Playing Card Shuffler (random.org/playing-cards)', 'Atmospheric-noise RNG backend'],
    setup: [
      {
        name: 'Browser session',
        body: 'A desktop browser on https://www.random.org/ over **HTTPS**.',
      },
      {
        name: 'Deck and hand',
        body: 'Shuffle **one** standard 52-card deck (no jokers).\nDeal a hand of **10** cards from the top of the shuffled deck.',
      },
    ],
    steps: [
      { text: 'Open https://www.random.org/playing-cards/.', depth: 0 },
      { text: 'Configure the shuffle.', depth: 0 },
      { text: 'Set the number of decks to 1.', depth: 1 },
      { text: 'Exclude jokers.', depth: 1 },
      { text: 'Set the number of cards to deal to 10.', depth: 1 },
      { text: 'Shuffle the deck, then deal the hand.', depth: 0 },
      { text: 'Record the dealt cards for inspection.', depth: 0 },
    ],
    expected: [
      'Exactly 10 cards are dealt.',
      'No card appears more than once in the hand.',
      'Every dealt card is a valid rank and suit from a standard deck.',
    ],
    modified: false,
  },
  {
    id: '9012bd4fae',
    displayId: 'RND-0012',
    suite: 'games',
    title: 'List Randomizer shuffles a pasted list and preserves every item',
    status: 'draft',
    tags: ['Games', 'Randomizers'],
    objective:
      'Verify the [List Randomizer](https://www.random.org/lists/) returns the same set of items in a randomized order, dropping or duplicating none.',
    systems: ['List Randomizer (random.org/lists)', 'Atmospheric-noise RNG backend'],
    setup: [
      {
        name: 'Browser session',
        body: 'A desktop browser on https://www.random.org/ over **HTTPS**.',
      },
      {
        name: 'Input list',
        body: 'Paste exactly these six names, one per line, into the list box:\n- Alice\n- Bao\n- Chidi\n- Dmitri\n- Esi\n- Farah',
      },
    ],
    steps: [
      { text: 'Open https://www.random.org/lists/.', depth: 0 },
      { text: 'Paste the six names, one per line, into the list box.', depth: 0 },
      { text: 'Press "Randomize List".', depth: 0 },
      { text: 'Compare the output list against the input.', depth: 0 },
    ],
    expected: [
      'All six names appear in the output.',
      'No name is dropped and none is duplicated.',
      'The output order differs from the pasted order.',
    ],
    modified: false,
  },
];

/** Per-workspace suite/case subtree, keyed by workspace id (materialized under each workspace path). */
export const trees: Record<string, TreeNode[]> = {
  webtools: [
    {
      type: 'suite',
      id: 'generators',
      name: 'Number Generators',
      path: 'Number-Generators',
      children: [
        { type: 'case', id: '3f9a1c7e20' },
        { type: 'case', id: 'b8d4e6017a' },
        {
          type: 'suite',
          id: 'quota',
          name: 'Quota and Limits',
          path: 'Number-Generators/Quota-and-Limits',
          // A suite-level prefix override + description → this suite gets a folder note,
          // and new cases under it are numbered QTA-NNNN (inheritance demo).
          prefix: 'QTA',
          description: 'Per-IP bit-quota limits and daily replenishment behavior.',
          children: [{ type: 'case', id: 'd7c3e159b0' }],
        },
      ],
    },
    {
      // A multi-word display name → the folder is the wiki-safe slug `Games-and-Randomizers`,
      // with a folder note recording the friendly "Games and Randomizers" display name.
      type: 'suite',
      id: 'games',
      name: 'Games and Randomizers',
      path: 'Games-and-Randomizers',
      children: [
        { type: 'case', id: 'c217ab9043' },
        { type: 'case', id: '5e0fa3c8d1' },
        { type: 'case', id: '9012bd4fae' },
      ],
    },
  ],
};

/** A run row before the run-folder fields (checks/file) are filled in below. */
type SeedRow = Pick<RunRow, 'case_id' | 'display_id' | 'title' | 'result' | 'tester' | 'executed_at' | 'notes'>;

/** Build a sample `Run` (folder model): seed rows get empty checks + a sidecar path. */
function sampleRun(
  meta: { id: string; name: string; created: string; status: 'open' | 'closed'; scope: string },
  seedRows: SeedRow[],
): Run {
  const file = `.casewright/runs/${meta.id}`;
  return {
    id: file,
    file,
    name: meta.name,
    created: meta.created,
    status: meta.status,
    scope: meta.scope,
    summary: '',
    notes: '',
    testerApproval: null,
    reviewerApproval: null,
    rows: seedRows.map((r, i) => ({
      ...r,
      checks: {},
      failNotes: {},
      itemText: {},
      file: `${file}/${runCaseFileName(i, r)}`,
    })),
  };
}

export const runs: Run[] = [
  sampleRun(
    { id: '2026-06-12-smoke', name: 'Smoke — web tools', created: '2026-06-12', status: 'open', scope: 'tag: Smoke' },
    [
      { case_id: '3f9a1c7e20', display_id: 'RND-0001', title: 'Integer Generator returns the requested count within an inclusive range', result: 'pass', tester: 'amartin', executed_at: '2026-06-12 09:08', notes: '' },
      { case_id: 'c217ab9043', display_id: 'RND-0010', title: 'Dice Roller rolls the requested dice and reports a valid face for each', result: 'pass', tester: 'amartin', executed_at: '2026-06-12 09:21', notes: '' },
      { case_id: '5e0fa3c8d1', display_id: 'RND-0011', title: 'Playing Card Shuffler deals a hand with no duplicate cards', result: 'not_run', tester: '', executed_at: '', notes: '' },
    ],
  ),
  sampleRun(
    { id: '2026-06-10-regression', name: 'Regression — randomness suite', created: '2026-06-10', status: 'open', scope: 'tag: Regression' },
    [
      { case_id: '3f9a1c7e20', display_id: 'RND-0001', title: 'Integer Generator returns the requested count within an inclusive range', result: 'pass', tester: 'amartin', executed_at: '2026-06-10 14:02', notes: '' },
      { case_id: 'b8d4e6017a', display_id: 'RND-0002', title: 'Sequence Generator returns a complete permutation with no repeats', result: 'fail', tester: 'jpatel', executed_at: '2026-06-10 14:19', notes: 'BUG-118 — value 37 missing from the returned sequence on one run' },
      { case_id: '5e0fa3c8d1', display_id: 'RND-0011', title: 'Playing Card Shuffler deals a hand with no duplicate cards', result: 'blocked', tester: 'jpatel', executed_at: '2026-06-10 14:33', notes: 'card shuffler page returned 503' },
      { case_id: 'd7c3e159b0', display_id: 'RND-0020', title: 'Daily bit quota depletes and blocks further true-random requests', result: 'not_run', tester: '', executed_at: '', notes: '' },
    ],
  ),
  sampleRun(
    { id: '2026-05-28-smoke', name: 'Smoke — pre-release', created: '2026-05-28', status: 'closed', scope: 'tag: Smoke' },
    [
      { case_id: '3f9a1c7e20', display_id: 'RND-0001', title: 'Integer Generator returns the requested count within an inclusive range', result: 'pass', tester: 'okeefe', executed_at: '2026-05-28 16:40', notes: '' },
      { case_id: 'c217ab9043', display_id: 'RND-0010', title: 'Dice Roller rolls the requested dice and reports a valid face for each', result: 'pass', tester: 'okeefe', executed_at: '2026-05-28 16:52', notes: '' },
    ],
  ),
];

// ============================================================
// Conflict scenario — produced by a Pull. Mix of auto-merged
// elements (one-sided) and true conflicts (changed on both sides).
// Drives the structured merge resolver.
// ============================================================
export const conflict: Conflict = {
  branch: 'main',
  behind: 3,
  ahead: 1,
  files: [
    {
      kind: 'case',
      path: 'areas/web-tools/Number-Generators/integer-generator-returns-the-requested-count.md',
      displayId: 'RND-0001',
      caseId: '3f9a1c7e20',
      title: 'Integer Generator returns the requested count within an inclusive range',
      elements: [
        {
          key: 'title',
          label: 'Title',
          kind: 'field',
          base: 'Integer Generator returns the requested count within an inclusive range',
          ours: 'Integer Generator returns the requested count within an inclusive range',
          theirs: 'Integer Generator returns the requested quantity within an inclusive range',
          auto: 'theirs',
          reason: 'Changed only on incoming (theirs).',
        },
        { key: 'status', label: 'Status', kind: 'field', base: 'active', ours: 'active', theirs: 'active', auto: 'same' },
        {
          key: 'tags',
          label: 'Tags',
          kind: 'tags',
          base: ['Generators', 'Smoke', 'Regression'],
          ours: ['Generators', 'Smoke', 'Regression', 'P1'],
          theirs: ['Generators', 'Smoke', 'Regression', 'Atmospheric'],
          auto: 'merge',
          merged: ['Generators', 'Smoke', 'Regression', 'P1', 'Atmospheric'],
          reason: 'Set merge: both additions kept (P1 + Atmospheric).',
        },
        {
          key: 'objective',
          label: 'Objective',
          kind: 'prose',
          conflict: true,
          base: 'Verify the Integer Generator returns exactly the requested quantity of integers, each within the inclusive range you specify, drawn from atmospheric noise (true random) rather than a software PRNG.',
          ours: 'Verify the Integer Generator returns exactly the requested quantity of integers, each within the inclusive range you specify, drawn from **atmospheric noise** (true random) rather than a software PRNG.',
          theirs: 'Verify the Integer Generator returns exactly the requested count of integers, each within the inclusive range, sourced from atmospheric noise rather than a pseudo-random generator.',
          reason: 'Changed on both sides — choose one or edit.',
        },
        {
          key: 'systems',
          label: 'Systems in Scope',
          kind: 'list',
          base: ['Integer Generator (random.org/integers)', 'Atmospheric-noise RNG backend'],
          ours: ['Integer Generator (random.org/integers)', 'Atmospheric-noise RNG backend'],
          theirs: ['Integer Generator (random.org/integers)', 'Atmospheric-noise RNG backend', 'Bit quota service'],
          auto: 'theirs',
          reason: 'Changed only on incoming (added Bit quota service).',
        },
        {
          key: 'steps',
          label: 'Steps',
          kind: 'steps',
          conflict: true,
          base: [
            { text: 'Open https://www.random.org/integers/.', depth: 0 },
            { text: 'Fill in the generator form.', depth: 0 },
            { text: 'Press "Get Numbers".', depth: 0 },
          ],
          ours: [
            { text: 'Open https://www.random.org/integers/.', depth: 0 },
            { text: 'Fill in the generator form.', depth: 0 },
            { text: 'Set "Generate" to 20 numbers.', depth: 1 },
            { text: 'Press "Get Numbers".', depth: 0 },
          ],
          theirs: [
            { text: 'Navigate to the Integer Generator.', depth: 0 },
            { text: 'Enter the count and range.', depth: 0 },
            { text: 'Submit the form to get numbers.', depth: 0 },
          ],
          reason: 'Changed on both sides — choose one or edit.',
        },
        {
          key: 'expected',
          label: 'Acceptance Criteria',
          kind: 'list',
          base: ['Exactly 20 integers are returned.', 'Every value is between 1 and 100 inclusive; duplicates are allowed.'],
          ours: ['Exactly 20 integers are returned.', 'Every value is between 1 and 100 inclusive; duplicates are allowed.'],
          theirs: ['Exactly 20 integers are returned.', 'Every value is between 1 and 100 inclusive; duplicates are allowed.'],
          auto: 'same',
        },
      ],
    },
    {
      kind: 'case',
      path: 'areas/web-tools/Number-Generators/sequence-generator-no-repeats.md',
      displayId: 'RND-0002',
      caseId: 'b8d4e6017a',
      title: 'Sequence Generator returns a complete permutation with no repeats',
      elements: [
        { key: 'title', label: 'Title', kind: 'field', base: 'Sequence Generator returns a complete permutation with no repeats', ours: 'Sequence Generator returns a complete permutation with no repeats', theirs: 'Sequence Generator returns a complete permutation with no repeats', auto: 'same' },
        { key: 'displayId', label: 'Display ID', kind: 'field', base: 'RND-0002', ours: 'RND-0002', theirs: 'RND-0002', auto: 'same' },
        { key: 'status', label: 'Status', kind: 'field', base: 'draft', ours: 'active', theirs: 'draft', auto: 'ours', reason: 'Changed only locally (ours) to active.' },
        {
          key: 'expected',
          label: 'Acceptance Criteria',
          kind: 'list',
          conflict: true,
          base: ['The sequence contains exactly 50 entries.', 'Each integer from 1 to 50 appears exactly once.', 'A second run returns a different order.'],
          ours: ['The sequence contains exactly 50 entries.', 'Each integer from 1 to 50 appears exactly once — none missing, none repeated.', 'A second run returns a different order.'],
          theirs: ['The sequence contains exactly 50 entries.', 'Each integer from 1 to 50 appears exactly once.', 'A second run returns the same set in a different order.', 'The page notes the result is true random.'],
          reason: 'Changed on both sides — choose one or edit.',
        },
      ],
    },
    {
      kind: 'run',
      path: '.casewright/runs/2026-06-10-regression.csv',
      title: 'Regression — randomness suite',
      rows: [
        { case_id: '3f9a1c7e20', display_id: 'RND-0001', auto: 'same', value: { result: 'pass', tester: 'amartin', notes: '' } },
        { case_id: 'c217ab9043', display_id: 'RND-0010', auto: 'theirs', reason: 'Result recorded only on incoming.', value: { result: 'pass', tester: 'okeefe', notes: '' } },
        {
          case_id: 'b8d4e6017a',
          display_id: 'RND-0002',
          conflict: true,
          base: { result: 'not_run', tester: '', notes: '' },
          ours: { result: 'fail', tester: 'jpatel', notes: 'BUG-118 — value 37 missing from the returned sequence on one run' },
          theirs: { result: 'blocked', tester: 'okeefe', notes: 'sequences page timed out' },
          reason: 'Result recorded differently on both sides.',
        },
      ],
    },
  ],
};
