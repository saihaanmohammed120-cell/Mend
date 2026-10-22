BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
DO $probe$
DECLARE
 owner_id uuid; task_uuid uuid; first_result jsonb; replay jsonb; viewed jsonb;
 n bigint; denied boolean:=false; direct_write_denied boolean:=false;
 marker text:='schema-audit-rollback-'||gen_random_uuid()::text;
BEGIN
 SELECT user_id INTO owner_id FROM public.tasks ORDER BY created_at LIMIT 1;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'No existing authorized task owner for probe'; END IF;
 EXECUTE 'SET LOCAL ROLE service_role';
 first_result:=public.mend_command('create_task',jsonb_build_object('user_id',owner_id,'prompt','Rollback-only schema acceptance probe','runtime','python','idempotency_key',marker));
 task_uuid:=(first_result->>'id')::uuid;
 replay:=public.mend_command('create_task',jsonb_build_object('user_id',owner_id,'prompt','Rollback-only schema acceptance probe','runtime','python','idempotency_key',marker));
 viewed:=public.mend_command('get_task',jsonb_build_object('task_id',task_uuid,'user_id',owner_id));
 IF viewed->>'status' IS DISTINCT FROM 'draft' OR replay->>'id' IS DISTINCT FROM first_result->>'id' THEN RAISE EXCEPTION 'RPC create/read/idempotency failed'; END IF;
 SELECT count(*) INTO n FROM public.logs WHERE task_id=task_uuid AND event_type='state' AND payload->>'status'='draft';
 IF n<>1 THEN RAISE EXCEPTION 'Initial state event mismatch'; END IF;
 BEGIN
  PERFORM public.mend_command('get_task',jsonb_build_object('task_id',task_uuid,'user_id','00000000-0000-0000-0000-000000000000'));
 EXCEPTION WHEN SQLSTATE 'M4031' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Cross-owner RPC read allowed'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 SELECT count(id) INTO n FROM public.tasks WHERE id=task_uuid;
 IF n<>1 THEN RAISE EXCEPTION 'Owner RLS read failed'; END IF;
 BEGIN
  INSERT INTO public.tasks(user_id,prompt,idempotency_key) VALUES(owner_id,'Disallowed direct write',marker||'-direct');
 EXCEPTION WHEN insufficient_privilege THEN direct_write_denied:=true;
 END;
 IF NOT direct_write_denied THEN RAISE EXCEPTION 'Direct browser write allowed'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',true);
 SELECT count(id) INTO n FROM public.tasks WHERE id=task_uuid;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-owner RLS read allowed'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('mend.schema_audit_result',jsonb_build_object('rpc_create_read',true,'idempotency',true,'initial_event',true,'owner_rls',true,'cross_owner_rpc_denied',true,'cross_owner_rls_hidden',true,'direct_browser_write_denied',true,'rows_rolled_back',true,'provider_execution','not_run')::text,true);
END $probe$;
SELECT current_setting('mend.schema_audit_result')::jsonb AS probe;
ROLLBACK;
