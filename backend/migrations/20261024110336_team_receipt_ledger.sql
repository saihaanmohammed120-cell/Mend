-- Team receipt ledger: operator memberships and explicit owner shares only.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

CREATE TABLE mend_private.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mend_private.team_memberships (
  team_id uuid NOT NULL REFERENCES mend_private.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id,user_id)
);
CREATE INDEX team_memberships_user_idx ON mend_private.team_memberships(user_id);
CREATE TABLE mend_private.team_receipt_shares (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id uuid NOT NULL,
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  shared_by uuid NOT NULL,
  shared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (team_id,shared_by) REFERENCES mend_private.team_memberships(team_id,user_id) ON DELETE CASCADE,
  UNIQUE (team_id,receipt_id)
);
CREATE INDEX team_receipt_shares_page_idx ON mend_private.team_receipt_shares(team_id,id DESC);
CREATE INDEX team_receipt_shares_receipt_idx ON mend_private.team_receipt_shares(receipt_id);
CREATE INDEX team_receipt_shares_member_idx ON mend_private.team_receipt_shares(team_id,shared_by);

ALTER TABLE mend_private.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE mend_private.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE mend_private.team_receipt_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mend_private.teams,mend_private.team_memberships,mend_private.team_receipt_shares
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE mend_private.team_receipt_shares_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER teams_no_update BEFORE UPDATE ON mend_private.teams
  FOR EACH ROW EXECUTE FUNCTION mend_private.deny_mutation();
CREATE TRIGGER team_memberships_no_update BEFORE UPDATE ON mend_private.team_memberships
  FOR EACH ROW EXECUTE FUNCTION mend_private.deny_mutation();
CREATE TRIGGER team_receipt_shares_no_update BEFORE UPDATE ON mend_private.team_receipt_shares
  FOR EACH ROW EXECUTE FUNCTION mend_private.deny_mutation();

CREATE FUNCTION mend_private.team_receipt_share_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.receipts r JOIN public.tasks t ON t.id=r.task_id
    WHERE r.id=NEW.receipt_id AND t.user_id=NEW.shared_by AND t.status='passed'
      AND t.expires_at>statement_timestamp() AND r.source='live' AND r.status='passed') THEN
    RAISE EXCEPTION USING ERRCODE='M4031',MESSAGE='receipt unavailable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER team_receipt_shares_guard BEFORE INSERT ON mend_private.team_receipt_shares
  FOR EACH ROW EXECUTE FUNCTION mend_private.team_receipt_share_guard();
REVOKE ALL ON FUNCTION mend_private.team_receipt_share_guard() FROM PUBLIC,anon,authenticated,service_role;

