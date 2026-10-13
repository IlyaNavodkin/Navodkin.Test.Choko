'use client';

import { useEffect, useId, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/provider';
import { LoadingState } from '../LoadingState/LoadingState';
import styles from './BlockingOverlay.module.css';
import {
  getBlockingOverlay,
  subscribeBlockingOverlay,
  type BlockingOverlayState,
} from './blockingOverlayStore';

function getServerSnapshot(): BlockingOverlayState | null {
  return null;
}

export function BlockingOverlayHost() {
  const { t } = useI18n();
  const overlay = useSyncExternalStore(
    subscribeBlockingOverlay,
    getBlockingOverlay,
    getServerSnapshot,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!overlay) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
    };
  }, [overlay]);

  if (!overlay || typeof document === 'undefined') return null;

  const title = overlay.title ?? t('loading');
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab' || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      aria-busy="true"
      aria-labelledby={titleId}
      aria-modal="true"
      className={styles.root}
      role="alertdialog"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <LoadingState id={titleId} size="lg" title={title} />
    </div>,
    document.body,
  );
}
