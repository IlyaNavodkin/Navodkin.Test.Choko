import { useState } from 'react';
import { Button, Input, Modal } from '@codaa/ui';
import { rt } from './referenceMessages';
import styles from './SectionMarkdownEditor.module.css';
export type ReferenceOption = { id: string; title: string; aliases: string[]; description: string; kind: string; href: string };

export function markdownReference(label: string, href: string): string {
  return `[${label.replace(/([\\\[\]])/g, '\\$1')}](${href})`;
}
export function ReferencePicker({ options, onPick, onClose }: { options: ReferenceOption[]; onPick: (option: ReferenceOption) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase('ru');
  const matches = options.filter((entry) => [entry.title, ...entry.aliases, entry.description].some((text) => text.toLocaleLowerCase('ru').includes(query)));
  return <Modal open title={rt('insert')} onOpenChange={(open) => { if (!open) onClose(); }} actions={<Button onClick={onClose}>{rt('cancel')}</Button>}>
    <Input autoFocus aria-label={rt('search')} placeholder={rt('search')} value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className={styles.referenceOptions}>{matches.length ? matches.map((entry) => <Button key={entry.id} variant="ghost" onClick={() => onPick(entry)}><span><strong>{entry.title}</strong><small>{entry.kind} · {entry.description}</small></span></Button>) : <p role="status">{rt('empty')}</p>}</div>
  </Modal>;
}
