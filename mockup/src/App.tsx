import { useMemo, useState } from 'react';
import { RESULT_META, allTags, cases, gitFiles, initialRuns, suites, type CaseItem, type Result, type Run, type Status } from './data';
import { I } from './icons';

type MainView = 'welcome' | 'case' | 'suite' | 'runs' | 'run' | 'guide' | 'source';

const STATUS_DOT: Record<Status, string> = {
  active: 'var(--pass)',
  draft: 'var(--warn)',
  deprecated: 'var(--faint)',
};

const SEED = [3, 0, 1, 5, 2, 0, 7, 4, 1, 9, 6, 2, 0, 3, 8, 5, 1, 0, 4, 6, 2, 10, 7, 3, 0, 1, 5, 2, 8, 4, 0, 6, 3, 1, 9, 5, 2, 0, 4, 7, 3, 1, 6, 0, 2, 8, 4, 5, 1, 3, 0, 7, 2, 9, 4, 1, 6, 0, 3, 5, 2, 8, 4, 0, 6, 1, 7, 3, 5, 2, 0, 4, 9, 1, 6, 3, 0, 5, 2, 7, 4, 1, 8, 3, 0, 6, 2, 5, 4, 1, 0, 7, 3, 9, 2, 5, 1, 4, 6, 0, 3, 8, 2, 5, 1, 7, 4, 0, 3, 6, 2, 9, 5, 1, 4, 0, 7, 3, 2, 6, 8, 1, 5, 0, 4, 3, 7, 2, 6, 1];

function heatColor(v: number): string {
  if (v === 0) return 'var(--well)';
  if (v <= 2) return 'color-mix(in srgb, var(--acc) 25%, var(--well))';
  if (v <= 5) return 'color-mix(in srgb, var(--acc) 55%, var(--well))';
  return 'var(--acc)';
}

function stepNums(steps: { depth: number }[]): string[] {
  const counters: number[] = [];
  return steps.map((s) => {
    counters.length = s.depth + 1;
    counters[s.depth] = (counters[s.depth] ?? 0) + 1;
    for (let i = s.depth + 1; i < counters.length; i++) counters[i] = 0;
    return counters.slice(0, s.depth + 1).join('.');
  });
}

function tally(rows: { result: Result }[]) {
  const t: Record<Result, number> = { pass: 0, fail: 0, blocked: 0, in_progress: 0, skipped: 0, not_run: 0 };
  rows.forEach((r) => (t[r.result] += 1));
  return t;
}

