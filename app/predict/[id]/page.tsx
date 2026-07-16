'use client'

import { useParams } from 'next/navigation'
import { MarketDetail } from '@/components/predict/MarketDetail'

// The board's copy of the market detail view. Activity mounts the same component at
// /activity/market/[id]; the only difference is which section owns the URL, which is what AppNav
// reads to decide the lit tab.
export default function PredictMarketPage() {
  const { id } = useParams<{ id: string }>()
  return <MarketDetail id={id} backHref="/predict" />
}
