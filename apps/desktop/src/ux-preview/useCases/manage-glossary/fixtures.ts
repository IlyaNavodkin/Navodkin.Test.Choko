import { formatEnvironmentValues } from './schema';
import type { GlossaryDraft, GlossaryEntry, GlossaryFilters } from './types';
export const emptyGlossaryDraft = (): GlossaryDraft => ({ title: '', kind: 'term', aliases: '', description: '', url: '', values: '' });
export const glossaryDraft = (entry: GlossaryEntry): GlossaryDraft => ({ title: entry.title, kind: entry.kind, aliases: entry.aliases.join(', '), description: entry.description, url: entry.url, values: formatEnvironmentValues(entry.values) });
export function glossaryFixtures(repository: number): GlossaryEntry[] {
  const rows: Omit<GlossaryEntry, 'id' | 'archived' | 'revision'>[] = repository === 0 ? [
    { title: 'SLA', kind: 'term', aliases: ['Service Level Agreement', 'Соглашение об уровне обслуживания'], description: 'Согласованные показатели доступности и времени ответа платёжного сервиса.', url: '' },
    { title: 'СБП', kind: 'abbreviation', aliases: ['Система быстрых платежей'], description: 'Оплата по QR-коду через приложение банка.', url: '' },
    { title: 'API', kind: 'abbreviation', aliases: ['Application Programming Interface', 'Программный интерфейс'], description: 'Контракт взаимодействия систем. В демо проверяем ответы платёжного API.', url: '' },
    { title: 'Регламент возвратов', kind: 'document', aliases: ['Refund policy'], description: 'Правила полного и частичного возврата. Пример внешнего документа.', url: 'https://example.com/docs/refunds' },
    { title: 'Prod', kind: 'environment', aliases: [], description: 'Боевой стенд платёжного сервиса. Значения подставляются только по явным ссылкам аргументов.', url: '', values: { baseUrl: 'https://pay.example.com', host: '192.0.2.10', retries: 1 } },
    { title: 'Stage', kind: 'environment', aliases: [], description: 'Приёмочный стенд перед релизом.', url: '', values: { baseUrl: 'https://stage.pay.example.com', host: '198.51.100.7', retries: 2 } },
  ] : [
    { title: 'Мобильная сессия', kind: 'term', aliases: ['Mobile session'], description: 'Период работы пользователя в мобильном приложении банка.', url: '' },
    { title: 'Локальный стенд', kind: 'environment', aliases: [], description: 'Локально запущенный стенд мобильного приложения.', url: '', values: { baseUrl: 'http://127.0.0.1:4173', retries: 0 } },
  ];
  return rows.map((row, index) => ({ ...row, id: `00000000-0000-4000-8000-${String(repository * 100 + index + 1).padStart(12, '0')}`, archived: false, revision: 'rev-1' }));
}
/** Content edits advance the revision; archiving keeps it, so a snapshot stays valid after restore. */
export function nextRevision(revision: string): string {
  const match = /^rev-(\d+)$/u.exec(revision);
  return `rev-${match ? Number(match[1]) + 1 : 2}`;
}
export const defaultGlossaryFilters = (): GlossaryFilters => ({ search: '', kind: '', archive: 'active' });
export function filterGlossary(entries: GlossaryEntry[], filters: GlossaryFilters): GlossaryEntry[] {
  const query = filters.search.trim().toLocaleLowerCase('ru');
  return entries.filter((entry) => (!filters.kind || entry.kind === filters.kind)
    && (filters.archive === 'all' || entry.archived === (filters.archive === 'archived'))
    && [entry.title, ...entry.aliases, entry.description, ...Object.keys(entry.values ?? {})].some((value) => value.toLocaleLowerCase('ru').includes(query)));
}
