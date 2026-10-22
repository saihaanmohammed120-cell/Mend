-- Mend / point 5 / Backend Schema v1.0. Compatible contract: TRD v1.2.
-- Apply once to a fresh Supabase project using its migration owner (postgres).
-- This does not provision a runner, run jobs, or enable live execution.
BEGIN;

CREATE SCHEMA mend_private;
REVOKE ALL ON SCHEMA mend_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE mend_private.release_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  live_execution_enabled boolean NOT NULL DEFAULT false,
  monetary_cap numeric(18,6) CHECK (monetary_cap > 0),
  evidence_reference text,
  CHECK (NOT live_execution_enabled OR
    (monetary_cap IS NOT NULL AND evidence_reference IS NOT NULL AND length(btrim(evidence_reference)) > 0))
);
INSERT INTO mend_private.release_gate DEFAULT VALUES;

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  parent_task_id uuid,
  prompt text NOT NULL CHECK (length(btrim(prompt)) > 0),
  runtime text NOT NULL DEFAULT 'python' CHECK (runtime = 'python'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','ready','writing','waiting_runner','running','fixing','finalizing',
    'passed','needs_help','runner_unavailable','stopping','stopped')),
  contract jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(contract) = 'object'),
  contract_version integer NOT NULL DEFAULT 1 CHECK (contract_version > 0),
  contract_frozen_at timestamptz,
  contract_sha256 text CHECK (contract_sha256 ~ '^[0-9a-f]{64}$'),
  protected_checks_sha256 text CHECK (protected_checks_sha256 ~ '^[0-9a-f]{64}$'),
  max_repairs smallint NOT NULL DEFAULT 3 CHECK (max_repairs = 3),
  job_timeout_seconds smallint NOT NULL DEFAULT 60 CHECK (job_timeout_seconds = 60),
  repair_count smallint NOT NULL DEFAULT 0 CHECK (repair_count BETWEEN 0 AND 3),
  execution_count smallint NOT NULL DEFAULT 0 CHECK (execution_count BETWEEN 0 AND 4),
  usage jsonb NOT NULL DEFAULT '{"tokens":0,"cost":0,"api_retries":0}',
  stop_reason text,
  cancel_requested_at timestamptz,
  task_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  next_sequence bigint NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  lease_owner uuid,
  lease_expires_at timestamptz,
  UNIQUE (user_id,idempotency_key),
  UNIQUE (id,user_id),
  FOREIGN KEY (parent_task_id,user_id) REFERENCES public.tasks(id,user_id) ON DELETE SET NULL (parent_task_id),
  CHECK (execution_count <= repair_count + 1),
  CHECK (jsonb_typeof(usage) = 'object' AND
    jsonb_typeof(usage->'tokens') IS NOT DISTINCT FROM 'number' AND
    jsonb_typeof(usage->'cost') IS NOT DISTINCT FROM 'number' AND
    jsonb_typeof(usage->'api_retries') IS NOT DISTINCT FROM 'number'),
  CHECK ((usage->>'tokens')::numeric BETWEEN 0 AND 30000 AND
    (usage->>'tokens')::numeric = trunc((usage->>'tokens')::numeric) AND
    (usage->>'cost')::numeric >= 0 AND
    (usage->>'api_retries')::numeric BETWEEN 0 AND 2 AND
    (usage->>'api_retries')::numeric = trunc((usage->>'api_retries')::numeric)),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((contract_frozen_at IS NULL AND contract_sha256 IS NULL AND
      protected_checks_sha256 IS NULL AND task_deadline_at IS NULL)
    OR (contract_frozen_at IS NOT NULL AND contract_sha256 IS NOT NULL AND
      protected_checks_sha256 IS NOT NULL AND task_deadline_at IS NOT NULL AND
      task_deadline_at = contract_frozen_at + interval '10 minutes')),
  CHECK (status IN ('draft','ready','needs_help','runner_unavailable','stopping','stopped')
    OR contract_frozen_at IS NOT NULL),
  CHECK ((status IN ('passed','needs_help','runner_unavailable','stopped')) =
    (completed_at IS NOT NULL)),
  CHECK (status NOT IN ('needs_help','runner_unavailable','stopped') OR stop_reason IS NOT NULL),
  CHECK (expires_at > created_at)
);

