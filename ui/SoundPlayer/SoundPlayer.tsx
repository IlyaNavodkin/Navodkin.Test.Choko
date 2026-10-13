import type { HTMLAttributes } from 'react';
import { Icon, IconNames } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { Slider } from '../Slider/Slider';
import styles from './SoundPlayer.module.css';
import { useI18n } from '../i18n/provider';

export type SoundPlayerProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onPlay' | 'onPause' | 'onVolumeChange'
> & {
  title: string;
  currentTime: number;
  duration: number;
  playing: boolean;
  volume: number;
  disabled?: boolean;
  seekDisabled?: boolean;
  volumeDisabled?: boolean;
  showNavigation?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onVolumeChange: (volume: number) => void;
};

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Compact sound player ported from Koster UI, using the shared button and slider primitives. */
export function SoundPlayer({
  title,
  currentTime,
  duration,
  playing,
  volume,
  disabled = false,
  seekDisabled = false,
  volumeDisabled = false,
  showNavigation = false,
  onPlay,
  onPause,
  onSeek,
  onPrevious,
  onNext,
  onVolumeChange,
  className = '',
  ...props
}: SoundPlayerProps) {
  const { t } = useI18n();
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  return (
    <div className={`${styles.root} ${className}`.trim()} {...props}>
      <div className={styles.trackInfo} title={title}>
        <Icon className={styles.musicIcon} name={IconNames.music} size="md" />
        <span className={styles.title}>{title}</span>
      </div>

      <Slider
        aria-label={t('playbackPosition')}
        className={styles.seek}
        disabled={disabled || seekDisabled || safeDuration === 0}
        max={safeDuration || 1}
        onValueChange={onSeek}
        step={0.1}
        value={Math.min(currentTime, safeDuration || 1)}
      />
      <span className={styles.time}>
        {formatTime(currentTime)} / {formatTime(safeDuration)}
      </span>

      <div className={styles.actions}>
        {showNavigation ? (
          <IconButton
            aria-label={t('previousRecording')}
            disabled={disabled || !onPrevious}
            onClick={onPrevious}
            size="sm"
            tooltipText={t('previousRecording')}
          >
            <Icon name={IconNames.skipBack} size="sm" />
          </IconButton>
        ) : null}
        <IconButton
          aria-label={playing ? t('pausePlayback') : t('playRecording')}
          disabled={disabled || safeDuration === 0}
          onClick={playing ? onPause : onPlay}
          size="sm"
          tooltipText={playing ? t('pause') : t('play')}
          variant="brand"
        >
          <Icon name={playing ? IconNames.pause : IconNames.play} size="sm" />
        </IconButton>
        {showNavigation ? (
          <IconButton
            aria-label={t('nextRecording')}
            disabled={disabled || !onNext}
            onClick={onNext}
            size="sm"
            tooltipText={t('nextRecording')}
          >
            <Icon name={IconNames.skipForward} size="sm" />
          </IconButton>
        ) : null}
      </div>

      <div className={styles.volume}>
        <Icon name={volume === 0 ? IconNames.volumeX : IconNames.volume2} size="sm" />
        <Slider
          aria-label={t('playbackVolume')}
          disabled={disabled || volumeDisabled}
          max={1}
          onValueChange={onVolumeChange}
          step={0.01}
          value={volume}
        />
      </div>
    </div>
  );
}
