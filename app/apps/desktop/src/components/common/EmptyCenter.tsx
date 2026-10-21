import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';

export function EmptyCenter() {
  const { createCase, cases, workspace, openReferenceBook, openAutomationSection, openRunsList } = useApp();
  if (!cases.length) return <main className="min-w-0 flex-1 overflow-auto bg-panel px-6 py-10">
    <div className="mx-auto max-w-[660px]">
      <div className="mb-4 text-accent">{I.file({ size: 28 })}</div>
      <h1 className="font-heading text-[26px] font-extrabold">Проект готов к работе</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-3">Начните с первого тест-кейса в рабочем пространстве «{workspace?.name}». Опишите, что проверять, шаги и ожидаемый результат.</p>
      <Button className="mt-6" variant="primary" onClick={() => createCase(null)}>{I.plus({ size: 15 })} Создать первый тест-кейс</Button>
      <div className="mt-10 border-t border-border pt-6">
        <h2 className="mb-4 text-[16px] font-bold">Что дальше</h2>
        <div className="flex flex-col gap-5 text-[13px] leading-relaxed text-ink-3">
          <div><button className="font-semibold text-accent-ink hover:underline" onClick={openRunsList}>Runs — провести проверку</button><p>Соберите кейсы в прогон, отмечайте результаты и создавайте баг-репорты.</p></div>
          <div><button className="font-semibold text-accent-ink hover:underline" onClick={openReferenceBook}>Reference — общие данные</button><p>Храните описания, окружения и аргументы, которые используют ваши тесты.</p></div>
          <div><button className="font-semibold text-accent-ink hover:underline" onClick={openAutomationSection}>Autotests — автоматизация</button><p>Связывайте автотесты с кейсами и смотрите результаты запусков. Это можно настроить позже.</p></div>
        </div>
      </div>
    </div>
  </main>;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="grid flex-1 place-items-center text-ink-faint">
        <div className="flex flex-col items-center gap-2.5 text-center">
          {I.file({ size: 30, style: { color: 'var(--ink-faint)' } })}
          <div className="text-[14px] text-ink-3">Select a case from the tree, or create a new one.</div>
          <Button variant="primary" onClick={() => createCase(null)}>
            {I.plus({ size: 14 })} New case
          </Button>
        </div>
      </div>
    </div>
  );
}
