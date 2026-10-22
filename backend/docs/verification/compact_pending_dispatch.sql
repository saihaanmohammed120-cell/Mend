CREATE OR REPLACE FUNCTION public.mend_command(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 t public.tasks%ROWTYPE; a public.task_attempts%ROWTYPE; r public.receipts%ROWTYPE;
 task_uuid uuid; owner_uuid uuid; worker_uuid uuid; attempt_uuid uuid;
 now_at timestamptz; result jsonb; receipt_body jsonb; proposed jsonb; reason text;
 n integer; amount numeric; actual_n integer; actual_amount numeric; sequence_value bigint; proposed_status text;
BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR
   p_action IS NULL THEN RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid command'; END IF;
 -- Only this server-side service-role RPC is granted. Worker identity is not a browser input.
 now_at := clock_timestamp();
 IF p_action='create_task' THEN
  owner_uuid := (p_payload->>'user_id')::uuid;
  IF owner_uuid IS NULL OR coalesce(length(btrim(p_payload->>'prompt')),0)=0 OR
    coalesce(length(p_payload->>'idempotency_key'),0) NOT BETWEEN 1 AND 200 OR
    coalesce(p_payload->>'runtime','python') <> 'python' THEN
   RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid task'; END IF;
  INSERT INTO public.tasks(user_id,prompt,runtime,idempotency_key)
   VALUES(owner_uuid,p_payload->>'prompt','python',p_payload->>'idempotency_key')
   ON CONFLICT (user_id,idempotency_key) DO NOTHING RETURNING id INTO task_uuid;
  IF task_uuid IS NULL THEN
   SELECT * INTO STRICT t FROM public.tasks WHERE user_id=owner_uuid AND
    idempotency_key=p_payload->>'idempotency_key' FOR UPDATE;
   IF t.prompt IS DISTINCT FROM p_payload->>'prompt' OR t.runtime IS DISTINCT FROM
      coalesce(p_payload->>'runtime','python') OR t.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='idempotency conflict'; END IF;
   task_uuid:=t.id;
  END IF;
  RETURN mend_private.task_view(task_uuid);
 ELSIF p_action='due' THEN
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO result FROM (
   SELECT a.id,a.id AS attempt_id,a.task_id,a.job_id,a.submission_key,a.status,a.deadline_at,a.dispatch_requested_at,
    t.user_id,t.cancel_requested_at,t.task_deadline_at,a.resolution_evidence,t.expires_at
   FROM public.task_attempts a JOIN public.tasks t ON t.id=a.task_id
   WHERE a.resolved_at IS NULL AND (a.deadline_at<=clock_timestamp() OR
    t.task_deadline_at<=clock_timestamp() OR t.expires_at<=clock_timestamp() OR t.cancel_requested_at IS NOT NULL)
   UNION ALL
   SELECT NULL::uuid AS id,NULL::uuid AS attempt_id,t.id AS task_id,NULL::text AS job_id,
    NULL::text AS submission_key,t.status,NULL::timestamptz AS deadline_at,NULL::timestamptz AS dispatch_requested_at,
    t.user_id,t.cancel_requested_at,t.task_deadline_at,NULL::jsonb AS resolution_evidence,t.expires_at
   FROM public.tasks t WHERE t.status IN ('writing','waiting_runner','running','fixing','finalizing','stopping') AND
    (t.task_deadline_at<=clock_timestamp() OR t.expires_at<=clock_timestamp() OR t.cancel_requested_at IS NOT NULL) AND
    NOT EXISTS(SELECT 1 FROM public.task_attempts a WHERE a.task_id=t.id AND a.resolved_at IS NULL)
   ORDER BY deadline_at NULLS LAST,task_deadline_at NULLS LAST LIMIT 100) x;
  RETURN result;
 ELSIF p_action='pending' THEN
  n:=coalesce((p_payload->>'limit')::integer,20);
  IF n NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid limit'; END IF;
  -- Dispatch polling needs identities only; full evidence stays in owned task reads.
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]'::jsonb) INTO result FROM (
   SELECT id,status,created_at FROM public.tasks WHERE status IN
    ('writing','waiting_runner','running','fixing','finalizing','stopping')
   ORDER BY created_at,id LIMIT n) x;
  RETURN result;
 END IF;
 task_uuid:=(p_payload->>'task_id')::uuid;
 SELECT * INTO t FROM public.tasks WHERE id=task_uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='M4031',MESSAGE='task unavailable'; END IF;
 owner_uuid:=(p_payload->>'user_id')::uuid;
 worker_uuid:=(p_payload->>'worker_id')::uuid;
 -- Owner read/actions must supply owner. Internal reads/cancellation are lease-fenced.
 IF p_action IN ('create_task','propose_contract','start_task','events') OR
   (p_action IN ('get_task','request_cancel') AND owner_uuid IS NOT NULL) THEN
  IF owner_uuid IS NULL OR owner_uuid IS DISTINCT FROM t.user_id OR t.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION USING ERRCODE='M4031',MESSAGE='task unavailable'; END IF;
 ELSIF p_action='deadline_cancel' THEN
  NULL; -- Service-only safety action rechecks deadline under task/attempt locks below.
 ELSIF p_action='claim_worker' THEN
  IF worker_uuid IS NULL THEN RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='worker required'; END IF;
 ELSE
  IF worker_uuid IS NULL OR t.lease_owner IS DISTINCT FROM worker_uuid OR
    t.lease_expires_at IS NULL OR t.lease_expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='worker lease expired'; END IF;
 END IF;
 IF p_action='deadline_cancel' AND p_payload->>'attempt_id' IS NULL THEN
  IF t.status IN ('passed','needs_help','runner_unavailable','stopped') OR NOT (
   coalesce(t.task_deadline_at<=clock_timestamp(),false) OR t.expires_at<=clock_timestamp() OR
   t.cancel_requested_at IS NOT NULL) THEN RETURN jsonb_build_object('cancel_requested',false); END IF;
  reason:=CASE WHEN t.cancel_requested_at IS NOT NULL THEN coalesce(t.stop_reason,'user_cancelled')
    WHEN t.expires_at<=clock_timestamp() THEN 'retention_expired' ELSE 'task_timeout' END;
  PERFORM public.mend_request_cancel(t.id,reason);
  RETURN jsonb_build_object('cancel_requested',true,'task_id',t.id,'attempt_id',NULL,'reason',reason);
 ELSIF p_action='get_task' THEN
  RETURN mend_private.task_view(t.id);
 ELSIF p_action='events' THEN
  n:=coalesce((p_payload->>'limit')::integer,100);
  IF n NOT BETWEEN 1 AND 100 OR coalesce((p_payload->>'after')::bigint,0)<0 THEN
   RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid replay range'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x.sequence),'[]'::jsonb) INTO result FROM (
   SELECT * FROM public.logs WHERE task_id=t.id AND sequence>coalesce((p_payload->>'after')::bigint,0)
   ORDER BY sequence LIMIT n) x;
  RETURN result;
 ELSIF p_action='propose_contract' THEN
  proposed:=p_payload->'contract';
  IF t.status NOT IN ('draft','ready') OR t.contract_frozen_at IS NOT NULL OR
    (p_payload->>'expected_version')::integer IS DISTINCT FROM t.contract_version THEN
   RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='proposal version conflict'; END IF;
  IF jsonb_typeof(proposed) IS DISTINCT FROM 'object' OR
   jsonb_typeof(proposed->'required_check_ids') IS DISTINCT FROM 'array' OR
   jsonb_typeof(proposed->'required_command_ids') IS DISTINCT FROM 'array' OR
   jsonb_array_length(proposed->'required_check_ids')=0 OR
   jsonb_array_length(proposed->'required_command_ids')=0 THEN
   RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid proposal'; END IF;
  UPDATE public.tasks SET contract=proposed,contract_version=contract_version+1,status='ready' WHERE id=t.id;
 ELSIF p_action='start_task' THEN
  IF t.contract_frozen_at IS NOT NULL AND t.contract_version=(p_payload->>'expected_version')::integer AND
     t.contract_sha256 IS NOT DISTINCT FROM p_payload->>'contract_sha256' AND
     t.protected_checks_sha256 IS NOT DISTINCT FROM p_payload->>'protected_checks_sha256' THEN
   RETURN mend_private.task_view(t.id); END IF;
  IF t.status<>'ready' OR (p_payload->>'expected_version')::integer IS DISTINCT FROM t.contract_version THEN
   RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='start version conflict'; END IF;
  IF clock_timestamp()+interval '10 minutes'>t.expires_at THEN
   RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='task budget exceeds remaining retention'; END IF;
  IF NOT EXISTS(SELECT 1 FROM mend_private.release_gate WHERE singleton AND live_execution_enabled) THEN
   RAISE EXCEPTION USING ERRCODE='M4121',MESSAGE='release blocked'; END IF;
  IF coalesce(p_payload->>'contract_sha256','') !~ '^[0-9a-f]{64}$' OR
    coalesce(p_payload->>'protected_checks_sha256','') !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='trusted canonical hashes required'; END IF;
  UPDATE public.tasks SET status='writing',contract_frozen_at=now_at,
   task_deadline_at=now_at+interval '10 minutes',contract_sha256=p_payload->>'contract_sha256',
   protected_checks_sha256=p_payload->>'protected_checks_sha256' WHERE id=t.id;
 ELSIF p_action='claim_worker' THEN
  RETURN jsonb_build_object('claimed',public.mend_claim_worker(t.id,worker_uuid,
    coalesce((p_payload->>'seconds')::integer,30)));
 ELSIF p_action='request_cancel' THEN
  reason:=coalesce(p_payload->>'reason','user_cancelled');
  PERFORM public.mend_request_cancel(t.id,reason);
  -- Intent is durable before any external provider cancellation call.
  UPDATE public.task_attempts SET cancel_requested_at=coalesce(cancel_requested_at,now_at)
   WHERE task_id=t.id AND resolved_at IS NULL;
  -- Diagnostics are server error codes, never free-form generated text or credentials.
  -- Invalid diagnostics cannot roll back essential cancellation intent.
  IF EXISTS(SELECT 1 FROM public.tasks WHERE id=t.id AND status='stopping') AND
    coalesce(p_payload->>'diagnostic_code','') ~ '^[a-z][a-z0-9_]{0,79}$' AND
    NOT EXISTS(SELECT 1 FROM public.logs WHERE task_id=t.id AND
      payload->>'diagnostic_code'=p_payload->>'diagnostic_code') THEN
   INSERT INTO public.logs(task_id,sequence,event_type,stream,payload)
    VALUES(t.id,1,'state','system',jsonb_build_object('status','stopping','reason',reason,
     'diagnostic_code',p_payload->>'diagnostic_code'));
  END IF;
 ELSIF p_action='set_state' THEN
  proposed_status:=p_payload->>'status';
  IF proposed_status IS NULL OR proposed_status NOT IN
   ('waiting_runner','running','needs_help','runner_unavailable','finalizing') THEN
   RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='state action not allowed'; END IF;
  UPDATE public.tasks SET status=proposed_status,
   stop_reason=CASE WHEN proposed_status IN ('needs_help','runner_unavailable') THEN
     coalesce(p_payload->>'stop_reason','execution_failed') ELSE stop_reason END,
   completed_at=CASE WHEN proposed_status IN ('needs_help','runner_unavailable') THEN now_at ELSE NULL END
   WHERE id=t.id;
 ELSIF p_action='reserve_repair' THEN
  RETURN jsonb_build_object('repair_count',public.mend_reserve_repair(t.id,worker_uuid));
 ELSIF p_action='reserve_attempt' THEN
  SELECT * INTO a FROM public.task_attempts WHERE submission_key=p_payload->>'submission_key';
  IF FOUND THEN
   IF a.task_id IS DISTINCT FROM t.id OR a.snapshot_sha256 IS DISTINCT FROM p_payload->>'snapshot_sha256' OR
      a.model_id IS DISTINCT FROM p_payload->>'model_id' OR
      a.snapshot_storage_key IS DISTINCT FROM p_payload->>'snapshot_storage_key' OR
      a.model_request_id IS DISTINCT FROM p_payload->>'model_request_id' OR
      a.image_digest IS DISTINCT FROM p_payload->>'image_digest' OR
      a.source_file_count IS DISTINCT FROM (p_payload->>'source_file_count')::smallint OR
      a.source_bytes IS DISTINCT FROM (p_payload->>'source_bytes')::integer THEN
    RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='submission key conflict'; END IF;
   RETURN to_jsonb(a); END IF;
  INSERT INTO public.task_attempts(task_id,ordinal,submission_key,model_id,model_request_id,
   snapshot_sha256,snapshot_storage_key,source_file_count,source_bytes,image_digest)
   VALUES(t.id,t.execution_count+1,p_payload->>'submission_key',p_payload->>'model_id',
    p_payload->>'model_request_id',p_payload->>'snapshot_sha256',p_payload->>'snapshot_storage_key',
    (p_payload->>'source_file_count')::smallint,(p_payload->>'source_bytes')::integer,
    p_payload->>'image_digest') RETURNING * INTO a;
  RETURN to_jsonb(a);
 ELSIF p_action IN ('dispatch','attach_job','resolve_attempt','output','deadline_cancel') THEN
  attempt_uuid:=(p_payload->>'attempt_id')::uuid;
  SELECT * INTO a FROM public.task_attempts WHERE task_id=t.id AND id=attempt_uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='M4031',MESSAGE='attempt unavailable'; END IF;
  IF p_action='deadline_cancel' THEN
   IF a.resolved_at IS NOT NULL OR NOT (coalesce(a.deadline_at<=clock_timestamp(),false) OR
      coalesce(t.task_deadline_at<=clock_timestamp(),false) OR
      t.expires_at<=clock_timestamp() OR t.cancel_requested_at IS NOT NULL) THEN
    RETURN jsonb_build_object('cancel_requested',false); END IF;
   reason:=CASE WHEN t.cancel_requested_at IS NOT NULL THEN coalesce(t.stop_reason,'user_cancelled')
     WHEN t.expires_at<=clock_timestamp() THEN 'retention_expired'
     WHEN t.task_deadline_at<=clock_timestamp() THEN 'task_timeout' ELSE 'job_timeout' END;
   PERFORM public.mend_request_cancel(t.id,reason);
   UPDATE public.task_attempts SET cancel_requested_at=coalesce(cancel_requested_at,clock_timestamp())
    WHERE id=a.id RETURNING * INTO a;
   RETURN to_jsonb(a)||jsonb_build_object('cancel_requested',true,'reason',reason);
  ELSIF p_action='output' THEN
   IF p_payload->>'provider_stream' IS NOT NULL AND p_payload->>'provider_stream' NOT IN
    ('unattributed','stdout','stderr') THEN
    RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid provider stream attribution'; END IF;
   IF p_payload ? 'truncated' AND jsonb_typeof(p_payload->'truncated') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid truncation flag'; END IF;
   IF p_payload->'truncated'='true'::jsonb THEN
    IF p_payload->>'stream' IS DISTINCT FROM 'system' THEN
     RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='trusted truncation marker must be system'; END IF;
    IF a.log_truncated THEN RETURN jsonb_build_object('sequence',NULL); END IF;
    UPDATE public.task_attempts SET log_truncated=true WHERE id=a.id;
    INSERT INTO public.logs(task_id,attempt_id,sequence,event_type,stream,message,truncated,payload)
     VALUES(t.id,a.id,1,'log','system','Output truncated after 256 KB.',true,
      CASE WHEN p_payload->>'provider_stream' IS NULL THEN '{}'::jsonb ELSE
       jsonb_build_object('provider_stream',p_payload->>'provider_stream') END) RETURNING sequence INTO sequence_value;
    RETURN jsonb_build_object('sequence',sequence_value);
   END IF;
   IF coalesce(octet_length(p_payload->>'message'),0)>65536 THEN
    RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='output chunk too large'; END IF;
   sequence_value:=mend_private.append_output(t.id,a.id,p_payload->>'stream',p_payload->>'message',p_payload->>'provider_stream');
   RETURN jsonb_build_object('sequence',sequence_value);
  ELSIF p_action='dispatch' THEN
   -- Existing intent must be reconciled, never translated into another create-job call.
   IF a.dispatch_requested_at IS NOT NULL THEN RETURN to_jsonb(a)||jsonb_build_object('new_dispatch',false); END IF;
   IF a.resolved_at IS NOT NULL OR t.status<>'waiting_runner' OR t.cancel_requested_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='dispatch unavailable'; END IF;
   UPDATE public.task_attempts SET dispatch_requested_at=now_at,deadline_at=now_at+interval '60 seconds'
    WHERE id=a.id RETURNING * INTO a;
   RETURN to_jsonb(a)||jsonb_build_object('new_dispatch',true);
  ELSIF p_action='attach_job' THEN
   IF coalesce(length(p_payload->>'job_id'),0)=0 OR a.dispatch_requested_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='job identity or dispatch missing'; END IF;
   IF a.job_id IS NOT NULL THEN
    IF a.job_id IS DISTINCT FROM p_payload->>'job_id' THEN
     RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='job identity conflict'; END IF;
    RETURN to_jsonb(a); END IF;
   -- A late acknowledged job is still attached so the cancellation worker can stop it.
   UPDATE public.task_attempts SET job_id=p_payload->>'job_id',status='submitted',
    submitted_at=coalesce((p_payload->>'submitted_at')::timestamptz,now_at) WHERE id=a.id RETURNING * INTO a;
   RETURN to_jsonb(a);
  ELSE
   IF a.resolved_at IS NOT NULL THEN
    IF a.status IS DISTINCT FROM p_payload->>'status' OR a.resolution_evidence IS DISTINCT FROM
     p_payload->'resolution_evidence' THEN
     RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='resolution conflict'; END IF;
    RETURN to_jsonb(a); END IF;
   proposed_status:=p_payload->>'status';
   IF proposed_status IS NULL OR proposed_status NOT IN
    ('passed','failed','timed_out','cancelled','infrastructure_failed') THEN
    RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='terminal attempt status required'; END IF;
   IF a.job_id IS NOT NULL AND (
    (p_payload->>'finished_at')::timestamptz IS NULL OR
    (p_payload->>'provider_stopped_at')::timestamptz IS NULL OR
    (p_payload->>'finished_at')::timestamptz<a.dispatch_requested_at OR
    (p_payload->>'provider_stopped_at')::timestamptz<(p_payload->>'finished_at')::timestamptz OR
    (p_payload->>'provider_stopped_at')::timestamptz>clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid provider chronology'; END IF;
   UPDATE public.task_attempts SET status=proposed_status,
    exit_code=(p_payload->>'exit_code')::integer,finished_at=(p_payload->>'finished_at')::timestamptz,
    provider_stopped_at=(p_payload->>'provider_stopped_at')::timestamptz,
    runner_report=p_payload->'runner_report',report_storage_key=p_payload->>'report_storage_key',
    failure_signature=p_payload->>'failure_signature',
    diagnostic_evidence_sha256=p_payload->>'diagnostic_evidence_sha256',
    resolution_evidence=p_payload->'resolution_evidence',resolved_at=now_at
    WHERE id=a.id RETURNING * INTO a;
   RETURN to_jsonb(a);
  END IF;
 ELSIF p_action='usage' THEN
  n:=coalesce((p_payload->>'token_count')::integer,-1); amount:=(p_payload->>'cost')::numeric;
  IF n<0 OR amount IS NULL OR amount<0 OR amount::text IN ('NaN','Infinity','-Infinity') OR
    coalesce((p_payload->>'api_retry_increment')::integer,0) NOT BETWEEN 0 AND 1 THEN
   RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid usage'; END IF;
  actual_n:=coalesce((p_payload->>'actual_tokens')::integer,0);
  actual_amount:=coalesce((p_payload->>'actual_cost')::numeric,0);
  IF actual_n<0 OR actual_amount<0 OR actual_amount::text IN ('NaN','Infinity','-Infinity') OR
   coalesce((t.usage->>'actual_tokens')::integer,0)+actual_n>(t.usage->>'tokens')::integer+n OR
   coalesce((t.usage->>'actual_cost')::numeric,0)+actual_amount>(t.usage->>'cost')::numeric+amount THEN
   RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='actual usage exceeded reservation'; END IF;
  IF t.status IN ('passed','needs_help','runner_unavailable','stopped') THEN
   RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='terminal task'; END IF;
  UPDATE public.tasks SET usage=jsonb_build_object(
   'tokens',(usage->>'tokens')::integer+n,'cost',(usage->>'cost')::numeric+amount,
   'api_retries',(usage->>'api_retries')::integer+coalesce((p_payload->>'api_retry_increment')::integer,0),
   'actual_tokens',coalesce((usage->>'actual_tokens')::integer,0)+actual_n,
   'actual_cost',coalesce((usage->>'actual_cost')::numeric,0)+actual_amount) WHERE id=t.id;
 ELSIF p_action='finish_stop' THEN
  IF t.status='stopped' THEN RETURN mend_private.task_view(t.id); END IF;
  IF t.status<>'stopping' THEN RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='cancellation intent missing'; END IF;
  UPDATE public.tasks SET status='stopped',completed_at=now_at,
   stop_reason=coalesce(p_payload->>'reason',stop_reason,'user_cancelled') WHERE id=t.id;
 ELSIF p_action='finalize' THEN
  SELECT * INTO r FROM public.receipts WHERE task_id=t.id;
  IF FOUND THEN RETURN r.receipt_json; END IF;
  IF t.status<>'finalizing' THEN RAISE EXCEPTION USING ERRCODE='M4091',MESSAGE='finalizing commit required'; END IF;
  SELECT * INTO STRICT a FROM public.task_attempts WHERE task_id=t.id AND ordinal=t.execution_count;
  receipt_body:=p_payload->'receipt';
  IF jsonb_typeof(receipt_body) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='receipt required'; END IF;
  -- Every authoritative identity comes from locked rows, never caller receipt copies.
  receipt_body:=receipt_body||jsonb_build_object('receipt_id',coalesce(receipt_body->>'receipt_id',gen_random_uuid()::text),
   'task_id',t.id,'source','live','status','passed','snapshot_sha256',a.snapshot_sha256);
  INSERT INTO public.receipts(id,task_id,final_attempt_id,contract_sha256,snapshot_sha256,
   model_id,job_id,image_digest,checks,omitted_checks,attempts,repair_count,duration_ms,
   bundle_storage_key,diff_storage_key,reproduction,receipt_json)
   VALUES((receipt_body->>'receipt_id')::uuid,t.id,a.id,t.contract_sha256,a.snapshot_sha256,
    a.model_id,a.job_id,a.image_digest,a.runner_report->'checks',
    coalesce(receipt_body->'omitted_checks','[]'),t.execution_count,t.repair_count,0,
    receipt_body->>'bundle_storage_key',receipt_body->>'diff_storage_key',
    receipt_body->'reproduction',receipt_body) RETURNING * INTO r;
  RETURN r.receipt_json;
 ELSE
  RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='unknown command';
 END IF;
 RETURN mend_private.task_view(t.id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
 RAISE EXCEPTION USING ERRCODE='M4001',MESSAGE='invalid typed payload';
END $function$

