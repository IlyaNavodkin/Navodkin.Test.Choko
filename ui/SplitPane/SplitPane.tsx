'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { clsx as cn } from 'clsx';
import { ResizeHandle } from '../ResizeHandle/ResizeHandle';
import { useI18n } from '../i18n/provider';
import styles from './SplitPane.module.css';

export type SplitPaneOrientation = 'horizontal' | 'vertical';

export type SplitPaneProps = {
  /** Exactly two panes: the fixed first pane and the growing second pane. */
  children: [ReactNode, ReactNode];
  orientation?: SplitPaneOrientation;
  /** Initial size of the first pane in px. Defaults to 280. */
  defaultSize?: number;
  /** Minimum size of the first pane in px. Defaults to 160. */
  minSize?: number;
  /** Maximum size of the first pane in px. Defaults to the viewport minus `minSize`. */
  maxSize?: number;
  resizable?: boolean;
  /** localStorage key used to persist the first pane size. */
  persistKey?: string;
  className?: string;
  /** Accessible label for the resize handle. */
  firstLabel?: string;
};

const DEFAULT_SIZE = 280;
const DEFAULT_MIN_SIZE = 160;

function readPersistedSize(persistKey?: string): number | null {
  if (!persistKey || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(persistKey);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedSize(persistKey: string | undefined, size: number) {
  if (!persistKey || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(persistKey, String(size));
  } catch {
    /* storage may be unavailable (private mode, quota) — ignore */
  }
}

function viewportSize(orientation: SplitPaneOrientation): number {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;
  return orientation === 'horizontal' ? window.innerWidth : window.innerHeight;
}

/** Two panes separated by an accessible, optionally persisted resize handle. */
export function SplitPane({
  children,
  orientation = 'horizontal',
  defaultSize = DEFAULT_SIZE,
  minSize = DEFAULT_MIN_SIZE,
  maxSize,
  resizable = true,
  persistKey,
  className,
  firstLabel,
}: SplitPaneProps) {
  const { t } = useI18n();
  const [size, setSize] = useState(() => readPersistedSize(persistKey) ?? defaultSize);
  const startSizeRef = useRef(size);
  const currentSizeRef = useRef(size);

  const clamp = useCallback(
    (value: number) => {
      const upper = maxSize ?? viewportSize(orientation) - minSize;
      return Math.min(Math.max(value, minSize), Math.max(minSize, upper));
    },
    [maxSize, minSize, orientation],
  );

  const resolvedSize = clamp(size);

  useEffect(() => {
    currentSizeRef.current = resolvedSize;
  }, [resolvedSize]);

  const handleResizeStart = useCallback(() => {
    startSizeRef.current = resolvedSize;
  }, [resolvedSize]);

  const handleResize = useCallback(
    (delta: number) => {
      setSize(clamp(startSizeRef.current + delta));
    },
    [clamp],
  );

  const handleResizeStep = useCallback(
    (delta: number) => {
      setSize((current) => clamp(current + delta));
    },
    [clamp],
  );

  const handleResizeEnd = useCallback(() => {
    writePersistedSize(persistKey, currentSizeRef.current);
  }, [persistKey]);

  const firstPaneStyle: CSSProperties =
    orientation === 'horizontal' ? { width: `${resolvedSize}px` } : { height: `${resolvedSize}px` };

  return (
    <div className={cn(styles.root, styles[orientation], className)}>
      <div className={styles.first} style={firstPaneStyle}>
        {children[0]}
      </div>

      {resizable ? (
        <div className={styles.handleSlot}>
          <ResizeHandle
            aria-label={firstLabel ?? t('resizePanel')}
            axis={orientation}
            side="right"
            onResizeStart={handleResizeStart}
            onResize={handleResize}
            onResizeStep={handleResizeStep}
            onResizeEnd={handleResizeEnd}
          />
        </div>
      ) : null}

      <div className={styles.second}>{children[1]}</div>
    </div>
  );
}
