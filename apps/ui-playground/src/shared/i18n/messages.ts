const ru = {
  catalog: 'Каталог компонентов', search: 'Найти компонент или группу', reset: 'Сбросить пример',
  empty: 'Ничего не найдено', emptyHint: 'Измените запрос или очистите поиск.', clear: 'Очистить',
  playground: 'UI Playground', local: 'Локальные примеры · @codaa/ui', controls: 'Настройки примера',
  example: 'Рабочий пример', output: 'Результат действия', initial: 'Действий пока нет',
  variants: 'Варианты и состояния', behavior: 'Что проверить', failure: 'Ошибка примера', retry: 'Повторить',
  text: 'Текст', disabled: 'Заблокирован', loading: 'Загрузка', readOnly: 'Только чтение',
  icon: 'Иконка', active: 'Активный', expanded: 'Раскрыт', action: 'Действие', secondary: 'Дополнительно',
  submit: 'Подтвердить локально', required: 'Введите название', name: 'Название', saved: 'Локально подтверждено',
  open: 'Открыть', close: 'Закрыть', simulatedError: 'Имитировать ошибку', simulated: 'Симуляция',
  longer: 'Длинный контент', emptyFixture: 'Пустой fixture', selection: 'Выбор', next: 'Далее', previous: 'Назад',
  title: 'Проверка интерфейса', description: 'Локальный пример без обращения к репозиторию или серверу.',
  count: 'Количество', size: 'Размер', error: 'Имитируемая ошибка. Повторите действие.',
  record: 'Симуляция записи', success: 'Готово', change: 'Изменить', remove: 'Убрать из примера',
  up: 'Вверх', down: 'Вниз', move: 'Переместить файл', invalidMove: 'Проверить защиту от цикла',
  invalid: 'Недопустимое перемещение отклонено', profile: 'Локальный профиль', demo: 'Демо',
  upload: 'Симуляция загрузки · содержимое файлов не читается и не отправляется',
  audioError: 'Аудио недоступно. Выключите имитацию ошибки и повторите Play.',
  online: 'В сети', offline: 'Не в сети', group: 'Группа действий', filter: 'Фильтр',
} as const;
export type MessageKey = keyof typeof ru;
export type Locale = 'ru' | 'en';
const en: Partial<Record<MessageKey, string>> = { catalog: 'Component catalog', reset: 'Reset example', search: 'Find component or group' };
export function t(key: MessageKey, locale: Locale = 'ru'): string { return (locale === 'en' ? en[key] : undefined) ?? ru[key]; }
