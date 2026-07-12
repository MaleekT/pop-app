-- Predict section: pooled (parimutuel) prediction markets.
-- Additive to the PvP `bets` table; the off-chain mirror of PredictMarket.sol.

create table if not exists markets (
  id               bigserial   primary key,
  on_chain_id      text        not null,
  contract_address text        not null,          -- PredictMarket deployment
  category         text        not null,          -- 'crypto' | 'sports' | 'youtube'
  template_key     text        not null,          -- reuses the 6 PvP template keys
  params           jsonb       not null default '{}',
  outcomes         jsonb       not null,          -- index-aligned labels, e.g. ["Home","Away","Draw"]
  definition_text  text        not null,
  definition_hash  text        not null,          -- keccak256(toHex(definition_text)), verified server-side
  resolve_at       timestamptz not null,          -- betting closes and resolver may propose
  proposed_at      timestamptz null,              -- set when the outcome is proposed (drives the finalize pass)
  status           text        not null default 'Pending',  -- Pending|Proposed|Challenged|Resolved|Voided
  resolved_outcome int         null,              -- winning outcome index, null until Resolved
  evidence         jsonb       null,
  created_at       timestamptz not null default now(),
  unique (on_chain_id, contract_address)
);

create index if not exists markets_status_resolve_at on markets (status, resolve_at);
create index if not exists markets_contract_address on markets (contract_address);

create table if not exists market_positions (
  id            bigserial   primary key,
  market_id     bigint      not null references markets (id) on delete cascade,
  bettor        text        not null,
  outcome_index int         not null,
  amount        text        not null,             -- raw bigint string, USDC 6 decimals
  tx_hash       text        null,
  created_at    timestamptz not null default now()
);

create index if not exists market_positions_market_idx on market_positions (market_id);
create index if not exists market_positions_bettor_idx on market_positions (bettor);
