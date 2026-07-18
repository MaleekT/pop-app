// Curated line-icon set for the homepage. One consistent style: 24x24 grid, stroke = currentColor
// (tint via the parent's color), 1.75 stroke, round caps/joins. No emoji anywhere on the page.

interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

// Prediction markets: outcome pools as bars, the shape of odds.
export function MarketsIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3.5" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="6" width="4" height="14" rx="1" />
      <rect x="16.5" y="14" width="4" height="6" rx="1" />
    </svg>
  )
}

// 1v1: two chevrons facing each other, head to head.
export function DuelIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l5 6-5 6" />
      <path d="M18 6l-5 6 5 6" />
    </svg>
  )
}

// Parlay: stacked layers, legs combined into one ticket.
export function ParlayIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 16.5l9 5 9-5" />
    </svg>
  )
}

// Taking a position: picking a side and putting something behind it.
export function TargetIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" />
    </svg>
  )
}

// A participant in a 1v1. Replaces the design's "A" / "B" avatar letters.
export function UserIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

// Two stakes crossing into escrow.
export function SwapIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 9h13l-3.5-3.5" />
      <path d="M20 15H7l3.5 3.5" />
    </svg>
  )
}

// Winner claims the pot. Replaces the money-with-wings emoji.
export function PayoutIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3.5v9" />
      <path d="M8.5 9l3.5 3.5L15.5 9" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export function LockIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function ShieldIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 8.1-7 9.5-4.1-1.4-7-5.2-7-9.5V6l7-3z" />
    </svg>
  )
}

export function CodeIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 8l-4 4 4 4" />
      <path d="M15 8l4 4-4 4" />
    </svg>
  )
}

export function EyeIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  )
}

// ── Market category icons, replacing the ₿ / ⚽ / 📱 emoji ──────────────────
// Tinted by categoryColor() from components/predict/ui.ts so a category reads the same here as it
// does on the board.

export function CryptoIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 8.5h4a2.25 2.25 0 0 1 0 4.5h-4" />
      <path d="M9.5 13h4.4a2.25 2.25 0 0 1 0 4.5H9.5z" />
      <path d="M9.5 6.5v11" />
    </svg>
  )
}

export function SportsIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 6.5l3.6 2.6-1.4 4.2H9.8L8.4 9.1z" />
      <path d="M12 3.5v3M4.4 9.4l2.9 2M19.6 9.4l-2.9 2M8.2 20l1.6-3.9M15.8 20l-1.6-3.9" />
    </svg>
  )
}

export function SocialIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
      <path d="M10.5 9.8l4.6 2.7-4.6 2.7z" />
    </svg>
  )
}

// Falls back to this when a category has no dedicated glyph.
export function GlobeIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5z" />
    </svg>
  )
}

// A settled check, used in the resolver read-out.
export function CheckIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  )
}
