# Testoritto desktop

**16 октября 2026:** Windows x64 EXE и NSIS 0.1.0 собраны для пользовательской приёмки. [Запуск, тестовые репозитории и сценарий проверки](ACCEPTANCE.md), [сборка и SHA256](evidence/windows-acceptance.md). Новый installer/native UI ещё не запускались; macOS и native E2E остаются открытыми. Описания ранних этапов ниже — история реализации.

**18 октября 2026:** native-путь «Автотестов» переведён на Rust v2: контракты Autotest/привязки/аргументы/окружения/invocation, portable-хранилище в `.testoritto/automation/`, исполнение через внешний Node с bridge v2 (аргументы в окружении, `invocationId`, junit.xml), публикация отчётов в папку прогона и нативный импорт Testoritto-отчётов. Проверки: Rust 208/208, tools 16/16 с настоящим Playwright, frontend 218/218, 42/42 browser. Подробности и ограничения: [Автотесты: native Rust v2](evidence/automation-native-v2.md).

**17 октября 2026:** в UX preview (`ux-preview.html`) добавлен раздел «Автотесты» на настоящей доменной логике v2: каталог автотестов и аргументы, привязки кейсов, окружения из справочника, разрешение значений с приоритетами, смешанный прогон с имитацией исполнения, report.json/junit.xml, публикация файлов в `.testoritto/automation/` и импорт JSON/JUnit. Это изолированный browser-срез: реальный Node/Playwright через Rust, product IPC и native приёмка не реализованы. Подробности и ограничения: [Автотесты: браузерный UX-срез](evidence/automation-ux-preview.md).

Приложение Testoritto на Tauri 2, React 19, TypeScript strict и Vite. Реализованы просмотр Git-репозитория, редактор существующих кейсов с явным сохранением и подтверждаемая инициализация новой структуры Casewright: выбор корня, переключение объявленных workspace, каталог кейсов/прогонов и чтение выбранных case/run документов. UI вызывает только перечисленные Rust IPC resources; browser preview показывает, что native-доступ недоступен.

## Команды

Из корня workspace:

```powershell
pnpm desktop:dev
pnpm desktop:frontend:typecheck
pnpm desktop:frontend:test
pnpm desktop:frontend:build
pnpm desktop:browser:install
pnpm desktop:browser:typecheck
pnpm desktop:browser:test
pnpm desktop:rust:fmt
pnpm desktop:rust:clippy
pnpm desktop:rust:test
pnpm desktop:build
```

Browser preview для проверки интерфейса запускается командой `pnpm --filter @testoritto/desktop dev -- --host 127.0.0.1 --port 1420`; пакетный preview script использует порт 4174. В браузере native IPC недоступен, поэтому отображается явное состояние «Откройте приложение Testoritto».

`desktop:browser:install` устанавливает headless Chromium в workspace `.cache/playwright`; `desktop:browser:test` поднимает отдельный production Vite preview на 4175 и запускает тесты в одном worker. Тесты подменяют только Tauri `invoke` в Playwright-контексте и проверяют пользовательские сценарии frontend; это не native E2E и не проверка filesystem/Git backend. Подробности, screenshots и ограничения: [browser evidence](evidence/browser.md).

## Текущие ограничения

### Native IPC

Команды протокола v1: `pick_repository`, `initialize_repository`, `close_repository`, `catalog_workspace`, `read_case`, `save_case`, `catalog_runs`, `read_run`, `list_recent_repositories`, `open_recent_repository`, `remember_workspace` и `get_runtime_diagnostics`. Picker открывает нативный выбор папки; WebView не передаёт абсолютные пути. Последующие запросы используют UUIDv4 session/resource/recent IDs и, для workspace, объявленный относительный путь. Rust проверяет main window и origin, payload и принадлежность ресурса до чтения. Git/filesystem/catalog/recents операции выполняются через `spawn_blocking`; ошибки IPC имеют безопасные стабильные коды и не раскрывают native paths/stderr. Capability main предоставляет только explicit app commands; dialog plugin не получает frontend permission. Произвольного filesystem API нет: save принимает только зарегистрированный case resource, revision и известные поля; initialize принимает только session ID. Разрешены минимальные core event/window права для защиты черновика при закрытии.

### Просмотр, редактор и инициализация

