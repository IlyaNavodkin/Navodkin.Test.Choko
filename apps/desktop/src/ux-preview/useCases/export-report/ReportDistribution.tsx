import { t } from '../explore-design/messages';
import { rt } from './messages';
import { distributionOrder, distributionSegments, reportResultColors, type ReportResult, type ReportSummary } from './distributionModel';
import styles from './ReportPreview.module.css';

export function ReportResultLabel({ result }: { result: ReportResult }) {
  return <span className={styles.resultLabel}><span className={styles.dot} style={{ background: `var(${reportResultColors[result].token})` }} aria-hidden="true" />{t(result)}</span>;
}

export function ReportDistribution({ summary, label, compact = false }: { summary: ReportSummary; label: string; compact?: boolean }) {
  return <div className={styles.distribution} role="group" aria-label={`${rt('distribution')}: ${label}`}>
    <div className={`${styles.bar} ${compact ? styles.compactBar : ''}`} aria-hidden="true">
      {distributionSegments(summary).map(({ state, fraction }) => <span key={state} data-result={state} style={{ width: `${fraction * 100}%`, background: `var(${reportResultColors[state].token})` }} />)}
    </div>
    {summary.total === 0 && <p className={styles.emptyDistribution}>{rt('noResults')}</p>}
    <dl className={`${styles.counts} ${compact ? styles.compactCounts : ''}`}>{distributionOrder.map((state) => <div key={state} style={{ borderColor: `var(${reportResultColors[state].token})` }}><dt><ReportResultLabel result={state} /></dt><dd>{summary.counts[state]}</dd></div>)}</dl>
  </div>;
}