let toastId = 0;

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const initView = params.get('view') as MainView | null;
  const validViews: MainView[] = ['welcome', 'case', 'suite', 'runs', 'run', 'guide', 'source'];
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [view, setView] = useState<MainView>(initView && validViews.includes(initView) ? initView : 'welcome');
  const [caseId, setCaseId] = useState('c1');
  const [suiteId, setSuiteId] = useState('games');
  const [runId, setRunId] = useState('run2');
  const [guideIdx, setGuideIdx] = useState(0);
  const [query, setQuery] = useState('');
  const [statusF, setStatusF] = useState<Status | null>(null);
  const [tagF, setTagF] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [palette, setPalette] = useState(params.get('palette') === '1');
  const [palQ, setPalQ] = useState('');
  const [commitOpen, setCommitOpen] = useState(params.get('commit') === '1');
  const [mergeOpen, setMergeOpen] = useState(params.get('merge') === '1');
  const [newRunOpen, setNewRunOpen] = useState(params.get('newrun') === '1');
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [checks, setChecks] = useState<Record<string, 'pass' | 'fail'>>({});
  const [recResult, setRecResult] = useState<Result | null>(null);
  const [tester, setTester] = useState('amartin');
  const [notes, setNotes] = useState('');
  const [mergePick, setMergePick] = useState<Record<string, 'ours' | 'theirs'>>({});
  const [committed, setCommitted] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toast = (msg: string) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  };

  const kase: CaseItem = cases.find((c) => c.id === caseId) ?? cases[0];
  const run: Run = runs.find((r) => r.id === runId) ?? runs[0];
  const suite = suites.find((s) => s.id === suiteId) ?? suites[0];

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return cases.filter((c) => {
      if (statusF && c.status !== statusF) return false;
      if (tagF && !c.tags.includes(tagF)) return false;
      if (!q) return true;
      return (c.title + ' ' + c.displayId + ' ' + c.objective + ' ' + c.tags.join(' ')).toLowerCase().includes(q);
    });
  }, [query, statusF, tagF]);

  const openCase = (id: string) => {
    setCaseId(id);
    setChecks({});
    setRecResult(null);
    setView('case');
  };

  const goGuide = (rid: string, idx: number) => {
    setRunId(rid);
    setGuideIdx(idx);
    setChecks({});
    setRecResult(null);
    setNotes('');
    setView('guide');
  };

  const recordResult = () => {
    if (!recResult) return;
    setRuns((rs) =>
      rs.map((r) => {
        if (r.id !== run.id) return r;
        const rows = r.rows.map((row, i) => (i === guideIdx ? { ...row, result: recResult, tester, notes } : row));
        return { ...r, rows };
      }),
    );
    toast(`${run.rows[guideIdx].displayId} recorded · ${RESULT_META[recResult].label}`);
    const next = run.rows.findIndex((r, i) => i > guideIdx && r.result === 'not_run');
    if (next !== -1) {
      setGuideIdx(next);
      setChecks({});
      setRecResult(null);
      setNotes('');
    } else {
      setView('run');
    }
  };

  const guideRow = run.rows[guideIdx];
  const guideCase = cases.find((c) => c.id === guideRow?.caseId);
  const guideItems = useMemo(() => {
    if (!guideCase) return [];
    const items: { key: string; kind: string; text: string; num?: string }[] = [];
    guideCase.setup.forEach((s, i) => items.push({ key: `setup-${i}`, kind: 'Setup', text: `${s.name} — ${s.body}` }));
    const nums = stepNums(guideCase.steps);
    guideCase.steps.forEach((s, i) =>
      items.push({ key: `step-${i}`, kind: 'Step', text: s.text, num: nums[i] }),
    );
    guideCase.expected.forEach((e, i) => items.push({ key: `exp-${i}`, kind: 'Accept', text: e }));
    return items;
  }, [guideCase]);
  const checkedCount = guideItems.filter((it) => checks[it.key]).length;
  const allPassed = guideItems.length > 0 && guideItems.every((it) => checks[it.key] === 'pass');

  const runTally = tally(run.rows);
  const runTotal = run.rows.length || 1;

  const palActions = [
    { group: 'Go to', label: 'Welcome / repositories', hint: '⌘1', fn: () => setView('welcome') },
    { group: 'Go to', label: 'Open case editor', hint: '⌘2', fn: () => openCase(caseId) },
    { group: 'Go to', label: 'Test runs dashboard', hint: '⌘3', fn: () => setView('runs') },
    { group: 'Go to', label: 'Source control', hint: '⌘4', fn: () => setView('source') },
    { group: 'Cases', label: 'New case…', hint: 'C', fn: () => { setNewRunOpen(false); toast('New case created in Games and Randomizers'); } },
    { group: 'Cases', label: 'Duplicate current case', hint: '', fn: () => toast('Duplicated ' + kase.displayId) },
    { group: 'Runs', label: 'New run…', hint: 'R', fn: () => setNewRunOpen(true) },
    { group: 'Runs', label: 'Continue run in guide', hint: 'G', fn: () => goGuide(run.id, Math.max(0, run.rows.findIndex((r) => r.result === 'not_run'))) },
    { group: 'Runs', label: 'Export weekly report (PDF)', hint: '', fn: () => toast('Weekly report exported') },
    { group: 'Git', label: 'Commit changes…', hint: '⌘⏎', fn: () => setCommitOpen(true) },
    { group: 'Git', label: 'Pull from origin', hint: '', fn: () => toast('Already up to date') },
    { group: 'Git', label: 'Push 1 commit', hint: '', fn: () => toast('Pushed to origin/main') },
    { group: 'Git', label: 'Resolve merge conflicts…', hint: '', fn: () => setMergeOpen(true) },
    { group: 'View', label: 'Toggle theme', hint: '⌘T', fn: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) },
  ];
  const palFiltered = palActions.filter((a) => (a.label + a.group).toLowerCase().includes(palQ.toLowerCase()));

  return (
    <div className="app" data-theme={theme}>
      <div className="titlebar">
        <div className="traffic">
          <i style={{ background: '#e0685c' }} />
          <i style={{ background: '#e5b44a' }} />
          <i style={{ background: '#6fbf8b' }} />
        </div>
        <button className="cmdk" onClick={() => { setPalQ(''); setPalette(true); }}>
          {I.search(14)}
          <span>Search, run commands, jump anywhere…</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="tb-right">
          <button className="icon-btn" title="Toggle theme" onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
            {theme === 'light' ? I.moon() : I.sun()}
          </button>
          <button className="icon-btn" title="Command palette" onClick={() => { setPalQ(''); setPalette(true); }}>{I.cmd()}</button>
        </div>
      </div>

      {mergeOpen === false && run.id === 'run2' && view !== 'welcome' && (
        <div className="banner">
          {I.warn(14)}
          <span><b>Merge conflict</b> — pull from <span className="mono">origin/main</span> needs attention · 3 files, 4 conflicts</span>
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setMergeOpen(true)}>Resolve</button>
          <button className="btn sm ghost" onClick={() => toast('Merge aborted')}>Abort</button>
        </div>
      )}

      <div className="workbench">
        <nav className="rail">
          <button className={`rail-btn${view === 'welcome' ? ' on' : ''}`} title="Welcome" onClick={() => setView('welcome')}>{I.box(19)}</button>
          <button className={`rail-btn${view === 'case' || view === 'suite' ? ' on' : ''}`} title="Cases" onClick={() => openCase(caseId)}>{I.layers(19)}</button>
          <button className={`rail-btn${view === 'runs' || view === 'run' || view === 'guide' ? ' on' : ''}`} title="Runs" onClick={() => setView('runs')}>{I.play(18)}</button>
          <button className={`rail-btn${view === 'source' ? ' on' : ''}`} title="Source control" onClick={() => setView('source')}>
            {I.git(19)}
            <span className="rail-badge">4</span>
          </button>
          <div className="rail-foot">
            <button className="rail-btn" title="Settings" onClick={() => toast('Settings — concept only')}>{I.eye(18)}</button>
            <div className="avatar">AM</div>
          </div>
        </nav>

        {(view === 'case' || view === 'suite') && (
          <aside className="side">
            <div className="side-head">
              <span className="side-title">Explorer</span>
              <span className="sp" />
              <button className="icon-btn" style={{ width: 26, height: 26 }} title="New case" onClick={() => toast('New case created')}>{I.file(15)}</button>
              <button className="icon-btn" style={{ width: 26, height: 26 }} title="New suite" onClick={() => toast('New suite created')}>{I.folder(15)}</button>
            </div>
            <div className="search">
              {I.search(14)}
              <input placeholder="Search cases…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && <button onClick={() => setQuery('')} style={{ display: 'grid', placeItems: 'center', color: 'var(--faint)' }}>{I.x(12)}</button>}
            </div>
            <div className="chips">
              {(['active', 'draft', 'deprecated'] as Status[]).map((s) => (
                <button key={s} className={`chip${statusF === s ? ' on' : ''}`} onClick={() => setStatusF(statusF === s ? null : s)}>
                  <span className="dot" style={{ background: STATUS_DOT[s] }} />{s}
                </button>
              ))}
            </div>
            {allTags.length > 0 && (
              <div className="chips" style={{ paddingTop: 0 }}>
                {allTags.slice(0, 6).map((t) => (
                  <button key={t} className={`chip${tagF === t ? ' on' : ''}`} onClick={() => setTagF(tagF === t ? null : t)}>
                    <span className="mono">#</span>{t}
                  </button>
                ))}
              </div>
            )}
            <div className="side-scroll">
              <div className="tree-cap"><span>RANDOM.ORG Web Tools</span><span className="mono">RND</span></div>
              {suites.map((s) => {
                const vis = cases.filter((c) => c.suite === s.id && filtered.includes(c));
                if (vis.length === 0) return null;
                const open = !collapsed[s.id];
                const active = view === 'suite' && suiteId === s.id;
                return (
                  <div key={s.id}>
                    <button
                      className={`trow${active ? ' on' : ''}`}
                      onClick={() => { setSuiteId(s.id); setView('suite'); }}
                    >
                      <span className="tw" onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [s.id]: open })); }}>
                        {open ? I.chevD() : I.chevR()}
                      </span>
                      {I.folder(15)}
                      <span className="lbl suite-lbl">{s.name}</span>
                      <span className="cnt">{vis.length}</span>
                    </button>
                    {open && vis.map((c) => (
                      <button
                        key={c.id}
                        className={`trow${view === 'case' && caseId === c.id ? ' on' : ''}`}
                        style={{ paddingLeft: 30 }}
                        onClick={() => openCase(c.id)}
                      >
                        <span style={{ color: STATUS_DOT[c.status], display: 'grid', placeItems: 'center' }}>{I.dot(7)}</span>
                        {I.file(14)}
                        <span className="lbl">{c.title}</span>
                        <span className="id">{c.displayId}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="ungrouped">No cases match.<br />Adjust search or filters.</div>}
            </div>
            <div className="gitbox" style={{ margin: '0 12px 12px' }}>
              <div className="tree-cap" style={{ padding: '0 4px 6px' }}><span>Source</span><span className="mono">4</span></div>
              {gitFiles.slice(0, 3).map((f) => (
                <div className="gitrow" key={f.path}>
                  <span className={`fbadge ${f.flag}`}>{f.flag}</span>
                  <span className="p">{f.path.split('/').pop()}</span>
                </div>
              ))}
              <button className="btn sm" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} onClick={() => setView('source')}>
                {I.git(14)} Review & commit
              </button>
            </div>
          </aside>
        )}

        <div className="main">
          {view === 'welcome' && (
            <div className="scroll">
              <div className="welcome">
                <div className="w-logo">
                  <div className="w-mark">C</div>
                  <div>
                    <div className="t">Choko</div>
                    <div className="s">Manual test cases · markdown on disk · git as the data store</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
                  <button className="btn primary" onClick={() => openCase('c1')}>{I.folder(15)} Open repository…</button>
                  <button className="btn" onClick={() => setView('runs')}>{I.play(14)} View runs</button>
                </div>
                <div className="tree-cap" style={{ padding: '0 2px 8px' }}><span>Recent repositories</span><span className="mono">2</span></div>
                {[
                  { name: 'random-org-tests', path: '~/work/qa/random-org-tests', meta: 'main · 1 workspace · 2 days ago', go: () => openCase('c1') },
                  { name: 'checkout-flows', path: '~/work/qa/checkout-flows', meta: 'develop · 3 workspaces · last week', go: () => openCase('c4') },
                ].map((r) => (
                  <button className="repocard" key={r.name} onClick={r.go}>
                    <span className="ic">{I.git(17)}</span>
                    <span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                      <span className="mono" style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>{r.path}</span>
                    </span>
                    <span className="rt mono">{r.meta}</span>
                  </button>
                ))}
                <div className="tree-cap" style={{ padding: '18px 2px 8px' }}><span>Start something new</span></div>
                <div className="card"><div className="card-b" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ color: 'var(--acc)' }}>{I.plus(16)}</span>
                  <span style={{ color: 'var(--ink-2)' }}>Initialize <span className="mono">.ch/</span> in any git repo — suites are folders, cases are markdown.</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn sm" onClick={() => toast('Repository initialized')}>Init</button>
                </div></div>
                <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 18 }}>
                  Concept mockup in a neutral style · press <kbd>⌘K</kbd> to jump anywhere · toggle <kbd>theme</kbd> in the title bar
                </div>
              </div>
            </div>
          )}

          {view === 'case' && (
            <>
              <div className="scroll">
                <div className="wrap">
                  <div className="crumbs">
                    <span>RANDOM.ORG Web Tools</span><span>/</span>
                    <span>{suites.find((s) => s.id === kase.suite)?.name}</span><span>/</span>
                    <span className="mono">{kase.displayId}</span>
                  </div>
                  <textarea
                    className="ed-title"
                    rows={2}
                    value={kase.title}
                    readOnly
                    onFocus={(e) => e.target.select()}
                  />
                  <div className="meta-row">
                    <span className="pill"><span style={{ color: 'var(--faint)' }}>ID</span><span className="mono"><b>{kase.displayId}</b></span>
                      <button title="Copy ID" onClick={() => toast('Copied ' + kase.displayId)}>{I.copy(12)}</button>
                    </span>
                    <select className="pill" value={kase.status} onChange={() => toast('Status updated')}>
                      <option value="active">● Active</option>
                      <option value="draft">● Draft</option>
                      <option value="deprecated">● Deprecated</option>
                    </select>
                    {kase.tags.map((t) => (
                      <span className="tag" key={t}><span className="mono">#</span>{t}</span>
                    ))}
                  </div>

                  <div className="card">
                    <div className="card-h">Objective</div>
                    <div className="card-b prose"><p>{kase.objective}</p></div>
                  </div>

                  <div className="card">
                    <div className="card-h">Systems in scope <span className="n">{kase.systems.length}</span></div>
                    <div className="card-b"><div className="sys-row">{kase.systems.map((s) => <span className="tag" key={s}>{s}</span>)}</div></div>
                  </div>

                  <div className="card">
                    <div className="card-h">Setup <span className="n">{kase.setup.length}</span></div>
                    <div className="card-b">
                      {kase.setup.map((s, i) => (
                        <div key={i} className="step-row">
                          <span className="step-n mono">S{i + 1}</span>
                          <span><b>{s.name}</b><br /><span style={{ color: 'var(--ink-2)' }}>{s.body}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-h">Steps <span className="n">{kase.steps.length}</span></div>
                    <div className="card-b">
                      {stepNums(kase.steps).map((n, i) => (
                        <div key={i} className="step-row" style={{ paddingLeft: kase.steps[i].depth * 22 }}>
                          <span className="step-n mono">{n}</span>
                          <span>{kase.steps[i].text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-h">Acceptance criteria <span className="n">{kase.expected.length}</span></div>
                    <div className="card-b">
                      {kase.expected.map((e, i) => (
                        <div key={i} className="check-li"><span>{e}</span></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="footbar">
                {I.file(13)}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kase.path}</span>
                {committed
                  ? <span className="ok">{I.check(13)} committed</span>
                  : <span className="dirty">{I.dot(8)} uncommitted changes</span>}
              </div>
            </>
          )}

          {view === 'suite' && (
            <div className="scroll">
              <div className="wrap wide">
                <div className="crumbs"><span>RANDOM.ORG Web Tools</span><span>/</span><span className="mono">{suite.prefix}</span></div>
                <div className="suite-hero">
                  <h1>{suite.name}</h1>
                  <div className="d">{suite.desc}</div>
                  <div className="big-nums">
                    <div><div className="bn">{suite.caseIds.length}</div><div className="bl">cases</div></div>
                    <div><div className="bn" style={{ color: 'var(--pass)' }}>{cases.filter((c) => c.suite === suite.id && c.status === 'active').length}</div><div className="bl"><span className="dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pass)' }} />active</div></div>
                    <div><div className="bn" style={{ color: 'var(--warn)' }}>{cases.filter((c) => c.suite === suite.id && c.status === 'draft').length}</div><div className="bl"><span className="dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warn)' }} />draft</div></div>
                    <div><div className="bn mono" style={{ fontSize: 20 }}>{cases.filter((c) => c.suite === suite.id).map((c) => c.displayId).sort()[0]} – {cases.filter((c) => c.suite === suite.id).map((c) => c.displayId).sort().pop()}</div><div className="bl">id range</div></div>
                  </div>
                </div>
                <div className="page-h">
                  <h1 style={{ fontSize: 14 }}>Cases</h1>
                  <span className="sp" />
                  <button className="btn sm primary" onClick={() => toast('New case in ' + suite.name)}>{I.plus(13)} New case</button>
                </div>
                <div className="dtable">
                  {cases.filter((c) => c.suite === suite.id).map((c) => (
                    <button className="drow" key={c.id} onClick={() => openCase(c.id)}>
                      <span className="resdot" style={{ background: STATUS_DOT[c.status] }} />
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', width: 76, flex: 'none' }}>{c.displayId}</span>
                      <span className="t">{c.title}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>{c.tags.slice(0, 2).join(' · ')}</span>
                      {I.chevR(14)}
                    </button>
                  ))}
                </div>
                <div className="card">
                  <div className="card-h">Suite settings <span className="n">{suite.id}.md</span></div>
                  <div className="card-b" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div className="field" style={{ flex: '2 1 220px' }}><label>Display name</label><input className="input" defaultValue={suite.name} /></div>
                    <div className="field" style={{ flex: '0 1 120px' }}><label>ID prefix</label><input className="input mono" defaultValue={suite.prefix} /></div>
                    <div className="field" style={{ flex: '1 1 100%' }}><label>Description</label><textarea className="textarea" rows={2} defaultValue={suite.desc} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'runs' && (
            <div className="scroll">
              <div className="wrap wide">
                <div className="page-h">
                  <h1>Test runs</h1>
                  <span className="tag mono">.ch/runs/</span>
                  <span className="sp" />
                  <button className="btn ghost" onClick={() => toast('Weekly report exported')}>{I.dl(14)} Weekly report</button>
                  <button className="btn primary" onClick={() => setNewRunOpen(true)}>{I.plus(14)} New run</button>
                </div>
                <div className="stats">
                  <div className="stat"><div className="v">2</div><div className="l">Runs this week</div><div className="s">2 open in total</div></div>
                  <div className="stat"><div className="v">6</div><div className="l">Tests executed</div><div className="s">results recorded this week</div></div>
                  <div className="stat"><div className="v" style={{ color: 'var(--pass)' }}>67<span style={{ fontSize: 13 }}>%</span></div><div className="l">Pass rate</div><div className="s">4 of 6 executed</div></div>
                  <div className="stat"><div className="v" style={{ color: 'var(--fail)' }}>2</div><div className="l">Needs attention</div><div className="s">1 fail · 1 blocked this week</div></div>
                </div>
                <div className="heat">
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-2)' }}>Activity · last 18 weeks</div>
                  <div className="heat-grid">
                    {SEED.slice(0, 126).map((v, i) => (
                      <i key={i} style={{ background: heatColor(v) }} title={`${v} results`} />
                    ))}
                  </div>
                </div>
                <div className="tree-cap" style={{ padding: '2px 2px 8px' }}><span>Recent runs</span><span className="mono">{runs.length}</span></div>
                {runs.map((r) => {
                  const t = tally(r.rows);
                  const total = r.rows.length || 1;
                  return (
                    <button className="runcard" key={r.id} onClick={() => { setRunId(r.id); setView('run'); }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="nm">{r.name}<span className={`status-tag ${r.status}`}>{r.status}</span></span>
                        <span className="mt" style={{ display: 'block' }}>{r.created} · {r.scope}</span>
                      </span>
                      <span>
                        <span className="bar">
                          {(['pass', 'fail', 'blocked', 'in_progress', 'skipped', 'not_run'] as Result[]).map((s) =>
                            t[s] ? <i key={s} style={{ width: `${(t[s] / total) * 100}%`, background: RESULT_META[s].color }} /> : null,
                          )}
                        </span>
                        <span className="sum" style={{ display: 'block', marginTop: 5 }}>{total} cases · {t.pass} pass · {t.fail} fail{t.blocked ? ` · ${t.blocked} blocked` : ''}</span>
                      </span>
                      {I.chevR(16)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === 'run' && (
            <>
              <div className="guide-top">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 14 }}>{run.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{run.created} · {run.scope} · {run.rows.filter((r) => r.result !== 'not_run').length}/{run.rows.length} recorded</div>
                </div>
                <span className="prog"><i style={{ width: `${(run.rows.filter((r) => r.result !== 'not_run').length / runTotal) * 100}%` }} /></span>
                <span style={{ flex: 1 }} />
                <button className="btn" onClick={() => goGuide(run.id, Math.max(0, run.rows.findIndex((r) => r.result === 'not_run')))}>{I.play(14)} Continue run</button>
                <button className="btn ghost" onClick={() => toast('Run exported to PDF')}>{I.dl(14)}</button>
              </div>
              <div className="scroll">
                <div className="wrap wide">
                  <div className="dtable">
                    {run.rows.map((row, i) => (
                      <div className="drow" key={i}>
                        <span className="resdot" style={{ background: RESULT_META[row.result].color }} title={RESULT_META[row.result].label} />
                        <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', width: 76, flex: 'none' }}>{row.displayId}</span>
                        <button className="t" style={{ textAlign: 'left' }} onClick={() => goGuide(run.id, i)}>{row.title}</button>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--faint)', width: 120, flex: 'none' }}>{row.tester}{row.at ? ` · ${row.at.slice(11) || row.at}` : ''}</span>
                        <span className="res-select">
                          {(['pass', 'fail', 'blocked', 'not_run'] as Result[]).map((r) => (
                            <button
                              key={r}
                              className={`res-btn${row.result === r ? ' sel' : ''}`}
                              style={row.result === r ? { borderColor: RESULT_META[r].color } : undefined}
                              onClick={() => {
                                setRuns((rs) => rs.map((x) => x.id === run.id
                                  ? { ...x, rows: x.rows.map((rw, j) => (j === i ? { ...rw, result: r, at: r === 'not_run' ? '' : '2026-06-12 10:0' + i } : rw)) }
                                  : x));
                              }}
                            >
                              <span className="resdot" style={{ background: RESULT_META[r].color, width: 8, height: 8 }} />
                              {r === 'not_run' ? 'Clear' : RESULT_META[r].label}
                            </button>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                  {(runTally.fail > 0 || runTally.blocked > 0) && (
                    <div className="card">
                      <div className="card-h">Needs attention <span className="n">{runTally.fail + runTally.blocked}</span></div>
                      <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {run.rows.filter((r) => r.result === 'fail' || r.result === 'blocked').map((r) => (
                          <div key={r.caseId} style={{ display: 'flex', gap: 10, alignItems: 'baseline', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px' }}>
                            <span className="resdot" style={{ background: RESULT_META[r.result].color }} />
                            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.displayId}</span>
                            <span style={{ fontWeight: 600 }}>{r.title}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: RESULT_META[r.result].color, fontWeight: 700 }}>{RESULT_META[r.result].label}</span>
                            {r.notes && <span style={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--ink-2)' }}>{r.notes}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {['Tester sign-off', 'Reviewer sign-off'].map((label) => (
                      <div className="card" key={label} style={{ marginBottom: 0 }}>
                        <div className="card-h">{label}</div>
                        <div className="card-b" style={{ display: 'flex', gap: 8 }}>
                          <input className="input" placeholder="Your name" defaultValue={label.startsWith('Tester') ? 'amartin' : ''} />
                          <button className="btn sm primary" onClick={() => toast(label + ' recorded')}>{I.check(13)} Approve</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {view === 'guide' && guideRow && (
            <>
              <div className="guide-top">
                <button className="btn sm ghost" onClick={() => setView('run')}>{I.back(14)} Results</button>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 650, fontSize: 13.5 }}>{run.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{checkedCount}/{guideItems.length} checks</div>
                </div>
                <span className="prog"><i style={{ width: `${guideItems.length ? (checkedCount / guideItems.length) * 100 : 0}%` }} /></span>
                <div className="guide-nav">
                  <button className="icon-btn" disabled={guideIdx === 0} onClick={() => { setGuideIdx(guideIdx - 1); setChecks({}); setRecResult(null); }}>{I.chevL(15)}</button>
                  <span className="pos">{guideIdx + 1} / {run.rows.length}</span>
                  <button className="icon-btn" disabled={guideIdx === run.rows.length - 1} onClick={() => { setGuideIdx(guideIdx + 1); setChecks({}); setRecResult(null); }}>{I.chevR(15)}</button>
                </div>
              </div>
              <div className="scroll">
                <div className="wrap">
                  <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--acc-ink)' }}>{guideRow.displayId}</div>
                  <h1 style={{ fontSize: 22, fontWeight: 680, letterSpacing: '-0.02em', margin: '4px 0 14px', lineHeight: 1.3 }}>{guideCase?.title ?? guideRow.title}</h1>
                  <div className="card">
                    <div className="card-h">Brief</div>
                    <div className="card-b prose"><p>{guideCase?.objective}</p></div>
                  </div>
                  {['Setup', 'Step', 'Accept'].map((kind) => {
                    const items = guideItems.filter((it) => it.kind === kind);
                    if (!items.length) return null;
                    const title = kind === 'Setup' ? 'Setup' : kind === 'Step' ? 'Steps' : 'Acceptance criteria';
                    return (
                      <div className="card" key={kind}>
                        <div className="card-h">{title} <span className="n">{items.filter((it) => checks[it.key] === 'pass').length}/{items.length}</span>
                          <span style={{ flex: 1 }} />
                          <button className="btn sm ghost" onClick={() => {
                            const next = { ...checks };
                            items.forEach((it) => { next[it.key] = 'pass'; });
                            setChecks(next);
                          }}>Mark all pass</button>
                        </div>
                        <div className="card-b" style={{ padding: '8px 10px' }}>
                          {items.map((it) => {
                            const st = checks[it.key];
                            return (
                              <button
                                key={it.key}
                                className="gitem"
                                data-s={st ?? 'none'}
                                onClick={() => setChecks((c) => {
                                  const n = { ...c };
                                  if (!n[it.key]) n[it.key] = 'pass';
                                  else if (n[it.key] === 'pass') n[it.key] = 'fail';
                                  else delete n[it.key];
                                  return n;
                                })}
                              >
                                <span className="gbox">{st === 'pass' ? I.check(11) : st === 'fail' ? I.x(11) : null}</span>
                                <span style={{ flex: 1 }}>
                                  {it.num && <span className="mono" style={{ color: 'var(--faint)', fontSize: 12, marginRight: 8 }}>{it.num}</span>}
                                  <span className="gt">{it.text}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="card" style={{ borderColor: allPassed ? 'var(--acc-line)' : undefined }}>
                    <div className="card-h">Record result
                      <span style={{ flex: 1 }} />
                      {allPassed
                        ? <span style={{ color: 'var(--pass)', display: 'inline-flex', gap: 5, alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}>{I.check(13)} All checks passed</span>
                        : <span style={{ color: 'var(--warn)', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Pass all {guideItems.length} checks to record a pass</span>}
                    </div>
                    <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="rec-result">
                        {(['pass', 'fail', 'blocked', 'skipped'] as Result[]).map((r) => (
                          <button
                            key={r}
                            className={`rec-btn${recResult === r ? ' sel' : ''}`}
                            style={recResult === r ? { borderColor: RESULT_META[r].color } : undefined}
                            onClick={() => setRecResult(r)}
                          >
                            <span className="resdot" style={{ background: RESULT_META[r].color }} />
                            {RESULT_META[r].label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div className="field" style={{ flex: '0 1 160px' }}><label>Tester</label><input className="input mono" value={tester} onChange={(e) => setTester(e.target.value)} /></div>
                        <div className="field" style={{ flex: 1 }}><label>Notes {recResult === 'fail' && <span style={{ color: 'var(--fail)' }}>· link a defect</span>}</label>
                          <textarea className="textarea" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={recResult === 'fail' ? 'What failed? Link DEF-…' : 'Optional · markdown'} />
                        </div>
                      </div>
                      <div><button className="btn primary" disabled={!recResult} onClick={recordResult}>{I.check(15)} Save & next case</button></div>
                    </div>
                  </div>
                  {(recResult === 'fail' || recResult === 'blocked' || recResult === 'skipped') && (
                    <div className="card defect">
                      <div className="card-h" style={{ background: 'transparent' }}><span style={{ color: 'var(--fail)' }}>Defect report</span>
                        <span style={{ flex: 1 }} />
                        <button className="btn sm ghost" onClick={() => toast('Defect copied to clipboard')}>{I.copy(12)} Copy</button>
                      </div>
                      <pre>{`[${recResult!.toUpperCase()}] ${guideRow.displayId} — ${guideCase?.title}\nRun: ${run.name} (${run.created}) · Tester: ${tester || '—'}\n${notes ? `Notes: ${notes}\n` : ''}Failed checks:\n${guideItems.filter((it) => checks[it.key] === 'fail').map((it) => `  • ${it.text}`).join('\n') || '  (none marked — mark failing steps above)'}`}</pre>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {view === 'source' && (
            <div className="scroll">
              <div className="wrap wide">
                <div className="page-h">
                  <h1>Source control</h1>
                  <span className="pill mono">{I.branch(13)} main <span style={{ color: 'var(--warn)' }}>↓3 ↑1</span></span>
                  <span className="sp" />
                  <button className="btn" onClick={() => toast('Pulled — 3 commits, 1 conflict file needs review')}>{I.pull(14)} Pull <span className="mono" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 10, padding: '0 7px', fontSize: 11 }}>3</span></button>
                  <button className="btn" onClick={() => setCommitOpen(true)}>{I.commit(14)} Commit <span className="mono" style={{ background: 'var(--acc-soft)', color: 'var(--acc-ink)', borderRadius: 10, padding: '0 7px', fontSize: 11 }}>4</span></button>
                  <button className="btn primary" onClick={() => toast('Pushed to origin/main')}>{I.push(14)} Push</button>
                </div>
                <div className="card">
                  <div className="card-h">Changes <span className="n">4</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn sm ghost" onClick={() => setCommitOpen(true)}>Commit all…</button>
                  </div>
                  <div style={{ padding: 6 }}>
                    {gitFiles.map((f) => (
                      <div className="gitrow" key={f.path}>
                        <span className={`fbadge ${f.flag}`}>{f.flag}</span>
                        <span className="p">{f.path}</span>
                        <button className="btn sm ghost" onClick={() => toast('Diff — concept only')}>Diff</button>
                        <button className="btn sm ghost" onClick={() => toast('Reverted ' + f.path.split('/').pop())}>Revert</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <div className="card-h">Sync</div>
                  <div className="card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>Your branch is <b>1 ahead</b> and <b>3 behind</b> <span className="mono">origin/main</span>. Last fetch 2 min ago.</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn sm" onClick={() => setMergeOpen(true)}>{I.merge(14)} Resolve conflicts…</button>
                    <button className="btn sm" onClick={() => toast('Fetched from origin')}>Fetch</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="statusbar">
        <button className="sb-item" onClick={() => setView('source')}>{I.branch(12)} <span className="mono">main</span></button>
        <button className="sb-item" onClick={() => setView('source')}><span style={{ color: 'var(--warn)' }}>{I.dot(8)}</span> <span className="mono">4 changes</span></button>
        <span className="sp" />
        <span className="sb-item mono">{cases.length} cases · {runs.length} runs</span>
        <button className="sb-item" onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>{theme === 'light' ? 'Light' : 'Dark'}</button>
        {committed
          ? <span className="sb-item" style={{ color: 'var(--pass)' }}>{I.check(12)} committed</span>
          : <button className="sb-item" style={{ color: 'var(--warn)' }} onClick={() => setCommitOpen(true)}>{I.dot(8)} uncommitted</button>}
      </div>

      {palette && (
        <div className="overlay" onClick={() => setPalette(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <input autoFocus placeholder="Type a command or search…" value={palQ} onChange={(e) => setPalQ(e.target.value)} />
            <div className="pal-list">
              {(() => {
                let lastGroup = '';
                return palFiltered.map((a, i) => {
                  const head = a.group !== lastGroup ? <div className="pal-group" key={'g' + a.group}>{a.group}</div> : null;
                  lastGroup = a.group;
                  return (
                    <span key={a.label}>
                      {head}
                      <button
                        className={`pal-item${i === 0 ? ' sel' : ''}`}
                        onClick={() => { setPalette(false); a.fn(); }}
                        onMouseEnter={(e) => {
                          document.querySelectorAll('.pal-item.sel').forEach((el) => el.classList.remove('sel'));
                          e.currentTarget.classList.add('sel');
                        }}
                      >
                        {a.label}
                        {a.hint && <span className="hint mono">{a.hint}</span>}
                      </button>
                    </span>
                  );
                });
              })()}
              {palFiltered.length === 0 && <div className="ungrouped">No commands match “{palQ}”.</div>}
            </div>
          </div>
        </div>
      )}

      {commitOpen && (
        <div className="overlay" onClick={() => setCommitOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">{I.commit(17)}<h3>Commit changes</h3><span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>main</span></div>
            <div className="modal-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field"><label>Message</label><input className="input" placeholder="test: clarify dice roller acceptance criteria" defaultValue="test: clarify dice roller acceptance criteria" /></div>
              <div className="field"><label>Description</label><textarea className="textarea" rows={2} placeholder="Optional extended description…" /></div>
              <div>
                <div className="tree-cap" style={{ padding: '0 2px 6px' }}><span>Staged · 4 files</span></div>
                {gitFiles.map((f) => (
                  <div className="gitrow" key={f.path}><span className={`fbadge ${f.flag}`}>{f.flag}</span><span className="p">{f.path}</span></div>
                ))}
              </div>
            </div>
            <div className="modal-f">
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Commits to <span className="mono">main</span></span>
              <span className="sp" />
              <button className="btn ghost" onClick={() => setCommitOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={() => { setCommitOpen(false); setCommitted(true); toast('Committed to main'); }}>{I.check(14)} Commit</button>
            </div>
          </div>
        </div>
      )}

      {newRunOpen && (
        <div className="overlay" onClick={() => setNewRunOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">{I.play(16)}<h3>New run</h3></div>
            <div className="modal-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field"><label>Name</label><input className="input" defaultValue="Regression — july sweep" /></div>
              <div className="field"><label>Scope</label>
                <select className="input">
                  <option>tag: Regression (4 cases)</option>
                  <option>tag: Smoke (2 cases)</option>
                  <option>suite: Games and Randomizers (3 cases)</option>
                  <option>All cases (6 cases)</option>
                </select>
              </div>
              <div className="field"><label>Tester</label><input className="input mono" defaultValue="amartin" /></div>
            </div>
            <div className="modal-f">
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>4 cases will be seeded</span>
              <span className="sp" />
              <button className="btn ghost" onClick={() => setNewRunOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={() => { setNewRunOpen(false); setView('runs'); toast('Run created — ready to execute'); }}>{I.plus(14)} Create run</button>
            </div>
          </div>
        </div>
      )}

      {mergeOpen && (
        <div className="overlay" onClick={() => setMergeOpen(false)}>
          <div className="modal lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <span style={{ color: 'var(--acc)' }}>{I.merge(18)}</span>
              <div><h3>Resolve merge — <span className="mono">origin/main</span></h3>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Structured 3-way merge · non-conflicting changes already merged automatically</div></div>
              <span className="sp" style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>{Object.keys(mergePick).length} / 3 resolved</span>
              <span className="prog" style={{ width: 120 }}><i style={{ width: `${(Object.keys(mergePick).length / 3) * 100}%` }} /></span>
            </div>
            <div className="modal-b" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { key: 'objective', label: 'Objective · RND-0001', ours: 'Verify the Integer Generator returns exactly the requested quantity…, drawn from atmospheric noise (true random)…', theirs: 'Verify the Integer Generator returns exactly the requested count…, sourced from atmospheric noise rather than a pseudo-random generator.' },
                { key: 'steps', label: 'Steps · RND-0001', ours: '7 steps — includes “Set Generate to 20 numbers” as a nested sub-step.', theirs: '3 steps — reworded: “Navigate to the Integer Generator / Enter the count and range / Submit the form”.' },
                { key: 'result', label: 'Result · RND-0002 in Regression run', ours: 'fail — jpatel: “BUG-118 — value 37 missing from the returned sequence”', theirs: 'blocked — okeefe: “sequences page timed out”' },
              ].map((c) => (
                <div key={c.key}>
                  <div className="tree-cap" style={{ padding: '0 2px 8px' }}><span>{c.label}</span><span className="mono">{mergePick[c.key] ? 'resolved · ' + mergePick[c.key] : 'conflict'}</span></div>
                  <div className="merge-cols">
                    {(['ours', 'theirs'] as const).map((side) => (
                      <button key={side} className={`mside${mergePick[c.key] === side ? ' picked' : ''}`} onClick={() => setMergePick((m) => ({ ...m, [c.key]: side }))}>
                        <h4>{side === 'ours' ? 'Yours · local' : 'Theirs · incoming'}{mergePick[c.key] === side && <span style={{ color: 'var(--acc-ink)' }}>{I.check(13)}</span>}</h4>
                        <p>{side === 'ours' ? c.ours : c.theirs}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-f">
              <button className="btn ghost" onClick={() => setMergeOpen(false)}>Decide later</button>
              <span className="sp" />
              <button className="btn primary" disabled={Object.keys(mergePick).length < 3} onClick={() => { setMergeOpen(false); toast('Merge completed — ready to commit'); }}>
                {I.check(14)} Complete merge {Object.keys(mergePick).length < 3 && `(${3 - Object.keys(mergePick).length} left)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>{I.check(13)} {t.msg}</div>
        ))}
      </div>
    </div>
  );
}
