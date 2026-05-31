-- Scope bets to their contract deployment so on_chain_id collisions are
-- impossible across redeployments. The unique constraint moves from
-- (on_chain_id) to (on_chain_id, contract_address).

-- 1. Add the column — nullable so existing rows aren't immediately rejected
ALTER TABLE bets ADD COLUMN IF NOT EXISTS contract_address text;

-- 2. Tag all existing rows with a sentinel so we can enforce NOT NULL
UPDATE bets SET contract_address = 'LEGACY' WHERE contract_address IS NULL;

-- 3. Drop the old single-column unique constraint
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_on_chain_id_key;

-- 4. Enforce NOT NULL now that every row has a value
ALTER TABLE bets ALTER COLUMN contract_address SET NOT NULL;

-- 5. New composite unique: same bet ID on different contracts is allowed
ALTER TABLE bets
  ADD CONSTRAINT bets_on_chain_id_contract_unique UNIQUE (on_chain_id, contract_address);

-- 6. Index for the common filter: WHERE contract_address = $current
CREATE INDEX IF NOT EXISTS bets_contract_address ON bets (contract_address);
