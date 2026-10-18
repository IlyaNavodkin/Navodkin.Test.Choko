import { Badge, Button, EmptyState, PageBrand, PageTopbar, SearchInput } from '@codaa/ui';
import { useComponentCatalog } from './useComponentCatalog';
import { CatalogSidebar } from './CatalogSidebar';
import { ComponentDemo } from '../inspect-component/ComponentDemo';
import { t } from '../../../shared/i18n/messages';
import styles from './Catalog.module.css';
import { visualEntries } from '../../registry/inventory';
export function ComponentCatalogPage() {
  const catalog = useComponentCatalog();
  const selected = catalog.entries.find(e => e.name === catalog.selected);
  return <div className={styles.app}>
    <PageTopbar className={styles.topbar}><PageBrand mark="T" title="Testoritto" eyebrow={t('playground')} />
      <div className={styles.search}><SearchInput key={catalog.searchEpoch} aria-label={t('search')} placeholder={t('search')} defaultValue={catalog.query} onValueChange={catalog.setQuery} debounceMs={0} size="sm" /></div>
      <Badge><span role="status" aria-live="polite">{catalog.entries.length} / {visualEntries.length}</span></Badge>
    </PageTopbar>
    <div className={styles.body}><CatalogSidebar entries={catalog.entries} selected={catalog.selected} select={catalog.select} />
      <div className={styles.detail}>{selected ? <ComponentDemo key={selected.name} entry={selected} /> :
        <div className={styles.empty}><EmptyState title={t('empty')} description={t('emptyHint')} /><Button onClick={catalog.clearQuery}>{t('clear')}</Button></div>}
      </div>
    </div>
  </div>;
}
