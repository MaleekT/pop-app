import { createWalletClient, createPublicClient, keccak256, toHex } from 'viem'
import { arcTransport } from '@/lib/markets/rpc'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { createMarketsClient } from '@/lib/markets/supabase'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi, MARKET_STATUS } from '@/lib/predict/contracts'
import * as cryptoPrice from '@/lib/markets/engines/crypto-price'
import * as sports from '@/lib/markets/engines/sports'
import * as youtube from '@/lib/markets/engines/youtube'
import type { MarketResolveInput } from '@/lib/markets/engines/types'
import type { MarketRow, MarketStatus, MarketEvidenceJson, MarketVoidEvidenceJson } from '@/lib/markets/db.types'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!
const SPORTS_KEYS = new Set(['sports_winner', 'sports_score'])

// Indices into PredictMarket.Status (contracts/src/predict/PredictMarket.sol:27), which
// MARKET_STATUS mirrors positionally.
const STATUS_PENDING = 0
const STATUS_PROPOSED = 1

// Statuses a market can still move out of. A row stays in the work queue until the CHAIN reports
// a terminal status, never on the strength of a mirror write.
const NON_TERMINAL: MarketStatus[] = ['Pending', 'Proposed', 'Challenged']

// Betting on a fixture closes at kick-off and the engine reports `pending` until it reads FT, so a
// sports market is legitimately Pending-and-overdue for the whole match. Age alone is therefore not
// evidence of a fault; only flag a Pending market well past any plausible fixture length.
const STALE_PENDING_MS = 6 * 60 * 60 * 1000

const makePublicClient = () => createPublicClient({ chain: arcTestnet, transport: arcTransport() })
const makeWalletClient = (account: ReturnType<typeof privateKeyToAccount>) =>
  createWalletClient({ account, chain: arcTestnet, transport: arcTransport() })

interface ResolverCtx {
  publicClient: ReturnType<typeof makePublicClient>
  walletClient: ReturnType<typeof makeWalletClient>
  db: ReturnType<typeof createMarketsClient>
}

interface ChainMarket {
  status: number
  resolvedOutcome: number
  proposedAt: bigint
}

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

interface StuckLog {
  id: string
  reason: string
  chainStatus: MarketStatus | null
  overdueMinutes: number
  definition: string
}

export interface MarketResolverResult {
  processed: number
  results: ResultLog[]
  stuck: StuckLog[]
}

async function readChainMarket(ctx: ResolverCtx, id: bigint): Promise<ChainMarket> {
  const m = await ctx.publicClient.readContract({
    address: PREDICT_MARKET_CONTRACT,
    abi: predictMarketAbi,
    functionName: 'getMarket',
    args: [id],
  })
  return m as unknown as ChainMarket
}

// A throw out of waitForTransactionReceipt proves nothing on this RPC: it routinely gives up while
// the tx is still mining, and the tx lands anyway. So an exception here is recorded, never acted on
// — the caller re-reads the chain and lets that decide what happened. Concluding "failed" from the
// throw, and skipping the mirror write on that basis, is precisely what stranded market 3: proposed
// on-chain, Pending in the mirror, and claimed by neither of the old two passes.
async function trySend(ctx: ResolverCtx, label: string, id: string, send: () => Promise<`0x${string}`>): Promise<void> {
  try {
    const hash = await send()
    await ctx.publicClient.waitForTransactionReceipt({ hash })
  } catch (err) {
    console.error(`markets resolver: ${label} on market ${id} did not confirm (may still have landed):`, err)
  }
}

// Re-reads chain state after a write. Falls back to the last known state if the read itself fails:
// the row stays non-terminal either way, so the next run picks it up and tries again.
async function rereadOr(ctx: ResolverCtx, id: bigint, fallback: ChainMarket): Promise<ChainMarket> {
  try {
    return await readChainMarket(ctx, id)
  } catch (err) {
    console.error(`markets resolver: chain re-read failed for market ${id}:`, err)
    return fallback
  }
}

interface EngineStep {
  skip?: string
  evidence: MarketEvidenceJson | MarketVoidEvidenceJson | null
}

