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

export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  </svg>
);

export const CrownIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M4 18h16M5 8l4 4 3-6 3 6 4-4-1.5 10h-11z" fill="currentColor" />
  </svg>
);

/** The Po:go logo: a die (two dots) and a stem that together read as a "P". Keep in sync with public/favicon.svg. */
export const LogoMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 100 100" role="img" aria-label="Po:go" {...p}>
    <rect width="100" height="100" rx="24" fill="#124034" />
    <rect x="3" y="3" width="94" height="94" rx="21" fill="none" stroke="#eac058" stroke-width="3" />
    <rect x="22" y="33" width="17" height="55" rx="8.5" fill="#d6342c" stroke="#0b1417" stroke-width="3.5" />
    <rect x="31" y="22" width="45" height="45" rx="11" fill="#f4eedb" stroke="#0b1417" stroke-width="3.5" />
    <circle cx="42.25" cy="33.25" r="3.8" fill="#0b1417" />
    <circle cx="64.75" cy="55.75" r="3.8" fill="#0b1417" />
  </svg>
);
