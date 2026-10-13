'use client';

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconNames } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import styles from './Modal.module.css';
import { useI18n } from '../i18n/provider';

let modalCount = 0;
let initialBodyOverflow = '';

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  header?: ReactNode;
  /** Fixed chrome between header and scrollable body (e.g. tabs). */
  toolbar?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: CSSProperties['maxWidth'];
  fullScreen?: boolean;
  closable?: boolean;
  closeOnBackdrop?: boolean;
  closeLabel?: string;
  'aria-label'?: string;
};

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));
}

/** Modal dialog ported from Koster UI and adapted to the shared React tokens. */
export function Modal({
  open,
  onOpenChange,
  title,
  header,
  toolbar,
  actions,
  children,
  maxWidth,
  fullScreen = false,
  closable = true,
  closeOnBackdrop = true,
  closeLabel,
  'aria-label': ariaLabel,
}: ModalProps) {
  const { t } = useI18n();
  const resolvedCloseLabel = closeLabel ?? t('close');
  const resolvedAriaLabel = ariaLabel ?? t('dialog');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modalCount === 0) {
      initialBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    modalCount += 1;

    const focusFrame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      (getFocusableElements(dialog)[0] ?? dialog).focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      modalCount = Math.max(0, modalCount - 1);
      if (modalCount === 0) document.body.style.overflow = initialBodyOverflow;
      activeElement?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const close = () => onOpenChange(false);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && closable) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop) close();
      }}
    >
      <div
        ref={dialogRef}
        aria-label={title ? undefined : resolvedAriaLabel}
        aria-labelledby={title ? titleId : undefined}
        aria-modal="true"
        className={`${styles.modal} ${fullScreen ? styles.fullScreen : ''}`.trim()}
        role="dialog"
        style={!fullScreen && maxWidth ? { maxWidth } : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {(header || title || closable) && (
          <div className={`${styles.header} ${toolbar ? styles.headerWithToolbar : ''}`.trim()}>
            <div className={styles.headerLeft}>
              {header ?? (title ? <h2 id={titleId}>{title}</h2> : null)}
            </div>
            {closable && (
              <IconButton
                aria-label={resolvedCloseLabel}
                className={styles.close}
                tooltipText={resolvedCloseLabel}
                variant="ghost"
                onClick={close}
              >
                <Icon name={IconNames.x} size="md" />
              </IconButton>
            )}
          </div>
        )}
        {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}
        <div className={styles.body}>{children}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
