import { useEffect, useState } from 'react';
import { AnimatedBackground, BACKGROUND_ANIMATION_DEFAULTS, BACKGROUND_ANIMATION_KINDS, type BackgroundAnimationKind } from '@codaa/ui';
import { Choice, DemoFrame, Range } from '../inspect-component/DemoControls';
import styles from '../inspect-component/Demo.module.css';
export function BackgroundDemo() {
  const [kind,setKind]=useState<BackgroundAnimationKind>('none');
  const [density,setDensity]=useState(BACKGROUND_ANIMATION_DEFAULTS.density);
  const [speed,setSpeed]=useState(BACKGROUND_ANIMATION_DEFAULTS.speed);
  const [opacity,setOpacity]=useState(BACKGROUND_ANIMATION_DEFAULTS.opacity);
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  return <DemoFrame output={reduced?'prefers-reduced-motion: reduce':kind} controls={<><Choice label="kind" value={kind} options={BACKGROUND_ANIMATION_KINDS} onChange={setKind}/><Range label="density" value={density} min={0.3} max={2} step={0.1} onChange={setDensity}/><Range label="speed" value={speed} min={0.3} max={2} step={0.1} onChange={setSpeed}/><Range label="opacity" value={opacity} min={0} max={1} step={0.1} onChange={setOpacity}/></>}><div className={styles.bounded}><AnimatedBackground preview settings={{kind:reduced?'none':kind,density,speed,opacity}} brandColor={getComputedStyle(document.documentElement).getPropertyValue('--app-accent-bg').trim()}/></div></DemoFrame>;
}