// Runs only when the CHAIN says Pending, so it can never re-propose an already-proposed market.
async function runEngineStep(ctx: ResolverCtx, m: MarketRow, id: bigint): Promise<EngineStep> {
  const engine = getEngine(m.template_key)
  if (!engine) return { skip: 'no-engine', evidence: null }

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
    return { skip: 'engine-error', evidence: null }
  }

  // The result is not out yet. A sports market sits here for the length of the match.
  if (r.pending) return { skip: 'awaiting-result', evidence: null }

  if (r.voided) {
    // Only sports fixtures void (postponed/cancelled). Guard mirrors the PvP resolver.
    if (!SPORTS_KEYS.has(m.template_key)) return { skip: 'void-skipped-non-sports', evidence: null }
    const voidEvidence: MarketVoidEvidenceJson = r.evidence
    const voidHash = keccak256(toHex(JSON.stringify(voidEvidence)))
    await trySend(ctx, 'voidMarket', m.on_chain_id, () =>
      ctx.walletClient.writeContract({
        address: PREDICT_MARKET_CONTRACT,
        abi: predictMarketAbi,
        functionName: 'voidMarket',
        args: [id, voidHash],
      }),
    )
    return { evidence: voidEvidence }
  }

  const evidence: MarketEvidenceJson = { sourceUrl: r.sourceUrl, rawValue: r.rawValue, fetchedAt: r.fetchedAt }
  const evidenceHash = keccak256(toHex(JSON.stringify(evidence)))
  await trySend(ctx, 'proposeOutcome', m.on_chain_id, () =>
    ctx.walletClient.writeContract({
      address: PREDICT_MARKET_CONTRACT,
      abi: predictMarketAbi,
      functionName: 'proposeOutcome',
      args: [id, r.outcomeIndex, evidenceHash],
    }),
  )
  return { evidence }
}

// The row is a projection of the chain, so every value written here comes from a chain read.
// `evidence` is the sole exception: it only exists in the run that produced it, so a market healed
// from an earlier run's write keeps whatever evidence it already had rather than gaining a blob
// whose hash would not match the on-chain evidenceHash.
async function mirrorToDb(
  ctx: ResolverCtx,
  m: MarketRow,
  chain: ChainMarket,
  evidence: MarketEvidenceJson | MarketVoidEvidenceJson | null,
): Promise<void> {
  const status = MARKET_STATUS[chain.status] as MarketStatus | undefined
  if (!status) throw new Error(`unknown on-chain status ${chain.status}`)

  const patch: Partial<MarketRow> = { status }
  if (status === 'Proposed' || status === 'Challenged' || status === 'Resolved') {
    patch.resolved_outcome = chain.resolvedOutcome
    patch.proposed_at = chain.proposedAt > 0n ? new Date(Number(chain.proposedAt) * 1000).toISOString() : null
  }
  // Evidence only means something once the outcome it justifies is on-chain. A market still Pending
  // here had its write fail for real, so the row is left alone and the next run re-derives it.
  if (evidence && status !== 'Pending') patch.evidence = evidence
  if (status === m.status && patch.evidence === undefined) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (ctx.db.from('markets') as any)
    .update(patch)
    .eq('on_chain_id', m.on_chain_id)
    .eq('contract_address', m.contract_address)
  // A silently dropped mirror write is the failure this rewrite exists to prevent, so it must be
  // loud. The row stays non-terminal regardless, so the next run retries it.
  if (error) throw new Error(`mirror write failed: ${error.message}`)
}

