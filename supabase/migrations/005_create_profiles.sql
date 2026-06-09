-- 005_create_profiles.sql
-- User profile table: maps wallet address → handle (and optional avatar).
-- Each wallet address has at most one row (upserted on conflict address).
-- Handles are stored lowercase and must match the app's HANDLE_RE: ^[a-z0-9_]{3,20}$

CREATE TABLE IF NOT EXISTS public.profiles (
  address    text        PRIMARY KEY,
  handle     text        UNIQUE,
  avatar_url text,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT handle_format CHECK (
    handle IS NULL OR handle ~ '^[a-z0-9_]{3,20}$'
  )
);

-- Index for fast case-insensitive handle lookups (.ilike queries in the profile API)
CREATE INDEX IF NOT EXISTS profiles_handle_lower_idx
  ON public.profiles (lower(handle));
