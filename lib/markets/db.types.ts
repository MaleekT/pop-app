export type MarketStatus = 'Pending' | 'Proposed' | 'Challenged' | 'Resolved' | 'Voided'

export interface MarketRow {
  id: number
  on_chain_id: string
  contract_address: string
  category: string
  template_key: string
  params: Record<string, string>
  outcomes: string[]
  definition_text: string
  definition_hash: string
  resolve_at: string
  proposed_at: string | null
  status: MarketStatus
  resolved_outcome: number | null
  evidence: MarketEvidenceJson | MarketVoidEvidenceJson | null
  created_at: string
}

export interface MarketPositionRow {
  id: number
  market_id: number
  bettor: string
  outcome_index: number
  amount: string
  tx_hash: string | null
  created_at: string
}

export interface MarketEvidenceJson {
  sourceUrl: string
  rawValue: string
  fetchedAt: string
}

export interface MarketVoidEvidenceJson {
  sourceUrl: string
  rawStatus: string
  fetchedAt: string
}

export interface MarketsDatabase {
  public: {
    Tables: {
      markets: {
        Row: MarketRow
        Insert: Omit<MarketRow, 'id' | 'created_at'>
        Update: Partial<Omit<MarketRow, 'id' | 'created_at'>>
      }
      market_positions: {
        Row: MarketPositionRow
        Insert: Omit<MarketPositionRow, 'id' | 'created_at'>
        Update: Partial<Omit<MarketPositionRow, 'id' | 'created_at'>>
      }
    }
  }
}