CREATE TABLE public.task_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 4),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN (
    'reserved','submitted','running','passed','failed','timed_out','cancelled','infrastructure_failed')),
  submission_key text NOT NULL UNIQUE CHECK (length(btrim(submission_key)) > 0),
  job_id text UNIQUE CHECK (job_id IS NULL OR length(btrim(job_id)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_request_id text,
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_storage_key text NOT NULL CHECK (length(btrim(snapshot_storage_key)) > 0),
  source_file_count smallint NOT NULL CHECK (source_file_count BETWEEN 1 AND 20),
  source_bytes integer NOT NULL CHECK (source_bytes BETWEEN 0 AND 200000),
  image_digest text NOT NULL CHECK (image_digest ~ '^sha256:[0-9a-f]{64}$'),
  dispatch_requested_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  exit_code integer,
  failure_signature text,
  diagnostic_evidence_sha256 text CHECK (diagnostic_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  runner_report jsonb CHECK (runner_report IS NULL OR jsonb_typeof(runner_report) = 'object'),
  report_storage_key text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- A terminal status is NOT proof that a provider job has stopped.
  resolved_at timestamptz,
  resolution_evidence jsonb,
  cancel_requested_at timestamptz,
  cancel_acknowledged_at timestamptz,
  provider_stopped_at timestamptz,
  log_bytes integer NOT NULL DEFAULT 0 CHECK (log_bytes BETWEEN 0 AND 256000),
  log_truncated boolean NOT NULL DEFAULT false,
  UNIQUE (task_id,ordinal),
  UNIQUE (task_id,id),
  CHECK ((dispatch_requested_at IS NULL AND deadline_at IS NULL) OR
    (dispatch_requested_at IS NOT NULL AND deadline_at IS NOT NULL AND
      deadline_at = dispatch_requested_at + interval '60 seconds')),
  CHECK ((resolved_at IS NULL) = (resolution_evidence IS NULL)),
  CHECK (resolved_at IS NULL OR status IN ('passed','failed','timed_out','cancelled','infrastructure_failed')),
  CHECK (status NOT IN ('submitted','running','passed','failed','timed_out')
    OR dispatch_requested_at IS NOT NULL),
  -- A reserved attempt can be cancelled before it was ever dispatched.
  CHECK (status <> 'cancelled' OR dispatch_requested_at IS NOT NULL OR
    (resolved_at IS NOT NULL AND resolution_evidence->>'kind' IS NOT DISTINCT FROM 'never_dispatched')),
  CHECK (status NOT IN ('submitted','running','passed','failed') OR job_id IS NOT NULL),
  CHECK (status <> 'failed' OR (failure_signature IS NOT NULL AND diagnostic_evidence_sha256 IS NOT NULL)),
  CHECK (status <> 'passed' OR (exit_code IS NOT NULL AND exit_code = 0 AND finished_at IS NOT NULL AND
    deadline_at IS NOT NULL AND finished_at <= deadline_at AND resolved_at IS NOT NULL AND
    runner_report IS NOT NULL AND report_storage_key IS NOT NULL AND cancel_requested_at IS NULL AND
    provider_stopped_at IS NOT NULL AND provider_stopped_at <= deadline_at)),
  CHECK (resolution_evidence IS NULL OR jsonb_typeof(resolution_evidence) = 'object')
);
-- An ambiguous dispatch/termination still occupies the single active slot.
CREATE UNIQUE INDEX task_one_unresolved_attempt ON public.task_attempts(task_id)
  WHERE resolved_at IS NULL;

CREATE TABLE public.logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  attempt_id uuid,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_type text NOT NULL CHECK (event_type IN ('state','log','receipt','failed','stopped')),
  stream text NOT NULL CHECK (stream IN ('stdout','stderr','system')),
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payload) = 'object'),
  truncated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (task_id,sequence),
  FOREIGN KEY (task_id,attempt_id) REFERENCES public.task_attempts(task_id,id),
  CHECK (stream = 'system' OR (event_type = 'log' AND attempt_id IS NOT NULL)),
  CHECK (event_type = 'log' OR stream = 'system')
);

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL UNIQUE REFERENCES public.tasks(id) ON DELETE CASCADE,
  final_attempt_id uuid NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  source text NOT NULL DEFAULT 'live' CHECK (source = 'live'),
  status text NOT NULL DEFAULT 'passed' CHECK (status = 'passed'),
  contract_sha256 text NOT NULL CHECK (contract_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  model_id text NOT NULL,
  job_id text NOT NULL,
  image_digest text NOT NULL CHECK (image_digest ~ '^sha256:[0-9a-f]{64}$'),
  checks jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'object'),
  omitted_checks jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(omitted_checks) = 'array'),
  attempts smallint NOT NULL CHECK (attempts BETWEEN 1 AND 4),
  repair_count smallint NOT NULL CHECK (repair_count BETWEEN 0 AND 3),
  duration_ms bigint NOT NULL CHECK (duration_ms >= 0),
  bundle_storage_key text NOT NULL,
  diff_storage_key text NOT NULL,
  reproduction jsonb NOT NULL CHECK (jsonb_typeof(reproduction) = 'object'),
  receipt_json jsonb NOT NULL CHECK (jsonb_typeof(receipt_json) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (task_id,final_attempt_id) REFERENCES public.task_attempts(task_id,id)
);

CREATE INDEX tasks_owner_recent ON public.tasks(user_id,created_at DESC);
CREATE INDEX tasks_deadline ON public.tasks(status,task_deadline_at);
CREATE INDEX attempts_deadline ON public.task_attempts(status,deadline_at);
-- logs(task_id,sequence) is already indexed by its UNIQUE constraint.

