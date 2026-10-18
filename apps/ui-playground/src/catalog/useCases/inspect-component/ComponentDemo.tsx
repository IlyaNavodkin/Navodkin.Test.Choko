import { Suspense, useState } from 'react';
import { Badge, Button, LoadingState } from '@codaa/ui';
import type { CatalogEntry } from '../browse-components/types';
import { DemoBoundary } from './DemoBoundary';
import { t } from '../../../shared/i18n/messages';
import styles from './Demo.module.css';
import { renderers } from '../../registry/renderers';
export function ComponentDemo({ entry }: { entry: CatalogEntry }) {
  const [epoch, setEpoch] = useState(0);
  const Renderer = renderers[entry.demo];
  return <><header className={styles.heading}><div><Badge>{entry.group}</Badge><h1>{entry.name}</h1><p>{entry.description}</p><p>{entry.controls}</p></div><Button onClick={() => setEpoch(e => e + 1)}>{t('reset')}</Button></header>
    <DemoBoundary key={epoch} name={entry.name} reset={() => setEpoch(e => e + 1)}><Suspense fallback={<LoadingState />}><Renderer demo={entry.demo} /></Suspense></DemoBoundary>
    <p className={styles.verification}>{t('behavior')}: {entry.verification}</p></>;
}
