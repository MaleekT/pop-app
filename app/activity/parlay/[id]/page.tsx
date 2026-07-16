'use client'

import { useParams } from 'next/navigation'
import { ParlayDetail } from '@/components/predict/ParlayDetail'

// Activity's copy of the ticket view. Reviewing a ticket you already bought is an Activity job, not a
// Parlay-builder one, so it gets an Activity URL: AppNav lights a tab by pathname and /parlay/* is
// deliberately part of the Predict section, so borrowing /parlay/[id] for this genuinely moved the
// user into Predict. Sits alongside /activity/market/[id], which is why that one was nested under
// /market rather than taking /activity/[id] outright.
export default function ActivityParlayTicketPage() {
  const { id } = useParams<{ id: string }>()
  return <ParlayDetail id={id} backHref="/activity?tab=parlays" />
}
