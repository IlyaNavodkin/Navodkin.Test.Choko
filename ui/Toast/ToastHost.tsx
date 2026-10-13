'use client';

import { useSyncExternalStore } from 'react';
import { Toast } from './Toast';
import styles from './Toast.module.css';
import { dismissToast, getToasts, subscribeToasts } from './toastStore';

const EMPTY_TOASTS: readonly never[] = [];

function getServerSnapshot(): readonly never[] {
  return EMPTY_TOASTS;
}

export function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getServerSnapshot);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.host} aria-live="polite">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          className={`${styles.toastItem} ${
            toast.variant === 'error' ? styles.error : styles.info
          }`.trim()}
          role="status"
          onClick={() => dismissToast(toast.id)}
        >
          {toast.message}
        </Toast>
      ))}
    </div>
  );
}