Можно открыть репозиторий через native picker или список недавних, обновить каталог или закрыть сессию; просматривать дерево кейсов, описание папок, метаданные и содержимое кейсов, а также список прогонов, сведения и sidecar-результаты. Предупреждения каталогов показываются ограниченными порциями. Если отсутствует `.casewright/config.yaml`, приложение сообщает об этом и не создаёт конфигурацию. Backend возвращает последнюю доступную workspace; переключение области сразу меняет каталог, а сохранение предпочтения выполняется отдельно и best-effort с возможностью повтора. Ошибка истории не блокирует picker. Существующий кейс с корректным ID и revision можно редактировать и сохранять: displayId, title, slug, status, tags, Objective, Systems, Setup, Steps и Acceptance Criteria. Dirty draft блокирует смену ресурса/области/repo; диск проверяется каждые две секунды для выбранного кейса. Внешнее изменение не затирает draft; загрузка новой версии требует подтверждения. Ctrl/Cmd+S вызывает тот же single-flight save. Инициализация показывается отдельной кнопкой и требует подтверждения списка файлов; существующая .casewright не перезаписывается. CRUD кейсов/папок, запись прогонов и Git workflow ещё не реализованы. Проверки и ограничения: [editor evidence](evidence/editor.md).

- Наличие редактора и Rust save-tests не подтверждает полный native UI workflow, CRUD, запись прогонов или Git collaboration.
- Windows x64 native production build `tauri build --no-bundle` прошёл в MSVC Developer Environment (Rust 1.98.1, Tauri 2.12.3); Rust fmt/clippy/tests прошли, generated ACL schema создана. Native окно запущено в обычном desktop-процессе; IPC вернул проверенные данные `0.1.0 / Windows / x64`. Подробности и границы проверки: [Windows foundation evidence](evidence/windows-foundation.md). macOS arm64 build/run и installers не проверены.
- Headless Chromium тесты покрывают UI просмотра, редактирования/save и инициализации с mock IPC; полный native picker → repository → case/run flow не проверен. Native Windows window и runtime diagnostics подтверждены отдельно; macOS arm64 build/window и installers не проверены. Остальные сценарии и native приёмка новых команд остаются незавершёнными.
- Read-only service перечисляет только объявленные workspaces и зарегистрированные opaque resource IDs; произвольный file read не является catalog API. Каталог ограничен 20 000 посещённых элементов, глубиной 64 и 32 MiB суммарного чтения; case — 2 MiB, run details/folder note — 1 MiB, `.order` — 256 KiB. Symlink/junction components отвергаются, но canonical checks не устраняют внешние TOCTOU races. Service держит session registry lock на время чтения/обхода, поэтому отмена/закрытие долгой операции пока не поддержаны.
- Без `.order` имена сортируются детерминированно по lowercase и исходному имени; это не полная locale-aware сортировка JavaScript для Unicode. Явный `.order` сохраняет заданный порядок.
- Rust toolchain закреплён в корневом `rust-toolchain.toml`, Node — в `.node-version`; Cargo.lock и pnpm-lock.yaml ведутся соответствующими инструментами.

Реализован поиск title/displayId и совместные status/tag filters текущей workspace; сохраняются родительские папки и текущий reader/draft. Закрытие «Сохранить и выйти» ждёт успешной записи. Актуальные проверки: [editor evidence](evidence/editor.md).

Создание, дублирование, перемещение и подтверждаемое удаление кейсов подключены через `create_case`/`organize_case`, отдельные custom permissions и scoped opaque folder/case IDs. Existing order/notes/run snapshots/index не переписываются. Проверки и ограничения: [case operations](evidence/case-operations.md).

Создание snapshot run и просмотр полного readonly source snapshot подключены через `create_run`. Source revisions входят в catalog, publication не заменяет существующий run. Проверки и формат `.source`: [run creation](evidence/run-creation.md).

## Run execution update

Реализованы явное сохранение результатов, per-item отметок и пояснений, tester/time/date override и Notes sidecar, а также open/closed, Summary/Notes самого прогона с сохранением approvals/date/unknown metadata. Запись использует optimistic SHA256 и atomic replacement. Черновик удерживается при ошибке/внешнем изменении. Проверки и ограничения: [Run execution](evidence/run-execution.md). Native UI и macOS не объявлены проверенными.

## Run workflow update

Добавлены таблица результатов с pagination/search/filter и пошаговое выполнение snapshot-кейсов. Failed save удерживает draft; переход к следующему pending кейсу выполняется только после успешной записи. Проверки и сценарий: [Run grid and guide](evidence/run-workflow.md). Native приёмка новых режимов остаётся открытой.

## Git inspection update

Добавлены readonly Git status/branch/upstream/ahead-behind и выбранный staged/unstaged diff через scoped typed IPC. Просмотр не изменяет index/историю; добавлен явный commit выбранных сохранённых продуктовых файлов с сохранением foreign staged entries и отдельным подтверждением. Pull/push/abort ещё не реализованы. Проверки, лимиты и setup: [Git inspection](evidence/git-inspection.md). Native приёмка новых сценариев остаётся открытой.

## Git synchronization update

Добавлены подтверждаемые pull/push текущей настроенной ветки и явный safe abort app-owned merge. Конфликты показываются без UI разрешения; внешние правки или отказ abort блокируют продолжение. Проверки, ограничения Git configuration и native приёмки: [Git synchronization](evidence/git-sync.md).
