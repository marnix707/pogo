import iconUrl from '../assets/icons/icon.svg';
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

/** A padlock: closed (locked) or with the shackle open. */
export const LockIcon = ({ open = false, ...p }: SVGProps<SVGSVGElement> & { open?: boolean }) => (
  <svg {...base} {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d={open ? 'M8 11V8a4 4 0 0 1 7.5-1.9' : 'M8 11V8a4 4 0 0 1 8 0v3'} />
  </svg>
);

export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M6 9l6 6 6-6" />
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

export const TrophyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8" />
  </svg>
);

export const CrownIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M4 18h16M5 8l4 4 3-6 3 6 4-4-1.5 10h-11z" fill="currentColor" />
  </svg>
);

/** The POGO app icon (Pogo on a yellow tile, pixel art from assets/icons/icon.svg). */
export const LogoMark = ({ className }: { className?: string }) => (
  <img
    src={iconUrl}
    alt="POGO"
    className={className}
    style={{ imageRendering: 'pixelated' }}
    draggable={false}
  />
);
