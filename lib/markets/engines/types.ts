// Market resolution result. Unlike the PvP engines (which resolve to a winner
// address), these resolve to a categorical outcome INDEX into the market's
// outcomes array. Convention: index 0 = Yes/Home/Over, per template.
export type MarketResolveResult =
  | { pending: true }
  | { pending: false; voided: true; evidence: MarketVoidEvidence }
  | { pending: false; voided: false; outcomeIndex: number; rawValue: string; sourceUrl: string; fetchedAt: string }

export interface MarketVoidEvidence {
  sourceUrl: string
  rawStatus: string
  fetchedAt: string
}

export interface MarketResolveInput {
  templateKey: string
  params: Record<string, string>
  outcomeCount: number
}
