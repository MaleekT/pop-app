export type BetStatus = 'Pending' | 'Locked' | 'Proposed' | 'Resolved' | 'Disputed' | 'Cancelled' | 'Expired' | 'Open' | 'Voided'

export interface BetRow {
  id: number
  on_chain_id: string
  contract_address: string
  creator: string
  opponent: string
  stake: string
  definition_text: string
  definition_hash: string
  template_key: string
  params: Record<string, string>
  resolve_at: string
  claim_deadline: string | null
  status: BetStatus
  proposed_winner: string | null
  evidence: EvidenceJson | VoidEvidenceJson | null
  created_at: string
}

export interface EvidenceJson {
  sourceUrl: string
  rawValue: string
  fetchedAt: string
}

export interface VoidEvidenceJson {
  sourceUrl: string
  rawStatus: string
  fetchedAt: string
}

export type InviteStatus = 'open' | 'claimed' | 'cancelled'

export interface InviteRow {
  id: string
  creator: string
  template_key: string
  params: Record<string, string>
  definition_text: string
  definition_hash: string
  resolve_at: string
  join_deadline: string
  stake: string
  pending_opponent: string | null
  status: InviteStatus
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      bets: {
        Row: BetRow
        Insert: Omit<BetRow, 'id' | 'created_at'>
        Update: Partial<Omit<BetRow, 'id' | 'created_at'>>
      }
      bet_invites: {
        Row: InviteRow
        Insert: Omit<InviteRow, 'id' | 'created_at' | 'status' | 'pending_opponent'>
        Update: Partial<Omit<InviteRow, 'id' | 'created_at'>>
      }
    }
  }
}
