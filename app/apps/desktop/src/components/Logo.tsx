import mascot from '@chioko/brand/chioko-mascot.png';

/**
 * The supplied Chioko mascot, shared with the application icon.
 */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      src={mascot}
      alt="Chioko"
      className={['brand-mascot', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
