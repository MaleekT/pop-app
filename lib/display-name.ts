import type { Address } from 'viem'

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
