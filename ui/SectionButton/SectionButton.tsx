import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import styles from './SectionButton.module.css';

type SectionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode;
  active?: boolean;
  rightContent?: ReactNode;
  rightLabel?: string;
  rightActive?: boolean;
  rightDisabled?: boolean;
  rightButtonRef?: Ref<HTMLButtonElement>;
  onRightClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  variant?: 'accent' | 'success' | 'danger';
  size?: 'compact' | 'control';
};

export function SectionButton({
  active = false,
  rightContent,
  rightLabel,
  rightActive = false,
  rightDisabled = false,
  rightButtonRef,
  onRightClick,
  variant = 'accent',
  size = 'compact',
  className = '',
  children,
  ...props
}: SectionButtonProps) {
  const hasRightSection = rightContent !== undefined;
  return (
    <div
      className={`${styles.root} ${styles[`size-${size}`]} ${
        active || rightActive ? styles[`rootActive-${variant}`] : ''
      } ${className}`.trim()}
    >
      <button
        {...props}
        className={`${styles.section} ${styles.left} ${active ? styles[`sectionActive-${variant}`] : ''} ${
          !hasRightSection ? styles.single : ''
        }`.trim()}
      >
        {children}
      </button>
      {hasRightSection && (
        <button
          ref={rightButtonRef}
          className={`${styles.section} ${styles.right} ${rightActive ? styles.sectionActive : ''}`.trim()}
          type="button"
          disabled={rightDisabled}
          aria-label={rightLabel}
          title={rightLabel}
          onClick={onRightClick}
        >
          {rightContent}
        </button>
      )}
    </div>
  );
}

export type { SectionButtonProps };
