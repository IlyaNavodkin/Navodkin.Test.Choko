'use client';

export type ToastVariant = 'error' | 'info';

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
};

type ToastListener = () => void;

const DEFAULT_DURATION_MS = 5000;

let nextId = 0;
let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(): void {
  for (const listener of listeners) listener();
}

function dismiss(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function showToast(options: {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}): number {
  const id = ++nextId;
  const duration = options.duration ?? DEFAULT_DURATION_MS;
  toasts = [
    ...toasts,
    {
      id,
      message: options.message,
      variant: options.variant ?? 'info',
      duration,
    },
  ];
  emit();
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), duration),
    );
  }
  return id;
}

export function dismissToast(id: number): void {
  dismiss(id);
}

export function getToasts(): readonly ToastItem[] {
  return toasts;
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
