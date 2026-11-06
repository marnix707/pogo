import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const FADE_MS = 180;

/**
 * The fading shell of every tooltip bubble: stays in the page while it fades out, so when another tooltip is
 * opened the old one fades out as the new one fades in. Give it the bubble's position classes; the look of the
 * bubble itself is the children.
 */
export function TipBubble({
  show,
  className = '',
  style,
  testId,
  children,
  role = 'status',
}: {
  show: boolean;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  children: ReactNode;
  role?: string;
}) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (show) {
      setMounted(true);
      // (two frames: the bubble first exists at opacity 0, then fades in)
      let b = 0;
      const a = requestAnimationFrame(() => {
        b = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(a);
        cancelAnimationFrame(b);
      };
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), FADE_MS + 20);
    return () => clearTimeout(t);
  }, [show]);
  if (!mounted) return null;
  return (
    <div
      role={role}
      data-testid={testId}
      data-open={show}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.96)',
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
        pointerEvents: show ? undefined : 'none',
      }}
    >
      {children}
    </div>
  );
}
