import type { JSX } from 'react';

function S(p: { d: React.ReactNode; s?: number; fill?: boolean }): JSX.Element {
  const s = p.s ?? 16;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={p.fill ? 0 : 1.6} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      {p.fill ? <g fill="currentColor" stroke="none">{p.d}</g> : p.d}
    </svg>
  );
}

export const I = {
  search: (s = 15) => <S s={s} d={<><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></>} />,
  file: (s = 15) => <S s={s} d={<><path d="M4 1.5h5.5L12.5 4.5V14.5h-8.5z" /><path d="M9.5 1.5v3h3" /></>} />,
  folder: (s = 15) => <S s={s} d={<path d="M1.5 4.5c0-.8.7-1.5 1.5-1.5h3l1.2 1.5H13c.8 0 1.5.7 1.5 1.5v5c0 .8-.7 1.5-1.5 1.5H3c-.8 0-1.5-.7-1.5-1.5z" />} />,
  chevD: (s = 13) => <S s={s} d={<path d="M4 6l4 4 4-4" />} />,
  chevR: (s = 13) => <S s={s} d={<path d="M6 4l4 4-4 4" />} />,
  chevL: (s = 13) => <S s={s} d={<path d="M10 4L6 8l4 4" />} />,
  plus: (s = 14) => <S s={s} d={<><path d="M8 3v10" /><path d="M3 8h10" /></>} />,
  play: (s = 14) => <S s={s} fill d={<path d="M5 3.5v9l7-4.5z" />} />,
  grid: (s = 16) => <S s={s} d={<><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>} />,
  layers: (s = 16) => <S s={s} d={<><path d="M8 2l6 3-6 3-6-3z" /><path d="M2 8.5l6 3 6-3" /><path d="M2 11.5l6 3 6-3" /></>} />,
  git: (s = 15) => <S s={s} d={<><circle cx="4.5" cy="4" r="2" /><circle cx="4.5" cy="12" r="2" /><circle cx="11.5" cy="8" r="2" /><path d="M4.5 6v4" /><path d="M11.5 6c0 2.5-3 2-5.5 3.2" /></>} />,
  branch: (s = 13) => <S s={s} d={<><circle cx="4.5" cy="4" r="1.8" /><circle cx="4.5" cy="12" r="1.8" /><circle cx="11.5" cy="5" r="1.8" /><path d="M4.5 5.8v4.4" /><path d="M11.5 6.8c0 2.6-4 1.8-5.4 3.4" /></>} />,
  check: (s = 14) => <S s={s} d={<path d="M2.5 8.5l3.5 3.5 7-8" />} />,
  x: (s = 13) => <S s={s} d={<><path d="M4 4l8 8" /><path d="M12 4l-8 8" /></>} />,
  warn: (s = 14) => <S s={s} d={<><path d="M8 2L14.5 13.5h-13z" /><path d="M8 6.5v3.5" /><circle cx="8" cy="11.8" r="0.4" fill="currentColor" /></>} />,
  clock: (s = 13) => <S s={s} d={<><circle cx="8" cy="8" r="6" /><path d="M8 5v3.2l2.2 1.3" /></>} />,
  cmd: (s = 13) => <S s={s} d={<><path d="M5.5 5L3 8l2.5 3" /><path d="M10.5 5L13 8l-2.5 3" /></>} />,
  sun: (s = 15) => <S s={s} d={<><circle cx="8" cy="8" r="3.2" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" /></>} />,
  moon: (s = 15) => <S s={s} d={<path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" />} />,
  dot: (s = 9) => <S s={s} fill d={<circle cx="8" cy="8" r="4" />} />,
  pull: (s = 14) => <S s={s} d={<><path d="M8 2v8" /><path d="M5 7l3 3 3-3" /><path d="M3 13.5h10" /></>} />,
  push: (s = 14) => <S s={s} d={<><path d="M8 10V2" /><path d="M5 5l3-3 3 3" /><path d="M3 13.5h10" /></>} />,
  commit: (s = 14) => <S s={s} d={<><circle cx="8" cy="8" r="2.4" /><path d="M5.6 8H2.5M13.5 8h-3.1" /></>} />,
  back: (s = 14) => <S s={s} d={<><path d="M10 3L5 8l5 5" /></>} />,
  copy: (s = 13) => <S s={s} d={<><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 3.5v-1h-8v8h1" /></>} />,
  trash: (s = 14) => <S s={s} d={<><path d="M2.5 4h11" /><path d="M6.5 4V2.5h3V4" /><path d="M4 4l.7 10h6.6L12 4" /></>} />,
  eye: (s = 14) => <S s={s} d={<><path d="M1.5 8S4 4 8 4s6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8z" /><circle cx="8" cy="8" r="1.8" /></>} />,
  merge: (s = 16) => <S s={s} d={<><circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="8" r="2" /><path d="M4 6v4" /><path d="M6 5c3 0 1.5 4 4 3" /></>} />,
  dl: (s = 14) => <S s={s} d={<><path d="M8 2v8" /><path d="M5 7.5L8 10.5l3-3" /><path d="M2.5 13.5h11" /></>} />,
  box: (s = 15) => <S s={s} d={<rect x="2.5" y="2.5" width="11" height="11" rx="2" />} />,
};
