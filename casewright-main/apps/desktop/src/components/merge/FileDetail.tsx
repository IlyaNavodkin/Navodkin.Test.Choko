import { I } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { MergeFile, Resolutions, Resolution } from '@/types';
import { AutoElement } from './AutoElement';
import { ConflictElement } from './ConflictElement';
import { CsvRowConflict } from './CsvRowConflict';
import { chipAuto, ehName, ehStatus, elemAuto, elemBase, elemHead } from './styles';

export interface FileDetailProps {
  file: MergeFile;
  resolutions: Resolutions;
  setRes: (key: string, value: Resolution) => void;
}

const autoNote =
  'mb-[18px] mt-2.5 flex items-center gap-2 rounded-md border border-[oklch(0.86_0.05_152)] bg-pass-soft px-3 py-2 text-[12px] text-pass';

export function FileDetail({ file, resolutions, setRes }: FileDetailProps) {
  if (file.kind === 'run') {
    const autoRows = file.rows.filter((r) => !r.conflict);
    return (
      <div className="min-h-0 flex-1 overflow-auto px-[22px] pb-10 pt-[18px]">
        <div className="mb-1 flex items-baseline gap-2.5">
          <h4 className="m-0 text-[15px] font-semibold">{file.title}</h4>
        </div>
        <div className="mb-[14px] font-mono text-[12px] text-ink-3">{file.path}</div>
        <div className={autoNote}>
          {I.check({ size: 14 })} {autoRows.length} row(s) auto-merged by <span className="font-mono">case_id</span> — only diverging
          rows need a choice.
        </div>
        {file.rows.map((r, i) =>
          r.conflict ? (
            <CsvRowConflict
              key={i}
              row={r}
              resKey={file.path + '::' + r.case_id}
              res={resolutions[file.path + '::' + r.case_id]}
              setRes={setRes}
            />
          ) : (
            <div key={i} className={cn(elemBase, elemAuto)}>
              <div className={cn(elemHead, 'border-b-0')}>
                <span className={ehName}>
                  <span className="font-mono">{r.display_id}</span>
                </span>
                <span className={ehStatus}>
                  <span className={chipAuto}>
                    {I.check({ size: 12 })} {r.auto === 'same' ? 'unchanged' : 'auto-merged'}
                  </span>
                </span>
              </div>
              {r.reason && (
                <div className="px-[14px] pb-3 pt-1.5 text-[13px] text-ink-2">
                  <div className="mt-1 text-[12px] text-ink-faint">{r.reason}</div>
                </div>
              )}
            </div>
          ),
        )}
      </div>
    );
  }

  const conflicts = file.elements.filter((e) => e.conflict);
  const autos = file.elements.filter((e) => !e.conflict);
  return (
    <div className="min-h-0 flex-1 overflow-auto px-[22px] pb-10 pt-[18px]">
      <div className="mb-1 flex items-baseline gap-2.5">
        <span className="font-mono text-[12px] text-ink-3">{file.displayId}</span>
        <h4 className="m-0 text-[15px] font-semibold">{file.title}</h4>
      </div>
      <div className="mb-[14px] font-mono text-[12px] text-ink-3">{file.path}</div>
      <div className={autoNote}>
        {I.check({ size: 14 })} {autos.length} element(s) auto-merged — {conflicts.length} need your decision.
      </div>
      {file.elements.map((el, i) =>
        el.conflict ? (
          <ConflictElement
            key={i}
            el={el}
            resKey={file.path + '::' + el.key}
            res={resolutions[file.path + '::' + el.key]}
            setRes={setRes}
          />
        ) : (
          <AutoElement key={i} el={el} />
        ),
      )}
    </div>
  );
}
