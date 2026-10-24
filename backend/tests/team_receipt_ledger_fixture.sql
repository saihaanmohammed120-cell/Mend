-- Synthetic authorization fixture for an already migrated disposable CI database.
-- No provider call, Auth server, production receipt or release evidence is created.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '25s';
DO $$ BEGIN
  IF current_database()<>'mend_ci' THEN
    RAISE EXCEPTION 'Team ledger fixture requires disposable mend_ci database';
  END IF;
END $$;

-- Produce each synthetic receipt through the actual guarded lifecycle.
-- The isolated release setting exists only inside this rolled-back transaction.
CREATE FUNCTION pg_temp.ledger_fixture_receipt(owner_id uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE task uuid; attempt uuid; worker uuid:=gen_random_uuid(); result jsonb;
  report jsonb; stopped timestamptz; job text; prefix text;
BEGIN
  result:=public.mend_command('create_task',jsonb_build_object('user_id',owner_id,
    'prompt','synthetic private fixture prompt','idempotency_key',gen_random_uuid()::text));
  task:=(result->>'id')::uuid;
  prefix:=owner_id::text||'/'||task::text||'/';
  PERFORM public.mend_command('propose_contract',jsonb_build_object('user_id',owner_id,
    'task_id',task,'expected_version',1,'contract',jsonb_build_object(
      'required_check_ids',jsonb_build_array('fixture-check'),
      'required_command_ids',jsonb_build_array('fixture-command'),
      'commands',jsonb_build_array(jsonb_build_object('id','fixture-command',
        'argv',jsonb_build_array('python','-m','unittest'))))));
  UPDATE mend_private.release_gate SET live_execution_enabled=true,monetary_cap=100,
    evidence_reference='isolated team-ledger fixture; rollback only' WHERE singleton;
  PERFORM public.mend_command('start_task',jsonb_build_object('user_id',owner_id,
    'task_id',task,'expected_version',2,'contract_sha256',repeat('a',64),
    'protected_checks_sha256',repeat('b',64)));
  PERFORM public.mend_command('claim_worker',jsonb_build_object('task_id',task,'worker_id',worker));
  result:=public.mend_command('reserve_attempt',jsonb_build_object('task_id',task,'worker_id',worker,
    'submission_key',gen_random_uuid()::text,'model_id','synthetic-fixture-model',
    'snapshot_sha256',repeat('c',64),'snapshot_storage_key',prefix||'snapshot.zip',
    'source_file_count',1,'source_bytes',100,'image_digest','sha256:'||repeat('d',64)));
  attempt:=(result->>'id')::uuid;
  PERFORM public.mend_command('set_state',jsonb_build_object('task_id',task,'worker_id',worker,'status','waiting_runner'));
  PERFORM public.mend_command('dispatch',jsonb_build_object('task_id',task,'worker_id',worker,'attempt_id',attempt));
  job:='synthetic-ledger-fixture-'||attempt::text;
  PERFORM public.mend_command('attach_job',jsonb_build_object('task_id',task,'worker_id',worker,
    'attempt_id',attempt,'job_id',job));
  PERFORM public.mend_command('set_state',jsonb_build_object('task_id',task,'worker_id',worker,'status','running'));
  stopped:=clock_timestamp();
  report:=jsonb_build_object('complete',true,'source','live','task_id',task,'attempt_id',attempt,
    'model_id','synthetic-fixture-model','image_digest','sha256:'||repeat('d',64),
    'job_id',job,'contract_sha256',repeat('a',64),'protected_checks_sha256',repeat('b',64),
    'snapshot_sha256',repeat('c',64),'checks',jsonb_build_object('total',1,'passed',1,'failed',0,
      'skipped',0,'results',jsonb_build_array(jsonb_build_object('id','fixture-check','status','passed'))),
    'command_results',jsonb_build_array(jsonb_build_object('id','fixture-command','status','passed',
      'exit_code',0,'argv',jsonb_build_array('python','-m','unittest'))));
  PERFORM public.mend_command('resolve_attempt',jsonb_build_object('task_id',task,'worker_id',worker,
    'attempt_id',attempt,'status','passed','exit_code',0,'finished_at',stopped,
    'provider_stopped_at',stopped,'runner_report',report,'report_storage_key',prefix||'report.json',
    'resolution_evidence',jsonb_build_object('kind','provider_terminal','reference','synthetic-fixture-only')));
  PERFORM public.mend_command('set_state',jsonb_build_object('task_id',task,'worker_id',worker,'status','finalizing'));
  result:=public.mend_command('finalize',jsonb_build_object('task_id',task,'worker_id',worker,
    'receipt',jsonb_build_object('bundle_verified_sha256',repeat('c',64),
      'bundle_storage_key',prefix||'bundle.zip','diff_storage_key',prefix||'diff.patch',
      'reproduction',jsonb_build_object('private','must never enter a team summary'))));
  UPDATE mend_private.release_gate SET live_execution_enabled=false WHERE singleton;
  RETURN (result->>'receipt_id')::uuid;
END $$;

DO $fixture$
DECLARE owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  team_a uuid:=gen_random_uuid(); team_b uuid:=gen_random_uuid(); receipt_a uuid; receipt_b uuid;
  receipt_c uuid; payload jsonb; result jsonb; second_page jsonb; cursor_id text; role_name text;
BEGIN
  INSERT INTO auth.users(id,email) VALUES(owner_a,owner_a::text||'@mend-fixture.invalid'),
    (owner_b,owner_b::text||'@mend-fixture.invalid'),(outsider,outsider::text||'@mend-fixture.invalid');
  INSERT INTO mend_private.teams(id) VALUES(team_a),(team_b);
  INSERT INTO mend_private.team_memberships(team_id,user_id) VALUES(team_a,owner_a),
    (team_a,owner_b),(team_b,owner_b);
  receipt_a:=pg_temp.ledger_fixture_receipt(owner_a);
  receipt_b:=pg_temp.ledger_fixture_receipt(owner_a);
  receipt_c:=pg_temp.ledger_fixture_receipt(owner_b);
  payload:=jsonb_build_object('user_id',owner_a,'team_id',team_a,'receipt_id',receipt_a);
  result:=public.mend_team_ledger('list',payload-'receipt_id');
  IF result->'receipts'<>'[]'::jsonb OR result->'next_cursor'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Private receipts were shared automatically';
  END IF;
  BEGIN
    PERFORM public.mend_team_ledger('list',jsonb_build_object('user_id',outsider,'team_id',team_a));
    RAISE EXCEPTION 'Nonmember read accepted';
  EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
  BEGIN
    PERFORM public.mend_team_ledger('share',payload||jsonb_build_object('user_id',owner_b));
    RAISE EXCEPTION 'Nonowner share accepted';
  EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
  BEGIN
    PERFORM public.mend_team_ledger('share',payload||jsonb_build_object('receipt_id',gen_random_uuid()));
    RAISE EXCEPTION 'Invented receipt accepted';
  EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
  BEGIN
    PERFORM public.mend_team_ledger('share',payload||jsonb_build_object('team_id',team_b));
    RAISE EXCEPTION 'Other-team share accepted';
  EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
  PERFORM public.mend_team_ledger('share',payload);
  PERFORM public.mend_team_ledger('share',payload);
  IF (SELECT count(*) FROM mend_private.team_receipt_shares WHERE team_id=team_a)<>1 THEN
    RAISE EXCEPTION 'Repeated share duplicated identity';
  END IF;
  PERFORM public.mend_team_ledger('share',payload||jsonb_build_object('receipt_id',receipt_b));
  PERFORM public.mend_team_ledger('share',jsonb_build_object('user_id',owner_b,'team_id',team_b,'receipt_id',receipt_c));
  result:=public.mend_team_ledger('list',jsonb_build_object('user_id',owner_b,'team_id',team_a,'limit',1));
  cursor_id:=result->>'next_cursor';
  IF jsonb_array_length(result->'receipts')<>1 OR cursor_id IS NULL OR
    result->'receipts'->0->>'receipt_id'<>receipt_b::text THEN
    RAISE EXCEPTION 'Newest-first bounded page failed';
  END IF;
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(result->'receipts'->0) AS key)
    IS DISTINCT FROM ARRAY['attempts','contract_sha256','created_at','duration_ms','receipt_id',
      'repair_count','shared_at','snapshot_sha256','source','status','task_id'] THEN
    RAISE EXCEPTION 'Unsafe team receipt projection';
  END IF;
  second_page:=public.mend_team_ledger('list',jsonb_build_object('user_id',owner_b,
    'team_id',team_a,'limit',1,'cursor',cursor_id));
  IF jsonb_array_length(second_page->'receipts')<>1 OR second_page->>'next_cursor' IS NOT NULL OR
    second_page->'receipts'->0->>'receipt_id'<>receipt_a::text THEN
    RAISE EXCEPTION 'Cursor repeated, skipped or crossed teams';
  END IF;
  BEGIN
    PERFORM public.mend_team_ledger('list',jsonb_build_object('user_id',owner_b,'team_id',team_a,'limit',101));
    RAISE EXCEPTION 'Unbounded limit accepted';
  EXCEPTION WHEN SQLSTATE 'M4001' THEN NULL; END;
  BEGIN
    PERFORM public.mend_team_ledger('list',jsonb_build_object('user_id',owner_b,'team_id',team_a,'cursor','9223372036854775808'));
    RAISE EXCEPTION 'Overflow cursor accepted';
  EXCEPTION WHEN SQLSTATE 'M4001' THEN NULL; END;
  BEGIN
    PERFORM public.mend_team_ledger('list',jsonb_build_object('user_id',owner_b,'team_id',team_a,'prompt','private'));
    RAISE EXCEPTION 'Unknown payload field accepted';
  EXCEPTION WHEN SQLSTATE 'M4001' THEN NULL; END;
  BEGIN
    UPDATE mend_private.team_receipt_shares SET shared_by=owner_b WHERE receipt_id=receipt_a;
    RAISE EXCEPTION 'Share identity changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Share identity changed' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO mend_private.team_receipt_shares(team_id,receipt_id,shared_by) VALUES(team_b,receipt_a,owner_b);
    RAISE EXCEPTION 'Direct forged ownership accepted';
  EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
  BEGIN
    PERFORM public.mend_team_ledger('unshare',payload||jsonb_build_object('user_id',owner_b));
    RAISE EXCEPTION 'Nonowner unshare accepted';
  EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
  PERFORM public.mend_team_ledger('unshare',payload);
  PERFORM public.mend_team_ledger('unshare',payload);
  PERFORM public.mend_team_ledger('share',payload);
  DELETE FROM mend_private.team_memberships WHERE team_id=team_a AND user_id=owner_b;
  BEGIN
    PERFORM public.mend_team_ledger('list',jsonb_build_object('user_id',owner_b,'team_id',team_a,'cursor',cursor_id));
    RAISE EXCEPTION 'Removed member reused cursor';
  EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
  INSERT INTO mend_private.team_memberships(team_id,user_id) VALUES(team_a,owner_b);
  DELETE FROM mend_private.team_memberships WHERE team_id=team_a AND user_id=owner_a;
  result:=public.mend_team_ledger('list',jsonb_build_object('user_id',owner_b,'team_id',team_a));
  IF result->'receipts'<>'[]'::jsonb THEN RAISE EXCEPTION 'Removed owner shares remain visible'; END IF;
  INSERT INTO mend_private.team_memberships(team_id,user_id) VALUES(team_a,owner_a);
  result:=public.mend_team_ledger('list',jsonb_build_object('user_id',owner_b,'team_id',team_a));
  IF result->'receipts'<>'[]'::jsonb THEN RAISE EXCEPTION 'Rejoining restored withdrawn shares'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.mend_team_ledger(text,jsonb)','EXECUTE') OR
      has_function_privilege(role_name,'mend_private.team_ledger_command(text,jsonb)','EXECUTE') OR
      has_table_privilege(role_name,'mend_private.team_receipt_shares','SELECT') OR
      has_table_privilege(role_name,'mend_private.team_memberships','INSERT') THEN
      RAISE EXCEPTION 'Client privilege bypass';
    END IF;
  END LOOP;
  IF has_table_privilege('service_role','mend_private.team_receipt_shares','INSERT') OR
    has_table_privilege('service_role','mend_private.team_memberships','INSERT') OR
    NOT has_function_privilege('service_role','public.mend_team_ledger(text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Service RPC boundary missing';
  END IF;
  IF (SELECT live_execution_enabled FROM mend_private.release_gate WHERE singleton) THEN
    RAISE EXCEPTION 'Ledger enabled provider release';
  END IF;
END $fixture$;
-- Prove the invoker wrapper can actually reach its narrow private implementation.
SET LOCAL ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.mend_team_ledger('list',jsonb_build_object('user_id',gen_random_uuid(),'team_id',gen_random_uuid()));
    RAISE EXCEPTION 'Service nonmember accepted';
  EXCEPTION WHEN SQLSTATE 'M4031' THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