-- Private helpers are callable by trigger owner, never by a browser.
CREATE FUNCTION mend_private.task_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE gate mend_private.release_gate%ROWTYPE; active_count integer; cleared_parent boolean := false;
BEGIN
  SELECT * INTO gate FROM mend_private.release_gate WHERE singleton;
  IF (NEW.usage->>'cost')::numeric > gate.monetary_cap THEN
    RAISE EXCEPTION 'monetary budget exhausted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.contract_frozen_at IS NOT NULL OR
      NEW.repair_count <> 0 OR NEW.execution_count <> 0 OR NEW.next_sequence <> 1 OR
      NEW.cancel_requested_at IS NOT NULL OR NEW.lease_owner IS NOT NULL THEN
      RAISE EXCEPTION 'new task must be an unfrozen draft';
    END IF;
    NEW.created_at := clock_timestamp();
    NEW.updated_at := NEW.created_at;
    NEW.expires_at := NEW.created_at + interval '24 hours';
    RETURN NEW;
  END IF;
  cleared_parent := OLD.parent_task_id IS NOT NULL AND NEW.parent_task_id IS NULL AND
    NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = OLD.parent_task_id);
  IF (NEW.id,NEW.user_id,NEW.idempotency_key,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.idempotency_key,OLD.created_at,OLD.expires_at) OR
    (NEW.parent_task_id IS DISTINCT FROM OLD.parent_task_id AND NOT cleared_parent) THEN
    RAISE EXCEPTION 'task identity and retention are immutable';
  END IF;
  IF OLD.status IN ('passed','needs_help','runner_unavailable','stopped') AND
    (to_jsonb(NEW) - ARRAY['updated_at','next_sequence','lease_owner','lease_expires_at','parent_task_id'])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['updated_at','next_sequence','lease_owner','lease_expires_at','parent_task_id']) THEN
    RAISE EXCEPTION 'terminal task is immutable';
  END IF;
  IF OLD.contract_frozen_at IS NULL AND NEW.contract_frozen_at IS NOT NULL AND
    NOT (OLD.status = 'ready' AND NEW.status = 'writing') THEN
    RAISE EXCEPTION 'only explicit Start may freeze a contract';
  END IF;
  IF NEW.contract_version IS DISTINCT FROM OLD.contract_version AND NEW.contract_version <> OLD.contract_version + 1 THEN
    RAISE EXCEPTION 'proposal version must advance exactly once';
  END IF;
  IF OLD.contract_frozen_at IS NOT NULL AND
    (NEW.prompt,NEW.runtime,NEW.contract,NEW.contract_version,NEW.contract_frozen_at,
     NEW.contract_sha256,NEW.protected_checks_sha256,NEW.task_deadline_at)
    IS DISTINCT FROM
    (OLD.prompt,OLD.runtime,OLD.contract,OLD.contract_version,OLD.contract_frozen_at,
     OLD.contract_sha256,OLD.protected_checks_sha256,OLD.task_deadline_at) THEN
    RAISE EXCEPTION 'frozen contract cannot change';
  END IF;
  IF OLD.contract_frozen_at IS NULL AND (NEW.prompt,NEW.contract) IS DISTINCT FROM
    (OLD.prompt,OLD.contract) AND NEW.contract_version <> OLD.contract_version + 1 THEN
    RAISE EXCEPTION 'proposal edit must increment version exactly once';
  END IF;
  IF NEW.repair_count < OLD.repair_count OR NEW.execution_count < OLD.execution_count OR
    (NEW.usage->>'tokens')::numeric < (OLD.usage->>'tokens')::numeric OR
    (NEW.usage->>'cost')::numeric < (OLD.usage->>'cost')::numeric OR
    (NEW.usage->>'api_retries')::numeric < (OLD.usage->>'api_retries')::numeric THEN
    RAISE EXCEPTION 'reserved budgets cannot be refunded';
  END IF;
  IF OLD.cancel_requested_at IS NOT NULL AND NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at THEN
    RAISE EXCEPTION 'cancellation intent cannot be removed';
  END IF;
  IF NEW.cancel_requested_at IS NOT NULL AND NEW.status NOT IN ('stopping','stopped') THEN
    RAISE EXCEPTION 'cancellation blocks new work and success';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (CASE OLD.status
      WHEN 'draft' THEN NEW.status IN ('ready','needs_help','stopping')
      WHEN 'ready' THEN NEW.status IN ('draft','writing','needs_help','stopping')
      WHEN 'writing' THEN NEW.status IN ('waiting_runner','needs_help','runner_unavailable','stopping')
      WHEN 'waiting_runner' THEN NEW.status IN ('running','needs_help','runner_unavailable','stopping')
      WHEN 'running' THEN NEW.status IN ('fixing','finalizing','needs_help','runner_unavailable','stopping')
      WHEN 'fixing' THEN NEW.status IN ('waiting_runner','needs_help','runner_unavailable','stopping')
      WHEN 'finalizing' THEN NEW.status IN ('passed','needs_help','stopping')
      WHEN 'stopping' THEN NEW.status = 'stopped'
      ELSE false END) THEN RAISE EXCEPTION 'invalid task transition: % -> %',OLD.status,NEW.status; END IF;
    IF NEW.status = 'writing' THEN
      IF NOT gate.live_execution_enabled THEN RAISE EXCEPTION 'live execution release gates unresolved'; END IF;
      IF OLD.status <> 'ready' OR NEW.contract_frozen_at IS NULL OR
        NEW.contract_frozen_at > clock_timestamp() OR
        NEW.task_deadline_at <= clock_timestamp() OR
        jsonb_typeof(NEW.contract->'required_check_ids') IS DISTINCT FROM 'array' OR
        jsonb_array_length(NEW.contract->'required_check_ids') < 1 OR
        jsonb_typeof(NEW.contract->'required_command_ids') IS DISTINCT FROM 'array' OR
        jsonb_array_length(NEW.contract->'required_command_ids') < 1 THEN
        RAISE EXCEPTION 'Start requires a valid frozen reviewed contract';
      END IF;
      -- Serialize Start across all tasks of this owner, not just this task row.
      PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
      SELECT count(*) INTO active_count FROM public.tasks WHERE user_id = NEW.user_id AND id <> NEW.id
        AND status IN ('writing','waiting_runner','running','fixing','finalizing','stopping');
      IF active_count >= 2 THEN RAISE EXCEPTION 'two active tasks per user'; END IF;
    END IF;
    IF NEW.status IN ('waiting_runner','running','fixing','finalizing','passed') AND
      NEW.task_deadline_at <= clock_timestamp() THEN RAISE EXCEPTION 'overall task deadline exceeded'; END IF;
    IF NEW.status IN ('needs_help','runner_unavailable','stopped') AND EXISTS (
      SELECT 1 FROM public.task_attempts WHERE task_id = NEW.id AND resolved_at IS NULL) THEN
      RAISE EXCEPTION 'cannot finish while dispatch or termination remains unresolved';
    END IF;
    IF NEW.status = 'finalizing' THEN PERFORM mend_private.check_success(NEW.id); END IF;
    IF NEW.status = 'passed' AND NOT EXISTS (SELECT 1 FROM public.receipts WHERE task_id = NEW.id) THEN
      RAISE EXCEPTION 'passed requires persisted receipt';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;

