export type Status = 'active' | 'draft' | 'deprecated';
export type Result = 'pass' | 'fail' | 'blocked' | 'in_progress' | 'skipped' | 'not_run';

export interface Step {
  text: string;
  depth: number;
}

export interface CaseItem {
  id: string;
  displayId: string;
  title: string;
  status: Status;
  tags: string[];
  suite: string;
  objective: string;
  systems: string[];
  setup: { name: string; body: string }[];
  steps: Step[];
  expected: string[];
  path: string;
}

export interface Suite {
  id: string;
  name: string;
  desc: string;
  prefix: string;
  caseIds: string[];
}

export interface RunRow {
  caseId: string;
  displayId: string;
  title: string;
  result: Result;
  tester: string;
  at: string;
  notes: string;
}

export interface Run {
  id: string;
  name: string;
  created: string;
  status: 'open' | 'closed';
  scope: string;
  rows: RunRow[];
}

export const RESULT_META: Record<Result, { label: string; color: string; soft: string }> = {
  pass: { label: 'Pass', color: 'var(--pass)', soft: 'var(--pass-soft)' },
  fail: { label: 'Fail', color: 'var(--fail)', soft: 'var(--fail-soft)' },
  blocked: { label: 'Blocked', color: 'var(--warn)', soft: 'var(--warn-soft)' },
  in_progress: { label: 'In progress', color: 'var(--prog)', soft: 'var(--prog-soft)' },
  skipped: { label: 'Skipped', color: 'var(--skip)', soft: 'var(--skip-soft)' },
  not_run: { label: 'Not run', color: 'var(--faint)', soft: 'var(--well)' },
};

export const suites: Suite[] = [
  {
    id: 'generators',
    name: 'Number Generators',
    desc: 'Integer and sequence generators backed by atmospheric noise.',
    prefix: 'RND',
    caseIds: ['c1', 'c2'],
  },
  {
    id: 'quota',
    name: 'Quota and Limits',
    desc: 'Per-IP bit-quota limits and daily replenishment behavior.',
    prefix: 'QTA',
    caseIds: ['c3'],
  },
  {
    id: 'games',
    name: 'Games and Randomizers',
    desc: 'Dice, cards and list shuffling for end-user play.',
    prefix: 'RND',
    caseIds: ['c4', 'c5', 'c6'],
  },
];

