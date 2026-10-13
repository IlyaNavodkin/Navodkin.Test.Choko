/** Background animation contract owned by the shared UI library. */

export type BackgroundAnimationKind = 'none' | 'links' | 'stars' | 'sparkles' | 'snow';

export type BackgroundAnimationSettings = {
  kind: BackgroundAnimationKind;
  density: number;
  speed: number;
  opacity: number;
};

export const BACKGROUND_ANIMATION_KINDS: BackgroundAnimationKind[] = [
  'none',
  'links',
  'stars',
  'sparkles',
  'snow',
];

export const BACKGROUND_ANIMATION_DEFAULTS: BackgroundAnimationSettings = {
  kind: 'none',
  density: 1,
  speed: 1,
  opacity: 0.6,
};