CREATE FUNCTION mend_private.allocate_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- UPDATE acquires the task lock; rollback rolls allocation and insert back together.
  UPDATE public.tasks SET next_sequence = next_sequence + 1 WHERE id = NEW.task_id
    RETURNING next_sequence - 1 INTO NEW.sequence;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown task'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mend_private.state_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE kind text; body jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status AND NEW.contract_version = OLD.contract_version THEN RETURN NEW; END IF;
  kind := CASE NEW.status WHEN 'passed' THEN 'receipt' WHEN 'stopped' THEN 'stopped'
    WHEN 'needs_help' THEN 'failed' WHEN 'runner_unavailable' THEN 'failed' ELSE 'state' END;
  body := jsonb_build_object('status',NEW.status,'contract_version',NEW.contract_version,'reason',NEW.stop_reason);
  IF NEW.status = 'passed' THEN
    body := body || jsonb_build_object('receipt_id',(SELECT id FROM public.receipts WHERE task_id = NEW.id));
  END IF;
  INSERT INTO public.logs(task_id,sequence,event_type,stream,payload) VALUES (NEW.id,1,kind,'system',body);
  RETURN NEW;
END $$;

CREATE FUNCTION mend_private.attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = NEW.task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown task'; END IF;
  IF NEW.snapshot_storage_key NOT LIKE t.user_id::text || '/' || t.id::text || '/%' OR
    (NEW.report_storage_key IS NOT NULL AND NEW.report_storage_key NOT LIKE t.user_id::text || '/' || t.id::text || '/%') THEN
    RAISE EXCEPTION 'artifact must belong to task owner';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF t.status NOT IN ('writing','fixing') OR t.cancel_requested_at IS NOT NULL OR
      t.task_deadline_at <= clock_timestamp() OR NEW.status <> 'reserved' OR
      NEW.ordinal <> t.execution_count + 1 OR NEW.log_bytes <> 0 OR NEW.log_truncated OR
      NEW.dispatch_requested_at IS NOT NULL OR NEW.resolved_at IS NOT NULL OR NEW.job_id IS NOT NULL OR t.execution_count >= 4 OR
      t.execution_count >= t.repair_count + 1 THEN RAISE EXCEPTION 'execution reservation rejected'; END IF;
    IF EXISTS (SELECT 1 FROM public.task_attempts WHERE task_id = t.id AND
      provider_stopped_at > deadline_at) THEN RAISE EXCEPTION 'prior job exceeded deadline; block further dispatch'; END IF;
    UPDATE public.tasks SET execution_count = execution_count + 1 WHERE id = t.id;
  ELSE
    IF (NEW.id,NEW.task_id,NEW.ordinal,NEW.submission_key,NEW.model_id,NEW.model_request_id,
      NEW.snapshot_sha256,NEW.snapshot_storage_key,NEW.source_file_count,NEW.source_bytes,NEW.image_digest,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.task_id,OLD.ordinal,OLD.submission_key,OLD.model_id,OLD.model_request_id,
      OLD.snapshot_sha256,OLD.snapshot_storage_key,OLD.source_file_count,OLD.source_bytes,OLD.image_digest,OLD.created_at) THEN
      RAISE EXCEPTION 'attempt reservation identity is immutable';
    END IF;
    IF OLD.job_id IS NOT NULL AND NEW.job_id IS DISTINCT FROM OLD.job_id THEN RAISE EXCEPTION 'job identity cannot change'; END IF;
    IF OLD.cancel_requested_at IS NOT NULL AND NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at THEN
      RAISE EXCEPTION 'attempt cancellation intent cannot be removed';
    END IF;
    IF OLD.dispatch_requested_at IS NOT NULL AND
      (NEW.dispatch_requested_at,NEW.deadline_at) IS DISTINCT FROM (OLD.dispatch_requested_at,OLD.deadline_at) THEN
      RAISE EXCEPTION 'job deadline cannot reset';
    END IF;
    IF OLD.resolved_at IS NOT NULL AND
      (to_jsonb(NEW) - ARRAY['log_bytes','log_truncated']) IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['log_bytes','log_truncated']) THEN RAISE EXCEPTION 'resolved attempt is immutable'; END IF;
    IF NEW.log_bytes < OLD.log_bytes OR (OLD.log_truncated AND NOT NEW.log_truncated) THEN
      RAISE EXCEPTION 'log counters cannot reset';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (CASE OLD.status
      WHEN 'reserved' THEN NEW.status IN ('submitted','timed_out','cancelled','infrastructure_failed')
      WHEN 'submitted' THEN NEW.status IN ('running','passed','failed','timed_out','cancelled','infrastructure_failed')
      WHEN 'running' THEN NEW.status IN ('passed','failed','timed_out','cancelled','infrastructure_failed')
      ELSE false END) THEN RAISE EXCEPTION 'invalid attempt transition'; END IF;
  END IF;
  IF NEW.dispatch_requested_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.dispatch_requested_at IS NULL) THEN
    IF t.cancel_requested_at IS NOT NULL OR t.task_deadline_at <= clock_timestamp() OR
      NEW.dispatch_requested_at > clock_timestamp() OR NEW.deadline_at > t.task_deadline_at THEN
      RAISE EXCEPTION 'dispatch must fit existing deadline and cancellation';
    END IF;
  END IF;
  IF NEW.resolved_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.resolved_at IS NULL) THEN
    IF coalesce(length(btrim(NEW.resolution_evidence->>'reference')),0) = 0 THEN
      RAISE EXCEPTION 'resolution requires durable evidence reference';
    END IF;
    IF NEW.job_id IS NOT NULL AND NEW.resolution_evidence->>'kind' IS DISTINCT FROM 'provider_terminal' THEN
      RAISE EXCEPTION 'known job requires confirmed provider termination evidence';
    END IF;
    IF NEW.job_id IS NULL AND coalesce(NEW.resolution_evidence->>'kind','') NOT IN ('never_dispatched','provider_absent') THEN
      RAISE EXCEPTION 'ambiguous dispatch must be reconciled';
    END IF;
    IF NEW.resolution_evidence->>'kind' = 'never_dispatched' AND NEW.dispatch_requested_at IS NOT NULL THEN
      RAISE EXCEPTION 'submitted or ambiguous work cannot be declared never dispatched';
    END IF;
    IF NEW.job_id IS NOT NULL AND NEW.provider_stopped_at IS NULL THEN
      RAISE EXCEPTION 'cancellation acknowledgement is not provider stop confirmation';
    END IF;
  END IF;
  IF NEW.status = 'passed' AND t.cancel_requested_at IS NOT NULL THEN RAISE EXCEPTION 'cancelled task cannot pass'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mend_private.check_success(p_task uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks%ROWTYPE; a public.task_attempts%ROWTYPE; required jsonb; observed jsonb; commands jsonb;
BEGIN
  SELECT * INTO STRICT t FROM public.tasks WHERE id = p_task FOR UPDATE;
  SELECT * INTO STRICT a FROM public.task_attempts WHERE task_id = p_task AND ordinal = t.execution_count;
  required := t.contract->'required_check_ids';
  observed := a.runner_report->'checks';
  commands := a.runner_report->'command_results';
  IF t.cancel_requested_at IS NOT NULL OR t.task_deadline_at <= clock_timestamp() OR
    a.status <> 'passed' OR a.resolved_at IS NULL OR a.job_id IS NULL OR
    a.finished_at > a.deadline_at OR a.provider_stopped_at > a.deadline_at OR a.exit_code IS DISTINCT FROM 0 OR
    a.runner_report->>'complete' IS DISTINCT FROM 'true' OR
    a.runner_report->>'contract_sha256' IS DISTINCT FROM t.contract_sha256 OR
    a.runner_report->>'protected_checks_sha256' IS DISTINCT FROM t.protected_checks_sha256 OR
    a.runner_report->>'snapshot_sha256' IS DISTINCT FROM a.snapshot_sha256 OR
    a.runner_report->>'attempt_id' IS DISTINCT FROM a.id::text OR
    a.runner_report->>'job_id' IS DISTINCT FROM a.job_id OR
    jsonb_typeof(required) IS DISTINCT FROM 'array' OR
    jsonb_typeof(observed) IS DISTINCT FROM 'object' OR
    jsonb_typeof(commands) IS DISTINCT FROM 'array' OR
    jsonb_typeof(t.contract->'required_command_ids') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'success evidence incomplete or mismatched';
  END IF;
  IF EXISTS (SELECT 1 FROM public.task_attempts WHERE task_id = p_task AND
    provider_stopped_at > deadline_at) THEN RAISE EXCEPTION 'prior job exceeded deadline; success blocked'; END IF;
  IF jsonb_array_length(required) < 1 OR
    (observed->>'failed') IS DISTINCT FROM '0' OR
    (observed->>'skipped') IS DISTINCT FROM '0' OR
    (observed->>'total')::integer IS DISTINCT FROM jsonb_array_length(required) OR
    (observed->>'passed')::integer IS DISTINCT FROM jsonb_array_length(required) OR
    jsonb_typeof(observed->'results') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'all required checks must run and pass';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(observed->'results')) <> jsonb_array_length(required) OR
    EXISTS (SELECT 1 FROM jsonb_array_elements(observed->'results') result
      WHERE result->>'status' IS DISTINCT FROM 'passed' OR
        NOT (required @> jsonb_build_array(result->>'id'))) OR
    EXISTS (SELECT 1 FROM jsonb_array_elements_text(required) check_id
      WHERE (SELECT count(*) FROM jsonb_array_elements(observed->'results') result
        WHERE result->>'id' = check_id) <> 1) THEN
    RAISE EXCEPTION 'missing, duplicated, skipped, failed or invented required check';
  END IF;
  IF jsonb_array_length(t.contract->'required_command_ids') < 1 OR
    jsonb_array_length(commands) <> jsonb_array_length(t.contract->'required_command_ids') OR
    EXISTS (SELECT 1 FROM jsonb_array_elements(commands) command
      WHERE command->>'status' IS DISTINCT FROM 'passed' OR command->>'exit_code' IS DISTINCT FROM '0' OR
        NOT ((t.contract->'required_command_ids') @> jsonb_build_array(command->>'id'))) OR
    EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.contract->'required_command_ids') command_id
      WHERE (SELECT count(*) FROM jsonb_array_elements(commands) command
        WHERE command->>'id' = command_id) <> 1) THEN
    RAISE EXCEPTION 'required command missing, duplicated or unsuccessful';
  END IF;
