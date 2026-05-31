// YouTube Data API v3 docs: https://developers.google.com/youtube/v3/docs
import type { ResolveParams, ResolveResult } from './types'

const YT_BASE = 'https://www.googleapis.com/youtube/v3'

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY not configured')
  return key
}

function buildUrl(path: string, params: Record<string, string>): string {
  const u = new URL(`${YT_BASE}/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  u.searchParams.set('key', apiKey())
  return u.toString()
}

function publicUrl(path: string, params: Record<string, string>): string {
  const u = new URL(`${YT_BASE}/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.toString()
}

export async function resolve(input: ResolveParams): Promise<ResolveResult> {
  const { templateKey, params, creator, opponent } = input
  const { target } = params

  const targetCount = parseInt(target, 10)
  if (isNaN(targetCount) || targetCount < 0) return { pending: true }

  const fetchedAt = new Date().toISOString()

  if (templateKey === 'youtube_views') {
    const { videoId } = params
    if (!videoId) return { pending: true }

    const url = buildUrl('videos', { part: 'statistics', id: videoId })
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return { pending: true }

    let data: unknown
    try {
      data = await res.json()
    } catch {
      return { pending: true }
    }

    const item = (data as { items?: { statistics?: { viewCount?: string } }[] }).items?.[0]
    if (!item) return { pending: true }

    const viewCount = parseInt(item.statistics?.viewCount ?? '', 10)
    if (isNaN(viewCount)) return { pending: true }

    return {
      pending: false,
      voided: false as const,
      winner: viewCount >= targetCount ? creator : opponent,
      rawValue: String(viewCount),
      sourceUrl: publicUrl('videos', { part: 'statistics', id: videoId }),
      fetchedAt,
    }
  }

  if (templateKey === 'youtube_subs') {
    const { channelId } = params
    if (!channelId) return { pending: true }

    const url = buildUrl('channels', { part: 'statistics', id: channelId })
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return { pending: true }

    let data: unknown
    try {
      data = await res.json()
    } catch {
      return { pending: true }
    }

    const item = (data as { items?: { statistics?: { subscriberCount?: string } }[] }).items?.[0]
    if (!item) return { pending: true }

    const subCount = parseInt(item.statistics?.subscriberCount ?? '', 10)
    if (isNaN(subCount)) return { pending: true }

    return {
      pending: false,
      voided: false as const,
      winner: subCount >= targetCount ? creator : opponent,
      rawValue: String(subCount),
      sourceUrl: publicUrl('channels', { part: 'statistics', id: channelId }),
      fetchedAt,
    }
  }

  return { pending: true }
}
