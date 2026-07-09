import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { createMarketsClient } from '@/lib/markets/supabase'
import { PARLAY_CONTRACT, parlayAbi, PARLAY_STATUS } from '@/lib/predict/contracts'
import type { ParlayLeg, ParlayRow } from '@/lib/markets/db.types'

const PARLAY_ADDRESS = process.env.NEXT_PUBLIC_PARLAY_CONTRACT!
const MARKET_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!
const TERMINAL_MARKET_STATUS = new Set(['Resolved', 'Voided'])

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

interface SettleLog {
  id: string
  outcome: string
}

export interface ParlaySettlerResult {
  processed: number
  results: SettleLog[]
}

// Whether every leg has reached a terminal market status (Resolved or Voided), using a
// prefetched status map. Pure and testable; mirrors the on-chain settle precondition.
export function allLegsTerminal(legs: ParlayLeg[], statusByMarket: Map<string, string>): boolean {
  if (legs.length === 0) return false
  return legs.every((l) => TERMINAL_MARKET_STATUS.has(statusByMarket.get(l.marketOnChainId) ?? ''))
}

// Reads a ticket's on-chain status and, if terminal, syncs the DB. Returns a result tag
// when it wrote a correction, else null (nothing to reconcile / still open). This makes
// the cron the authoritative writer of parlay status (closes the client-mirror gap).
async function reconcileFromChain(
  publicClient: ReturnType<typeof createPublicClient>,
  db: ReturnType<typeof createMarketsClient>,
  onChainId: string,
): Promise<string | null> {
  try {
    const ticket = (await publicClient.readContract({
      address: PARLAY_CONTRACT,
      abi: parlayAbi,
      functionName: 'tickets',
      args: [BigInt(onChainId)],
    })) as unknown as readonly [`0x${string}`, bigint, bigint, number]
    const chainStatus = PARLAY_STATUS[Number(ticket[3])] ?? 'Open'
    if (chainStatus === 'Open') return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('parlays') as any)
      .update({ status: chainStatus })
      .eq('on_chain_id', onChainId)
      .eq('contract_address', PARLAY_ADDRESS)
    return `reconciled-${chainStatus.toLowerCase()}`
  } catch {
    return null
  }
}

// Auto-settles open parlay tickets whose legs have all resolved. settle() is
// permissionless on-chain; the cron pays gas and mirrors the final status. Runs on its
// own cron-job.org trigger, isolated from resolution and PvP.
export async function runParlaySettler(): Promise<ParlaySettlerResult> {
  const key = requireEnv('RESOLVER_PRIVATE_KEY') as `0x${string}`
  const rpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? 'https://rpc.testnet.arc.network'
  if (!PARLAY_ADDRESS) throw new Error('NEXT_PUBLIC_PARLAY_CONTRACT not configured')

  const account = privateKeyToAccount(key)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) })
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) })
  const db = createMarketsClient()
  const results: SettleLog[] = []

  const { data: openData, error } = await db
    .from('parlays')
    .select('*')
    .eq('contract_address', PARLAY_ADDRESS)
    .eq('status', 'Open')
  if (error) throw new Error(error.message)
  const open = (openData ?? []) as ParlayRow[]
  if (open.length === 0) return { processed: 0, results }

  // One query for every referenced leg market's mirrored status, so we only attempt
  // settle() for tickets that can actually settle (avoids doomed gas spends).
  const legIds = Array.from(new Set(open.flatMap((p) => p.legs.map((l) => l.marketOnChainId))))
  const statusByMarket = new Map<string, string>()
  if (legIds.length > 0) {
    const { data: mData } = await db
      .from('markets')
      .select('on_chain_id,status')
      .eq('contract_address', MARKET_ADDRESS)
      .in('on_chain_id', legIds)
    for (const m of (mData ?? []) as { on_chain_id: string; status: string }[]) {
      statusByMarket.set(m.on_chain_id, m.status)
    }
  }

  for (const p of open) {
    if (!allLegsTerminal(p.legs, statusByMarket)) {
      results.push({ id: p.on_chain_id, outcome: 'legs-not-terminal' })
      continue
    }
    try {
      const hash = await walletClient.writeContract({
        address: PARLAY_CONTRACT,
        abi: parlayAbi,
        functionName: 'settle',
        args: [BigInt(p.on_chain_id)],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const [log] = parseEventLogs({ abi: parlayAbi, eventName: 'TicketSettled', logs: receipt.logs })
      if (!log) {
        // Settled on-chain but the event was unreadable — take status from chain truth.
        const reconciled = await reconcileFromChain(publicClient, db, p.on_chain_id)
        results.push({ id: p.on_chain_id, outcome: reconciled ?? 'settled-unknown' })
        continue
      }
      const finalStatus = PARLAY_STATUS[Number(log.args.status)] ?? 'Open'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.from('parlays') as any)
        .update({ status: finalStatus })
        .eq('on_chain_id', p.on_chain_id)
        .eq('contract_address', PARLAY_ADDRESS)
      results.push({ id: p.on_chain_id, outcome: `settled-${finalStatus.toLowerCase()}` })
    } catch (err) {
      // settle() reverted: the chain lags the DB mirror (LegNotTerminal), or the ticket
      // is already terminal on-chain (WrongStatus). Reconcile from chain truth.
      const reconciled = await reconcileFromChain(publicClient, db, p.on_chain_id)
      if (reconciled == null) console.error(`parlay settler: settle reverted for ${p.on_chain_id}:`, err)
      results.push({ id: p.on_chain_id, outcome: reconciled ?? 'settle-skipped' })
    }
  }

  return { processed: results.length, results }
}