END $$;

CREATE FUNCTION mend_private.receipt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks%ROWTYPE; a public.task_attempts%ROWTYPE;
BEGIN
  SELECT * INTO STRICT t FROM public.tasks WHERE id = NEW.task_id FOR UPDATE;
  IF t.status <> 'finalizing' THEN RAISE EXCEPTION 'persist finalizing before receipt'; END IF;
  PERFORM mend_private.check_success(t.id);
  SELECT * INTO STRICT a FROM public.task_attempts WHERE task_id = t.id AND ordinal = t.execution_count;
  IF (NEW.final_attempt_id,NEW.contract_sha256,NEW.snapshot_sha256,NEW.model_id,NEW.job_id,NEW.image_digest,
      NEW.attempts,NEW.repair_count,NEW.checks)
    IS DISTINCT FROM (a.id,t.contract_sha256,a.snapshot_sha256,a.model_id,a.job_id,a.image_digest,
      t.execution_count,t.repair_count,a.runner_report->'checks') THEN RAISE EXCEPTION 'receipt evidence mismatch'; END IF;
  IF NEW.bundle_storage_key NOT LIKE t.user_id::text || '/' || t.id::text || '/%' OR
    NEW.diff_storage_key NOT LIKE t.user_id::text || '/' || t.id::text || '/%' OR
    NEW.receipt_json->>'bundle_verified_sha256' IS DISTINCT FROM a.snapshot_sha256 OR
    NEW.receipt_json->>'receipt_id' IS DISTINCT FROM NEW.id::text OR
    NEW.receipt_json->>'task_id' IS DISTINCT FROM t.id::text OR
    NEW.receipt_json->>'source' IS DISTINCT FROM 'live' OR
    NEW.receipt_json->>'status' IS DISTINCT FROM 'passed' OR
    NEW.receipt_json->>'snapshot_sha256' IS DISTINCT FROM a.snapshot_sha256 THEN
    RAISE EXCEPTION 'handoff identity or bundle hash mismatch';
  END IF;
  NEW.created_at := clock_timestamp();
  NEW.duration_ms := floor(extract(epoch FROM (NEW.created_at - t.contract_frozen_at))*1000)::bigint;
  -- Canonical fields override conflicting caller copies; history comes from this task's rows.
  NEW.receipt_json := NEW.receipt_json || jsonb_build_object(
    'schema_version',NEW.schema_version,'receipt_id',NEW.id,'task_id',t.id,
    'source','live','status','passed','live_verification',true,
    'contract_sha256',NEW.contract_sha256,'snapshot_sha256',NEW.snapshot_sha256,
    'model',jsonb_build_object('id',NEW.model_id),'job_id',NEW.job_id,'image_digest',NEW.image_digest,
    'checks',NEW.checks,'omitted_checks',NEW.omitted_checks,'attempts',NEW.attempts,
    'repair_count',NEW.repair_count,'duration_ms',NEW.duration_ms,'created_at',NEW.created_at,
    'reproduction',NEW.reproduction,
    'limits',jsonb_build_object('job_seconds',60,'max_repairs',3,'task_seconds',600,'token_cap',30000),
    'artifacts',jsonb_build_object('bundle_storage_key',NEW.bundle_storage_key,'diff_storage_key',NEW.diff_storage_key),
    'history',(SELECT jsonb_agg(jsonb_build_object('ordinal',x.ordinal,'status',x.status,'job_id',x.job_id,
      'model_id',x.model_id,'snapshot_sha256',x.snapshot_sha256,'failure_signature',x.failure_signature,
      'dispatch_requested_at',x.dispatch_requested_at,'finished_at',x.finished_at,
      'provider_stopped_at',x.provider_stopped_at) ORDER BY x.ordinal)
      FROM public.task_attempts x WHERE x.task_id = t.id));
  RETURN NEW;
