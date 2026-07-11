import { createWalletClient, createPublicClient, http, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { createMarketsClient } from '@/lib/markets/supabase'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi, MARKET_STATUS } from '@/lib/predict/contracts'
import * as cryptoPrice from '@/lib/markets/engines/crypto-price'
import * as sports from '@/lib/markets/engines/sports'
import * as youtube from '@/lib/markets/engines/youtube'
import type { MarketResolveInput } from '@/lib/markets/engines/types'
import type { MarketRow, MarketEvidenceJson, MarketVoidEvidenceJson } from '@/lib/markets/db.types'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!
const CHALLENGE_WINDOW_MS = 0 // mirrors PredictMarket.CHALLENGE_WINDOW (instant: propose + finalize in one run)
const SPORTS_KEYS = new Set(['sports_winner', 'sports_score'])

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

function getEngine(templateKey: string) {
  if (templateKey.startsWith('crypto_price')) return cryptoPrice
  if (templateKey.startsWith('sports')) return sports
  if (templateKey.startsWith('youtube')) return youtube
  return null
}

interface ResultLog {
  id: string
  outcome: string
}

export interface MarketResolverResult {
  processed: number
  results: ResultLog[]
}

export async function runMarketResolver(): Promise<MarketResolverResult> {
  const resolverKey = requireEnv('RESOLVER_PRIVATE_KEY') as `0x${string}`
  const rpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? 'https://rpc.testnet.arc.network'
  if (!CONTRACT_ADDRESS) throw new Error('NEXT_PUBLIC_PREDICT_MARKET_CONTRACT not configured')

  const account = privateKeyToAccount(resolverKey)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) })

  const onChainResolver = await publicClient.readContract({
    address: PREDICT_MARKET_CONTRACT,
    abi: predictMarketAbi,
    functionName: 'resolver',
  })
  if ((onChainResolver as string).toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Resolver mismatch: on-chain=${onChainResolver} wallet=${account.address}`)
  }

  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) })
  const db = createMarketsClient()
  const now = new Date().toISOString()
  const results: ResultLog[] = []

  // Pass 1 — propose (or void) outcomes for markets whose betting window has closed.
  const { data: pendingData, error: pErr } = await db
    .from('markets')
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .eq('status', 'Pending')
    .lte('resolve_at', now)
  if (pErr) throw new Error(pErr.message)

  for (const m of (pendingData ?? []) as MarketRow[]) {
    const engine = getEngine(m.template_key)
    if (!engine) {
      results.push({ id: m.on_chain_id, outcome: 'no-engine' })
      continue
    }

    const input: MarketResolveInput = {
      templateKey: m.template_key,
      params: m.params,
      outcomeCount: m.outcomes.length,
    }

    let r
    try {
      r = await engine.resolve(input)
    } catch (err) {
      console.error(`markets resolver: engine error for market ${m.on_chain_id}:`, err)
      results.push({ id: m.on_chain_id, outcome: 'engine-error' })
      continue
    }

    if (r.pending) {
      results.push({ id: m.on_chain_id, outcome: 'pending' })
      continue
    }

    if (r.voided) {
      // Only sports fixtures void (postponed/cancelled). Guard mirrors the PvP resolver.
      if (!SPORTS_KEYS.has(m.template_key)) {
        results.push({ id: m.on_chain_id, outcome: 'void-skipped-non-sports' })
        continue
      }
      const voidEvidence: MarketVoidEvidenceJson = r.evidence
      const voidHash = keccak256(toHex(JSON.stringify(voidEvidence)))
      try {
        const hash = await walletClient.writeContract({
          address: PREDICT_MARKET_CONTRACT,
          abi: predictMarketAbi,
          functionName: 'voidMarket',
          args: [BigInt(m.on_chain_id), voidHash],
        })
        await publicClient.waitForTransactionReceipt({ hash })
      } catch (err) {
        console.error(`markets resolver: voidMarket tx failed for market ${m.on_chain_id}:`, err)
        results.push({ id: m.on_chain_id, outcome: 'void-tx-failed' })
        continue
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.from('markets') as any)
        .update({ status: 'Voided', evidence: voidEvidence })
        .eq('on_chain_id', m.on_chain_id)
        .eq('contract_address', m.contract_address)
      results.push({ id: m.on_chain_id, outcome: 'voided' })
      continue
    }

    const evidence: MarketEvidenceJson = { sourceUrl: r.sourceUrl, rawValue: r.rawValue, fetchedAt: r.fetchedAt }
    const evidenceHash = keccak256(toHex(JSON.stringify(evidence)))
    try {
      const hash = await walletClient.writeContract({
        address: PREDICT_MARKET_CONTRACT,
        abi: predictMarketAbi,
        functionName: 'proposeOutcome',
        args: [BigInt(m.on_chain_id), r.outcomeIndex, evidenceHash],
      })
      await publicClient.waitForTransactionReceipt({ hash })
    } catch (err) {
      console.error(`markets resolver: proposeOutcome tx failed for market ${m.on_chain_id}:`, err)
      results.push({ id: m.on_chain_id, outcome: 'tx-failed' })
      continue
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('markets') as any)
      .update({ status: 'Proposed', resolved_outcome: r.outcomeIndex, proposed_at: new Date().toISOString(), evidence })
      .eq('on_chain_id', m.on_chain_id)
      .eq('contract_address', m.contract_address)
    results.push({ id: m.on_chain_id, outcome: 'proposed' })
  }

  // Pass 2 — finalize proposed markets whose challenge window has elapsed. finalize()
  // is permissionless on-chain and reverts while still open, so those are skipped.
  const cutoff = new Date(Date.now() - CHALLENGE_WINDOW_MS).toISOString()
  const { data: proposedData, error: fErr } = await db
    .from('markets')
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .eq('status', 'Proposed')
    .lte('proposed_at', cutoff)
  if (fErr) throw new Error(fErr.message)

  for (const m of (proposedData ?? []) as MarketRow[]) {
    try {
      const hash = await walletClient.writeContract({
        address: PREDICT_MARKET_CONTRACT,
        abi: predictMarketAbi,
        functionName: 'finalize',
        args: [BigInt(m.on_chain_id)],
      })
      await publicClient.waitForTransactionReceipt({ hash })
    } catch {
      results.push({ id: m.on_chain_id, outcome: 'finalize-skipped' })
      continue
    }

    // finalize() auto-voids a market with an empty winning pool; reconcile from chain.
    const mkt = await publicClient.readContract({
      address: PREDICT_MARKET_CONTRACT,
      abi: predictMarketAbi,
      functionName: 'getMarket',
      args: [BigInt(m.on_chain_id)],
    })
    const statusIdx = Number((mkt as unknown as { status: number }).status)
    const finalStatus = MARKET_STATUS[statusIdx] ?? 'Proposed'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('markets') as any)
      .update({ status: finalStatus })
      .eq('on_chain_id', m.on_chain_id)
      .eq('contract_address', m.contract_address)
    results.push({ id: m.on_chain_id, outcome: finalStatus === 'Voided' ? 'finalized-voided' : 'finalized' })
  }

  return { processed: results.length, results }
}
