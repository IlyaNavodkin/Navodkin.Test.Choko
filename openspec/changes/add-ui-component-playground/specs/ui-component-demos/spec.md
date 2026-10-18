# Spec Delta

## Purpose

Позволить проверять фактическое поведение компонентов локальной библиотеки через осмысленные варианты, интерактивные controls и обратимые локальные сценарии.

## ADDED Requirements

### Requirement: Реальные props и варианты

Каждый визуальный экспорт SHALL иметь рабочую демонстрацию согласно `coverage-matrix.md`, минимум два осмысленных варианта или состояния и controls, влияющие на поддерживаемые props либо окружение композиции. Статические primitives SHALL иметь controls для реальных размеров, текста, slots или окружения. Показанное состояние SHALL соответствовать фактическому выводу.

#### Scenario: Props меняют вывод
- **WHEN** пользователь меняет Button variant/size/loading или Progress value/tone
- **THEN** меняются реальная кнопка или полоса; value Progress 0…1 показывается как 0…100%, loading предотвращает повторное действие

#### Scenario: Нет подходящего prop
- **WHEN** открыт `MenuSeparator` или `PageHeaderCopy` без самостоятельного state API
- **THEN** controls меняют окружение рабочей композиции и описание объясняет роль экспорта, не приписывая ему несуществующий prop

### Requirement: Формы и ошибки

Формы SHALL поддерживать ввод, переключение и отображение актуальных значений; disabled/readOnly/loading SHALL демонстрироваться только там, где их поддерживает API. Ошибка SHALL возникать от локальной проверки и исчезать после исправления, с доступной связью поля и сообщения. Примеры SHALL включать свободный ввод и ограниченный выбор.

#### Scenario: Изменение значений
- **WHEN** пользователь вводит текст, переключает Checkbox/Toggle и выбирает Select option
- **THEN** controls и output показывают новые значения; disabled option не выбирается; заблокированное поле не меняет значение

#### Scenario: Локальная ошибка
- **WHEN** пользователь подтверждает форму с пустым обязательным полем, затем исправляет значение
- **THEN** сначала виден ErrorLabel с доступной связью поля, затем сообщение исчезает и выводится локальный результат без HTTP запроса

### Requirement: Рабочие compound components

Compound exports SHALL демонстрироваться внутри требуемых родителей: Menu family, Popover family, Tabs/Tab, ButtonGroup family, FloatingToolbar family, FilterChipGroup/FilterChip и PageShell family. Выбор дочернего экспорта SHALL показывать его роль в композиции. Ссылки и действия SHALL завершаться локальным изменением или сообщением без внешней авторизации.

#### Scenario: Открытие меню
- **WHEN** пользователь открывает MenuTrigger, выбирает enabled MenuItem и повторяет попытку с disabled item
- **THEN** меню открывается с MenuLabel и MenuSeparator, enabled action меняет output и закрывает меню, disabled item не выполняет действие

#### Scenario: Переключение контента
- **WHEN** пользователь выбирает Tab или PageSegment
- **THEN** выбранное состояние и соответствующий контент меняются вместе, label и controls соответствуют активной панели

#### Scenario: Локальная ссылка
- **WHEN** пользователь активирует PageSsoLink или PageRowBody
- **THEN** показан локальный результат demo, без перехода к реальному SSO или перезагрузки приложения

### Requirement: Overlay и focus

Modal, ConfirmDialog, Menu, Popover и Select SHALL открываться и закрываться через реальные triggers; output SHALL отражать выбранное действие. Keyboard, Escape, outside click, disabled items и восстановление focus SHALL проверяться с учётом поддерживаемой семантики компонента. Modal SHALL удерживать focus внутри во время открытия.

#### Scenario: Диалог с клавиатуры
- **WHEN** пользователь открывает Modal через Enter, проходит Tab/Shift+Tab и нажимает Escape
- **THEN** focus остаётся внутри открытого диалога, после закрытия возвращается к trigger, прокрутка страницы восстанавливается

#### Scenario: Confirm pending и ошибка
- **WHEN** в ConfirmDialog запускается локальное подтверждение с имитацией задержки или ошибки
- **THEN** pending отключает повторное подтверждение и закрытие; успех закрывает dialog и обновляет fixture, ошибка снимает pending и показывает сообщение, позволяя повторить

#### Scenario: Popover у края
- **WHEN** открытый Popover находится у края окна и окно меняет размер
- **THEN** содержимое остаётся доступным, Escape и outside click закрывают его, focus возвращается к trigger

### Requirement: Данные, selection и перемещение

Table SHALL использовать типизированные fixtures с сортировкой, пагинацией, controlled selection, disabled row, search/filter и empty состоянием. FileTree SHALL поддерживать раскрытие, выбор, row actions и обратимое перемещение fixture. DragAndDrop SHALL изменять порядок fixture и иметь consumer-действия перемещения с клавиатуры.

#### Scenario: Таблица на нескольких страницах
- **WHEN** пользователь сортирует строки, меняет страницу, выбирает строки и очищает selection через toolbar или SelectionBar
- **THEN** порядок, диапазон и selected count совпадают с отображаемыми данными; disabled row не выбирается; очистка снимает selection

