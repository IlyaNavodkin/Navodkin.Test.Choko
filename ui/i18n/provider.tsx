/**
 * Library-owned i18n runtime.
 *
 * The UI package is Russian-first: `ru` is the default language. Products may
 * wrap their tree in `I18nProvider` to override the language and/or individual
 * messages. `useI18n` never throws and never returns `undefined`, so every
 * library component works standalone (without a provider) using the built-in
 * dictionaries.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export type I18nContextValue = {
  t: TranslateFn;
  language: string;
  setLanguage: (language: string) => void;
};

export const DEFAULT_LANGUAGE = 'ru';

/** Russian dictionary — the default language of the library. */
export const UI_MESSAGES_RU: Record<string, string> = {
  // Legacy audio / table / dialog keys
  seekAudio: 'Перемотка аудио',
  record: 'Запись',
  stopRecording: 'Остановить запись',
  playRecording: 'Воспроизвести запись',
  pausePlayback: 'Пауза',
  pause: 'Пауза',
  play: 'Воспроизвести',
  loading: 'Загрузка',
  change: 'Изменить',
  confirm: 'Подтвердить',
  cancel: 'Отмена',
  close: 'Закрыть',
  dialog: 'Диалог',
  selectValue: 'Выберите значение',
  noDevices: 'Нет доступных элементов',
  playbackPosition: 'Позиция воспроизведения',
  playbackVolume: 'Громкость воспроизведения',
  previousRecording: 'Предыдущая запись',
  nextRecording: 'Следующая запись',
  tableRange: '{start}–{end} из {total}',
  previousPage: 'Предыдущая страница',
  nextPage: 'Следующая страница',
  rowsPerPage: 'Строк на странице',

  // Generic primitives
  noData: 'Нет данных',
  dropFilesHere: 'Перетащите файлы сюда',
  browse: 'Выбрать',
  expandAll: 'Развернуть всё',
  collapseAll: 'Свернуть всё',
  resizePanel: 'Изменить размер панели',
  remove: 'Удалить',
  fileTree: 'Дерево файлов',
  upload: 'Загрузить',
  uploading: 'Загрузка',
  uploadFailed: 'Не удалось загрузить',
  retry: 'Повторить',
  search: 'Поиск',
  clear: 'Очистить',
  selectAll: 'Выбрать все',
  selected: 'выбрано',
  actions: 'Действия',
  more: 'Ещё',
  emptyFolder: 'Папка пуста',
  rename: 'Переименовать',
  download: 'Скачать',
  breadcrumb: 'Навигационная цепочка',

  // Menus, selection and view controls
  menu: 'Меню',
  moreActions: 'Ещё действия',
  openMenu: 'Открыть меню',
  selectAllRows: 'Выбрать все строки',
  selectRow: 'Выбрать строку',
  clearSelection: 'Снять выделение',
};

/** English dictionary. */
export const UI_MESSAGES_EN: Record<string, string> = {
  seekAudio: 'Seek audio',
  record: 'Record',
  stopRecording: 'Stop recording',
  playRecording: 'Play recording',
  pausePlayback: 'Pause',
  pause: 'Pause',
  play: 'Play',
  loading: 'Loading',
  change: 'Change',
  confirm: 'Confirm',
  cancel: 'Cancel',
  close: 'Close',
  dialog: 'Dialog',
  selectValue: 'Select a value',
  noDevices: 'No items available',
  playbackPosition: 'Playback position',
  playbackVolume: 'Playback volume',
  previousRecording: 'Previous recording',
  nextRecording: 'Next recording',
  tableRange: '{start}–{end} of {total}',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  rowsPerPage: 'Rows per page',

  noData: 'No data',
  dropFilesHere: 'Drop files here',
  browse: 'Browse',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  resizePanel: 'Resize panel',
  remove: 'Remove',
  fileTree: 'File tree',
  upload: 'Upload',
  uploading: 'Uploading',
  uploadFailed: 'Upload failed',
  retry: 'Retry',
  search: 'Search',
  clear: 'Clear',
  selectAll: 'Select all',
  selected: 'selected',
  actions: 'Actions',
  more: 'More',
  emptyFolder: 'Folder is empty',
  rename: 'Rename',
  download: 'Download',
  breadcrumb: 'Breadcrumb',

  menu: 'Menu',
  moreActions: 'More actions',
  openMenu: 'Open menu',
  selectAllRows: 'Select all rows',
  selectRow: 'Select row',
  clearSelection: 'Clear selection',
};

/** Base dictionaries keyed by language tag. */
const BASE_MESSAGES: Record<string, Record<string, string>> = {
  ru: UI_MESSAGES_RU,
  en: UI_MESSAGES_EN,
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

function createTranslate(
  language: string,
  messages?: Record<string, string>,
): TranslateFn {
  const base = BASE_MESSAGES[language] ?? UI_MESSAGES_RU;
  return (key, params) => {
    const template = messages?.[key] ?? base[key] ?? key;
    return interpolate(template, params);
  };
}

/** Fallback used when no provider is mounted: Russian, no-op setLanguage. */
const fallbackValue: I18nContextValue = {
  t: createTranslate(DEFAULT_LANGUAGE),
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
};

const I18nContext = createContext<I18nContextValue | null>(null);

export type I18nProviderProps = {
  children: ReactNode;
  language?: string;
  messages?: Record<string, string>;
  onLanguageChange?: (language: string) => void;
};

/** Optional provider that supplies language/message overrides to the library. */
export function I18nProvider({
  children,
  language = DEFAULT_LANGUAGE,
  messages,
  onLanguageChange,
}: I18nProviderProps): ReactElement {
  const [currentLanguage, setCurrentLanguage] = useState(language);

  useEffect(() => {
    setCurrentLanguage(language);
  }, [language]);

  const setLanguage = useCallback(
    (nextLanguage: string) => {
      setCurrentLanguage(nextLanguage);
      onLanguageChange?.(nextLanguage);
    },
    [onLanguageChange],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      t: createTranslate(currentLanguage, messages),
      language: currentLanguage,
      setLanguage,
    }),
    [currentLanguage, messages, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Access the translation function. Never throws and never returns `undefined`:
 * without a provider it falls back to the built-in Russian dictionary.
 */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext) ?? fallbackValue;
}
