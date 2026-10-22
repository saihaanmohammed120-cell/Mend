-- Cover the exact composite foreign keys reported by the hosted advisor.
-- The inspected tables have 3/0/4/0 rows; bound lock waiting for this small migration.
-- This changes indexes only: no rows, permissions, policies or execution gates.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

CREATE INDEX logs_task_attempt_fk_idx
  ON public.logs (task_id, attempt_id);

CREATE INDEX receipts_task_final_attempt_fk_idx
  ON public.receipts (task_id, final_attempt_id);

CREATE INDEX tasks_parent_owner_fk_idx
  ON public.tasks (parent_task_id, user_id);