END $$;

CREATE FUNCTION mend_private.complete_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Receipt row, passed state, and receipt event are in this same transaction.
  UPDATE public.tasks SET status = 'passed',completed_at = NEW.created_at WHERE id = NEW.task_id;
  RETURN NEW;
END $$;

CREATE FUNCTION mend_private.deny_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION '% is append-only during retention',TG_TABLE_NAME; END $$;

CREATE TRIGGER tasks_guard BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION mend_private.task_guard();
CREATE TRIGGER tasks_event AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION mend_private.state_event();
CREATE TRIGGER attempts_guard BEFORE INSERT OR UPDATE ON public.task_attempts FOR EACH ROW EXECUTE FUNCTION mend_private.attempt_guard();
CREATE TRIGGER logs_sequence BEFORE INSERT ON public.logs FOR EACH ROW EXECUTE FUNCTION mend_private.allocate_event();
CREATE TRIGGER logs_no_update BEFORE UPDATE ON public.logs FOR EACH ROW EXECUTE FUNCTION mend_private.deny_mutation();
CREATE TRIGGER receipts_guard BEFORE INSERT ON public.receipts FOR EACH ROW EXECUTE FUNCTION mend_private.receipt_guard();
CREATE TRIGGER receipts_complete AFTER INSERT ON public.receipts FOR EACH ROW EXECUTE FUNCTION mend_private.complete_receipt();
CREATE TRIGGER receipts_no_update BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION mend_private.deny_mutation();

