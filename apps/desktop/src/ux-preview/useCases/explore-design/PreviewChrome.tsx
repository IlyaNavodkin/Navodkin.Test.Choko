import actionStyles from './PrimaryAction.module.css';
import { Button, Icon, IconNames, Select } from '@codaa/ui';
import { repositories } from './fixtures';
import { t } from './messages';
import type { PreviewSection } from './types';
import type { UseExploreDesignResult } from './useExploreDesign';
import styles from './Preview.module.css';
export function PreviewChrome({ model, onStates, onClose }: { model: UseExploreDesignResult; onStates: () => void; onClose: () => void }) {
  return <header className={styles.topbar}>
    <strong className={styles.brand}>{t('brand')}</strong>
    {model.repository !== null && <><Select className={styles.repoSelect} size="sm" aria-label={t('repo')} value={String(model.repository)} options={[...repositories.map((item, i) => ({ value: String(i), label: item.name })), { value: 'start', label: t('changeRepo') }]} onValueChange={(value) => model.openRepository(value === 'start' ? null : Number(value))} />
      <span className={styles.branch}><Icon name={IconNames.gitBranch} size="sm" />main</span>
      <nav className={styles.nav} aria-label={t('workspace')}>{(['cases', 'runs', 'automation', 'git', 'glossary'] as const).map((section: PreviewSection) => <button key={section} aria-current={model.section === section ? 'page' : undefined} onClick={() => model.setSection(section)}><Icon name={section === 'cases' || section === 'glossary' ? IconNames.fileText : section === 'runs' || section === 'automation' ? IconNames.play : IconNames.gitBranch} size="sm" />{t(section)}{section === 'git' && model.files.length > 0 && <span className={styles.count}>{model.files.length}</span>}</button>)}</nav></>}
    <div className={styles.previewControls}><Button size="sm" variant="ghost" onClick={onStates}>{t('layoutStates')}</Button><Button size="sm" variant="ghost" onClick={onClose} aria-label={t('closeSimulation')} title={t('closeSimulation')}><Icon name={IconNames.logOut} size="sm" /></Button><span className={styles.demo}>{t('demo')}</span></div>
  </header>;
}
export function StartScreen({ onOpen }: { onOpen: (index: number) => void }) {
  return <main className={styles.start}><div className={styles.startHeading}><span className={styles.eyebrow}>{t('workspace')}</span><h1>{t('startTitle')}</h1><p>{t('startIntro')}</p><Button className={`${styles.openRepoButton} ${actionStyles.primaryAction}`} variant="primary" leadingIcon={<Icon name={IconNames.folderOpen} />} onClick={() => onOpen(0)}>{t('open')}</Button><span className={styles.compatibility}>{t('compatibleRepos')}</span></div>
    <section className={styles.recents}><h2>{t('start')}</h2>{repositories.map((repo, index) => <button className={styles.recent} onClick={() => onOpen(index)} key={repo.name}><Icon name={IconNames.folder} /><span><strong>{repo.name}</strong><small>{repo.path}</small></span><span className={styles.recentMeta}>main<small>{t('local')}</small></span><Icon name={IconNames.chevronRight} /></button>)}</section>
    <p className={styles.muted}>{t('demo')}</p></main>;
}
