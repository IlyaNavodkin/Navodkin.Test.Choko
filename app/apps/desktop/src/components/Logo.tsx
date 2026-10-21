import mascot from '@choko/brand/choko-mascot.png';

/**
 * The supplied Choko mascot, shared with the application icon.
 */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      src={mascot}
      alt="Choko"
      className={['brand-mascot', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
