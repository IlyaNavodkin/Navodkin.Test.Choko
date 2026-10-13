'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import styles from './Avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export type AvatarProps = {
  src?: string;
  speakingSrc?: string;
  silentSrc?: string;
  isSpeaking?: boolean;
  alt?: string;
  initial?: string;
  size?: AvatarSize;
  color?: string;
  online?: boolean;
  className?: string;
};

/** Initials/image avatar; speaking/silent URLs switch when isSpeaking is set. */
export function Avatar({
  src,
  speakingSrc,
  silentSrc,
  isSpeaking = false,
  alt = '',
  initial,
  size = 'md',
  color,
  online = false,
  className = '',
}: AvatarProps) {
  const preferred =
    speakingSrc || silentSrc
      ? isSpeaking
        ? speakingSrc || silentSrc
        : silentSrc || speakingSrc
      : src;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const resolvedSrc = preferred && preferred !== failedSrc ? preferred : undefined;

  useLayoutEffect(() => {
    setFailedSrc(null);
    setImageLoaded(false);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, [preferred]);

  return (
    <div className={`${styles.wrapper} ${styles[size]} ${className}`.trim()}>
      <div
        className={styles.placeholder}
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden={resolvedSrc && imageLoaded ? true : undefined}
      >
        {initial ? <span className={styles.initial}>{initial}</span> : null}
      </div>
      {resolvedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          className={`${styles.image} ${imageLoaded ? styles.imageLoaded : ''}`.trim()}
          src={resolvedSrc}
          alt={alt}
          onLoad={() => setImageLoaded(true)}
          onError={() => setFailedSrc(resolvedSrc)}
        />
      ) : null}
      {online ? <span className={styles.indicator} /> : null}
    </div>
  );
}
