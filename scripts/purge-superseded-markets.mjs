// Deletes every `markets` row that does NOT belong to the current PredictMarket deployment
// (NEXT_PUBLIC_PREDICT_MARKET_CONTRACT). Their `market_positions` rows cascade away with them
// (FK `on delete cascade`, migration 006).
//
// WHY THIS EXISTS: `markets.on_chain_id` is only unique PER contract (`unique (on_chain_id,
// contract_address)`), so every redeploy restarts ids at 1 and the shared table ends up with
// several rows sharing an id across deployments. Anything that resolves a market by bare
// on_chain_id (a card link, the resolver) can then hit the wrong row. Run this after every
// contract redeploy so the table only ever mirrors the LIVE contract.
//
//   node scripts/purge-superseded-markets.mjs           # dry run — prints the plan, deletes nothing
//   node scripts/purge-superseded-markets.mjs --commit  # actually delete
//
// Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_PREDICT_MARKET_CONTRACT from the
// environment, falling back to a .env file in the current directory.

import { readFileSync } from 'node:fs'

function loadDotEnv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env; rely on the real environment */ }
}

function die(msg) { console.error(`ERROR: ${msg}`); process.exit(1) }

loadDotEnv()

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CURRENT = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT
const COMMIT = process.argv.includes('--commit')

if (!URL || !KEY) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
if (!/^0x[0-9a-fA-F]{40}$/.test(CURRENT ?? '')) die(`NEXT_PUBLIC_PREDICT_MARKET_CONTRACT is not a valid address: ${CURRENT}`)

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function getAll(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers })
  if (!res.ok) die(`GET ${path} -> ${res.status} ${await res.text()}`)
  return res.json()
}

const markets = await getAll('markets?select=contract_address')
const positions = await getAll('market_positions?select=id')

const counts = {}
for (const m of markets) counts[m.contract_address] = (counts[m.contract_address] ?? 0) + 1

const currentCount = Object.entries(counts).find(([a]) => a.toLowerCase() === CURRENT.toLowerCase())?.[1] ?? 0
const superseded = Object.keys(counts).filter((a) => a.toLowerCase() !== CURRENT.toLowerCase())

console.log(`markets: ${markets.length} rows across ${Object.keys(counts).length} contract(s) | positions: ${positions.length}`)
console.log(`  KEEP    ${CURRENT} -> ${currentCount}`)
for (const a of superseded) console.log(`  DELETE  ${a} -> ${counts[a]}`)

// Safety rail: the live contract must actually be present. If it has zero rows the env is likely
// stale/wrong, and "delete everything that isn't current" would wipe the real data. Refuse.
if (currentCount === 0) die('current contract has 0 markets in the table — refusing to delete (env may be wrong)')
if (superseded.length === 0) { console.log('nothing to purge; the table already holds only the current contract.'); process.exit(0) }
if (!COMMIT) { console.log('\nDRY RUN — re-run with --commit to delete the superseded rows.'); process.exit(0) }

let deleted = 0
for (const a of superseded) {
  const res = await fetch(`${URL}/rest/v1/markets?contract_address=eq.${encodeURIComponent(a)}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=representation' },
  })
  if (!res.ok) die(`DELETE ${a} -> ${res.status} ${await res.text()}`)
  const rows = await res.json()
  deleted += rows.length
  console.log(`deleted ${rows.length} markets for ${a}`)
}

const marketsAfter = await getAll('markets?select=id')
const positionsAfter = await getAll('market_positions?select=id')
console.log(`\ndone. markets ${markets.length} -> ${marketsAfter.length} | positions ${positions.length} -> ${positionsAfter.length} | deleted ${deleted} markets`)
