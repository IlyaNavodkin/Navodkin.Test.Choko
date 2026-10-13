import { useState } from 'react';
import { I } from '@/components/icons';

export interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, onChange }: TagEditorProps) {
  const [adding, setAdding] = useState('');
  const commit = () => {
    const t = adding.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setAdding('');
  };
  return (
    <div className="flex flex-wrap items-center gap-[5px]">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-[3px] rounded-sm border border-accent-line bg-accent-soft py-px pl-[7px] pr-1 font-mono text-[11px] text-accent-ink"
        >
          <span className="font-mono opacity-60">#</span>
          {t}
          <button
            className="grid place-items-center rounded-[3px] p-px text-accent-ink opacity-60 hover:bg-[oklch(0.88_0.05_256)] hover:opacity-100"
            onClick={() => onChange(tags.filter((x) => x !== t))}
          >
            {I.x({ size: 11 })}
          </button>
        </span>
      ))}
      <input
        className="h-[22px] w-[84px] rounded-sm border border-dashed border-border-2 bg-transparent px-1.5 py-px font-mono text-[11px] focus:border-solid focus:border-accent focus:outline-none"
        placeholder="+ tag"
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Backspace' && !adding && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={commit}
      />
    </div>
  );
}
