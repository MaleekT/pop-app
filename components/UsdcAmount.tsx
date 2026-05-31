import { formatUnits } from 'viem'

interface UsdcAmountProps {
  /** Raw USDC amount in 6-decimal units */
  amount: bigint | string | number
  accent?: boolean
  className?: string
}

export function UsdcAmount({ amount, className }: UsdcAmountProps) {
  const raw = typeof amount === 'string' ? BigInt(amount) : typeof amount === 'number' ? BigInt(amount) : amount
  const formatted = parseFloat(formatUnits(raw, 6)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (
    <span className={className}>
      {formatted} <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85em' }}>USDC</span>
    </span>
  )
}
