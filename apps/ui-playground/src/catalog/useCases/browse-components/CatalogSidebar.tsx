import { GroupLabel, SectionButton } from '@codaa/ui';
import { groupOrder } from '../../registry/inventory';
import type { VisualExport } from '../../registry/inventory';
import type { CatalogEntry } from './types';
import { t } from '../../../shared/i18n/messages';
import styles from './Catalog.module.css';
export function CatalogSidebar({ entries, selected, select }: { entries: CatalogEntry[]; selected: VisualExport | null; select: (name: VisualExport) => void }) {
  return <nav aria-label={t('catalog')} className={styles.sidebar}>
    {groupOrder.map(group => {
      const rows = entries.filter(e => e.group === group);
      return rows.length ? <GroupLabel key={group} label={group}><div className={styles.entries}>{rows.map(e =>
        <SectionButton key={e.name} active={selected === e.name} aria-current={selected === e.name ? 'page' : undefined} onClick={() => select(e.name)}>{e.name}</SectionButton>)}</div></GroupLabel> : null;
    })}
  </nav>;
}
