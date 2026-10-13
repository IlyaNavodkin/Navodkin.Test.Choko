'use client';

export type BlockingOverlayState = {
  title?: string;
};

type BlockingOverlayListener = () => void;

let state: BlockingOverlayState | null = null;
const listeners = new Set<BlockingOverlayListener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function showBlockingOverlay(title?: string): void {
  state = title ? { title } : {};
  emit();
}

export function hideBlockingOverlay(): void {
  if (state === null) return;
  state = null;
  emit();
}

export function getBlockingOverlay(): BlockingOverlayState | null {
  return state;
}

export function subscribeBlockingOverlay(listener: BlockingOverlayListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
