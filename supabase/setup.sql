BEGIN;
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

-- PREPARED ONLY. Run first in an isolated clone after schema/backup review.
-- Session must explicitly SET epea.owner_column = 'user_id' or 'line_user_id'.

DO $$
DECLARE owner_col text := current_setting('epea.owner_column', true);
BEGIN
  IF owner_col IS NULL OR owner_col NOT IN ('user_id','line_user_id') THEN RAISE EXCEPTION 'Set verified epea.owner_column first'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='records' AND column_name=owner_col AND data_type IN ('text','character varying')) THEN RAISE EXCEPTION 'Owner schema mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='records' AND column_name='created_at' AND data_type='timestamp with time zone') THEN RAISE EXCEPTION 'Verify transaction timestamp type; migration requires timestamptz'; END IF;
  EXECUTE format('CREATE INDEX IF NOT EXISTS epea_records_owner_idx ON public.records (%I)', owner_col);
END $$;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ordinary';
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS adjustment_reason text;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS adjustment_at timestamptz;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS original_record_id text;
CREATE UNIQUE INDEX IF NOT EXISTS epea_records_id_unique ON public.records(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.records'::regclass AND conname='epea_valid_money') THEN
    ALTER TABLE public.records ADD CONSTRAINT epea_valid_money CHECK (
      amount IS NOT NULL AND CASE WHEN amount::text ~ '^[0-9]+([.]0+)?$' THEN amount::numeric BETWEEN 0 AND 9007199254740991 ELSE false END
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.records'::regclass AND conname='epea_valid_domain') THEN
    ALTER TABLE public.records ADD CONSTRAINT epea_valid_domain CHECK (
      type IS NOT NULL AND type IN ('income','expense') AND payment_method IS NOT NULL AND payment_method IN ('cash','credit_card')
      AND kind IN ('ordinary','repayment','adjustment') AND version > 0
      AND (kind <> 'repayment' OR (type='expense' AND payment_method='cash'))
      AND (kind <> 'adjustment' OR (coalesce(length(trim(adjustment_reason)),0)>0 AND adjustment_at IS NOT NULL))
    ) NOT VALID;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.records_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id text NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  operation text NOT NULL, before_record jsonb, after_record jsonb
);
CREATE INDEX IF NOT EXISTS epea_audit_record_idx ON public.records_audit(record_id,audit_id);
CREATE OR REPLACE FUNCTION public.epea_track_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Use a reversible deletion marker'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id <> OLD.id OR to_jsonb(NEW)->'user_id' IS DISTINCT FROM to_jsonb(OLD)->'user_id'
      OR to_jsonb(NEW)->'line_user_id' IS DISTINCT FROM to_jsonb(OLD)->'line_user_id' THEN RAISE EXCEPTION 'Identity and ownership are immutable'; END IF;
    NEW.version := OLD.version + 1;
    NEW.updated_at := clock_timestamp();
  ELSE NEW.version := 1; NEW.updated_at := clock_timestamp(); END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.epea_audit_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.records_audit(record_id,operation,before_record,after_record)
    VALUES(NEW.id::text,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS epea_track ON public.records;
CREATE TRIGGER epea_track BEFORE INSERT OR UPDATE OR DELETE ON public.records FOR EACH ROW EXECUTE FUNCTION public.epea_track_record();
DROP TRIGGER IF EXISTS epea_audit ON public.records;
CREATE TRIGGER epea_audit AFTER INSERT OR UPDATE ON public.records FOR EACH ROW EXECUTE FUNCTION public.epea_audit_record();
CREATE OR REPLACE FUNCTION public.epea_snapshot(account_owner text,owner_column text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF owner_column NOT IN ('user_id','line_user_id') THEN RAISE EXCEPTION 'Unknown owner column'; END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), ''[]''::jsonb) FROM public.records r WHERE r.%I=$1 AND r.deleted_at IS NULL',owner_column) INTO result USING account_owner;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.epea_history(account_owner text,record_id text,owner_column text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF owner_column NOT IN ('user_id','line_user_id') THEN RAISE EXCEPTION 'Unknown owner column'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY audit_id),'[]'::jsonb) FROM public.records_audit a WHERE a.record_id=epea_history.record_id AND coalesce(a.after_record,a.before_record)->>owner_column=account_owner);
END $$;
-- Existing policies must be backed up and reviewed. Grants below implement server-only data access.
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.records,public.records_audit FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.records TO service_role;
REVOKE DELETE ON public.records FROM service_role;
GRANT SELECT ON public.records_audit TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.records_audit FROM service_role;
REVOKE ALL ON FUNCTION public.epea_snapshot(text,text),public.epea_history(text,text,text),public.epea_track_record(),public.epea_audit_record() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.epea_snapshot(text,text),public.epea_history(text,text,text) TO service_role;


COMMIT;
NOTIFY pgrst, 'reload schema';