-- Atomic backend operations. Network/model calls happen AFTER these transactions commit.
CREATE FUNCTION public.mend_reserve_repair(p_task uuid,p_lease uuid) RETURNS smallint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO STRICT t FROM public.tasks WHERE id = p_task FOR UPDATE;
  IF t.status NOT IN ('running','fixing') OR t.cancel_requested_at IS NOT NULL OR
    t.task_deadline_at <= clock_timestamp() OR t.repair_count >= 3 OR
    p_lease IS NULL OR t.lease_owner IS DISTINCT FROM p_lease OR t.lease_expires_at IS NULL OR
    t.lease_expires_at <= clock_timestamp() OR
    EXISTS (SELECT 1 FROM public.task_attempts WHERE task_id = p_task AND resolved_at IS NULL) OR
    NOT EXISTS (SELECT 1 FROM public.task_attempts WHERE task_id = p_task AND ordinal = t.execution_count AND status = 'failed') THEN
    RAISE EXCEPTION 'repair reservation rejected';
  END IF;
  IF EXISTS (SELECT 1 FROM public.task_attempts WHERE task_id = p_task AND
    provider_stopped_at > deadline_at) THEN RAISE EXCEPTION 'prior job exceeded deadline; repairs blocked'; END IF;
  IF EXISTS (SELECT 1 FROM public.task_attempts latest JOIN public.task_attempts previous
      ON previous.task_id = latest.task_id AND previous.ordinal = latest.ordinal - 1
      WHERE latest.task_id = p_task AND latest.ordinal = t.execution_count AND
        latest.status = 'failed' AND previous.status = 'failed' AND
        latest.failure_signature = previous.failure_signature AND
        latest.diagnostic_evidence_sha256 = previous.diagnostic_evidence_sha256) THEN
    RAISE EXCEPTION 'repeated failure without new evidence';
  END IF;
  UPDATE public.tasks SET repair_count = repair_count + 1,status = 'fixing' WHERE id = p_task;
  RETURN t.repair_count + 1;
END $$;

CREATE FUNCTION public.mend_claim_worker(p_task uuid,p_owner uuid,p_seconds integer DEFAULT 30)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks%ROWTYPE;
BEGIN
  IF p_owner IS NULL OR p_seconds NOT BETWEEN 1 AND 60 OR p_seconds IS NULL THEN RAISE EXCEPTION 'invalid lease'; END IF;
  SELECT * INTO STRICT t FROM public.tasks WHERE id = p_task FOR UPDATE;
  IF t.status IN ('passed','needs_help','runner_unavailable','stopped') THEN RETURN false; END IF;
  IF t.lease_owner IS NOT NULL AND t.lease_owner <> p_owner AND t.lease_expires_at > clock_timestamp() THEN RETURN false; END IF;
  UPDATE public.tasks SET lease_owner = p_owner,
    lease_expires_at = clock_timestamp() + make_interval(secs => p_seconds) WHERE id = p_task;
  RETURN true;
END $$;

