import { fallback, http } from 'viem'

// Arc RPC transport with automatic failover, shared by every Predict server job (curator, resolver,
// parlay settler, reclaim, house top-up).
//
// WHY: these jobs ran against a single http() transport pointed at the shared public endpoint
// (https://rpc.testnet.arc.network). Four crons every 5 minutes exhaust its per-window limit, and it
// starts answering "request limit reached". With one transport that RPC error throws, and a throw in
// the middle of the curator's create -> seed -> mirror sequence abandoned the market it had just
// created on-chain. viem's fallback transport fixes the failure mode at the source: "If a Transport
// request fails, it will fall back to the next one in the list."
//
// The endpoints below were each verified live against chain 5042002 (they returned identical state).
// They are all keyless public endpoints on purpose: an API-key endpoint (e.g. Alchemy) must NOT go in
// a NEXT_PUBLIC_* var, because that value is inlined into the browser bundle and the key would be
// exposed. If a dedicated endpoint is ever needed, give the server jobs their own non-public var.
//
// NOTE: `rank: true` is deliberately NOT used. Ranking pings every transport every 10s and scores
// them over a 10-sample window, which only pays off for a long-lived client. These run in serverless
// functions that live for seconds, so ranking would add RPC calls and never gather enough samples.
// Ordering best-first is what actually helps here.
const FALLBACK_RPCS = [
  'https://arc-testnet.drpc.org',
  'https://5042002.rpc.thirdweb.com',
  'https://rpc.testnet.arc.network',
] as const

// The configured endpoint is tried FIRST, then the rest as backups. Duplicates are dropped so the
// same endpoint is never dialled twice in the chain.
export function arcRpcUrls(): string[] {
  const configured = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC?.trim()
  return [...new Set([configured, ...FALLBACK_RPCS].filter((u): u is string => Boolean(u)))]
}

export function arcTransport() {
  return fallback(arcRpcUrls().map((url) => http(url)))
}
