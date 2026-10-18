import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { RunResource } from '../../api/contracts';
import { repositoryApi, type RepositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';
import { useZodForm } from '../../../shared/forms/useZodForm';
export type RunEditAdapter<R extends RunResource, E extends object> = {
  schema: z.ZodType<E>; toEdit: (resource: R) => E; canEdit: (resource: R) => boolean;
  read: (api: RepositoryApi, sessionId: string, resourceId: string) => Promise<R>;
  save: (api: RepositoryApi, sessionId: string, resourceId: string, revision: string, edit: E) => Promise<R>;
};
export type UseEditRunResourceArgs<R extends RunResource, E extends object> = {
  document: R; initialEditing?: boolean; sessionId: string; resourceId: string; invalidMessage: string;
  onBlockedChange: (blocked: boolean) => void; onSavingChange?: (saving: boolean) => void;
  onDocumentChange: (document: R) => void; api?: RepositoryApi; adapter: RunEditAdapter<R, E>;
};
export function useEditRunResource<R extends RunResource, E extends object>({ document, sessionId, resourceId, invalidMessage, onBlockedChange, onSavingChange, onDocumentChange, adapter, initialEditing = false, api = repositoryApi }: UseEditRunResourceArgs<R, E>) {
  const form = useZodForm({ initialValues: adapter.toEdit(document), schema: adapter.schema, invalidMessage });
  const [baseline, setBaseline] = useState(document);
  const [isEditing, setEditing] = useState(initialEditing);
  const [isSaving, setSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const [externalDocument, setExternalDocument] = useState<R | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form.values) !== JSON.stringify(adapter.toEdit(baseline));
  const blocked = dirty || isSaving || discardOpen;
  const mounted = useRef(true); const flight = useRef(false); const generation = useRef(0);
  const saveShortcut = useRef<(() => Promise<boolean>) | null>(null);
  const latest = useRef({ dirty, isSaving, baseline, onDocumentChange }); latest.current = { dirty, isSaving, baseline, onDocumentChange };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; onBlockedChange(false); }; }, [onBlockedChange]);
  useEffect(() => { onBlockedChange(blocked); }, [blocked, onBlockedChange]);
  useEffect(() => { onSavingChange?.(isSaving); return () => onSavingChange?.(false); }, [isSaving, onSavingChange]);
  useEffect(() => { if (!dirty && !isSaving && document.document.revision !== baseline.document.revision) { setBaseline(document); form.reset(adapter.toEdit(document)); } }, [document, dirty, isSaving, baseline.document.revision, form.reset]);
  useEffect(() => {
    let disposed = false; let polling = false;
    const timer = setInterval(() => {
      if (polling || flight.current || !latest.current.baseline.document.revision) return;
      polling = true; const version = generation.current;
      void adapter.read(api, sessionId, resourceId).then((next) => {
        if (disposed || version !== generation.current || !next.document.revision || next.document.revision === latest.current.baseline.document.revision) return;
        if (latest.current.dirty || latest.current.isSaving) setExternalDocument(next);
        else { setBaseline(next); form.reset(adapter.toEdit(next)); latest.current.onDocumentChange(next); setSaved(false); }
      }).catch((error: unknown) => { if (!disposed && version === generation.current) setErrorCode(api.errorCodeFrom(error)); }).finally(() => { polling = false; });
    }, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, [api, adapter, sessionId, resourceId, form.reset]);
  const save = async (): Promise<boolean> => {
    if (flight.current || !baseline.document.revision || !adapter.canEdit(baseline) || externalDocument) return false;
    const edit = form.validate(); if (!edit) { setErrorCode('INVALID_RUN_EDIT'); return false; }
    const version = ++generation.current; flight.current = true; setSaving(true); setErrorCode(null); setSaved(false);
    try { const next = await adapter.save(api, sessionId, resourceId, baseline.document.revision, edit); if (!mounted.current || version !== generation.current) return false; setBaseline(next); form.reset(adapter.toEdit(next)); onDocumentChange(next); setExternalDocument(null); setSaved(true); return true; }
    catch (error: unknown) { if (mounted.current && version === generation.current) setErrorCode(api.errorCodeFrom(error)); return false; }
    finally { flight.current = false; if (mounted.current) setSaving(false); generation.current += 1; }
  };
  saveShortcut.current = isEditing ? save : null;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS' && saveShortcut.current) { event.preventDefault(); void saveShortcut.current(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const discard = async () => {
    if (flight.current) return;
    flight.current = true; setSaving(true); setErrorCode(null); generation.current += 1;
    try { const next = await adapter.read(api, sessionId, resourceId); if (!mounted.current) return; setBaseline(next); form.reset(adapter.toEdit(next)); onDocumentChange(next); setExternalDocument(null); setSaved(false); setEditing(false); setDiscardOpen(false); }
    catch (error: unknown) { if (mounted.current) setErrorCode(api.errorCodeFrom(error)); }
    finally { flight.current = false; if (mounted.current) setSaving(false); generation.current += 1; }
  };
  const setEditableField: typeof form.setFieldValue = (key, value) => { if (!flight.current) form.setFieldValue(key, value); };
  return { form: { ...form, setFieldValue: setEditableField }, isEditing, isSaving, dirty, saved, errorCode, externalDocument, discardOpen, canEdit: Boolean(adapter.canEdit(document) && document.document.revision), startEditing: () => { setEditing(true); setSaved(false); }, stopEditing: () => { if (dirty) setDiscardOpen(true); else setEditing(false); }, askDiscard: () => setDiscardOpen(true), cancelDiscard: () => setDiscardOpen(false), save, discard };
}
export type UseEditRunResourceResult<R extends RunResource, E extends object> = ReturnType<typeof useEditRunResource<R, E>>;
