import { createClient } from '@supabase/supabase-js'
import type { Database } from './db.types'

function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

export function createServerClient() {
  return createClient<Database>(
    getEnv('SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}
