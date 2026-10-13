import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  FormHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react';
import styles from './PageShell.module.css';

export { styles as pageShellStyles };

export type PageShellWidth = 'sm' | 'md' | 'lg';
export type PageShellVariant = 'stage' | 'chrome';

export type PageShellProps = {
  children: ReactNode;
  width?: PageShellWidth;
  variant?: PageShellVariant;
  className?: string;
  style?: CSSProperties;
};

export function PageShell({
  children,
  width = 'md',
  variant = 'stage',
  className = '',
  style,
}: PageShellProps) {
  if (variant === 'chrome') {
    return (
      <main
        className={`${styles.main} ${styles.mainChrome} ${className}`.trim()}
        style={style}
        data-lk-theme="default"
      >
        <div className={styles.chrome}>{children}</div>
      </main>
    );
  }

  return (
    <main className={`${styles.main} ${className}`.trim()} style={style} data-lk-theme="default">
      <section className={`${styles.stage} ${styles[`width-${width}`]}`}>{children}</section>
    </main>
  );
}

export function PageBrand({
  mark = 'K',
  title = 'Koster Meet',
  eyebrow,
  logoUrl,
  description,
  size = 'md',
  className = '',
}: {
  mark?: string;
  title?: ReactNode;
  eyebrow?: ReactNode;
  logoUrl?: string | null;
  description?: ReactNode;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const sizeClass = size === 'lg' ? styles.brandLg : '';
  return (
    <div className={`${styles.brand} ${sizeClass} ${className}`.trim()}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.brandLogo} src={logoUrl} alt="" />
      ) : (
        <span className={styles.brandMark} aria-hidden="true">
          {mark}
        </span>
      )}
      <div className={styles.brandCopy}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <strong className={styles.title}>{title}</strong>
        {description ? <p className={styles.brandDescription}>{description}</p> : null}
      </div>
    </div>
  );
}

export function PageTopbar({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <header className={`${styles.topbar} ${className}`.trim()} {...props} />;
}

export function PageTopbarCopy({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.topbarCopy} ${className}`.trim()} {...props} />;
}

export function PageTopbarActions({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.topbarActions} ${className}`.trim()} {...props} />;
}

export function PageChromeBody({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.chromeBody} ${className}`.trim()} {...props} />;
}

export function PageEyebrow({ className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`${styles.eyebrow} ${className}`.trim()} {...props} />;
}

export function PageTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={`${styles.title} ${className}`.trim()} {...props} />;
}

export function PageDescription({ className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`${styles.description} ${className}`.trim()} {...props} />;
}

export function PageHeader({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <header className={`${styles.header} ${className}`.trim()} {...props} />;
}

export function PageHeaderCopy({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.headerCopy} ${className}`.trim()} {...props} />;
}

export function PageHeaderActions({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.headerActions} ${className}`.trim()} {...props} />;
}

export function PageMeta({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`${styles.meta} ${className}`.trim()} {...props} />;
}

export function PageLink({ className = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={`${styles.link} ${className}`.trim()} {...props} />;
}

export function PageTextButton({ className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`${styles.textButton} ${className}`.trim()} {...props} />;
}

export function PageSegmented({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.segmented} ${className}`.trim()} role="tablist" {...props} />;
}

export type PageSegmentProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function PageSegment({
  active = false,
  className = '',
  type = 'button',
  ...props
}: PageSegmentProps) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={active}
      className={`${styles.segment} ${active ? styles.segmentActive : ''} ${className}`.trim()}
      {...props}
    />
  );
}

export function PageToolbar({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.toolbar} ${className}`.trim()} {...props} />;
}

export function PageToolbarCopy({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.toolbarCopy} ${className}`.trim()} {...props} />;
}

export function PagePanel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`${styles.panel} ${className}`.trim()} {...props} />;
}

export function PageList({ className = '', scrollable = false, ...props }: HTMLAttributes<HTMLDivElement> & { scrollable?: boolean }) {
  return (
    <div className={`${scrollable ? styles.scrollList : styles.list} ${className}`.trim()} {...props} />
  );
}

export function PageRow({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={`${styles.row} ${className}`.trim()} {...props} />;
}

export function PageRowBody({ className = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={`${styles.rowBody} ${className}`.trim()} {...props} />;
}

export function PageRowTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`${styles.rowTitle} ${className}`.trim()} {...props} />;
}

export function PageRowSubtitle({ className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`${styles.rowSubtitle} ${className}`.trim()} {...props} />;
}

export function PageRowActions({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.rowActions} ${className}`.trim()} {...props} />;
}

export function PageJoinRow({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.joinRow} ${className}`.trim()} {...props} />;
}

export function PageFooter({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <footer className={`${styles.footer} ${className}`.trim()} {...props} />;
}

export function PageUserChip({
  username,
  label,
  className = '',
  onClick,
  'aria-label': ariaLabel,
}: {
  username: string;
  label?: ReactNode;
  className?: string;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  const content = (
    <>
      <span className={styles.userAvatar} aria-hidden="true">
        {username.slice(0, 1)}
      </span>
      <PageMeta>
        {username}
        {label ? ` · ${label}` : null}
      </PageMeta>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`${styles.userChip} ${styles.userChipButton} ${className}`.trim()}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <div className={`${styles.userChip} ${className}`.trim()}>{content}</div>;
}

export function PageMuted({ className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`${styles.muted} ${className}`.trim()} {...props} />;
}

export function PageForm({ className = '', ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={`${styles.form} ${className}`.trim()} {...props} />;
}

export function PageHelp({ className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`${styles.help} ${className}`.trim()} {...props} />;
}

export function PageDivider({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.divider} ${className}`.trim()} {...props} />;
}

export function PageSsoLink({ className = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={`${styles.ssoLink} ${className}`.trim()} {...props} />;
}