#### Scenario: Пустой фильтр таблицы
- **WHEN** поиск таблицы исключает все fixtures
- **THEN** показано empty состояние без устаревших строк; очистка фильтра восстанавливает данные

#### Scenario: Дерево и недопустимое перемещение
- **WHEN** пользователь раскрывает папку, выбирает файл, перемещает его в другую папку, затем пытается переместить папку в её потомка
- **THEN** допустимое действие меняет локальную структуру; цикл отклоняется и fixture сохраняется; файловая система не затрагивается

#### Scenario: Порядок списка без мыши
- **WHEN** пользователь нажимает доступное действие «Вверх» для элемента DragAndDrop demo
- **THEN** элемент перемещается в fixture и видимый список показывает новый порядок; reset возвращает начальный порядок

### Requirement: Layout и feedback

Layout examples SHALL показывать resize, collapse, scroll и slots в достаточной области. Feedback examples SHALL показывать реальные loading/empty/error и status варианты. ToastHost SHALL демонстрировать info/error с управляемым dismiss; BlockingOverlayHost SHALL автоматически освобождать интерфейс не позднее двух секунд и возвращать focus.

#### Scenario: Resize и collapse
- **WHEN** пользователь двигает SplitPane/ResizeHandle мышью или стрелками и сворачивает FloatingToolbar
- **THEN** размеры остаются в заданных пределах, панель меняется, скрытые controls не доступны через Tab; после reset начальные размеры восстановлены

#### Scenario: Toast жизненный цикл
- **WHEN** пользователь показывает info/error toast и нажимает dismiss либо ждёт указанное время
- **THEN** сообщение появляется в единственном host справа снизу и затем исчезает; reset убирает все созданные demo toasts

#### Scenario: Блокирующий пример
- **WHEN** пользователь включает BlockingOverlayHost demo
- **THEN** показан реальный blocking overlay с сообщением; он автоматически исчезает не позднее двух секунд, focus возвращается к trigger и каталог снова доступен

### Requirement: Media и upload без внешних эффектов

Media SHALL использовать локальные fixtures; воспроизведение SHALL начинаться только после явного действия. AudioWaveform recording SHALL быть явно обозначенной симуляцией, без доступа к устройствам. UploadDropzone SHALL принимать локальный выбор/drop, показывать metadata, rejection, simulated progress/error/retry/remove без отправки файлов. Camera/microphone SHALL не запрашиваться.

#### Scenario: Аудио
- **WHEN** пользователь нажимает Play в SoundPlayer, затем Pause, Seek, Volume и Next
- **THEN** локальное аудио и отображаемое время/volume меняются вместе; переход переключает локальный fixture; до Play звук не воспроизводится

#### Scenario: Запрет браузером
- **WHEN** локальный audio playback завершается ошибкой или недоступен
- **THEN** появляется понятное сообщение, playing возвращается в false и доступны retry/reset без необработанного promise rejection

#### Scenario: Выбор и отказ файла
- **WHEN** пользователь выбирает подходящий файл, затем файл неверного типа или превышающий лимит
- **THEN** первый появляется как metadata и проходит simulated stages; второй получает конкретную причину rejection; содержимое файлов не отправляется и не сохраняется на диск

#### Scenario: Симуляция записи
- **WHEN** пользователь нажимает Record в AudioWaveform
- **THEN** изменяются recording state и synthetic samples с подписью «Симуляция записи»; запрос доступа к микрофону не возникает

### Requirement: Сброс и изоляция

Действие «Сбросить пример» SHALL возвращать props, локальные values, fixtures, selection, размеры и output к начальным значениям. При reset, смене экспорта и размонтировании SHALL закрываться overlays, останавливаться audio, очищаться timers/object URLs и demo-owned store effects. Состояние других demo SHALL не наследоваться.

#### Scenario: Сброс сложного примера
- **WHEN** после сортировки/выбора/перемещения/изменения props пользователь нажимает reset
- **THEN** восстановлены документированные defaults, исходный fixture и пустой action output; сохранены поиск и выбранный export

#### Scenario: Переключение во время эффекта
- **WHEN** пользователь покидает пример во время simulated upload, pending confirmation или playback
- **THEN** старые эффекты не обновляют новый пример, audio останавливается, overlay исчезает и body scroll/focus восстановлены

### Requirement: Локальная диагностика ошибки demo

Ошибка рендера отдельного demo SHALL оставлять каталог доступным и показывать имя экспорта, понятное сообщение и reset/retry. Имитация ошибки SHALL явно отличаться подписью от сбоя примера. Ошибочный пример SHALL не считаться прошедшим runtime-проверку.

#### Scenario: Ошибка компонента
- **WHEN** отдельный demo выбрасывает ошибку при рендере
- **THEN** sidebar и поиск работают, справа показана диагностика с reset/retry; в отчёте проверки зафиксирован failure

#### Scenario: Управляемая ошибка fixture
- **WHEN** включён вариант simulated error в upload или форме
- **THEN** пользователь видит ожидаемую ошибку сценария и может восстановить успешное состояние без перезагрузки каталога
