export type OverlayRect = { left: number; right: number; top: number; bottom: number };
export type EditorOverlayPosition = { left: number; top: number; maxHeight: number; maxWidth: number };
export function positionEditorOverlay({ anchor, width, height, bounds, preferred }: {
  anchor: OverlayRect; width: number; height: number; bounds: OverlayRect; preferred: 'top' | 'bottom';
}): EditorOverlayPosition {
  const gap = 6; const padding = 8;
  const minLeft = bounds.left + padding; const minTop = bounds.top + padding;
  const maxWidth = Math.max(0, bounds.right - minLeft - padding);
  const above = Math.max(0, anchor.top - gap - minTop);
  const below = Math.max(0, bounds.bottom - padding - anchor.bottom - gap);
  const useTop = preferred === 'top' ? above >= height || (below < height && above > below) : below < height && above > below;
  const maxHeight = Math.min(360, useTop ? above : below);
  const actualHeight = Math.min(height, maxHeight);
  const left = Math.max(minLeft, Math.min(anchor.left, bounds.right - padding - Math.min(width, maxWidth)));
  const top = Math.max(minTop, Math.min(useTop ? anchor.top - gap - actualHeight : anchor.bottom + gap, bounds.bottom - padding - actualHeight));
  return { left, top, maxHeight, maxWidth };
}