// Brings one market's row into line with the chain, acting on chain state at every branch.
async function reconcileMarket(ctx: ResolverCtx, m: MarketRow): Promise<{ outcome: string; chainStatus: MarketStatus | null }> {
  const id = BigInt(m.on_chain_id)
  let chain: ChainMarket
  try {
    chain = await readChainMarket(ctx, id)
  } catch (err) {
    console.error(`markets resolver: chain read failed for market ${m.on_chain_id}:`, err)
    return { outcome: 'chain-read-failed', chainStatus: null }
  }

  let evidence: MarketEvidenceJson | MarketVoidEvidenceJson | null = null

  if (chain.status === STATUS_PENDING) {
    const step = await runEngineStep(ctx, m, id)
    if (step.skip) return { outcome: step.skip, chainStatus: 'Pending' }
    evidence = step.evidence
    chain = await rereadOr(ctx, id, chain)
  }

  // finalize() is permissionless and CHALLENGE_WINDOW is 0, so it is due the moment a market is
  // Proposed. Reaching this from a chain read rather than from this run's own propose is what lets
  // a market stranded by an earlier run settle itself. finalize() also auto-voids a market with an
  // empty winning pool, which the chain re-read below picks up.
  if (chain.status === STATUS_PROPOSED) {
    await trySend(ctx, 'finalize', m.on_chain_id, () =>
      ctx.walletClient.writeContract({
        address: PREDICT_MARKET_CONTRACT,
        abi: predictMarketAbi,
        functionName: 'finalize',
        args: [id],
      }),
    )
    chain = await rereadOr(ctx, id, chain)
  }

  const chainStatus = (MARKET_STATUS[chain.status] as MarketStatus | undefined) ?? null
  try {
    await mirrorToDb(ctx, m, chain, evidence)
  } catch (err) {
    console.error(`markets resolver: mirror failed for market ${m.on_chain_id}:`, err)
    return { outcome: 'mirror-failed', chainStatus }
  }
  return { outcome: chainStatus ?? 'unknown', chainStatus }
}

// Names the states that should be impossible, so a regression surfaces in the cron response instead
// of hiding in a results row nobody reads for fourteen hours.
function stuckReason(m: MarketRow, chainStatus: MarketStatus | null): string | null {
  if (chainStatus === 'Proposed') return 'proposed-but-not-finalized'
  if (chainStatus === 'Pending' && Date.now() - Date.parse(m.resolve_at) > STALE_PENDING_MS) return 'no-result-after-6h'
  return null
}

export async function runMarketResolver(): Promise<MarketResolverResult> {
  const resolverKey = requireEnv('RESOLVER_PRIVATE_KEY') as `0x${string}`
  if (!CONTRACT_ADDRESS) throw new Error('NEXT_PUBLIC_PREDICT_MARKET_CONTRACT not configured')

  const account = privateKeyToAccount(resolverKey)
  const publicClient = makePublicClient()

  const onChainResolver = await publicClient.readContract({
    address: PREDICT_MARKET_CONTRACT,
    abi: predictMarketAbi,
    functionName: 'resolver',
  })
  if ((onChainResolver as string).toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Resolver mismatch: on-chain=${onChainResolver} wallet=${account.address}`)
  }

  const ctx: ResolverCtx = { publicClient, walletClient: makeWalletClient(account), db: createMarketsClient() }
  const now = new Date().toISOString()

  // One work queue, not a Pending pass plus a Proposed pass. That split was the defect: a market
  // whose propose landed but whose mirror write did not belonged to neither pass — the Pending pass
  // re-proposed it forever against a contract that reverts WrongStatus, and the Proposed pass keyed
  // off the mirror it never got, so nothing ever called finalize(). Oldest close first, so a
  // backlog drains in a deterministic order and a run that times out mid-loop leaves the rest
  // non-terminal for the next run to pick up.
  const { data, error } = await ctx.db
    .from('markets')
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .in('status', NON_TERMINAL)
    .lte('resolve_at', now)
    .order('resolve_at', { ascending: true })
  if (error) throw new Error(error.message)

  const results: ResultLog[] = []
  const stuck: StuckLog[] = []

  for (const m of (data ?? []) as MarketRow[]) {
    const { outcome, chainStatus } = await reconcileMarket(ctx, m)
    results.push({ id: m.on_chain_id, outcome })
    const reason = stuckReason(m, chainStatus)
    if (reason) {
      stuck.push({
        id: m.on_chain_id,
        reason,
        chainStatus,
        overdueMinutes: Math.round((Date.now() - Date.parse(m.resolve_at)) / 60_000),
        definition: m.definition_text,
      })
    }
  }

  return { processed: results.length, results, stuck }
}
