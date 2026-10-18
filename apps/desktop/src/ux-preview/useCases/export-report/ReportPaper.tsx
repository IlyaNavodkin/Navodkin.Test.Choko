import { rt } from './messages';
import { ReportDistribution, ReportResultLabel } from './ReportDistribution';
import { formatRate } from './pdfDefinition';
import type { ReportDocument } from './types';
import styles from './ReportPreview.module.css';
export function ReportPaper({ report: r }: { report: ReportDocument }) {
  return <article className={styles.paper} aria-label={rt(r.kind)}><header><p>Testoritto · {r.repoName}</p><h1>{rt(r.kind)}</h1><p>{r.period.start} — {r.period.end}</p><small>{rt('generated')}: {r.generatedAt}</small></header>
    <section><h2>{rt('summary')}</h2><ReportDistribution summary={r.summary} label={rt('summary')} /><p>{rt('total')}: {r.summary.total} · {rt('passRate')}: {formatRate(r.summary.passRate)}</p></section>
    <section><h2>{rt('suites')}</h2>{r.suites.map((suite) => <div className={styles.suite} key={suite.name}><h3>{suite.name}</h3><p>{rt('total')}: {suite.summary.total} · {rt('passRate')}: {formatRate(suite.summary.passRate)}</p><ReportDistribution summary={suite.summary} label={suite.name} compact /></div>)}</section>
    {r.kind === 'weekly' && <section><h2>{rt('matrix')}</h2><div className={styles.scroll}><table className={styles.matrix}><thead><tr><th>{rt('case')}</th>{r.runs.map((run) => <th key={run.id}>{run.name}<br />{run.date}</th>)}</tr></thead><tbody>{r.matrix.map((row) => <tr key={row.caseId}><td>{row.displayId} · {row.title}</td>{row.results.map((cell) => <td key={cell.runId}>{cell.result === null ? '—' : <ReportResultLabel result={cell.result} />}</td>)}</tr>)}</tbody></table></div></section>}
    {r.runs.map((run) => <section key={run.id}><h2>{run.name}</h2><p>{run.date} · {rt(run.closed ? 'closed' : 'opened')} · {run.id}</p><p>{run.summary}</p>{r.kind === 'weekly' && <><p>{rt('total')}: {run.totals.total} · {rt('passRate')}: {formatRate(run.totals.passRate)}</p><ReportDistribution summary={run.totals} label={run.name} compact /></>}{run.notes !== undefined && <p>{rt('runNotes')}: {run.notes}</p>}
      <div className={styles.scroll}><table><thead><tr><th>{rt('case')}</th><th>{rt('result')}</th><th>{rt('tester')}</th></tr></thead><tbody>{run.cases.map((item) => <tr key={item.id}><td>{item.displayId} · {item.title}<br /><small>{item.suite}</small></td><td><ReportResultLabel result={item.result} /></td><td>{item.tester || '—'}</td></tr>)}</tbody></table></div>
      {run.cases.map((item) => <details key={item.id} className={styles.snapshot}><summary>{rt('snapshot')}: {item.displayId} · {item.title}</summary><small>{item.id}</small><h3>{rt('objective')}</h3><p>{item.objective}</p><h3>{rt('setup')}</h3><p>{item.setup}</p><h3>{rt('steps')}</h3><ol>{item.steps.map((step, index) => <li key={index}>{step} [{rt(item.checks[index] ?? 'none')}]</li>)}</ol><h3>{rt('expected')}</h3><p>{item.expected}</p>{item.notes !== undefined && <p>{rt('runNotes')}: {item.notes}</p>}{item.failNotes?.map((note, index) => note && <p key={index}>{rt('failNotes')} {index + 1}: {note}</p>)}</details>)}
    </section>)}
  </article>;
}
