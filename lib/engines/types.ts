import type { Address } from 'viem'

export interface ResolveParams {
  templateKey: string
  params: Record<string, string>
  creator: Address
  opponent: Address
}

export type ResolveResult =
  | { pending: true }
  | { pending: false; voided: true; evidence: { sourceUrl: string; rawStatus: string; fetchedAt: string } }
  | { pending: false; voided: false; winner: Address; rawValue: string; sourceUrl: string; fetchedAt: string }
