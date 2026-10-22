-- Read-only operator inspection. This grants no delete path and changes no retention policy.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

CREATE INDEX tasks_retention_scan_idx ON public.tasks (expires_at, id);

CREATE FUNCTION public.mend_retention_plan(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; observed_at timestamptz := statement_timestamp();
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='M4001', MESSAGE='retention inspection limit must be 1–100';
  END IF;
  WITH sampled AS MATERIALIZED (
    SELECT t.id,t.user_id,t.status,t.expires_at,t.lease_expires_at
    FROM public.tasks t WHERE t.expires_at <= observed_at
    ORDER BY t.expires_at,t.id LIMIT p_limit + 1
  ), chosen AS (
    SELECT * FROM sampled ORDER BY expires_at,id LIMIT p_limit
  ), classified AS (
    SELECT t.id,t.expires_at,array_remove(ARRAY[
      CASE WHEN t.status NOT IN ('draft','ready','passed','needs_help','runner_unavailable','stopped') THEN 'active_state' END,
      CASE WHEN t.lease_expires_at > observed_at THEN 'active_lease' END,
      CASE WHEN EXISTS(SELECT 1 FROM public.task_attempts a WHERE a.task_id=t.id AND a.resolved_at IS NULL) THEN 'unresolved_attempts' END,
      CASE WHEN EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='mend-artifacts'
        AND o.name LIKE t.user_id::text || '/' || t.id::text || '/%') THEN 'storage_objects' END
    ],NULL) AS blockers FROM chosen t
  )
  SELECT jsonb_build_object('schema_version',1,'as_of',observed_at,'limit',p_limit,
    'has_more',(SELECT count(*) > p_limit FROM sampled),
    'tasks',coalesce(jsonb_agg(jsonb_build_object('task_id',c.id,'blockers',to_jsonb(c.blockers),
      'purge_guard_satisfied',cardinality(c.blockers)=0) ORDER BY c.expires_at,c.id),'[]'::jsonb))
  INTO result FROM classified c;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.mend_retention_plan(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mend_retention_plan(integer) TO service_role;
