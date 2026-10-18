import { useRef, useState } from 'react';
import { useZodForm } from '../../../shared/forms/useZodForm';
import { defaultGlossaryFilters, emptyGlossaryDraft, filterGlossary, glossaryDraft, glossaryFixtures, nextRevision } from './fixtures';
import { gt } from './messages';
import { glossarySchema, parseEnvironmentValues } from './schema';
import type { GlossaryDraft, GlossaryEntry, GlossaryFilters } from './types';
export type UsePreviewGlossaryArgs = { repository: number; blocked: boolean; failSave: boolean };
export type UsePreviewGlossaryResult = ReturnType<typeof useGlossaryState>;
function useGlossaryState({ repository, blocked, failSave }: UsePreviewGlossaryArgs) {
  const [entries, setEntries] = useState(() => glossaryFixtures(repository));
  const [selectedId, setSelectedId] = useState<string | null>(() => glossaryFixtures(repository)[0]?.id ?? null);
  const [newId, setNewId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [filters, setFilters] = useState<GlossaryFilters>(defaultGlossaryFilters);
  const [saving, setSaving] = useState(false); const pending = useRef(false);
  const [notice, setNotice] = useState('');
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const form = useZodForm<GlossaryDraft>({ initialValues: selected ? glossaryDraft(selected) : emptyGlossaryDraft(), schema: glossarySchema, invalidMessage: gt('invalid') });
  const dirty = editing && (newId !== null || (selected !== null && JSON.stringify(form.values) !== JSON.stringify(glossaryDraft(selected))));
  function selectEntry(id: string) {
    if (pending.current) return;
    const entry = entries.find((entry) => entry.id === id); if (!entry) return;
    setSelectedId(id); setNewId(null); setEditing(false); form.reset(glossaryDraft(entry)); setNotice('');
  }
  function create() {
    if (blocked || pending.current) return;
    setNewId(crypto.randomUUID()); setSelectedId(null); setEditing(true); form.reset(emptyGlossaryDraft()); setNotice('');
  }
  function discard() {
    if (pending.current) return;
    setNewId(null); setEditing(false); form.reset(selected ? glossaryDraft(selected) : emptyGlossaryDraft()); setNotice('');
  }
  async function persist(archive?: boolean): Promise<boolean> {
    if (blocked || pending.current) { setNotice(gt('blocked')); return false; }
    if (archive !== undefined && (!selected || editing)) return false;
    if (archive === undefined && !dirty) { setEditing(false); return true; }
    const values = archive === undefined ? form.validate() : selected ? glossaryDraft(selected) : null;
    const id = newId ?? selected?.id; if (!values || !id) return false;
    pending.current = true; setSaving(true); setNotice('');
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      if (failSave) { setNotice(gt('failed')); return false; }
      const content = archive !== undefined || newId !== null ? selected?.revision ?? 'rev-1' : nextRevision(selected?.revision ?? 'rev-1');
      const entry: GlossaryEntry = {
        id, title: values.title, kind: values.kind, aliases: values.aliases.split(',').map((value) => value.trim()).filter(Boolean),
        description: values.description, url: values.url, archived: archive ?? selected?.archived ?? false,
        // Archiving keeps the content revision: a taken snapshot stays valid after a restore.
        revision: content,
        ...(values.kind === 'environment' ? { values: parseEnvironmentValues(values.values).values } : {}),
      };
      setEntries((previous) => previous.some((item) => item.id === id) ? previous.map((item) => item.id === id ? entry : item) : [...previous, entry]);
      setSelectedId(id); setNewId(null); setEditing(false); form.reset(glossaryDraft(entry)); setNotice(gt('saved')); return true;
    } finally { pending.current = false; setSaving(false); }
  }
  return { entries, selected, newId, editing, filters, setFilters, visibleEntries: filterGlossary(entries, filters),
    values: form.values, errors: { ...form.errors,
      ...(form.errors.title && { title: gt('titleRequired') }),
      ...(form.errors.description && { description: gt('descriptionRequired') }),
      ...(form.errors.url && { url: gt('urlInvalid') }),
      ...(form.errors.values && { values: form.values.kind === 'environment' ? gt('valuesInvalid') : gt('valuesForbidden') }),
    }, dirty, saving, blocked, notice, selectEntry, create, discard,
    edit: () => { if (!blocked && !pending.current && selected) { setEditing(true); form.reset(glossaryDraft(selected)); setNotice(''); } },
    update: <K extends keyof GlossaryDraft>(key: K, value: GlossaryDraft[K]) => {
      if (blocked || pending.current) return;
      if (key === 'kind') { form.setFieldValue('kind', value as GlossaryDraft['kind']); if (value !== 'environment') form.setFieldValue('values', ''); return; }
      form.setFieldValue(key, value);
    },
    save: () => persist(), toggleArchive: () => persist(!selected?.archived),
  };
}
export function usePreviewGlossary(args: UsePreviewGlossaryArgs): UsePreviewGlossaryResult { return useGlossaryState(args); }
