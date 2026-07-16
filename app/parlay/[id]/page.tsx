'use client'

import { useParams } from 'next/navigation'
import { ParlayDetail } from '@/components/predict/ParlayDetail'

// The Parlay builder's copy of the ticket view. Activity mounts the same component at
// /activity/parlay/[id]; the only difference is which section owns the URL, which is what AppNav
// reads to decide the lit tab.
export default function ParlayTicketPage() {
  const { id } = useParams<{ id: string }>()
  return <ParlayDetail id={id} backHref="/parlay" />
}
