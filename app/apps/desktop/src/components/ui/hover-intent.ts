/** A single owner prevents adjacent cells from leaving several popovers on screen. */
let activeClose: (() => void) | null = null;

export function createHoverIntent(onChange: (open: boolean) => void) {
  let opening: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  let shown = false;
  let blocked = false;
  let disposed = false;
  const clear = () => { clearTimeout(opening); clearTimeout(closing); };
  const close = () => {
    clear();
    if (activeClose === close) activeClose = null;
    if (shown) { shown = false; onChange(false); }
  };
  return {
    enter(delay = 600) {
      clear();
      if (blocked || shown || disposed) return;
      opening = setTimeout(() => {
        if (disposed) return;
        activeClose?.();
        activeClose = close;
        shown = true;
        onChange(true);
      }, delay);
    },
    leave() {
      clear();
      blocked = false;
      if (shown) closing = setTimeout(close, 180);
    },
    keepOpen() { clearTimeout(closing); },
    dismiss() { blocked = true; close(); },
    dispose() {
      disposed = true;
      clear();
      if (activeClose === close) activeClose = null;
    },
  };
}
