import { describe, expect, it } from 'vitest';
import type { ScreenRect } from '@/lib/nwjs';
import { clampToScreens, isVisibleOnScreens, parseWindowState } from './window-state';

// Two side-by-side 1080p monitors: primary at the origin, a second to its right.
const MONITORS: ScreenRect[] = [
  { x: 0, y: 0, width: 1920, height: 1080 },
  { x: 1920, y: 0, width: 1920, height: 1080 },
];

describe('parseWindowState', () => {
  it('accepts a well-formed blob and coerces maximized to a boolean', () => {
    expect(parseWindowState({ x: 10, y: 20, width: 1200, height: 800, maximized: true })).toEqual({
      x: 10,
      y: 20,
      width: 1200,
      height: 800,
      maximized: true,
    });
    // missing/garbage maximized → false
    expect(parseWindowState({ x: 0, y: 0, width: 1200, height: 800 })?.maximized).toBe(false);
    expect(parseWindowState({ x: 0, y: 0, width: 1200, height: 800, maximized: 'yes' })?.maximized).toBe(false);
  });

  it('rejects malformed or non-finite input', () => {
    expect(parseWindowState(null)).toBeNull();
    expect(parseWindowState('nope')).toBeNull();
    expect(parseWindowState({ x: 0, y: 0, width: 1200 })).toBeNull(); // missing height
    expect(parseWindowState({ x: NaN, y: 0, width: 1200, height: 800 })).toBeNull();
    expect(parseWindowState({ x: 0, y: 0, width: 0, height: 800 })).toBeNull(); // non-positive size
    expect(parseWindowState({ x: 0, y: 0, width: -1200, height: 800 })).toBeNull();
  });
});

describe('isVisibleOnScreens', () => {
  it('trusts the saved value when no monitor info is available', () => {
    expect(isVisibleOnScreens({ x: -9999, y: -9999, width: 100, height: 100 }, [])).toBe(true);
  });

  it('is visible when fully on a monitor (incl. the secondary)', () => {
    expect(isVisibleOnScreens({ x: 100, y: 100, width: 1200, height: 800 }, MONITORS)).toBe(true);
    expect(isVisibleOnScreens({ x: 2000, y: 100, width: 1200, height: 800 }, MONITORS)).toBe(true);
  });

  it('is visible when a usable chunk straddles onto a monitor', () => {
    // mostly on the second monitor, a sliver hanging into the first
    expect(isVisibleOnScreens({ x: 1900, y: 50, width: 1200, height: 800 }, MONITORS)).toBe(true);
  });

  it('is not visible when off every monitor or only a thin sliver shows', () => {
    expect(isVisibleOnScreens({ x: 5000, y: 5000, width: 1200, height: 800 }, MONITORS)).toBe(false);
    // only 20px peeks onto the primary (below the 80px threshold)
    expect(isVisibleOnScreens({ x: -1180, y: 100, width: 1200, height: 800 }, MONITORS)).toBe(false);
  });
});

describe('clampToScreens', () => {
  it('leaves an on-screen window untouched', () => {
    const b = { x: 100, y: 100, width: 1200, height: 800 };
    expect(clampToScreens(b, MONITORS)).toEqual(b);
  });

  it('enforces the sanity floor on an absurdly small size', () => {
    // Width has no usability minimum anymore (only a small sanity floor); height still floors at 640.
    expect(clampToScreens({ x: 0, y: 0, width: 100, height: 300 }, MONITORS)).toEqual({
      x: 0,
      y: 0,
      width: 240,
      height: 640,
    });
  });

  it('leaves a sub-1024 width untouched (no width minimum)', () => {
    expect(clampToScreens({ x: 0, y: 0, width: 500, height: 700 }, MONITORS)).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 700,
    });
  });

  it('recenters an off-screen window on the primary monitor', () => {
    const fitted = clampToScreens({ x: 6000, y: 6000, width: 1200, height: 800 }, MONITORS);
    expect(fitted).toEqual({ x: 360, y: 140, width: 1200, height: 800 });
    expect(isVisibleOnScreens(fitted, MONITORS)).toBe(true);
  });

  it('shrinks an oversized window to fit the primary monitor when recentering', () => {
    const fitted = clampToScreens({ x: 9000, y: 0, width: 3000, height: 2000 }, MONITORS);
    expect(fitted.width).toBe(1920);
    expect(fitted.height).toBe(1080);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(0);
  });

  it('only enforces the sanity floor when there is no monitor info', () => {
    expect(clampToScreens({ x: -100, y: -100, width: 100, height: 300 }, [])).toEqual({
      x: -100,
      y: -100,
      width: 240,
      height: 640,
    });
  });
});
