-- Fresh database schema matching the original CSV ownership and transaction semantics.
-- Original IDs stay text to preserve both UUID and legacy identifiers.
CREATE TABLE IF NOT EXISTS public.records (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text NOT NULL,
  note text NOT NULL DEFAULT '',
  payment_method text NOT NULL,
  created_at timestamptz NOT NULL,
  is_urgent boolean NOT NULL DEFAULT false,
  import_source text
);
SET epea.owner_column = 'user_id';
-- Execute 001_ledger_integrity.sql immediately afterward, before any public data access.
