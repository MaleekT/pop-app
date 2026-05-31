import Link from 'next/link'

const SIZES = {
  sm: 40,   // secondary-page nav bars (my, new, lobby, settings)
  md: 50,   // homepage nav
  lg: 44,   // footer
} as const

interface LogoProps {
  size?: keyof typeof SIZES
}

export function Logo({ size = 'md' }: LogoProps) {
  const h = SIZES[size]
  return (
    <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/pop-logo.png"
        alt="POP"
        style={{ height: h, width: 'auto', display: 'block' }}
      />
    </Link>
  )
}
