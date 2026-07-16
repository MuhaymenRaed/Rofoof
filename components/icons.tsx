import type { SVGProps } from "react";

/**
 * Lightweight stroke-icon set (Tabler/Lucide style) so the project stays
 * dependency-free. All icons inherit `currentColor` and a 1.75 stroke.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const Home = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9h4.5v-5h3v5H18v-9" />
  </Base>
);

export const User = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Base>
);

export const Bell = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </Base>
);

export const Sun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
);

export const Moon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Base>
);

export const Search = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Base>
);

export const Heart = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Base {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M19.5 12.6 12 20l-7.5-7.4a4.6 4.6 0 0 1 0-6.5 4.6 4.6 0 0 1 6.5 0L12 6.6l1-1a4.6 4.6 0 0 1 6.5 0 4.6 4.6 0 0 1 0 6.5Z" />
  </Base>
);

export const Bag = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 8h12l-1 12H7L6 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Base>
);

export const Cart = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="17" cy="20" r="1.4" />
    <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
  </Base>
);

export const Package = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
    <path d="M4 7l8 4 8-4M12 11v10" />
  </Base>
);

export const Grid = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Base>
);

export const Sticker = (p: IconProps) => (
  <Base {...p}>
    <path d="M15.5 3H6a3 3 0 0 0-3 3v9.5L15.5 3Z" transform="translate(0 0)" />
    <path d="M20 8.5 8.5 20H18a3 3 0 0 0 3-3V8.5Z" opacity="0" />
    <path d="M14 3v5a3 3 0 0 0 3 3h4" />
    <path d="M21 11 11 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h8l7 8Z" />
  </Base>
);

export const Photo = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L20 21" />
  </Base>
);

export const Hexagon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z" />
  </Base>
);

export const Cube = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 2.7 20 7v10l-8 4.3L4 17V7l8-4.3Z" />
    <path d="M4 7l8 4.3M20 7l-8 4.3M12 11.3V21.3" />
  </Base>
);

export const Check = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Base>
);

export const Plus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const Minus = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);

export const X = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const Menu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Base>
);

export const ChevronEnd = (p: IconProps) => (
  // points toward the inline-end (left in RTL)
  <Base {...p}>
    <path d="m14 6-6 6 6 6" />
  </Base>
);

export const Star = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Base {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
  </Base>
);

export const Trash = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7" />
  </Base>
);

export const Truck = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H14a1 1 0 0 1 1 1v9H3V6.5Z" />
    <path d="M15 9h3.2a1 1 0 0 1 .8.4L21 12v3h-6V9Z" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </Base>
);

export const Sliders = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="13" cy="18" r="2" />
  </Base>
);

export const Globe = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
  </Base>
);

export const Droplet = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5c3 3.8 6 6.7 6 10a6 6 0 0 1-12 0c0-3.3 3-6.2 6-10Z" />
  </Base>
);

export const Sparkles = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
    <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
  </Base>
);

export const MapPin = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 21s7-6.3 7-11a7 7 0 0 0-14 0c0 4.7 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Base>
);

export const Phone = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 0-2Z" />
  </Base>
);

export const Instagram = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="3.6" />
    <circle cx="17" cy="7" r="0.6" fill="currentColor" />
  </Base>
);

export const Whatsapp = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.1L4 20Z" />
    <path d="M9 9.2c.2-.6.5-.6.8-.6h.5c.2 0 .4 0 .6.5l.7 1.6c.1.2 0 .4-.1.5l-.5.6c-.1.2-.2.3 0 .6a6 6 0 0 0 2.4 2.1c.3.1.5.1.6 0l.6-.7c.2-.2.3-.1.5-.1l1.6.8c.2.1.4.2.4.4 0 .6-.4 1.4-.7 1.6-.4.3-1.6.8-3.4 0a8 8 0 0 1-3.9-3.9c-.6-1.3-.4-2.4-.2-2.9Z" />
  </Base>
);
