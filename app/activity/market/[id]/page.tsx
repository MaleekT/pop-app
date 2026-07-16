'use client'

import { useParams } from 'next/navigation'
import { MarketDetail } from '@/components/predict/MarketDetail'

// Activity's copy of the market detail view. Checking a position you already hold is an Activity job,
// not a Predict one, so it gets an Activity URL: AppNav lights a tab by pathname, so borrowing
// /predict/[id] for this genuinely moved the user into Predict. Nested under /market rather than
// /activity/[id] so a numeric market id can never collide with a static segment added later.
export default function ActivityMarketPage() {
  const { id } = useParams<{ id: string }>()
  return <MarketDetail id={id} backHref="/activity?tab=predictions" />
}
