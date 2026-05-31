import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { POP_CONTRACT, USDC, erc20Abi, popAbi } from '@/lib/contracts'
import { createServerClient } from '@/lib/supabase'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_POP_CONTRACT!
const DEMO_STAKE_USDC = '1'
// Positive integers only — no leading zeros, no negatives
const BET_ID_RE = /^[1-9]\d*$/

export async function POST(req: NextRequest) {
  const houseKey = process.env.HOUSE_PRIVATE_KEY as `0x${string}` | undefined
  if (!houseKey) return NextResponse.json({ error: 'House not configured' }, { status: 503 })

  const body = await req.json() as {
    betId: string
    definitionText: string
    definitionHash: string
    templateKey: string
    params: Record<string, string>
    resolveAt: string
    creator: string
    opponent: string
  }

  if (!body.betId || !BET_ID_RE.test(body.betId)) {
    return NextResponse.json({ error: 'Invalid betId — must be a positive integer' }, { status: 400 })
  }

  const rpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? 'https://rpc.testnet.arc.network'
  const account = privateKeyToAccount(houseKey)
  const stakeRaw = parseUnits(DEMO_STAKE_USDC, 6)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) })
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) })

  let acceptTxHash: `0x${string}`

  try {
    const approveHash = await walletClient.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [POP_CONTRACT, stakeRaw],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `USDC approve failed: ${message}` }, { status: 502 })
  }

  try {
    acceptTxHash = await walletClient.writeContract({
      address: POP_CONTRACT,
      abi: popAbi,
      functionName: 'acceptBet',
      args: [BigInt(body.betId)],
    })
    await publicClient.waitForTransactionReceipt({ hash: acceptTxHash })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `acceptBet failed: ${message}` }, { status: 502 })
  }

  // Upsert so a retry after a DB failure doesn't duplicate the row.
  // The on-chain tx is already confirmed at this point — callers can
  // verify via acceptTxHash if the DB write fails.
  const db = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('bets') as any).upsert({
    on_chain_id: body.betId,
    contract_address: CONTRACT_ADDRESS,
    creator: body.creator,
    opponent: body.opponent,
    stake: stakeRaw.toString(),
    definition_text: body.definitionText,
    definition_hash: body.definitionHash,
    template_key: body.templateKey,
    params: body.params,
    resolve_at: body.resolveAt,
    status: 'Locked',
  }, { onConflict: 'on_chain_id,contract_address' })

  if (error) {
    // On-chain tx succeeded — return the hash so the caller can reconcile
    return NextResponse.json(
      { error: `DB persist failed: ${error.message}`, acceptTxHash },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, acceptTxHash })
}
