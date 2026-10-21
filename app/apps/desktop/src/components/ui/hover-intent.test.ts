import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHoverIntent } from './hover-intent';

const cleanup: (() => void)[] = [];
const intent = (callback = vi.fn()) => {
  const value = createHoverIntent(callback);
  cleanup.push(value.dispose);
  return { value, callback };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup.splice(0).forEach((dispose) => dispose()); vi.useRealTimers(); });

describe('calm hover intent', () => {
  it('does not open while the pointer quickly passes across calendar cells', () => {
    const { value, callback } = intent();
    value.enter();
    vi.advanceTimersByTime(250);
    value.leave();
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
  });
  it('waits for a deliberate hover, and lets the pointer cross into the popover', () => {
    const { value, callback } = intent();
    value.enter();
    vi.advanceTimersByTime(599);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenLastCalledWith(true);
    value.leave();
    vi.advanceTimersByTime(100);
    value.keepOpen();
    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);
    value.leave();
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenLastCalledWith(false);
  });
  it('cancels and suppresses a popover after a click until the pointer leaves', () => {
    const { value, callback } = intent();
    value.enter();
    vi.advanceTimersByTime(100);
    value.dismiss();
    value.enter();
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
    value.leave();
    value.enter();
    vi.advanceTimersByTime(600);
    expect(callback).toHaveBeenLastCalledWith(true);
  });
  it('allows only one informational popover at a time', () => {
    const a = intent();
    const b = intent();
    a.value.enter();
    vi.advanceTimersByTime(600);
    b.value.enter();
    vi.advanceTimersByTime(600);
    expect(a.callback).toHaveBeenLastCalledWith(false);
    expect(b.callback).toHaveBeenLastCalledWith(true);
  });
  it('cancels pending work when the component unmounts', () => {
    const { value, callback } = intent();
    value.enter();
    value.dispose();
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
  });
});
