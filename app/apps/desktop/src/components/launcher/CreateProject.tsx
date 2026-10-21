import { useId, useState } from 'react';
import { I } from '@/components/icons';
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui';
import { pickDirectory } from '@/lib/nwjs';
import { projectFolderName } from '@/services/project';
import { useApp } from '@/store/app-store';

export function CreateProject({ onClose }: { onClose: () => void }) {
  const ctx = useApp();
  const id = useId();
  const [name, setName] = useState('');
  const [parentPath, setParentPath] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const target = `${parentPath.replace(/[\\/]+$/, '')}/${name.trim() || 'название-проекта'}`;
  const chooseFolder = async () => { const folder = await pickDirectory(); if (folder) setParentPath(folder); };
  return <Modal title="Создать проект" onClose={onClose} dismissable={!ctx.loading}>
    <form className="flex min-h-0 flex-col" onSubmit={(event) => {
      event.preventDefault();
      try { projectFolderName(name); setValidation(null); }
      catch (error) { setValidation(error instanceof Error ? error.message : String(error)); return; }
      void ctx.createProject({ name, parentPath }).then((created) => { if (created) onClose(); });
    }}>
      <ModalHeader><h3>Создать проект</h3><Button aria-label="Закрыть" className="ml-auto" variant="ghost" size="sm" disabled={ctx.loading} onClick={onClose}>{I.x({ size: 16 })}</Button></ModalHeader>
      <ModalBody className="flex flex-col gap-5">
        <p className="text-[13px] text-ink-3">Название и место хранения — всё, что нужно для начала. GitHub и подключение автотестов можно настроить позже.</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-[13px] font-medium">Название проекта</label>
          <Input id={`${id}-name`} autoFocus required disabled={ctx.loading} placeholder="Например, Интернет-магазин" value={name} onChange={(e) => { setName(e.target.value); setValidation(null); }} aria-invalid={!!validation} aria-describedby={validation ? `${id}-validation` : undefined} />
          {validation && <p id={`${id}-validation`} role="alert" className="text-[12px] text-fail">{validation}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-folder`} className="text-[13px] font-medium">Создать в папке</label>
          <div className="flex items-center gap-2"><Input className="min-w-0 flex-1" id={`${id}-folder`} required disabled={ctx.loading} value={parentPath} onChange={(e) => setParentPath(e.target.value)} placeholder="Выберите папку на компьютере" /><Button className="shrink-0" disabled={ctx.loading} onClick={() => void chooseFolder()}>{I.folderOpen({ size: 14 })} Обзор…</Button></div>
          {parentPath && <p className="break-all text-[12px] text-ink-3">Новая папка: <span className="font-mono">{target}</span></p>}
        </div>
        <div className="rounded-lg border border-border bg-panel-2 p-3 text-[12px] leading-relaxed text-ink-3">Choko создаст локальную историю Git и первое рабочее пространство. Файлы проекта будут храниться на вашем компьютере.</div>
        {ctx.error && <p role="alert" className="break-words text-[13px] text-fail">{ctx.error}</p>}
      </ModalBody>
      <ModalFooter><Button disabled={ctx.loading} onClick={onClose}>Отмена</Button><Button type="submit" variant="primary" disabled={ctx.loading || !name.trim() || !parentPath.trim()}>{ctx.loading ? 'Создаём проект…' : 'Создать проект'}</Button></ModalFooter>
    </form>
  </Modal>;
}