export const cases: CaseItem[] = [
  {
    id: 'c1',
    displayId: 'RND-0001',
    title: 'Integer Generator returns the requested count within an inclusive range',
    status: 'active',
    tags: ['Generators', 'Smoke', 'Regression'],
    suite: 'generators',
    objective:
      'Verify the Integer Generator returns exactly the requested quantity of integers, each within the inclusive range you specify, drawn from atmospheric noise (true random) rather than a software PRNG.',
    systems: ['Integer Generator', 'Atmospheric-noise backend', 'Bit quota service'],
    setup: [
      { name: 'Browser session', body: 'A modern desktop browser with JavaScript enabled, pointed at random.org over HTTPS.' },
      { name: 'Positive quota', body: 'Open the quota page and confirm the bit balance for your IP is positive.' },
      { name: 'Form parameters', body: 'Generate 20 numbers, range 1–100 inclusive, 5 columns, base 10.' },
    ],
    steps: [
      { text: 'Open the Integer Generator page.', depth: 0 },
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
    path: 'areas/web-tools/Number-Generators/integer-generator.md',
  },
  {
    id: 'c2',
    displayId: 'RND-0002',
    title: 'Sequence Generator returns a complete permutation with no repeats',
    status: 'active',
    tags: ['Generators', 'Regression'],
    suite: 'generators',
    objective:
      'Verify the Sequence Generator returns every integer in the requested range exactly once, in a randomized order — a true shuffle, not a sample with replacement.',
    systems: ['Sequence Generator', 'Atmospheric-noise backend'],
    setup: [
      { name: 'Browser session', body: 'A modern desktop browser on random.org, loaded over HTTPS.' },
      { name: 'Sequence range', body: 'Randomize the range 1 to 50, smallest value first.' },
    ],
    steps: [
      { text: 'Open the Sequence Generator page.', depth: 0 },
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
    path: 'areas/web-tools/Number-Generators/sequence-generator.md',
  },
  {
    id: 'c3',
    displayId: 'QTA-0020',
    title: 'Daily bit quota depletes and blocks further true-random requests',
    status: 'active',
    tags: ['Quota', 'Limits', 'Regression'],
    suite: 'quota',
    objective:
      'Verify that once an IP exhausts its free daily bit quota, the service stops serving true-random requests until the quota replenishes after the next midnight UTC top-up.',
    systems: ['Bit quota service', 'Integer Generator', 'Atmospheric-noise backend'],
    setup: [
      { name: 'Browser session', body: 'A desktop browser over HTTPS, single IP for the whole run (no VPN switching).' },
      { name: 'Starting quota', body: 'Record the starting bit balance. Free daily allowance is 1,000,000 bits.' },
      { name: 'Depletion method', body: 'Drain the quota with large requests — 10,000 numbers per request.' },
    ],
    steps: [
      { text: 'Record the starting balance from the quota page.', depth: 0 },
      { text: 'Exhaust the daily quota.', depth: 0 },
      { text: 'Request 10,000 integers from the Integer Generator.', depth: 1 },
      { text: 'Refresh the quota page and note the reduced balance.', depth: 1 },
      { text: 'Repeat until the balance reaches 0 or goes negative.', depth: 1 },
      { text: 'Attempt one more true-random request once the quota is exhausted.', depth: 0 },
      { text: 'Re-check the quota page after the next daily top-up.', depth: 0 },
    ],
    expected: [
      'The bit balance decreases with every request.',
      'Once exhausted, further true-random requests are refused with a quota message.',
      'The balance is replenished after the daily top-up, and requests succeed again.',
    ],
    path: 'areas/web-tools/Number-Generators/Quota-and-Limits/bit-quota.md',
  },
  {
    id: 'c4',
    displayId: 'RND-0010',
    title: 'Dice Roller rolls the requested dice and reports a valid face for each',
    status: 'active',
    tags: ['Games', 'Smoke'],
    suite: 'games',
    objective:
      'Verify the Dice Roller rolls the requested number of standard six-sided dice and reports a face value of 1–6 for every die.',
    systems: ['Dice Roller', 'Atmospheric-noise backend'],
    setup: [
      { name: 'Browser session', body: 'A desktop browser on random.org over HTTPS.' },
      { name: 'Roll configuration', body: 'Roll 5 dice, each with 6 sides (standard d6).' },
    ],
    steps: [
      { text: 'Open the Dice Roller page.', depth: 0 },
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
    path: 'areas/web-tools/Games-and-Randomizers/dice-roller.md',
  },
  {
    id: 'c5',
    displayId: 'RND-0011',
    title: 'Playing Card Shuffler deals a hand with no duplicate cards',
    status: 'active',
    tags: ['Games', 'Regression'],
    suite: 'games',
    objective:
      'Verify the Playing Card Shuffler shuffles a single standard 52-card deck and deals the requested hand with no duplicate cards.',
    systems: ['Playing Card Shuffler', 'Atmospheric-noise backend'],
    setup: [
      { name: 'Browser session', body: 'A desktop browser on random.org over HTTPS.' },
      { name: 'Deck and hand', body: 'Shuffle one standard 52-card deck (no jokers). Deal a hand of 10 cards.' },
    ],
    steps: [
      { text: 'Open the Playing Card Shuffler page.', depth: 0 },
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
    path: 'areas/web-tools/Games-and-Randomizers/card-shuffler.md',
  },
  {
    id: 'c6',
    displayId: 'RND-0012',
    title: 'List Randomizer shuffles a pasted list and preserves every item',
    status: 'draft',
    tags: ['Games', 'Randomizers'],
    suite: 'games',
    objective:
      'Verify the List Randomizer returns the same set of items in a randomized order, dropping or duplicating none.',
    systems: ['List Randomizer', 'Atmospheric-noise backend'],
    setup: [
      { name: 'Browser session', body: 'A desktop browser on random.org over HTTPS.' },
      { name: 'Input list', body: 'Paste six names, one per line: Alice, Bao, Chidi, Dmitri, Esi, Farah.' },
    ],
    steps: [
      { text: 'Open the List Randomizer page.', depth: 0 },
      { text: 'Paste the six names, one per line, into the list box.', depth: 0 },
      { text: 'Press "Randomize List".', depth: 0 },
      { text: 'Compare the output list against the input.', depth: 0 },
    ],
    expected: [
      'All six names appear in the output.',
      'No name is dropped and none is duplicated.',
      'The output order differs from the pasted order.',
    ],
    path: 'areas/web-tools/Games-and-Randomizers/list-randomizer.md',
  },
];

export const initialRuns: Run[] = [
  {
    id: 'run1',
    name: 'Smoke — web tools',
    created: '2026-06-12',
    status: 'open',
    scope: 'tag: Smoke',
    rows: [
      { caseId: 'c1', displayId: 'RND-0001', title: 'Integer Generator returns the requested count within an inclusive range', result: 'pass', tester: 'amartin', at: '2026-06-12 09:08', notes: '' },
      { caseId: 'c4', displayId: 'RND-0010', title: 'Dice Roller rolls the requested dice and reports a valid face for each', result: 'pass', tester: 'amartin', at: '2026-06-12 09:21', notes: '' },
      { caseId: 'c5', displayId: 'RND-0011', title: 'Playing Card Shuffler deals a hand with no duplicate cards', result: 'not_run', tester: '', at: '', notes: '' },
    ],
  },
  {
    id: 'run2',
    name: 'Regression — randomness suite',
    created: '2026-06-10',
    status: 'open',
    scope: 'tag: Regression',
    rows: [
      { caseId: 'c1', displayId: 'RND-0001', title: 'Integer Generator returns the requested count within an inclusive range', result: 'pass', tester: 'amartin', at: '2026-06-10 14:02', notes: '' },
      { caseId: 'c2', displayId: 'RND-0002', title: 'Sequence Generator returns a complete permutation with no repeats', result: 'fail', tester: 'jpatel', at: '2026-06-10 14:19', notes: 'Value 37 missing from the returned sequence on one run.' },
      { caseId: 'c5', displayId: 'RND-0011', title: 'Playing Card Shuffler deals a hand with no duplicate cards', result: 'blocked', tester: 'jpatel', at: '2026-06-10 14:33', notes: 'Card shuffler page returned 503.' },
      { caseId: 'c3', displayId: 'QTA-0020', title: 'Daily bit quota depletes and blocks further true-random requests', result: 'not_run', tester: '', at: '', notes: '' },
    ],
  },
  {
    id: 'run3',
    name: 'Smoke — pre-release',
    created: '2026-05-28',
    status: 'closed',
    scope: 'tag: Smoke',
    rows: [
      { caseId: 'c1', displayId: 'RND-0001', title: 'Integer Generator returns the requested count within an inclusive range', result: 'pass', tester: 'okeefe', at: '2026-05-28 16:40', notes: '' },
      { caseId: 'c4', displayId: 'RND-0010', title: 'Dice Roller rolls the requested dice and reports a valid face for each', result: 'pass', tester: 'okeefe', at: '2026-05-28 16:52', notes: '' },
    ],
  },
];

export const gitFiles = [
  { flag: 'M', path: 'areas/web-tools/Number-Generators/integer-generator.md' },
  { flag: 'M', path: 'areas/web-tools/Games-and-Randomizers/dice-roller.md' },
  { flag: 'A', path: 'areas/web-tools/Games-and-Randomizers/list-randomizer.md' },
  { flag: 'M', path: '.ch/runs/2026-06-10-regression.md' },
];

export const allTags = ['Generators', 'Smoke', 'Regression', 'Games', 'Quota', 'Limits', 'Randomizers'];
