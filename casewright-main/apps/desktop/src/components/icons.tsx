import type { CSSProperties, ReactNode } from 'react';

export interface IconProps {
  size?: number;
  fill?: string;
  stroke?: string;
  sw?: number;
  vb?: number;
  style?: CSSProperties;
}

interface IconBaseProps extends IconProps {
  d?: string;
  children?: ReactNode;
}

export function Icon({
  d,
  size = 16,
  fill = 'none',
  stroke = 'currentColor',
  sw = 1.6,
  children,
  vb = 24,
  style,
}: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export type IconFn = (props?: IconProps) => ReactNode;

/** The Casewright line-icon set. Each entry is called like `I.file({ size: 14 })`. */
export const I = {
  chevron: (p?: IconProps) => <Icon {...p} d="M9 6l6 6-6 6" />,
  chevronDown: (p?: IconProps) => <Icon {...p} d="M6 9l6 6 6-6" />,
  folder: (p?: IconProps) => (
    <Icon {...p} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  ),
  folderOpen: (p?: IconProps) => (
    <Icon
      {...p}
      d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2M3 7v10a2 2 0 002 2h12.5a1.5 1.5 0 001.45-1.1L21 9"
    />
  ),
  workspace: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </Icon>
  ),
  file: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M6 3h8l4 4v14a0 0 0 01 0 0H6a0 0 0 01 0 0V3z" />
      <path d="M14 3v4h4" />
    </Icon>
  ),
  download: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M12 4v11" />
      <path d="M7 11l5 4 5-4" />
      <path d="M5 20h14" />
    </Icon>
  ),
  search: (p?: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Icon>
  ),
  plus: (p?: IconProps) => <Icon {...p} d="M12 5v14M5 12h14" />,
  minus: (p?: IconProps) => <Icon {...p} d="M5 12h14" />,
  undo: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M8 5L4 9l4 4" />
      <path d="M4 9h9.5a5.5 5.5 0 010 11H9" />
    </Icon>
  ),
  dots: (p?: IconProps) => (
    <Icon {...p}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </Icon>
  ),
  branch: (p?: IconProps) => (
    <Icon {...p}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="8" r="2.4" />
      <path d="M6 8.4v7.2M8.4 7.2c5 .4 7.6 1.6 9.6 0M18 10.4c0 3-2 4-6 4.6" />
    </Icon>
  ),
  pull: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M12 4v10" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </Icon>
  ),
  push: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M12 20V10" />
      <path d="M7 13l5-5 5 5" />
      <path d="M5 4h14" />
    </Icon>
  ),
  commit: (p?: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M3 12h5.8M15.2 12H21" />
    </Icon>
  ),
  merge: (p?: IconProps) => (
    <Icon {...p}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="16" r="2.2" />
      <path d="M6 8.2v7.6M6.2 7c4 5 7 5 9.6 6.6" />
    </Icon>
  ),
  bold: (p?: IconProps) => (
    <Icon {...p} sw={2}>
      <path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" />
    </Icon>
  ),
  italic: (p?: IconProps) => (
    <Icon {...p} sw={2}>
      <path d="M15 5h-5M14 19H9M14 5l-4 14" />
    </Icon>
  ),
  strike: (p?: IconProps) => (
    <Icon {...p} sw={2}>
      <path d="M5 12h14M8 7.5C8 6 9.5 5 12 5s4 1.2 4 3M8 16c0 2 2 3 4 3s4-1 4-3" />
    </Icon>
  ),
  code: (p?: IconProps) => <Icon {...p} d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
  link: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M10 13a4 4 0 005.7 0l2.3-2.3a4 4 0 10-5.7-5.7L11 6.3" />
      <path d="M14 11a4 4 0 00-5.7 0L6 13.3a4 4 0 105.7 5.7L13 17.7" />
    </Icon>
  ),
  drag: (p?: IconProps) => (
    <Icon {...p}>
      <circle cx="9" cy="6" r="1.3" />
      <circle cx="15" cy="6" r="1.3" />
      <circle cx="9" cy="12" r="1.3" />
      <circle cx="15" cy="12" r="1.3" />
      <circle cx="9" cy="18" r="1.3" />
      <circle cx="15" cy="18" r="1.3" />
    </Icon>
  ),
  indent: (p?: IconProps) => <Icon {...p} d="M4 6h16M10 12h10M10 18h10M4 10v4l3-2z" />,
  outdent: (p?: IconProps) => <Icon {...p} d="M4 6h16M10 12h10M10 18h10M7 10v4l-3-2z" />,
  trash: (p?: IconProps) => <Icon {...p} d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />,
  copy: (p?: IconProps) => (
    <Icon {...p}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </Icon>
  ),
  check: (p?: IconProps) => <Icon {...p} d="M5 12l5 5 9-10" />,
  x: (p?: IconProps) => <Icon {...p} d="M6 6l12 12M18 6L6 18" />,
  dot: (p?: IconProps) => (
    <Icon {...p} fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="4" />
    </Icon>
  ),
  list: (p?: IconProps) => (
    <Icon {...p} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  ),
  grid: (p?: IconProps) => (
    <Icon {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1.3" />
      <rect x="13" y="4" width="7" height="7" rx="1.3" />
      <rect x="4" y="13" width="7" height="7" rx="1.3" />
      <rect x="13" y="13" width="7" height="7" rx="1.3" />
    </Icon>
  ),
  play: (p?: IconProps) => (
    <Icon {...p} fill="currentColor" stroke="none">
      <path d="M7 5l11 7-11 7z" />
    </Icon>
  ),
  filter: (p?: IconProps) => <Icon {...p} d="M4 5h16l-6 7v6l-4 2v-8z" />,
  tag: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M3 12V5a2 2 0 012-2h7l9 9-9 9z" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
    </Icon>
  ),
  clock: (p?: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </Icon>
  ),
  warn: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </Icon>
  ),
  sync: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M20 11a8 8 0 00-14-4.5M4 5v3h3" />
      <path d="M4 13a8 8 0 0014 4.5M20 19v-3h-3" />
    </Icon>
  ),
  back: (p?: IconProps) => <Icon {...p} d="M15 6l-6 6 6 6" />,
  repo: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M5 4h13a1 1 0 011 1v15H7a2 2 0 01-2-2z" />
      <path d="M5 16h14M9 4v12" />
    </Icon>
  ),
  layers: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Icon>
  ),
  eye: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.6" />
    </Icon>
  ),
  edit: (p?: IconProps) => (
    <Icon {...p}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </Icon>
  ),
} satisfies Record<string, IconFn>;
