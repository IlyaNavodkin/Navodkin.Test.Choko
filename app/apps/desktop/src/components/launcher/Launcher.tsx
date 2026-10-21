import { useEffect, useState } from 'react';
import { I } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui';
import { useApp, useAppStore } from '@/store/app-store';
import { CreateProject } from './CreateProject';

function timeAgo(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed)) return '';
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} ч. назад` : `${Math.floor(hours / 24)} дн. назад`;
}
const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

export function Launcher() {
  const ctx = useApp();
  const [creating, setCreating] = useState(false);
  useEffect(() => { void ctx.loadRecents(); }, [ctx.loadRecents]);
  const closeCreator = () => { setCreating(false); useAppStore.setState({ error: null }); };
  return <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-bg">
    <main className="flex w-full max-w-[780px] flex-col px-6 py-10 sm:px-10">
      <div className="mb-8 flex items-center gap-3"><Logo size={68} /><span className="font-brand text-[32px] font-black tracking-tight text-accent">Chioko</span></div>
      <h1 className="font-heading text-[28px] font-extrabold leading-tight">Начните с проекта</h1>
      <p className="mt-3 max-w-[540px] text-[14px] leading-relaxed text-ink-3">В одном месте — тест-кейсы, прогоны, справочник и автотесты. Создайте проект или откройте существующую папку.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="primary" disabled={ctx.loading} onClick={() => { useAppStore.setState({ error: null }); setCreating(true); }}>{I.plus({ size: 16 })} Создать проект</Button>
        <Button disabled={ctx.loading} onClick={() => void ctx.openRepo()}>{I.folderOpen({ size: 16 })} {ctx.loading ? 'Открываем проект…' : 'Открыть проект…'}</Button>
      </div>
      {(ctx.needsInit || ctx.emptyRepo) && <section className="mt-6 rounded-lg border border-accent-line bg-accent-soft p-4" aria-label="Настройка проекта">
        <h2 className="text-[16px] font-bold">{ctx.emptyRepo ? 'Создадим первое рабочее пространство' : 'Добавить Chioko в эту папку?'}</h2>
        <p className="mt-2 break-words text-[13px] leading-relaxed text-ink-2"><b>{folderName(ctx.repoPath)}</b>. {ctx.emptyRepo ? 'Рабочее пространство объединяет кейсы одной области. Начнём с одного — остальные можно добавить позже.' : 'Существующие документы останутся на месте. Chioko подготовит локальную историю и первое рабочее пространство.'}</p>
        <p className="mt-2 break-all font-mono text-[11px] text-ink-3">{ctx.repoPath}</p>
        <div className="mt-4 flex flex-wrap gap-2"><Button variant="primary" disabled={ctx.loading} onClick={() => void ctx.initRepo()}>{ctx.loading ? 'Подготавливаем…' : ctx.emptyRepo ? 'Создать рабочее пространство' : 'Добавить Chioko в проект'}</Button><Button disabled={ctx.loading} onClick={() => void ctx.openRepo()}>Выбрать другую папку</Button></div>
      </section>}
      {ctx.error && !creating && <p role="alert" className="mt-5 break-words rounded-md border border-fail bg-fail-soft p-3 text-[13px] text-fail">{ctx.error}</p>}
      <section className="mt-10" aria-labelledby="recent-projects">
        <div className="mb-3 flex items-center gap-2"><h2 id="recent-projects" className="text-[16px] font-bold">Недавние проекты</h2>{ctx.recents.length > 0 && <span className="text-[12px] text-ink-faint">{ctx.recents.length}</span>}</div>
        {ctx.recents.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-[13px] text-ink-3">Здесь появятся проекты, с которыми вы работали. Для начала создайте новый проект или откройте существующий.</p> : <div className="flex flex-col gap-2">
          {ctx.recents.map((recent) => <button key={recent.path} disabled={ctx.loading} onClick={() => void ctx.openRepo(recent.path)} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3 text-left transition-colors hover:border-accent-line hover:bg-accent-soft disabled:opacity-50">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-panel-2 text-ink-3">{I.folder({ size: 18 })}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{recent.name}</span><span className="mt-1 block truncate font-mono text-[11px] text-ink-3">{recent.path}</span></span>
            <span className="shrink-0 text-[11px] text-ink-faint">{timeAgo(recent.lastOpened)}</span>
          </button>)}
        </div>}
      </section>
      <p className="mt-7 text-[12px] text-ink-faint">Проект — вся папка с тестами. Рабочие пространства — области внутри проекта, например «Сайт» или «API».</p>
    </main>
    {creating && <CreateProject onClose={closeCreator} />}
  </div>;
}
