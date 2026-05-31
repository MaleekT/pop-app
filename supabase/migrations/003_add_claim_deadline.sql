-- Add claim_deadline column for open bets.
-- Null for all existing private bets; set to the claim window close time for Open bets.
alter table bets
  add column if not exists claim_deadline timestamptz null;
