const ru = {
  read: 'Чтение', edit: 'Редактировать', mode: 'Режим кейса', draft: 'Несохранённый черновик',
  insert: 'Из справочника', search: 'Поиск в справочнике', empty: 'Нет активных записей', cancel: 'Отмена',
  missing: 'Запись не найдена', close: 'Закрыть', open: 'Открыть в справочнике', archived: 'Архивная запись',
  aliases: 'Другие названия', unresolved: 'Ссылка не разрешена в справочнике текущего репозитория. Файл не открывается.', task: 'Задача', diagnostics: 'Диагностика ссылки',
} as const;
export const rt = (key: keyof typeof ru): string => ru[key];
