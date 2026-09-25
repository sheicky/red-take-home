// Drawn icons, one stroke weight. Plane path from Lucide (ISC).
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Plane = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" className={className} {...base}>
    <g transform="rotate(45 12 12)">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </g>
  </svg>
);

export const Chevron = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" className={className} {...base}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const Check = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" className={className} {...base} strokeWidth={3}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
