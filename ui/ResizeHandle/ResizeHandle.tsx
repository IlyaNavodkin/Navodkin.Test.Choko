import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';
import styles from './ResizeHandle.module.css';

type ResizeHandleProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onKeyDown'
> & {
  /** Side of the panel where the resize target is placed. */
  side?: 'left' | 'right';
  /** Direction in which the panel is resized. */
  axis?: 'horizontal' | 'vertical';
  /** Delta applied by the arrow keys. */
  keyboardStep?: number;
  onResizeStart?: (event: PointerEvent<HTMLButtonElement>) => void;
  onResize?: (delta: number, event: SyntheticEvent<HTMLButtonElement>) => void;
  onResizeStep?: (delta: number, event: KeyboardEvent<HTMLButtonElement>) => void;
  onResizeEnd?: (event: SyntheticEvent<HTMLButtonElement>) => void;
};

/**
 * Accessible drag target for resizing an adjacent panel.
 * The consumer owns the panel width; this component only reports movement deltas.
 */
export function ResizeHandle({
  side = 'right',
  axis = 'horizontal',
  keyboardStep = 8,
  className = '',
  disabled = false,
  onResizeStart,
  onResize,
  onResizeStep,
  onResizeEnd,
  'aria-label': ariaLabel = 'Resize panel',
  ...props
}: ResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const startCoordinateRef = useRef(0);

  const getCoordinate = (event: PointerEvent<HTMLButtonElement>) =>
    axis === 'horizontal' ? event.clientX : event.clientY;

  const finishResize = (event: SyntheticEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current === null) return;

    pointerIdRef.current = null;
    setIsResizing(false);
    onResizeEnd?.(event);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return;

    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    startCoordinateRef.current = getCoordinate(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
    onResizeStart?.(event);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;

    onResize?.(getCoordinate(event) - startCoordinateRef.current, event);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishResize(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const decreaseKeys = axis === 'horizontal' ? ['ArrowLeft'] : ['ArrowUp'];
    const increaseKeys = axis === 'horizontal' ? ['ArrowRight'] : ['ArrowDown'];
    const step = event.shiftKey ? keyboardStep * 3 : keyboardStep;

    if (decreaseKeys.includes(event.key)) {
      event.preventDefault();
      onResizeStep?.(-step, event);
    }
    if (increaseKeys.includes(event.key)) {
      event.preventDefault();
      onResizeStep?.(step, event);
    }
  };

  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      className={`${styles.handle} ${styles[`side-${side}`]} ${styles[`axis-${axis}`]} ${
        isResizing ? styles.resizing : ''
      } ${className}`.trim()}
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={finishResize}
      onKeyDown={handleKeyDown}
    />
  );
}

export type { ResizeHandleProps };