CREATE FUNCTION public.mend_append_output(p_task uuid,p_attempt uuid,p_stream text,p_message text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.task_attempts%ROWTYPE; budget integer; n integer; s bigint; kept text;
BEGIN
  IF p_stream NOT IN ('stdout','stderr') OR p_message IS NULL THEN RAISE EXCEPTION 'invalid output'; END IF;
  PERFORM 1 FROM public.tasks WHERE id = p_task FOR UPDATE;
  SELECT * INTO STRICT a FROM public.task_attempts WHERE task_id = p_task AND id = p_attempt FOR UPDATE;
  IF a.log_truncated THEN RETURN NULL; END IF;
  budget := 256000 - a.log_bytes;
  n := octet_length(p_message);
  kept := p_message;
  -- Trim whole characters; avoid slicing UTF-8 bytes inside a code point.
  IF n > budget THEN
    kept := left(p_message,budget);
    WHILE octet_length(kept) > budget LOOP kept := left(kept,length(kept)-1); END LOOP;
  END IF;
  IF kept <> '' THEN
    INSERT INTO public.logs(task_id,attempt_id,sequence,event_type,stream,message)
      VALUES (p_task,p_attempt,1,'log',p_stream,kept) RETURNING sequence INTO s;
  END IF;
  UPDATE public.task_attempts SET log_bytes = log_bytes + octet_length(kept),log_truncated = n > budget
    WHERE id = p_attempt;
  IF n > budget THEN
    INSERT INTO public.logs(task_id,attempt_id,sequence,event_type,stream,message,truncated)
      VALUES (p_task,p_attempt,1,'log','system','Output truncated after 256 KB.',true) RETURNING sequence INTO s;
  END IF;
  RETURN s;
END $$;

CREATE FUNCTION public.mend_request_cancel(p_task uuid,p_reason text DEFAULT 'user_cancelled') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN ('user_cancelled','job_timeout','task_timeout','termination_unconfirmed','retention_expired') THEN
    RAISE EXCEPTION 'invalid cancellation reason';
  END IF;
  SELECT * INTO STRICT t FROM public.tasks WHERE id = p_task FOR UPDATE;
  IF t.status IN ('passed','needs_help','runner_unavailable','stopped') THEN RETURN t.status; END IF;
  IF t.status <> 'stopping' THEN
    UPDATE public.tasks SET status = 'stopping',cancel_requested_at = clock_timestamp(),
      stop_reason = p_reason WHERE id = p_task;
  END IF;
  -- Caller commits, then deadline worker cancels/reconciles the provider job.
  RETURN 'stopping';
END $$;

CREATE FUNCTION mend_private.purge_expired_task(p_task uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF t.expires_at > clock_timestamp() OR
    t.status NOT IN ('draft','ready','passed','needs_help','runner_unavailable','stopped') OR
    t.lease_expires_at > clock_timestamp() OR
    EXISTS (SELECT 1 FROM public.task_attempts WHERE task_id = p_task AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'retention cleanup must wait for stopped work and expired retention';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'mend-artifacts' AND
      name LIKE t.user_id::text || '/' || t.id::text || '/%') THEN
    RAISE EXCEPTION 'remove artifacts through Storage API before purging metadata';
  END IF;
  DELETE FROM public.tasks WHERE id = p_task;
  RETURN true;
END $$;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_owner_read ON public.tasks FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND expires_at > now());
CREATE POLICY attempts_owner_read ON public.task_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = (SELECT auth.uid()) AND t.expires_at > now()));
CREATE POLICY logs_owner_read ON public.logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = (SELECT auth.uid()) AND t.expires_at > now()));
CREATE POLICY receipts_owner_read ON public.receipts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = (SELECT auth.uid()) AND t.expires_at > now()));

REVOKE ALL ON public.tasks,public.task_attempts,public.logs,public.receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.tasks,public.task_attempts,public.logs,public.receipts TO authenticated,service_role;
GRANT INSERT ON public.tasks,public.task_attempts TO service_role;
-- Budget counters / event sequence / log counters / lease ownership are helper-owned.
GRANT UPDATE(prompt,contract,contract_version,status,contract_frozen_at,contract_sha256,
  protected_checks_sha256,usage,stop_reason,cancel_requested_at,task_deadline_at,completed_at)
  ON public.tasks TO service_role;
GRANT UPDATE(status,job_id,dispatch_requested_at,deadline_at,submitted_at,started_at,finished_at,
  exit_code,failure_signature,diagnostic_evidence_sha256,runner_report,report_storage_key,resolved_at,resolution_evidence,
  cancel_requested_at,cancel_acknowledged_at,provider_stopped_at) ON public.task_attempts TO service_role;
GRANT INSERT ON public.receipts TO service_role;
-- Logs can only be inserted by trusted trigger helpers / capped output RPC.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mend_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mend_reserve_repair(uuid,uuid),
  public.mend_append_output(uuid,uuid,text,text),public.mend_request_cancel(uuid,text),
  public.mend_claim_worker(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mend_reserve_repair(uuid,uuid),
  public.mend_append_output(uuid,uuid,text,text),public.mend_request_cancel(uuid,text),
  public.mend_claim_worker(uuid,uuid,integer) TO service_role;

INSERT INTO storage.buckets(id,name,public) VALUES ('mend-artifacts','mend-artifacts',false);
-- No browser Storage write/read policies: API authorizes and signs private downloads.

COMMIT;
