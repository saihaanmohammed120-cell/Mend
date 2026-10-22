BEGIN;
DO $test$
DECLARE p jsonb; n integer; invalid_count integer:=0; denied_count integer:=0;
BEGIN
 FOR n IN SELECT unnest(ARRAY[0,101,NULL]::integer[]) LOOP
  BEGIN PERFORM public.mend_retention_plan(n);
  EXCEPTION WHEN SQLSTATE 'M4001' THEN invalid_count:=invalid_count+1; END;
 END LOOP;
 IF invalid_count<>3 THEN RAISE EXCEPTION 'Invalid retention limits were not all rejected'; END IF;
 BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.mend_retention_plan(2);
 EXCEPTION WHEN insufficient_privilege THEN denied_count:=denied_count+1;
 END;
 EXECUTE 'RESET ROLE';
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mend_retention_plan(2);
 EXCEPTION WHEN insufficient_privilege THEN denied_count:=denied_count+1;
 END;
 EXECUTE 'RESET ROLE';
 IF denied_count<>2 THEN RAISE EXCEPTION 'Browser RPC access was not denied'; END IF;
 EXECUTE 'SET LOCAL ROLE service_role';
 p:=public.mend_retention_plan(2);
 IF jsonb_array_length(p->'tasks')<>2 OR (p->>'has_more')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Bounded live inspection/pagination signal failed';
 END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('mend.retention_acceptance',jsonb_build_object('invalid_limits_rejected',invalid_count,'browser_roles_denied',denied_count,'service_rpc_succeeded',true,'limit_two_returns_two',true,'has_more',true,'deletion_performed',false)::text,true);
END $test$;
SELECT current_setting('mend.retention_acceptance')::jsonb AS acceptance;
ROLLBACK;
