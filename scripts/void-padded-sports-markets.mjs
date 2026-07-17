// One-off remediation: void every OPEN sports market whose betting window extends past its
// fixture's kick-off, so the curator can re-create it with correct timing.
//
// WHY THIS EXISTS
// PredictMarket.resolveAt is written once in createMarket and has no setter, so a market minted
// with the old `kickoff + 3h` pad CANNOT be repaired in place. Its betting stays open through the
// match and for ~70 minutes after the result is public. The only on-chain lever is voidMarket()
// (verified: PredictMarket.sol:188 checks msg.sender and status ONLY, no timing guard), so the
// badly-timed markets are destroyed and re-minted by the curator under the fixed code.
//
// WHY IT WRITES THE DB TOO — do not "simplify" this away
// Voiding on-chain alone is worse than doing nothing. The resolver only reconciles markets whose
// resolve_at has PASSED, and these all close in the future, so it would never mirror the void. The
// row would sit at Pending, meaning: the board keeps showing a market that reverts WrongStatus on
// deposit, AND the curator's dedupe query (status='Pending' AND resolve_at > now) still counts the
// fixture as taken, so it would never re-create it. Chain and mirror must move together.
//
// The owner's seed returns by itself: runSeedReclaim() already handles Voided (reclaim.ts:64,81)
// and calls claimRefund. Any OTHER wallet's stake is refundable by that wallet via claimRefund;
// this script never touches anyone else's money.
//
// Run from the repo root (dry run first, it is the default):
//   node scripts/void-padded-sports-markets.mjs
//   node scripts/void-padded-sports-markets.mjs --commit

import { readFileSync } from 'node:fs'
import { createWalletClient, createPublicClient, http, fallback, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'

const COMMIT = process.argv.includes('--commit')

// Tiny .env loader — same approach as purge-superseded-markets.mjs, so this stays dependency-free
// of any app import and can be run straight from VS Code.
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    } catch { /* file absent is fine */ }
  }
}
loadEnv()

const need = (k) => {
  const v = process.env[k]
  if (!v) throw new Error(`${k} not set`)
  return v
}

const CONTRACT = need('NEXT_PUBLIC_PREDICT_MARKET_CONTRACT')
const SUPABASE_URL = need('SUPABASE_URL').replace(/\/$/, '')
const SERVICE_KEY = need('SUPABASE_SERVICE_ROLE_KEY')
const KEY = need('RESOLVER_PRIVATE_KEY')

const RPCS = [
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC,
  'https://arc-testnet.drpc.org',
  'https://5042002.rpc.thirdweb.com',
  'https://rpc.testnet.arc.network',
].filter(Boolean)
const transport = () => fallback([...new Set(RPCS)].map((u) => http(u)))

const abi = [
  { type: 'function', name: 'voidMarket', inputs: [{ type: 'uint256' }, { type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getMarket', inputs: [{ type: 'uint256' }], outputs: [{ type: 'tuple', components: [
    { name: 'definitionHash', type: 'bytes32' }, { name: 'resolveAt', type: 'uint64' }, { name: 'proposedAt', type: 'uint64' },
    { name: 'outcomeCount', type: 'uint8' }, { name: 'resolvedOutcome', type: 'uint8' }, { name: 'status', type: 'uint8' },
    { name: 'evidenceHash', type: 'bytes32' },
  ] }], stateMutability: 'view' },
]
const STATUS = ['Pending', 'Proposed', 'Challenged', 'Resolved', 'Voided']

const account = privateKeyToAccount(KEY)
const publicClient = createPublicClient({ chain: arcTestnet, transport: transport() })
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: transport() })

async function sb(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`)
  return res.json()
}

async function kickoffOf(fixtureId) {
  const numeric = String(fixtureId).replace(/^tsdb:/, '')
  if (!/^\d+$/.test(numeric)) return null
  const r = await fetch(`https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=${encodeURIComponent(numeric)}`, { signal: AbortSignal.timeout(15000) })
  if (!r.ok) return null
  const j = await r.json()
  const ts = j.events?.[0]?.strTimestamp
  return ts ? Date.parse(ts + 'Z') : null
}

const rows = await sb(`markets?contract_address=eq.${CONTRACT}&status=eq.Pending&category=eq.sports&select=*`)
console.log(`open sports markets on ${CONTRACT}: ${rows.length}`)

const targets = []
for (const m of rows) {
  const kickoff = await kickoffOf(m.params?.fixtureId)
  if (kickoff == null) {
    // Unknown kick-off means unknown padding. Never void on a guess.
    console.log(`id=${m.on_chain_id} SKIP — no kick-off from TheSportsDB (cannot prove it is padded)`)
    continue
  }
  const padMs = Date.parse(m.resolve_at) - kickoff
  if (padMs <= 0) {
    console.log(`id=${m.on_chain_id} OK   — closes ${Math.round(-padMs / 1000)}s before kick-off`)
    continue
  }
  targets.push({ ...m, padMs })
  console.log(`id=${m.on_chain_id} VOID — betting stays open ${(padMs / 3_600_000).toFixed(2)}h PAST kick-off  ${m.definition_text.slice(0, 44)}`)
}

console.log('')
console.log(`${targets.length} market(s) to void.`)
if (!COMMIT) {
  console.log('DRY RUN. Re-run with --commit to apply.')
  process.exit(0)
}

for (const m of targets) {
  const id = BigInt(m.on_chain_id)
  const evidence = { reason: 'betting-window-extended-past-kickoff', fixtureId: m.params?.fixtureId, voidedAt: new Date().toISOString() }
  const hash = keccak256(toHex(JSON.stringify(evidence)))

  try {
    const tx = await walletClient.writeContract({ address: CONTRACT, abi, functionName: 'voidMarket', args: [id, hash] })
    try {
      await publicClient.waitForTransactionReceipt({ hash: tx })
    } catch {
      // This RPC throws while a tx is still mining; the state read below is the real answer.
    }
  } catch (e) {
    console.error(`id=${m.on_chain_id} write failed:`, e.shortMessage ?? e.message)
  }

  // Chain is the truth. Only mirror what it actually says — never assume the write landed.
  const chain = await publicClient.readContract({ address: CONTRACT, abi, functionName: 'getMarket', args: [id] })
  const status = STATUS[Number(chain.status)]
  if (status !== 'Voided') {
    console.error(`id=${m.on_chain_id} chain still says ${status} — mirror NOT touched, re-run to retry`)
    continue
  }

  await sb(`markets?on_chain_id=eq.${m.on_chain_id}&contract_address=eq.${CONTRACT}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Voided', evidence }),
  })
  console.log(`id=${m.on_chain_id} voided on-chain + mirrored`)
}

console.log('')
console.log('Done. The curator will re-create these fixtures with correct timing at 2 per run (~5 min apart).')
console.log('The owner seed returns automatically via runSeedReclaim(). Any other wallet must claimRefund itself.')
