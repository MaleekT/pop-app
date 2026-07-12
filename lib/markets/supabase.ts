import { createClient } from '@supabase/supabase-js'
import type { MarketsDatabase } from './db.types'

// Markets-scoped Supabase client. Kept separate from lib/supabase.ts so the Predict
// section never alters the PvP client or its Database typing (fully additive).
function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

export function createMarketsClient() {
  return createClient<MarketsDatabase>(
    getEnv('SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}
