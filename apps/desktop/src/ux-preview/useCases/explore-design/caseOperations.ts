import { demoCases } from './fixtures';
import type { DemoCase } from './types';
export type CaseOperation = 'newCase' | 'duplicateCase' | 'renameCase' | 'moveCase' | 'deleteCase' | 'newFolder' | 'renameSuite' | 'duplicateSuite' | 'moveSuite' | 'deleteSuite';
export const suiteOperations: CaseOperation[] = ['renameSuite', 'duplicateSuite', 'moveSuite', 'deleteSuite'];
export type OperationFields = { name: string; destination: string };
export type ManifestEntry = { from: string | null; to: string | null };
export type OperationPlan = { revision: number; entries: ManifestEntry[]; cases: DemoCase[]; folders: string[]; affectedIds: string[]; selectId?: string };
export function casePath(item: DemoCase): string { return `cases/${item.folder}/${item.filename ?? `${item.displayId}.md`}`; }
export function validSegment(value: string): boolean { return Boolean(value.trim()) && !/[\\/:*?"<>|]/.test(value) && !value.includes('..') && !value.endsWith('.'); }
export function planIsCurrent(plan: OperationPlan, revision: number): boolean { return plan.revision === revision; }
export function prepareCaseOperation(args: { operation: CaseOperation; fields: OperationFields; selected: DemoCase | null; folder: string; cases: DemoCase[]; folders: string[]; revision: number; allocateId: () => string }): OperationPlan {
  const { operation, fields, selected, folder, revision, allocateId } = args;
  let cases = structuredClone(args.cases); let folders = [...args.folders]; let selectId: string | undefined; const entries: ManifestEntry[] = []; const affectedIds: string[] = [];
  const newFolder = [fields.destination, fields.name.trim()].filter(Boolean).join('/');
  if (operation === 'newCase' || operation === 'duplicateCase') {
    const id = allocateId(); const base = operation === 'duplicateCase' && selected ? structuredClone(selected) : { ...structuredClone(demoCases[0]), objective: '', setup: '', steps: ['Новый шаг'], expected: '', tags: [] };
    const item: DemoCase = { ...base, id, displayId: `DEMO-${id.split('-').at(-1)}`, title: fields.name.trim(), folder: fields.destination, status: 'draft', filename: `${id}.md` };
    cases.push(item); selectId = item.id; if (!folders.includes(item.folder)) folders.push(item.folder); entries.push({ from: null, to: casePath(item) });
  } else if (operation === 'newFolder') {
    folders.push(newFolder); entries.push({ from: null, to: `cases/${newFolder}/` });
  } else if (suiteOperations.includes(operation)) {
    const isInside = (value: string) => value === folder || value.startsWith(`${folder}/`);
    const destination = operation === 'moveSuite' ? [fields.destination, folder.split('/').at(-1)].filter(Boolean).join('/') : newFolder;
    const members = cases.filter((item) => isInside(item.folder)); affectedIds.push(...members.map((item) => item.id));
    for (const item of members) {
      const target = { ...item, folder: destination + item.folder.slice(folder.length) };
      if (operation === 'duplicateSuite') { target.id = allocateId(); target.displayId = `DEMO-${target.id.split('-').at(-1)}`; target.filename = `${target.id}.md`; }
      entries.push({ from: casePath(item), to: operation === 'deleteSuite' ? null : casePath(target) });
      if (operation === 'duplicateSuite') cases.push(target); else if (operation !== 'deleteSuite') cases = cases.map((value) => value.id === item.id ? target : value);
    }
    for (const suffix of ['/.order', '/vendor.txt', '.md']) entries.push({ from: `cases/${folder}${suffix}`, to: operation === 'deleteSuite' ? null : `cases/${destination}${suffix}` });
    if (operation === 'deleteSuite') { cases = cases.filter((item) => !isInside(item.folder)); folders = folders.filter((value) => !isInside(value)); }
    else if (operation === 'duplicateSuite') folders.push(...folders.filter(isInside).map((value) => destination + value.slice(folder.length)));
    else folders = folders.map((value) => isInside(value) ? destination + value.slice(folder.length) : value);
  } else if (selected) {
    affectedIds.push(selected.id);
    const next = { ...selected, ...(operation === 'renameCase' ? { filename: fields.name.trim() } : { folder: fields.destination }) };
    entries.push({ from: casePath(selected), to: operation === 'deleteCase' ? null : casePath(next) });
    cases = operation === 'deleteCase' ? cases.filter((item) => item.id !== selected.id) : cases.map((item) => item.id === selected.id ? next : item);
  }
  return { revision, entries, cases, folders: [...new Set(folders)], affectedIds, selectId };
}
