interface TxLinkProps {
  hash: string
  children?: React.ReactNode
  className?: string
}

const EXPLORER = 'https://testnet.arcscan.app'

export function TxLink({ hash, children, className }: TxLinkProps) {
  return (
    <a
      href={`${EXPLORER}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{ color: 'var(--color-pop-accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
    >
      {children ?? `${hash.slice(0, 10)}…${hash.slice(-6)}`}
    </a>
  )
}

interface AddressLinkProps {
  address: string
  className?: string
  profile?: { handle?: string | null }
}

export function AddressLink({ address, className, profile }: AddressLinkProps) {
  const handle = profile?.handle
  return (
    <a
      href={`${EXPLORER}/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{ color: 'var(--color-pop-muted)', fontFamily: handle ? undefined : 'var(--font-mono)', fontSize: '0.85em', textDecoration: 'none' }}
    >
      {handle ? (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <span style={{ color: 'var(--color-pop-text)', fontWeight: 600, fontFamily: 'inherit' }}>@{handle}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8em' }}>{address.slice(0, 6)}…{address.slice(-4)}</span>
        </span>
      ) : (
        <>{address.slice(0, 6)}…{address.slice(-4)}</>
      )}
    </a>
  )
}
