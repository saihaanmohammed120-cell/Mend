-- Server-only status observation. No task, artifact or release-gate mutation.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
CREATE FUNCTION public.mend_runtime_probe() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object('schema_version',1,
   'gate_present',EXISTS(SELECT 1 FROM mend_private.release_gate WHERE singleton),
   'live_execution_enabled',coalesce((SELECT live_execution_enabled FROM mend_private.release_gate WHERE singleton),false));
$$;
REVOKE ALL ON FUNCTION public.mend_runtime_probe() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mend_runtime_probe() TO service_role;
