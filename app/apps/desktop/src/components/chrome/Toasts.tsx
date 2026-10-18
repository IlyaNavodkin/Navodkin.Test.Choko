import { I } from '@/components/icons';
import { useApp } from '@/store/app-store';

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="absolute bottom-[18px] left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-[9px] rounded-full bg-[oklch(0.27_0.012_60)] px-[14px] py-[9px] text-[12.5px] text-[oklch(0.97_0.005_80)] shadow-[0_8px_24px_oklch(0.3_0.02_70/0.3)] animate-[toastin_0.2s_cubic-bezier(0.2,0.8,0.2,1)]"
        >
          <span className="grid place-items-center text-[oklch(0.7_0.13_152)]">{I.check({ size: 15 })}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
