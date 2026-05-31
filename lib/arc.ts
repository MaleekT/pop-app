import { createPublicClient, http } from 'viem'
import { arcTestnet } from 'viem/chains'

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? 'https://rpc.testnet.arc.network'),
})
