import type { ISourceOptions } from '@tsparticles/engine';
import type {
  BackgroundAnimationKind,
  BackgroundAnimationSettings,
} from './backgroundTypes';
import {
  BACKGROUND_ANIMATION_DEFAULTS,
  BACKGROUND_ANIMATION_KINDS,
} from './backgroundTypes';

export type AnimatedParticleKind = Exclude<BackgroundAnimationKind, 'none'>;

export const ANIMATED_PARTICLE_KINDS: AnimatedParticleKind[] = BACKGROUND_ANIMATION_KINDS.filter(
  (kind): kind is AnimatedParticleKind => kind !== 'none',
);

const NEUTRAL = '#94a3b8';
const NEUTRAL_SOFT = '#cbd5e1';

function mixColors(brandColor: string | undefined): string[] {
  const brand = brandColor?.trim() || NEUTRAL;
  return [NEUTRAL_SOFT, NEUTRAL, brand];
}

function clampFactor(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1.5, Math.max(0.3, value));
}

function scaleCount(base: number, density: number): number {
  return Math.max(8, Math.round(base * density));
}

const particleBase: ISourceOptions = {
  fullScreen: { enable: false },
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  detectRetina: true,
  pauseOnBlur: true,
  pauseOnOutsideViewport: true,
};

export function buildParticlesOptions(
  settings: BackgroundAnimationSettings,
  brandColor?: string,
): ISourceOptions | null {
  if (settings.kind === 'none') return null;

  const density = clampFactor(settings.density, BACKGROUND_ANIMATION_DEFAULTS.density);
  const speed = clampFactor(settings.speed, BACKGROUND_ANIMATION_DEFAULTS.speed);
  const opacity = clampFactor(settings.opacity, BACKGROUND_ANIMATION_DEFAULTS.opacity);
  const colors = mixColors(brandColor);
  const primary = colors[2] ?? NEUTRAL;
  const opacityMin = Math.max(0.08, opacity * 0.35);
  const opacityMax = Math.min(0.95, opacity);

  switch (settings.kind) {
    case 'links':
      return {
        ...particleBase,
        interactivity: {
          events: {
            onHover: { enable: true, mode: 'grab' },
            resize: { enable: true },
          },
          modes: {
            grab: { distance: 140, links: { opacity: opacity * 0.55 } },
          },
        },
        particles: {
          number: { value: scaleCount(48, density), density: { enable: true } },
          color: { value: colors },
          links: {
            enable: true,
            color: primary,
            distance: 140,
            opacity: opacity * 0.32,
            width: 1,
          },
          move: {
            enable: true,
            speed: 0.55 * speed,
            direction: 'none',
            outModes: { default: 'out' },
          },
          opacity: { value: { min: opacityMin, max: opacityMax } },
          size: { value: { min: 1, max: 2.2 } },
        },
      };
    case 'stars':
      return {
        ...particleBase,
        particles: {
          number: { value: scaleCount(110, density), density: { enable: true } },
          color: { value: colors },
          links: { enable: false },
          move: {
            enable: true,
            speed: 0.12 * speed,
            direction: 'none',
            outModes: { default: 'out' },
          },
          opacity: {
            value: { min: opacityMin, max: opacityMax },
            animation: { enable: true, speed: 0.7 * speed, sync: false },
          },
          size: { value: { min: 0.5, max: 1.6 } },
          shape: { type: 'circle' },
        },
      };
    case 'sparkles':
      return {
        ...particleBase,
        particles: {
          number: { value: scaleCount(36, density), density: { enable: true } },
          color: { value: colors },
          links: { enable: false },
          move: {
            enable: true,
            speed: { min: 0.35 * speed, max: 1.1 * speed },
            direction: 'top',
            outModes: { default: 'out' },
          },
          opacity: {
            value: { min: opacityMin, max: opacityMax },
            animation: { enable: true, speed: 1.2 * speed, sync: false },
          },
          size: { value: { min: 1, max: 2.6 } },
          shape: { type: 'circle' },
        },
      };
    case 'snow':
      return {
        ...particleBase,
        particles: {
          number: { value: scaleCount(70, density), density: { enable: true } },
          color: { value: [NEUTRAL_SOFT, NEUTRAL] },
          links: { enable: false },
          move: {
            enable: true,
            speed: { min: 0.25 * speed, max: 0.9 * speed },
            direction: 'bottom',
            straight: false,
            outModes: { default: 'out' },
          },
          opacity: { value: { min: opacityMin, max: opacityMax } },
          size: { value: { min: 1, max: 3.2 } },
          shape: { type: 'circle' },
        },
      };
    default:
      return null;
  }
}
