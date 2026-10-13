'use client';

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { Spinner } from '../Spinner/Spinner';
import { useI18n } from '../i18n/provider';
import styles from './UploadDropzone.module.css';

export type UploadFileStatus = 'queued' | 'uploading' | 'done' | 'failed';
export type UploadRejectionReason = 'size' | 'type';

export type UploadFileItem = {
  id: string;
  name: string;
  sizeBytes?: number;
  /** 0…100. Rendered as a progress bar for `queued` / `uploading` items. */
  progress?: number;
  status: UploadFileStatus;
  /** Fine-grained stage («Хеширование…», «Загрузка 42%»), rendered next to the size. */
  stageLabel?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onRemove?: () => void;
};

export type UploadDropzoneProps = {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  disabled?: boolean;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
  files?: UploadFileItem[];
  /** Called with the client-side rejected files and the first reason that applied. */
  onRejected?: (files: File[], reason: UploadRejectionReason) => void;
};

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  return accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith('.')) return fileName.endsWith(token);
      if (token.endsWith('/*')) return fileType.startsWith(token.slice(0, -1));
      return fileType === token;
    });
}

function formatSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clampPercent(progress?: number): number {
  if (progress === undefined || !Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

/** Keyboard-operable file drop area with optional in-flight item list. */
export function UploadDropzone({
  onFilesSelected,
  accept,
  multiple = true,
  maxSizeBytes,
  disabled = false,
  hint,
  className,
  children,
  files,
  onRejected,
}: UploadDropzoneProps) {
  const { t } = useI18n();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const processFiles = (incoming: File[]) => {
    if (!incoming.length) return;

    const accepted: File[] = [];
    const tooLarge: File[] = [];
    const wrongType: File[] = [];

    for (const file of incoming) {
      if (!matchesAccept(file, accept)) {
        wrongType.push(file);
        continue;
      }
      if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
        tooLarge.push(file);
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length) onFilesSelected(accepted);
    if (tooLarge.length) onRejected?.(tooLarge, 'size');
    if (wrongType.length) onRejected?.(wrongType, 'type');
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(event.target.files ?? []));
    // Allow re-selecting the same file after a rejection.
    event.target.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setDragOver(false);
    processFiles(Array.from(event.dataTransfer?.files ?? []));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPicker();
  };

  return (
    <div className={cn(styles.root, className)}>
      <div
        aria-disabled={disabled || undefined}
        className={cn(styles.zone, dragOver && styles.dragOver, disabled && styles.disabled)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
      >
        <span aria-hidden="true" className={styles.icon}>
          <Icon name={IconNames.cloudUpload} size="lg" />
        </span>

        {children ?? (
          <div className={styles.copy}>
            <span className={styles.title}>{t('dropFilesHere')}</span>
            {hint ? <span className={styles.hint}>{hint}</span> : null}
          </div>
        )}

        <button
          className={styles.browse}
          disabled={disabled}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openPicker();
          }}
        >
          {t('browse')}
        </button>

        <input
          ref={inputRef}
          accept={accept}
          className={styles.input}
          disabled={disabled}
          id={inputId}
          multiple={multiple}
          type="file"
          onChange={handleInputChange}
        />
      </div>

      {files && files.length ? (
        <ul className={styles.fileList}>
          {files.map((file) => (
            <li key={file.id} className={styles.fileItem}>
              <span aria-hidden="true" className={styles.fileIcon}>
                {file.status === 'uploading' ? (
                  <Spinner size="sm" />
                ) : (
                  <Icon name={IconNames.file} size="sm" />
                )}
              </span>

              <span className={styles.fileMeta}>
                <span className={styles.fileName} title={file.name}>
                  {file.name}
                </span>
                <span className={styles.fileDetail}>
                  {formatSize(file.sizeBytes)}
                  {file.status === 'failed'
                    ? `${formatSize(file.sizeBytes) ? ' · ' : ''}${
                        file.errorMessage ?? t('uploadFailed')
                      }`
                    : ''}
                </span>

                {file.status === 'queued' || file.status === 'uploading' ? (
                  <span
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={clampPercent(file.progress)}
                    className={styles.progressTrack}
                    role="progressbar"
                  >
                    <span
                      className={styles.progressBar}
                      style={{ width: `${clampPercent(file.progress)}%` }}
                    />
                  </span>
                ) : null}
              </span>

              <span className={styles.fileActions}>
                {file.status === 'failed' && file.onRetry ? (
                  <IconButton
                    aria-label={t('retry')}
                    size="sm"
                    tooltipText={t('retry')}
                    variant="ghost"
                    onClick={file.onRetry}
                  >
                    <Icon name={IconNames.refreshCw} size="sm" />
                  </IconButton>
                ) : null}
                {file.onRemove ? (
                  <IconButton
                    aria-label={t('remove')}
                    size="sm"
                    tooltipText={t('remove')}
                    variant="ghost"
                    onClick={file.onRemove}
                  >
                    <Icon name={IconNames.x} size="sm" />
                  </IconButton>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
