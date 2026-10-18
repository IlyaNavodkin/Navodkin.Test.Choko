import { useEffect, useRef, useState } from 'react';
import { CaseEditSchema, type CaseDocument, type CaseEdit } from '../../api/contracts';
import { repositoryApi, type RepositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';
import { useZodForm } from '../../../shared/forms/useZodForm';
export type UseEditCaseArgs = { document: CaseDocument; sessionId: string; resourceId: string; invalidMessage: string; onBlockedChange: (blocked: boolean) => void; onSavingChange?: (saving: boolean) => void; onDocumentChange: (document: CaseDocument) => void; api?: RepositoryApi };
function editFrom(document: CaseDocument): CaseEdit { const { id: _id, ...edit } = document.model; return edit; }
export function useEditCase({ document, sessionId, resourceId, invalidMessage, onBlockedChange, onSavingChange, onDocumentChange, api = repositoryApi }: UseEditCaseArgs) {
  const form = useZodForm({ initialValues: editFrom(document), schema: CaseEditSchema, invalidMessage });
  const [baseline, setBaseline] = useState(document);
  const [isEditing, setEditing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const [externalDocument, setExternalDocument] = useState<CaseDocument | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form.values) !== JSON.stringify(editFrom(baseline));
  const blocked = dirty || isSaving || discardOpen;
  const mounted = useRef(true); const flight = useRef(false); const generation = useRef(0);
  const saveShortcut = useRef<(() => Promise<boolean>) | null>(null);
  const latest = useRef({ dirty, isSaving, baseline, onDocumentChange }); latest.current = { dirty, isSaving, baseline, onDocumentChange };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; onBlockedChange(false); }; }, [onBlockedChange]);
  useEffect(() => { onBlockedChange(blocked); }, [blocked, onBlockedChange]);
  useEffect(() => { onSavingChange?.(isSaving); return () => onSavingChange?.(false); }, [isSaving, onSavingChange]);
  useEffect(() => { if (!dirty && !isSaving && document.revision !== baseline.revision) { setBaseline(document); form.reset(editFrom(document)); } }, [document, dirty, isSaving, baseline.revision, form.reset]);
  useEffect(() => {
    let disposed = false; let polling = false;
    const timer = setInterval(() => {
      if (polling || flight.current || !latest.current.baseline.revision) return;
      polling = true; const version = generation.current;
      void api.readCase(sessionId, resourceId).then((next) => {
        if (disposed || version !== generation.current || !next.revision || next.revision === latest.current.baseline.revision) return;
        if (latest.current.dirty || latest.current.isSaving) setExternalDocument(next);
        else { setBaseline(next); form.reset(editFrom(next)); latest.current.onDocumentChange(next); setSaved(false); }
      }).catch((error: unknown) => { if (!disposed && version === generation.current) setErrorCode(api.errorCodeFrom(error)); }).finally(() => { polling = false; });
    }, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, [api, sessionId, resourceId, form.reset]);
  const save = async (): Promise<boolean> => {
    if (flight.current || !baseline.revision || !baseline.model.id || externalDocument) return false;
    const edit = form.validate(); if (!edit) { setErrorCode('INVALID_CASE_EDIT'); return false; }
    const version = ++generation.current; flight.current = true; setSaving(true); setErrorCode(null); setSaved(false);
    try { const next = await api.saveCase(sessionId, resourceId, baseline.revision, edit); if (!mounted.current || version !== generation.current) return false; setBaseline(next); form.reset(editFrom(next)); onDocumentChange(next); setExternalDocument(null); setSaved(true); return true; }
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
    try { const next = await api.readCase(sessionId, resourceId); if (!mounted.current) return; setBaseline(next); form.reset(editFrom(next)); onDocumentChange(next); setExternalDocument(null); setSaved(false); setEditing(false); setDiscardOpen(false); }
    catch (error: unknown) { if (mounted.current) setErrorCode(api.errorCodeFrom(error)); }
    finally { flight.current = false; if (mounted.current) setSaving(false); generation.current += 1; }
  };
  const setEditableField: typeof form.setFieldValue = (key, value) => { if (!flight.current) form.setFieldValue(key, value); };
  return { form: { ...form, setFieldValue: setEditableField }, isEditing, isSaving, dirty, saved, errorCode, externalDocument, discardOpen, canEdit: Boolean(document.model.id && document.revision), startEditing: () => { setEditing(true); setSaved(false); }, stopEditing: () => { if (dirty) setDiscardOpen(true); else setEditing(false); }, askDiscard: () => setDiscardOpen(true), cancelDiscard: () => setDiscardOpen(false), save, discard };
}
export type UseEditCaseResult = ReturnType<typeof useEditCase>;
