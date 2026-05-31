import { createWalletClient, createPublicClient, http, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { createServerClient } from '@/lib/supabase'
import { POP_CONTRACT, popAbi } from '@/lib/contracts'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_POP_CONTRACT!
import * as cryptoPrice from '@/lib/engines/crypto-price'
import * as youtube from '@/lib/engines/youtube'
import * as sports from '@/lib/engines/sports'
import type { ResolveParams } from '@/lib/engines/types'
import type { BetRow, EvidenceJson, VoidEvidenceJson } from '@/lib/db.types'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

function getEngine(templateKey: string) {
  if (templateKey.startsWith('crypto_price')) return cryptoPrice
  if (templateKey.startsWith('youtube')) return youtube
  if (templateKey.startsWith('sports')) return sports
  return null
}

export interface ResolverResult {
  processed: number
  results: { id: string; outcome: string }[]
}

export async function runResolver(): Promise<ResolverResult> {
  const resolverKey = requireEnv('RESOLVER_PRIVATE_KEY') as `0x${string}`
  const rpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? 'https://rpc.testnet.arc.network'

  const account = privateKeyToAccount(resolverKey)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) })

  const onChainResolver = await publicClient.readContract({
    address: POP_CONTRACT,
    abi: popAbi,
    functionName: 'resolver',
  })

  if (onChainResolver.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Resolver mismatch: on-chain=${onChainResolver} wallet=${account.address}`)
  }

  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpc),
  })

  const db = createServerClient()
  const now = new Date().toISOString()

  if (!CONTRACT_ADDRESS) throw new Error('NEXT_PUBLIC_POP_CONTRACT not configured')

  const { data: rawBets, error } = await db
    .from('bets')
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .eq('status', 'Locked')
    .lte('resolve_at', now)

  if (error) throw new Error(error.message)

  const bets = rawBets as BetRow[]
  const results: { id: string; outcome: string }[] = []

  for (const bet of bets) {
    const engine = getEngine(bet.template_key)
    if (!engine) {
      results.push({ id: bet.on_chain_id, outcome: 'no-engine' })
      continue
    }

    const input: ResolveParams = {
      templateKey: bet.template_key,
      params: bet.params as Record<string, string>,
      creator: bet.creator as `0x${string}`,
      opponent: bet.opponent as `0x${string}`,
    }

    let resolveResult
    try {
      resolveResult = await engine.resolve(input)
    } catch {
      results.push({ id: bet.on_chain_id, outcome: 'engine-error' })
      continue
    }

    if (resolveResult.pending) {
      results.push({ id: bet.on_chain_id, outcome: 'pending' })
      continue
    }

    if (resolveResult.voided) {
      const SPORTS_KEYS = new Set(['sports_winner', 'sports_score'])
      if (!SPORTS_KEYS.has(bet.template_key)) {
        results.push({ id: bet.on_chain_id, outcome: 'void-skipped-non-sports' })
        continue
      }

      const voidEvidence: VoidEvidenceJson = resolveResult.evidence
      const voidEvidenceHash = keccak256(toHex(JSON.stringify(voidEvidence)))

      try {
        const hash = await walletClient.writeContract({
          address: POP_CONTRACT,
          abi: popAbi,
          functionName: 'voidBet',
          args: [BigInt(bet.on_chain_id), voidEvidenceHash],
        })
        await publicClient.waitForTransactionReceipt({ hash })
      } catch (err) {
        console.error(`voidBet tx failed for bet ${bet.on_chain_id}:`, err)
        results.push({ id: bet.on_chain_id, outcome: 'void-tx-failed' })
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (db.from('bets') as any)
        .update({ status: 'Voided', evidence: voidEvidence })
        .eq('on_chain_id', bet.on_chain_id)
        .eq('contract_address', bet.contract_address)
      if (dbErr) console.error(`DB update failed after voidBet for bet ${bet.on_chain_id}:`, dbErr)

      results.push({ id: bet.on_chain_id, outcome: 'voided' })
      continue
    }

    const evidence: EvidenceJson = {
      sourceUrl: resolveResult.sourceUrl,
      rawValue: resolveResult.rawValue,
      fetchedAt: resolveResult.fetchedAt,
    }
    const evidenceHash = keccak256(toHex(JSON.stringify(evidence)))

    try {
      const hash = await walletClient.writeContract({
        address: POP_CONTRACT,
        abi: popAbi,
        functionName: 'proposeResolution',
        args: [BigInt(bet.on_chain_id), resolveResult.winner, evidenceHash],
      })
      await publicClient.waitForTransactionReceipt({ hash })
    } catch {
      results.push({ id: bet.on_chain_id, outcome: 'tx-failed' })
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('bets') as any)
      .update({ status: 'Proposed', proposed_winner: resolveResult.winner, evidence })
      .eq('on_chain_id', bet.on_chain_id)
      .eq('contract_address', bet.contract_address)

    results.push({ id: bet.on_chain_id, outcome: 'proposed' })
  }

  return { processed: results.length, results }
}
