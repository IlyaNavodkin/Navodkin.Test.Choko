'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { initParticlesEngine, Particles } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { BackgroundAnimationSettings } from './backgroundTypes';
import { buildParticlesOptions } from './backgroundPresets';
import styles from './AnimatedBackground.module.css';

let enginePromise: Promise<void> | null = null;

/** Loads the slim particles bundle once per module instance. */
function ensureParticlesEngine(): Promise<void> {
  if (!enginePromise) {
    enginePromise = initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    });
  }
  return enginePromise;
}

export type AnimatedBackgroundProps = {
  settings: BackgroundAnimationSettings;
  brandColor?: string;
  /** Use inside admin preview card instead of fixed full-page layer. */
  preview?: boolean;
  className?: string;
};

export function AnimatedBackground({
  settings,
  brandColor,
  preview = false,
  className = '',
}: AnimatedBackgroundProps) {
  const reactId = useId().replace(/:/g, '');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    let active = true;
    ensureParticlesEngine().then(() => {
      if (active) setEngineReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const options = useMemo(
    () => buildParticlesOptions(settings, brandColor),
    [settings, brandColor],
  );

  if (reducedMotion || !engineReady || !options || settings.kind === 'none') {
    return null;
  }

  return (
    <div
      className={`${preview ? styles.previewLayer : styles.layer} ${className}`.trim()}
      aria-hidden="true"
    >
      <Particles
        id={preview ? `koster-bg-preview-${reactId}` : 'koster-animated-background'}
        className={styles.particles}
        options={options}
      />
    </div>
  );
}
