import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, Modal, ModalBody, ModalFooter, ModalHeader, Select, Textarea } from '@/components/ui';
import { useApp } from '@/store/app-store';

/**
 * Edit a workspace's name + description. The dropdown lists every workspace; `add`
 * pre-selects the freshly-declared one, `edit` pre-selects the active workspace.
 */
export function WorkspaceModal() {
  const ctx = useApp();
  const close = () => ctx.setModal(null);
  const workspaces = ctx.workspaces;

  // Fall back to the first workspace when the preferred id no longer exists (e.g. it was
  // removed externally while the modal was closed) so the dropdown never shows a stale value.
  const preferred = ctx.wsModalId ?? ctx.workspace?.id;
  const initialId = (workspaces.find((w) => w.id === preferred) ?? workspaces[0])?.id ?? '';
  const [wsId, setWsId] = useState(initialId);
  const current = workspaces.find((w) => w.id === wsId);
  const [name, setName] = useState(current?.name ?? '');
  const [description, setDescription] = useState(current?.description ?? '');

  // Switching the dropdown loads that workspace's current fields.
  const onSelect = (id: string) => {
    const w = workspaces.find((x) => x.id === id);
    setWsId(id);
    setName(w?.name ?? '');
    setDescription(w?.description ?? '');
  };

  const save = () => {
    if (!current || !name.trim()) return;
    ctx.updateWorkspace(wsId, { name: name.trim(), description: description.trim() });
    close();
  };

  return (
    <Modal onClose={close}>
      <ModalHeader>
        <span className="grid place-items-center text-accent">{I.workspace({ size: 18 })}</span>
        <h3>Edit workspace</h3>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Workspace">
          <Select value={wsId} onChange={(e) => onSelect(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.path ? ` — ${w.path}` : ' — repo root'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name">
          <Input value={name} placeholder="Workspace name" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            rows={3}
            placeholder="Optional — what this workspace covers"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!current || !name.trim()} onClick={save}>
          {I.check({ size: 14 })} Save
        </Button>
      </ModalFooter>
    </Modal>
  );
}
