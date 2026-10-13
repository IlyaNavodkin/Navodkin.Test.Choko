import { useMemo, useState, type CSSProperties, type HTMLAttributes, type PointerEvent } from 'react';
import { Button } from '../Button/Button';
import { Icon, IconNames } from '../Icon/Icon';
import styles from './AudioWaveform.module.css';
import { useI18n } from '../i18n/provider';

const MAX_BARS = 72;

export type AudioWaveformProps = Omit<HTMLAttributes<HTMLDivElement>, 'onPlay' | 'onPause'> & {
  samples: readonly number[];
  active?: boolean;
  interactive?: boolean;
  currentTime?: number;
  duration?: number;
  playing?: boolean;
  recordable?: boolean;
  recording?: boolean;
  recordDisabled?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (seconds: number) => void;
  onRecord?: () => void;
  onStopRecording?: () => void;
};

function normalizeSample(sample: number) {
  return Math.max(0.08, Math.min(1, Number.isFinite(sample) ? sample : 0));
}

function downsample(samples: readonly number[], targetCount: number) {
  if (samples.length <= targetCount) return samples.map(normalizeSample);
  return Array.from({ length: targetCount }, (_, index) => {
    const start = Math.floor((index * samples.length) / targetCount);
    const end = Math.max(start + 1, Math.floor(((index + 1) * samples.length) / targetCount));
    return normalizeSample(Math.max(...samples.slice(start, end)));
  });
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${(value % 60).toString().padStart(2, '0')}`;
}

/** Interactive audio waveform ported from Koster UI. The caller owns audio capture and samples. */
export function AudioWaveform({
  samples,
  active = false,
  interactive = false,
  currentTime = 0,
  duration = 0,
  playing = false,
  recordable = false,
  recording = false,
  recordDisabled = false,
  onPlay,
  onPause,
  onSeek,
  onRecord,
  onStopRecording,
  className = '',
  ...props
}: AudioWaveformProps) {
  const { t } = useI18n();
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const bars = useMemo(() => {
    const values = downsample(samples, MAX_BARS);
    if (values.length === 0) return Array(MAX_BARS).fill(0.08);
    return !active || values.length >= MAX_BARS
      ? values
      : [...Array(MAX_BARS - values.length).fill(0.08), ...values];
  }, [active, samples]);
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const canPlayback = duration > 0 && !recording;

  const updateHover = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || !canPlayback) {
      setHoverProgress(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverProgress(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  };

  const seek = (seconds: number) => {
    if (playing) onPause?.();
    onSeek?.(seconds);
  };

  return (
    <div className={`${styles.root} ${interactive ? styles.interactive : ''} ${className}`.trim()} {...props}>
      <div
        className={styles.waveformFrame}
        onPointerDown={updateHover}
        onPointerLeave={() => setHoverProgress(null)}
        onPointerMove={updateHover}
      >
        <div className={`${styles.waveform} ${active ? styles.active : ''}`} aria-hidden="true">
          {bars.map((height, index) => (
            <span
              key={index}
              className={interactive && index / Math.max(1, bars.length - 1) <= progress ? styles.played : ''}
              style={{ height: `${height * 100}%` }}
            />
          ))}
        </div>
        {interactive ? (
          <input
            aria-label={t('seekAudio')}
            className={styles.scrubber}
            disabled={!canPlayback}
            max={duration || 1}
            min="0"
            onChange={(event) => seek(Number(event.target.value))}
            step="0.01"
            type="range"
            value={currentTime}
          />
        ) : null}
        {interactive && !recording && (playing || (duration > 0 && currentTime > 0)) ? (
          <div
            className={`${styles.playbackMarker} ${progress < 0.08 ? styles.markerStart : ''} ${
              progress > 0.92 ? styles.markerEnd : ''
            }`.trim()}
            style={{ '--waveform-marker-position': `${progress * 100}%` } as CSSProperties}
          >
            <span>{formatTime(currentTime)}</span>
          </div>
        ) : null}
        {interactive && hoverProgress !== null && canPlayback ? (
          <div
            className={`${styles.hoverMarker} ${hoverProgress < 0.08 ? styles.markerStart : ''} ${
              hoverProgress > 0.92 ? styles.markerEnd : ''
            }`.trim()}
            style={{ '--waveform-marker-position': `${hoverProgress * 100}%` } as CSSProperties}
          >
            <span>{formatTime(hoverProgress * duration)}</span>
          </div>
        ) : null}
      </div>

      {interactive ? (
        <div className={styles.controls}>
          {recordable ? (
            <Button
              size="md"
              variant={recording ? 'danger' : 'secondary'}
              disabled={recordDisabled}
              aria-label={recording ? t('stopRecording') : t('record')}
              onClick={recording ? onStopRecording : onRecord}
            >
              <Icon name={recording ? IconNames.square : IconNames.mic} size="md" />
              {recording ? t('stopRecording') : t('record')}
            </Button>
          ) : null}
          <Button
            size="md"
            variant="primary"
            disabled={!canPlayback}
            aria-label={playing ? t('pausePlayback') : t('playRecording')}
            onClick={playing ? onPause : onPlay}
          >
            <Icon name={playing ? IconNames.pause : IconNames.play} size="md" />
            {playing ? t('pause') : t('play')}
          </Button>
          <span className={styles.timeGroup}>
            <span className={styles.time}>{formatTime(currentTime)}</span>
            <span className={styles.timeMuted}>/</span>
            <span className={styles.timeMuted}>{formatTime(duration)}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
