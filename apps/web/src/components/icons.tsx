import type { SVGProps } from 'react';

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export const SlidersIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 7h8M18 7h2M4 17h2M12 17h8" />
    <circle cx="15" cy="7" r="2.4" />
    <circle cx="9" cy="17" r="2.4" />
  </svg>
);

export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const CrownIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M4 18h16M5 8l4 4 3-6 3 6 4-4-1.5 10h-11z" fill="currentColor" />
  </svg>
);

/** Hexagon with a pip: the Pogo mark. */
export const LogoMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden {...p}>
    <path
      d="M12 2l8.66 5v10L12 22l-8.66-5V7z"
      fill="rgb(var(--c-accent))"
      stroke="rgb(var(--c-accentink))"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" fill="rgb(var(--c-accentink))" />
  </svg>
);
