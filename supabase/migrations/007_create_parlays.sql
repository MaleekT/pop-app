-- Predict section: parlay tickets. Off-chain mirror of Parlay.sol.
create table if not exists parlays (
  id                bigserial   primary key,
  on_chain_id       text        not null,
  contract_address  text        not null,          -- Parlay deployment
  bettor            text        not null,
  stake             text        not null,          -- raw bigint string, USDC 6 decimals
  locked_multiplier text        not null,          -- scaled by ODDS_SCALE (1e6), bigint string
  legs              jsonb       not null,          -- [{ marketOnChainId, outcomeIndex }]
  status            text        not null default 'Open',  -- Open|Won|Lost|Refunded
  created_at        timestamptz not null default now(),
  unique (on_chain_id, contract_address)
);

create index if not exists parlays_bettor_idx on parlays (bettor);
create index if not exists parlays_status_idx on parlays (status);
