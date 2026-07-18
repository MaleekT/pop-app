'use client'

import { useReadContract, useReadContracts } from 'wagmi'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi } from '@/lib/predict/contracts'
import type { MarketRow } from '@/lib/markets/db.types'

// Live parimutuel odds read straight from the contract, never the DB mirror, because the mirror does
// not carry pool sizes and the chain is the truth.
//
// The all-or-nothing guard is the point of this hook: odds are only real if poolSum AND every
// per-outcome pool came back. A partial read used to be indistinguishable from a genuine zero, which
// would render an invented percentage next to somebody's money. When it is not ready the caller gets
// total 0n, which OddsBar renders as a dash.

const BASE = { address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi } as const
const REFRESH_MS = 15_000

export interface MarketOdds {
  pools: bigint[]
  total: bigint
  ready: boolean
}

export function useMarketOdds(market: MarketRow): MarketOdds {
  const id = BigInt(market.on_chain_id)

  const { data: poolSumData, isSuccess: poolSumOk } = useReadContract({
    ...BASE,
    functionName: 'poolSum',
    args: [id],
    query: { refetchInterval: REFRESH_MS },
  })

  const { data: poolsData } = useReadContracts({
    contracts: market.outcomes.map((_, i) => ({ ...BASE, functionName: 'pool' as const, args: [id, i] })),
    query: { refetchInterval: REFRESH_MS },
  })

  const ready = poolSumOk && Boolean(poolsData) && poolsData!.every((r) => r.status === 'success')

  return {
    ready,
    pools: ready
      ? market.outcomes.map((_, i) => (poolsData![i].result as bigint | undefined) ?? 0n)
      : market.outcomes.map(() => 0n),
    total: ready ? ((poolSumData as bigint | undefined) ?? 0n) : 0n,
  }
}
