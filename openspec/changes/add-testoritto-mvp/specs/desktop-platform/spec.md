# Spec Delta

## Purpose

Обеспечивает работающее десктопное приложение на Windows и macOS с нативными действиями и безопасной границей доступа к системе.

## ADDED Requirements

### Requirement: Tauri desktop foundation
Система SHALL поставляться как Tauri 2 desktop application с React интерфейсом и Rust native backend, без зависимости от Node.js runtime или Node-sidecar на пользовательской машине.

#### Scenario: Installed runtime dependencies
- **WHEN** пользователь запускает установленное приложение с требуемым OS WebView и системным Git, без установленного Node.js
- **THEN** открытие repo, edit/save и Git workflow доступны

### Requirement: Windows and macOS desktop delivery
Система SHALL предоставлять устанавливаемые desktop artifacts для согласованных Windows/macOS targets и поддерживать запуск, выбор repo и основной edit/save/Git workflow на каждой платформе.

#### Scenario: Windows installation
- **WHEN** Windows x64 artifact установлен на согласованной версии ОС
- **THEN** приложение запускается, открывает repo и выполняет edit/save/commit smoke scenario

#### Scenario: macOS installation
- **WHEN** macOS artifact установлен на поддерживаемой архитектуре и версии ОС
- **THEN** приложение запускается, открывает repo и выполняет тот же smoke scenario

### Requirement: Operating system conventions
Система SHALL предоставлять нативный folder picker и platform-appropriate shortcuts и SHALL обрабатывать закрытие окна с pending saves без скрытой потери draft.

#### Scenario: Close with failed pending save
- **WHEN** пользователь закрывает приложение и pending save завершается ошибкой
- **THEN** система сообщает ошибку и запрашивает явный выбор сохранения/отмены/выхода

#### Scenario: macOS keyboard actions
- **WHEN** пользователь выполняет основной shortcut на macOS
- **THEN** действие использует Cmd conventions и соответствует доступной команде интерфейса

### Requirement: Restricted WebView privileges
Система SHALL ограничивать интерфейс разрешённым типизированным API и SHALL NOT предоставлять доступ к произвольным файлам, shell execution, Node runtime или credentials через контент репозитория.

#### Scenario: Hostile Markdown content
- **WHEN** кейс содержит script/HTML или ссылку с исполняемой схемой
- **THEN** его отображение не исполняет системные команды и не предоставляет чтение внешних файлов

#### Scenario: Invalid privileged request
- **WHEN** IPC запрос имеет недопустимого отправителя, payload или repo path
- **THEN** запрос отклоняется до файловой или Git операции

### Requirement: Independent product distribution
Artifacts Testoritto SHALL использовать собственное имя продукта и SHALL NOT обращаться к update endpoints Casewright или содержать встроенные private-repo credentials.

#### Scenario: New installation updater behavior
- **WHEN** запускается новая установка Testoritto
- **THEN** она не скачивает обновления автора исходного приложения и не раскрывает GitHub token
