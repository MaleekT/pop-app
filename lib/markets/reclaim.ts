import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { createMarketsClient } from '@/lib/markets/supabase'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi } from '@/lib/predict/contracts'
import { RECLAIM_WINDOW_DAYS } from '@/lib/markets/bankroll-config'
import type { MarketRow } from '@/lib/markets/db.types'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

export type ReclaimAction = 'claim' | 'refund' | 'skip'

// What the owner should do to recover its seed from a terminal market, given on-chain
// facts. Pure and testable.
export function reclaimAction(args: {
  status: string
  alreadyClaimed: boolean
  winningStake: bigint // owner's stake on the resolved outcome (Resolved only)
  totalStake: bigint   // owner's stake across all outcomes (Voided only)
}): ReclaimAction {
  if (args.alreadyClaimed) return 'skip'
  if (args.status === 'Resolved') return args.winningStake > 0n ? 'claim' : 'skip'
  if (args.status === 'Voided') return args.totalStake > 0n ? 'refund' : 'skip'
  return 'skip'
}

interface ReclaimLog {
  id: string
  outcome: string
}

export interface ReclaimResult {
  processed: number
  results: ReclaimLog[]
}

// Recovers the owner's seed from markets that have resolved or voided, so the seeding
// float recirculates back to the owner wallet. claim()/claimRefund() pay msg.sender, so
// the owner wallet only ever reclaims its own stake. Idempotent via the on-chain
// `claimed` flag; bounded to a recent window.
export async function runSeedReclaim(): Promise<ReclaimResult> {
  const key = requireEnv('RESOLVER_PRIVATE_KEY') as `0x${string}`
  const rpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? 'https://rpc.testnet.arc.network'
  if (!CONTRACT_ADDRESS) throw new Error('NEXT_PUBLIC_PREDICT_MARKET_CONTRACT not configured')

  const account = privateKeyToAccount(key)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) })
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) })
  const owner = account.address
  const db = createMarketsClient()
  const results: ReclaimLog[] = []

  const windowIso = new Date(Date.now() - RECLAIM_WINDOW_DAYS * 86_400_000).toISOString()
  const { data, error } = await db
    .from('markets')
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .in('status', ['Resolved', 'Voided'])
    .gt('resolve_at', windowIso)
  if (error) throw new Error(error.message)
  const terminal = (data ?? []) as MarketRow[]

  for (const m of terminal) {
    const id = BigInt(m.on_chain_id)
    const alreadyClaimed = (await publicClient.readContract({
      address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi, functionName: 'claimed', args: [id, owner],
    })) as boolean

    let winningStake = 0n
    let totalStake = 0n
    if (m.status === 'Resolved' && m.resolved_outcome != null) {
      winningStake = (await publicClient.readContract({
        address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi, functionName: 'staked', args: [id, m.resolved_outcome, owner],
      })) as bigint
    } else if (m.status === 'Voided') {
      for (let o = 0; o < m.outcomes.length; o++) {
        totalStake += (await publicClient.readContract({
          address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi, functionName: 'staked', args: [id, o, owner],
        })) as bigint
      }
    }

    const action = reclaimAction({ status: m.status, alreadyClaimed: Boolean(alreadyClaimed), winningStake, totalStake })
    if (action === 'skip') {
      results.push({ id: m.on_chain_id, outcome: 'skip' })
      continue
    }

    try {
      const hash = await walletClient.writeContract({
        address: PREDICT_MARKET_CONTRACT,
        abi: predictMarketAbi,
        functionName: action === 'claim' ? 'claim' : 'claimRefund',
        args: [id],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      results.push({ id: m.on_chain_id, outcome: action === 'claim' ? 'claimed' : 'refunded' })
    } catch (err) {
      console.error(`reclaim: ${action} failed for market ${m.on_chain_id}:`, err)
      results.push({ id: m.on_chain_id, outcome: 'error' })
    }
  }

  return { processed: results.length, results }
}
