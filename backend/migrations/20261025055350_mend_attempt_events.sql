-- Observations only: existing attempt guards, execution and release gates are unchanged.
CREATE FUNCTION mend_private.attempt_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE event_code text; observed jsonb := NULL; checks jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_code := 'attempt_reserved';
  ELSIF OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN
    event_code := 'attempt_resolved';
    checks := NEW.runner_report->'checks';
    IF jsonb_typeof(checks) = 'object' AND jsonb_typeof(checks->'results') = 'array' THEN
      SELECT jsonb_build_object('total',checks->'total','passed',checks->'passed',
        'failed',checks->'failed','skipped',checks->'skipped','results',
        coalesce(jsonb_agg(jsonb_build_object('check_id',coalesce(item->>'check_id',item->>'id'),
          'status',item->>'status')),'[]'::jsonb)) INTO observed
      FROM jsonb_array_elements(checks->'results') item;
    END IF;
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO public.logs(task_id,attempt_id,sequence,event_type,stream,message,payload)
    VALUES(NEW.task_id,NEW.id,1,'log','system',
      CASE event_code WHEN 'attempt_reserved' THEN 'Attempt reservation recorded.' ELSE 'Attempt outcome recorded.' END,
      jsonb_build_object('schema_version',1,'code',event_code,'ordinal',NEW.ordinal,
        'attempt_status',NEW.status,'snapshot_sha256',NEW.snapshot_sha256,'model_id',NEW.model_id,
        'job_id',NEW.job_id,'checks',observed));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mend_private.attempt_event() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER attempts_event AFTER INSERT OR UPDATE ON public.task_attempts
  FOR EACH ROW EXECUTE FUNCTION mend_private.attempt_event();
