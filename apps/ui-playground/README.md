# UI Playground

Отдельный каталог 102 визуальных экспортов локального `@codaa/ui`. React 19, TypeScript strict, Vite, CSS Modules и исходные Citadelic tokens. Browser frontend пригоден для дальнейшего подключения к Tauri 2. Native wrapper, IPC и installers в этот change не входят; browser build не является native smoke.

## Запуск

Из корня checkout, Node >=22.12, pnpm 11:

```powershell
pnpm install --frozen-lockfile
pnpm ui:dev
```

Dev: http://127.0.0.1:5174. Остановить свой процесс: Ctrl+C в терминале, где запущена команда. Production artifact: `apps/ui-playground/dist`.

```powershell
pnpm ui:typecheck
pnpm ui:test
pnpm ui:coverage
pnpm ui:build
pnpm ui:preview
```

Preview: http://127.0.0.1:4174. Оба сервера слушают только loopback, с `strictPort`. При занятом порте команда завершается ошибкой; чужие процессы не останавливаются. Явный другой порт:

```powershell
pnpm ui:dev --port 5175
pnpm ui:preview --port 4175
```

## Добавление demo

1. Сверить новый public runtime export в `ui/index.ts` и добавить строку в OpenSpec `coverage-matrix.md`.
2. Добавить explicit entry в `src/catalog/registry/inventory.ts`: точное имя, группа, demo id, варианты, controls, verification. Infrastructure требует причины исключения.
3. Создать consumer в `src/catalog/useCases/<demo-id>/`, импортируя только public `@codaa/ui`. Hook API: `UseXxxArgs`/`UseXxxResult`; без `any`, deep imports и искусственного backend.
4. Зарегистрировать renderer в `renderers.tsx`, начальные props/fixtures в `scenarios.ts`. Runtime state в consumer обязан совпадать с defaults. Compound children помещаются в обязательный parent.
5. Добавить typed RU message в `shared/i18n/messages.ts`. EN допускает RU fallback. API имена и fixture-контент остаются исходными.
6. Проверить controls, действия, reset, switch/unmount, console и заполнить runtime report. Static coverage не доказывает реальный render.

`ComponentDemo` remount-ит example и error boundary по export/reset epoch. Повторный выбор не сбрасывает state. `useDemoSession` владеет timeout handles и отменяет их при unmount. Каждый эффект отдельно очищает свои ресурсы: audio pause/listeners, synthetic interval, tracked toast ids, owned blocking overlay. Reset сохраняет query и selection каталога, возвращает props, fixtures, internal Table sort/page и output.

## Fixtures и границы

Таблица, дерево, reorder, формы и ссылки изменяют только память приложения. Zod form submit локален, HTTP отсутствует. `ConfirmDialog` закрывает caller после success; consumer управляет pending и error, ограничивает повторный click; error остаётся внутри dialog. Toast primitive не имеет variant: info/error принадлежат store. Один Host размещён справа снизу через consumer CSS Module, ids очищаются только для текущего demo.

`public/fixtures/mark.svg` и `speaking.svg` — созданные для каталога векторные T-марки с sample tokens Citadelic. `broken.svg` преднамеренно невалиден для fallback. `tone-1.wav`/`tone-2.wav` — синтетические PCM mono 8 kHz, 6 s, 220/330 Hz; без сторонних медиа и лицензий. Нет autoplay. Waveform Record — подписанная симуляция с synthetic samples, без microphone/camera/getUserMedia.

Upload принимает только metadata выбранных Files: name/size; содержимое не читается, не отправляется, не сохраняется. Прогресс/ошибка/retry — таймерная симуляция. `stageLabel` Kit не выводит, поэтому consumer отдельно показывает status badges. Pointer и keyboard действия tree/reorder работают на локальных fixtures, без fs/Git.

AnimatedBackground использует существующий tsParticles engine, без миграции зависимостей; lazy renderer и bounded preview. Reduced motion учитывается библиотекой и consumer. Build может предупреждать о `use client` в исходной browser library и размере основного chunk; это не ошибки typecheck. Фактические результаты и ограничения — в `runtime-report.md`.