-- The definer implementation stays outside PostgREST's exposed schema.
-- Only the service can supply an actor, verified by the backend session layer.
CREATE FUNCTION mend_private.team_ledger_command(p_action text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; team uuid; receipt uuid; page_limit integer; before_id bigint; result jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('list','share','unshare') OR
    jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>2048 OR
    NOT (p_payload ?& ARRAY['user_id','team_id']) OR
    jsonb_typeof(p_payload->'user_id') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p_payload->'team_id') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid ledger command';
  END IF;
  actor:=(p_payload->>'user_id')::uuid;
  team:=(p_payload->>'team_id')::uuid;
  -- Consult current membership rows on every call, never cached JWT metadata.
  IF NOT EXISTS (SELECT FROM mend_private.team_memberships WHERE team_id=team AND user_id=actor) THEN
    RAISE EXCEPTION USING ERRCODE='M4031',MESSAGE='team unavailable';
  END IF;
  IF p_action='list' THEN
    IF p_payload-ARRAY['user_id','team_id','limit','cursor']<>'{}'::jsonb OR
      (p_payload ? 'limit' AND (jsonb_typeof(p_payload->'limit') IS DISTINCT FROM 'number'
       OR (p_payload->>'limit') !~ '^[1-9][0-9]{0,2}$')) OR
      (p_payload ? 'cursor' AND p_payload->'cursor'<>'null'::jsonb AND
       (jsonb_typeof(p_payload->'cursor') IS DISTINCT FROM 'string'
        OR (p_payload->>'cursor') !~ '^[1-9][0-9]{0,18}$')) THEN
      RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid ledger page';
    END IF;
    page_limit:=coalesce((p_payload->>'limit')::integer,20);
    before_id:=(p_payload->>'cursor')::bigint;
    IF page_limit NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid ledger limit';
    END IF;
    WITH sampled AS MATERIALIZED (
      SELECT s.id,s.shared_at,r.id AS receipt_id,r.task_id,r.source,r.status,
        r.contract_sha256,r.snapshot_sha256,r.attempts,r.repair_count,r.duration_ms,r.created_at
      FROM mend_private.team_receipt_shares s
      JOIN public.receipts r ON r.id=s.receipt_id
      JOIN public.tasks t ON t.id=r.task_id AND t.user_id=s.shared_by
      WHERE s.team_id=team AND (before_id IS NULL OR s.id<before_id)
        AND EXISTS (SELECT FROM mend_private.team_memberships WHERE team_id=team AND user_id=actor)
        AND t.expires_at>statement_timestamp() AND t.status='passed' AND r.source='live' AND r.status='passed'
      ORDER BY s.id DESC LIMIT page_limit+1
    ), chosen AS (SELECT * FROM sampled ORDER BY id DESC LIMIT page_limit)
    SELECT jsonb_build_object(
      'receipts',coalesce(jsonb_agg(jsonb_build_object(
        'receipt_id',receipt_id,'task_id',task_id,'source',source,'status',status,
        'contract_sha256',contract_sha256,'snapshot_sha256',snapshot_sha256,
        'attempts',attempts,'repair_count',repair_count,'duration_ms',duration_ms,
        'created_at',created_at,'shared_at',shared_at) ORDER BY id DESC),'[]'::jsonb),
      'next_cursor',CASE WHEN (SELECT count(*) FROM sampled)>page_limit THEN min(id)::text END)
      INTO result FROM chosen;
    RETURN result;
  END IF;
  IF p_payload-ARRAY['user_id','team_id','receipt_id']<>'{}'::jsonb OR
    jsonb_typeof(p_payload->'receipt_id') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid ledger share';
  END IF;
  receipt:=(p_payload->>'receipt_id')::uuid;
  IF NOT EXISTS (SELECT FROM public.receipts r JOIN public.tasks t ON t.id=r.task_id
    WHERE r.id=receipt AND t.user_id=actor AND t.expires_at>statement_timestamp()
      AND t.status='passed' AND r.source='live' AND r.status='passed') THEN
    RAISE EXCEPTION USING ERRCODE='M4031',MESSAGE='receipt unavailable';
  END IF;
  IF p_action='share' THEN
    INSERT INTO mend_private.team_receipt_shares(team_id,receipt_id,shared_by)
      VALUES(team,receipt,actor) ON CONFLICT (team_id,receipt_id) DO NOTHING;
  ELSE
    DELETE FROM mend_private.team_receipt_shares
      WHERE team_id=team AND receipt_id=receipt AND shared_by=actor;
  END IF;
  RETURN jsonb_build_object('shared',p_action='share','receipt_id',receipt);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid ledger identity or cursor';
END $$;
REVOKE ALL ON FUNCTION mend_private.team_ledger_command(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA mend_private TO service_role;
GRANT EXECUTE ON FUNCTION mend_private.team_ledger_command(text,jsonb) TO service_role;
CREATE FUNCTION public.mend_team_ledger(p_action text,p_payload jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT mend_private.team_ledger_command(p_action,p_payload)
$$;
REVOKE ALL ON FUNCTION public.mend_team_ledger(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mend_team_ledger(text,jsonb) TO service_role;
COMMIT;
