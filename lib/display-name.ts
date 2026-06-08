import type { Address } from 'viem'

/**
 * Strips internal technical details from a bet definition string for display.
 * The original definition_text is preserved in the DB and used for hash verification —
 * this function only affects what the user sees.
 *
 * Removes:
 *   - Fixture references: " (football fixture #tsdb:2470308)"
 *   - Source attributions: " per TheSportsDB", " per CoinGecko", " per YouTube Data API v3"
 */
export function formatBetTitle(definitionText: string): string {
  return definitionText
    .replace(/\s*\(\w+\s+fixture\s+#[^)]+\)/gi, '')
    .replace(/\s+per\s+(TheSportsDB|CoinGecko|YouTube Data API v3)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export interface DisplayName {
  primary: string
  secondary?: string
  isHandle: boolean
}

export function displayNameSync(addr: Address, profile?: { handle?: string | null }): DisplayName {
  const handle = profile?.handle
  if (!handle) {
    return { primary: `${addr.slice(0, 6)}…${addr.slice(-4)}`, isHandle: false }
  }
  return {
    primary: `@${handle}`,
    secondary: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    isHandle: true,
  }
}

export async function displayName(addr: Address): Promise<DisplayName> {
  try {
    const res = await fetch(`/api/profile?address=${encodeURIComponent(addr)}`)
    if (!res.ok) return displayNameSync(addr)
    const profile = await res.json() as { handle?: string | null } | null
    return displayNameSync(addr, profile ?? undefined)
  } catch {
    return displayNameSync(addr)
  }
}
