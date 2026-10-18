import { Alert, Badge, Button, EmptyState, Input, Select, StatusPill, Tab, Tabs } from '@codaa/ui';
import { useMemo, useState } from 'react';
import { AutotestPanel } from './AutotestPanel';
import { BindingsPanel } from './BindingsPanel';
import { ImportPanel } from './ImportPanel';
import { ResultsPanel } from './ResultsPanel';
import { RunPanel } from './RunPanel';
import { at } from './messages';
import { automationStates } from './types';
import type { Autotest, AutomationState } from './types';
import type { UsePreviewAutomationResult } from './usePreviewAutomation';
import styles from './AutomationWorkspace.module.css';

type Section = 'autotest' | 'bindings' | 'run' | 'results' | 'import';

export function AutomationWorkspace({ model: m }: { model: UsePreviewAutomationResult }) {
  const [section, setSection] = useState<Section>('autotest');
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState<'active' | 'archived' | 'all'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(() => m.autotests.find((item) => !item.archived)?.id ?? null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [createToken, setCreateToken] = useState(0);
  const disabled = m.blocked || m.busy;

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru');
    return m.autotests.filter((item) => (archive === 'all' || item.archived === (archive === 'archived'))
      && (!query || `${item.title} ${item.selector.automationId} ${item.selector.project} ${item.description}`.toLocaleLowerCase('ru').includes(query)));
  }, [m.autotests, search, archive]);
  const selected: Autotest | null = m.autotests.find((item) => item.id === selectedId) ?? null;

  return <div className={styles.workspace}>
    <aside className={styles.sidebar} aria-label={at('catalog')}>
      <div className={styles.tools}>
        <h2>{at('catalog')}</h2>
        <Input size="sm" aria-label={at('search')} placeholder={at('search')} value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select size="sm" aria-label={at('archiveFilter')} value={archive} options={(['active', 'archived', 'all'] as const).map((value) => ({ value, label: at(value) }))} onValueChange={(value) => setArchive(value as typeof archive)} />
        <Button size="sm" disabled={disabled} onClick={() => { setSection('autotest'); setCreateToken((value) => value + 1); }}>{at('create')}</Button>
      </div>
      <div className={styles.list}>
        {visible.map((item) => <button key={item.id} className={styles.entry} aria-pressed={item.id === selectedId} onClick={() => { setSelectedId(item.id); setSection('autotest'); }}>
          <small>{item.selector.automationId} · {item.selector.project}{item.archived && ` · ${at('archivedLabel')}`}</small>
          <strong>{item.title}</strong>
          <span>{m.bindings.filter((binding) => binding.autotestId === item.id).length} {at('bindings').toLocaleLowerCase('ru')} · {item.argumentDefinitions.length} {at('arguments').toLocaleLowerCase('ru')}</span>
        </button>)}
        {!visible.length && <div className={styles.emptyBlock}><p>{at('empty')}</p><Button size="sm" onClick={() => { setSearch(''); setArchive('active'); }}>{at('reset')}</Button></div>}
      </div>
    </aside>

    <main className={styles.detail}>
      <p className={styles.memory}>{at('memory')}</p>
      <div className={styles.profileBar}>
        <div className={styles.profileFacts}>
          <strong>{m.profile.label}</strong>
          <span>{m.profile.cwd} · {m.profile.config} · {at('projects')}: {m.profile.projects.join(', ')}</span>
          <span>{at('timeout')}: {Math.round(m.profile.timeoutMs / 1000)} s · {at('retries')}: {m.profile.retries} · {at('workers')}: {m.profile.workers}</span>
          <small>{at('revision')}: {m.profileRevision.slice(0, 12)}</small>
        </div>
        <div className={styles.profileActions}>
          {m.trusted ? <StatusPill tone="success" size="sm">{at('trustGrantedShort')}</StatusPill> : <StatusPill tone="danger" size="sm">{at('trustMissingShort')}</StatusPill>}
          <Button size="sm" disabled={disabled} onClick={() => m.setTrust(!m.trusted)}>{at(m.trusted ? 'revoke' : 'grant')}</Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setProfileEditing((value) => !value)}>{at('edit')}</Button>
          <Select size="sm" aria-label={at('stateLabel')} value={m.state} options={automationStates.map((value) => ({ value, label: at(value) }))} onValueChange={(value) => m.setDemoState(value as AutomationState)} />
          {!m.catalogValid && <Badge variant="danger">catalog</Badge>}
        </div>
      </div>
      {profileEditing && <div className={styles.profileEditor}>
        <label>{at('title')}<Input size="sm" aria-label="profile-label" value={m.profile.label} disabled={disabled} onChange={(event) => m.setProfile('label', event.target.value)} /></label>
        <label>{at('config')}<Input size="sm" aria-label={at('config')} value={m.profile.config} disabled={disabled} onChange={(event) => m.setProfile('config', event.target.value)} /></label>
        <label>{at('timeout')}<Input size="sm" aria-label={at('timeout')} value={String(m.profile.timeoutMs)} disabled={disabled} onChange={(event) => m.setProfile('timeoutMs', Number(event.target.value) || 1)} /></label>
        <label>{at('retries')}<Input size="sm" aria-label={at('retries')} value={String(m.profile.retries)} disabled={disabled} onChange={(event) => m.setProfile('retries', Number(event.target.value) || 0)} /></label>
        <label>{at('workers')}<Input size="sm" aria-label={at('workers')} value={String(m.profile.workers)} disabled={disabled} onChange={(event) => m.setProfile('workers', Number(event.target.value) || 1)} /></label>
        <Button size="sm" variant="primary" disabled={disabled} onClick={() => { m.saveProfile(); setProfileEditing(false); }}>{at('save')}</Button>
        <small>{at('profileHint')}</small>
      </div>}
      <p className={styles.muted}>{at('trustHint')} · {at('simulated')}: {at('runsInDemo')}</p>
      {m.blocked && <p role="status">{at('blockedRunning')}</p>}
      {m.error && <Alert variant="danger" action={<Button size="sm" variant="ghost" onClick={m.dismissNotice}>{at('close')}</Button>}>{m.error}</Alert>}
      {m.notice && <Alert variant="info" action={<Button size="sm" variant="ghost" onClick={m.dismissNotice}>{at('close')}</Button>}>{m.notice}</Alert>}

      <Tabs value={section} onValueChange={(value) => setSection(value as Section)}>
        <Tab value="autotest">{at('heading')}</Tab>
        <Tab value="bindings">{at('bindings')}</Tab>
        <Tab value="run">{at('run')}</Tab>
        <Tab value="results">{at('results')}</Tab>
        <Tab value="import">{at('import')}</Tab>
      </Tabs>
      {section === 'autotest' ? <AutotestPanel model={m} selected={selected} createToken={createToken} onSaved={setSelectedId} />
        : section === 'bindings' ? <BindingsPanel model={m} />
          : section === 'run' ? <RunPanel model={m} />
            : section === 'results' ? <ResultsPanel model={m} />
              : <ImportPanel model={m} />}
      {!m.cases.length && <EmptyState title={at('select')} description={at('bindingsHint')} />}
    </main>
  </div>;
}
