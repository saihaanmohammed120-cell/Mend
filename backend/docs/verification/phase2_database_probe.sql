-- Real hosted SQL/RPC/RLS test only. Not application HTTP or provider evidence.
-- All synthetic ownership and task rows are rolled back.
BEGIN;
DO $$
DECLARE
  probe_owner uuid := gen_random_uuid();
  other_owner uuid := gen_random_uuid();
  probe_task uuid;
  created jsonb;
  replay jsonb;
  read_back jsonb;
  row_count bigint;
  wrong_owner_rejected boolean := false;
BEGIN
  INSERT INTO auth.users(id,email)
    VALUES(probe_owner,'mend-probe-'||probe_owner::text||'@example.invalid');
  EXECUTE 'SET LOCAL ROLE service_role';
  created := public.mend_command('create_task',jsonb_build_object(
    'user_id',probe_owner,'prompt','Phase 2 rollback-only database probe',
    'runtime','python','idempotency_key','mend-probe-'||probe_owner::text));
  probe_task := (created->>'id')::uuid;
  replay := public.mend_command('create_task',jsonb_build_object(
    'user_id',probe_owner,'prompt','Phase 2 rollback-only database probe',
    'runtime','python','idempotency_key','mend-probe-'||probe_owner::text));
  read_back := public.mend_command('get_task',jsonb_build_object(
    'task_id',probe_task,'user_id',probe_owner));
  IF read_back->>'status' IS DISTINCT FROM 'draft' OR
     replay->>'id' IS DISTINCT FROM created->>'id' THEN
    RAISE EXCEPTION 'draft/read/idempotency mismatch';
  END IF;
  SELECT count(*) INTO row_count FROM public.logs
    WHERE task_id=probe_task AND event_type='state' AND payload->>'status'='draft';
  IF row_count <> 1 THEN RAISE EXCEPTION 'initial event mismatch'; END IF;
  BEGIN
    PERFORM public.mend_command('get_task',jsonb_build_object(
      'task_id',probe_task,'user_id',other_owner));
  EXCEPTION WHEN SQLSTATE 'M4031' THEN wrong_owner_rejected := true;
  END;
  IF NOT wrong_owner_rejected THEN RAISE EXCEPTION 'cross-owner access permitted'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',probe_owner,'role','authenticated')::text,true);
  SELECT count(*) INTO row_count FROM public.tasks WHERE id=probe_task;
  IF row_count <> 1 THEN RAISE EXCEPTION 'owner RLS read mismatch'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',other_owner,'role','authenticated')::text,true);
  SELECT count(*) INTO row_count FROM public.tasks WHERE id=probe_task;
  IF row_count <> 0 THEN RAISE EXCEPTION 'cross-owner RLS read allowed'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('mend.phase2_probe_result',jsonb_build_object(
    'rpc_write_read_verified',true,'idempotency_verified',true,
    'initial_state_event_verified',true,'owner_rls_verified',true,
    'cross_owner_rejected',true,'provider_execution','skipped',
    'record_retention','rolled_back')::text,true);
END $$;
SELECT current_setting('mend.phase2_probe_result')::jsonb AS database_probe;
ROLLBACK;
