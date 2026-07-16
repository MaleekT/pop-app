'use client'

import { useRouter } from 'next/navigation'
import { backBtnStyle } from '@/components/predict/ui'

// Returns the user wherever they actually came from — the board, Activity, a parlay leg — instead of
// a destination baked into the view. Shared by every detail view that is mounted under more than one
// section, because a hardcoded back link is the same bug as a hardcoded card link: it silently moves
// the user into whichever section the author happened to have in mind.
//
// fallbackHref names the section the view is mounted under, and is used only on a cold load with no
// in-app history (a shared link opened in a fresh tab), where there is nothing to go back to.
export function BackLink({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back()
        else router.push(fallbackHref)
      }}
      style={{ ...backBtnStyle, display: 'inline-block' }}
    >
      ← Back
    </button>
  )
}
