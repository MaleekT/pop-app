import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { PARLAY_CONTRACT, parlayAbi } from '@/lib/predict/contracts'
import { USDC, erc20Abi } from '@/lib/contracts'
import { HOUSE_FLOOR, HOUSE_TARGET } from '@/lib/markets/bankroll-config'

const PARLAY_ADDRESS = process.env.NEXT_PUBLIC_PARLAY_CONTRACT!

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

// How much to move into the house: nothing if available is at/above the floor, else top
// back up to target, capped by what the owner wallet actually holds. Pure and testable.
export function houseTopUpAmount(available: bigint, ownerBalance: bigint, floor: bigint, target: bigint): bigint {
  if (available >= floor) return 0n
  const needed = target - available
  if (needed <= 0n) return 0n // guard against a misconfigured target <= available
  return needed <= ownerBalance ? needed : ownerBalance
}

export interface HouseTopUpResult {
  topped: boolean
  amount?: string
  reason?: string
}

// Keeps the parlay house pool funded from the owner wallet so winning parlays can always
// be paid. Losing-parlay stakes flow back into the house, so this is a variance backstop,
// not a steady drain.
export async function topUpHouseIfLow(): Promise<HouseTopUpResult> {
  const key = requireEnv('RESOLVER_PRIVATE_KEY') as `0x${string}`
  const rpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? 'https://rpc.testnet.arc.network'
  if (!PARLAY_ADDRESS) throw new Error('NEXT_PUBLIC_PARLAY_CONTRACT not configured')

  const account = privateKeyToAccount(key)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) })

  const available = (await publicClient.readContract({
    address: PARLAY_CONTRACT, abi: parlayAbi, functionName: 'houseAvailable',
  })) as bigint
  if (available >= HOUSE_FLOOR) return { topped: false, reason: 'house-ok' }

  const ownerBalance = (await publicClient.readContract({
    address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address],
  })) as bigint
  const amount = houseTopUpAmount(available, ownerBalance, HOUSE_FLOOR, HOUSE_TARGET)
  if (amount <= 0n) return { topped: false, reason: 'owner-usdc-empty' }

  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) })
  const approveHash = await walletClient.writeContract({
    address: USDC, abi: erc20Abi, functionName: 'approve', args: [PARLAY_CONTRACT, amount],
  })
  await publicClient.waitForTransactionReceipt({ hash: approveHash })
  const fundHash = await walletClient.writeContract({
    address: PARLAY_CONTRACT, abi: parlayAbi, functionName: 'fundHouse', args: [amount],
  })
  await publicClient.waitForTransactionReceipt({ hash: fundHash })

  return { topped: true, amount: amount.toString() }
}
