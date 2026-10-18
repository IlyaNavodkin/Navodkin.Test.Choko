const ru = {
  visual: 'Визуально', source: 'Markdown', expand: 'Развернуть', collapse: 'Свернуть',
  format: 'Форматирование', bold: 'Жирный', italic: 'Курсив', strike: 'Зачёркнутый', heading: 'Заголовок',
  bullet: 'Маркированный список', ordered: 'Нумерованный список', task: 'Список задач', quote: 'Цитата', code: 'Код', codeBlock: 'Блок кода',
  link: 'Ссылка', linkUrl: 'Адрес ссылки', apply: 'Применить', removeLink: 'Убрать ссылку', cancel: 'Отмена', unsafeLink: 'Укажите полный адрес http://, https:// или mailto:.',
  table: 'Таблица', addRow: 'Добавить строку', deleteRow: 'Удалить строку', addColumn: 'Добавить столбец', deleteTable: 'Удалить таблицу', undo: 'Отменить', redo: 'Повторить',
  insert: 'Вставить блок', insertMenu: 'Вставить', hint: 'Введите / для вставки блока', empty: 'Введите текст…', noCommands: 'Нет подходящих блоков',
  unsupported: 'Исходник сохранён. Это содержимое доступно в Markdown: HTML, изображения, сноски, расширения и неподдерживаемые ссылки не преобразуются в визуальный документ.',
  normalized: 'После правки визуального документа разметка и переносы строк могут нормализоваться. Исходник без правок сохраняется точно.',
} as const;
export function mt(key: keyof typeof ru): string { return ru[key]; }
