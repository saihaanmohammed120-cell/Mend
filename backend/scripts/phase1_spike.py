"""Explicit paid Phase 1 probe; default dry-run never contacts providers."""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass, field
import datetime as dt
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mend.domain import MendError, curated_contract, initial_files, source_sha256
from mend.inference import DEFAULT_MODEL, TokenFactoryClient
from mend.runner import NebiusRunner, timestamp
from mend.termination import confirmed_stop

REQUIRED_ENV = (
    "NEBIUS_TOKEN_FACTORY_API_KEY", "NEBIUS_IAM_TOKEN", "NEBIUS_PROJECT_ID",
    "NEBIUS_SUBNET_ID", "NEBIUS_PLATFORM", "NEBIUS_PRESET", "MEND_SPIKE_IMAGE",
    "MEND_INPUT_PRICE_PER_MILLION", "MEND_OUTPUT_PRICE_PER_MILLION",
    "MEND_PRICE_PROVENANCE", "MEND_TASK_COST_CAP", "MEND_SPIKE_PROBE_APPROVED",
)


@dataclass(frozen=True)
class ProbeConfig:
    factory_key: str = field(repr=False)
    iam_token: str = field(repr=False)
    project_id: str
    subnet_id: str
    platform: str
    preset: str
    image: str
    input_price: str
    output_price: str
    price_provenance: str
    cost_cap: float
    model_id: str = DEFAULT_MODEL

    @classmethod
    def from_env(cls, env):
        missing = [name for name in REQUIRED_ENV if not env.get(name)]
        if missing:
            raise MendError("missing_probe_configuration", "Missing configuration names: " + ", ".join(missing), 503)
        if env["MEND_SPIKE_PROBE_APPROVED"] != "true":
            raise MendError("unapproved_probe_image", "The fixed trusted timing image must be explicitly approved.", 503)
        try:
            cap = Decimal(env["MEND_TASK_COST_CAP"])
            finite = cap.is_finite() and cap > 0 and math.isfinite(float(cap))
        except (InvalidOperation, ValueError, OverflowError):
            finite = False
        if not finite:
            raise MendError("invalid_probe_cost_cap", "A finite positive inference cost cap is required.", 503)
        return cls(env["NEBIUS_TOKEN_FACTORY_API_KEY"], env["NEBIUS_IAM_TOKEN"],
                   env["NEBIUS_PROJECT_ID"], env["NEBIUS_SUBNET_ID"],
                   env["NEBIUS_PLATFORM"], env["NEBIUS_PRESET"], env["MEND_SPIKE_IMAGE"],
                   env["MEND_INPUT_PRICE_PER_MILLION"], env["MEND_OUTPUT_PRICE_PER_MILLION"],
                   env["MEND_PRICE_PROVENANCE"], float(cap), env.get("NEBIUS_MODEL_ID", DEFAULT_MODEL))


class Clock:
    def monotonic(self):
        return time.monotonic()

    def now(self):
        return dt.datetime.now(dt.timezone.utc)

    async def sleep(self, seconds):
        await asyncio.sleep(seconds)


def iso(value):
    return value.isoformat().replace("+00:00", "Z")


class Journal:
    """Private atomic local journal is persisted before any provider dispatch."""
    def __init__(self, path, report):
        self.path, self.report = Path(path), report
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
        self.save()

    def save(self):
        fd, temporary = tempfile.mkstemp(prefix=".mend-spike-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(self.report, handle, sort_keys=True, indent=2, allow_nan=False)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def base_report(source="dry_run"):
    return {"schema_version": 1, "source": source, "live_release_ready": False,
            "sampling_is_not_a_guarantee": True, "inference": [], "job": {},
            "unmeasured": ["trusted_report_transfer", "receipt_finalization", "isolation", "log_delivery",
                           "cloud_job_cost", "actual_infrastructure_termination"],
            "production_bootstrap_unchanged": True}


async def measure_inference(model, journal, *, calls=1, max_output_tokens=2048, cost_cap, clock):
    contract, files = curated_contract(), initial_files()
    tokens_reserved, cost_reserved = 0, 0.0
    for ordinal in range(1, calls + 1):
        diagnostics = None if ordinal == 1 else {
            "source": "curated_repair_context_fixture", "check_id": "empty-input",
            "message": "Reviewed starter is missing its empty-input guard; this fixture is not live stderr.",
        }
        reservation = model.reservation(contract, "Implement the frozen CSV cleaning contract.", files,
                                        diagnostics, max_output_tokens)
        charge = reservation.get("cost")
        if charge is None or not math.isfinite(charge) or charge < 0:
            raise MendError("missing_probe_pricing", "Configured pricing is required before inference.", 503)
        if tokens_reserved + reservation["token_count"] > 30000 or cost_reserved + charge > cost_cap:
            journal.report["inference_stop_reason"] = "reserved_token_or_cost_budget_exhausted"
            journal.save()
            break
        tokens_reserved += reservation["token_count"]
        cost_reserved += charge
        record = {"ordinal": ordinal, "context": "initial" if ordinal == 1 else "curated_repair_fixture",
                  "reservation": reservation, "status": "dispatching", "dispatched_at": iso(clock.now()),
                  "latency_scope": "account_model_discovery_when_uncached_plus_completion"}
        journal.report["inference"].append(record)
        journal.save()
        began = clock.monotonic()
        try:
            result = await model.generate(contract, "Implement the frozen CSV cleaning contract.", files,
                                          diagnostics, max_output_tokens=max_output_tokens, timeout=30.0)
            record.update(status="completed", **{key: result[key] for key in (
                "model_id", "model_request_id", "input_tokens", "output_tokens", "cost")})
            actual_tokens = result["input_tokens"] + result["output_tokens"]
            if actual_tokens > reservation["token_count"] or result["cost"] is None or result["cost"] > charge:
                record["status"] = "reservation_overage_reconciliation_required"
            # Returned files remain untrusted data and never enter the timing job.
            record["returned_source_executed"] = False
        except MendError as error:
            record.update(status="not_accepted", error_code=error.code)
            usage = getattr(error, "usage", None)
            if usage:
                record.update(**{key: usage[key] for key in (
                    "model_id", "model_request_id", "input_tokens", "output_tokens", "cost")})
            else:
                record["usage_reconciliation_required"] = True
        except Exception:
            record.update(status="unknown", error_code="probe_inference_failed_safely", usage_reconciliation_required=True)
        finally:
            record["latency_seconds"] = round(clock.monotonic() - began, 6)
            journal.report["reserved_tokens"] = tokens_reserved
            journal.report["reserved_inference_cost"] = cost_reserved
            journal.save()
        if record["status"] != "completed":
            break


async def measure_job(runner, journal, *, clock):
    contract, files = curated_contract(), initial_files()
    dispatch_wall, dispatch_mono = clock.now(), clock.monotonic()
    attempt = {"id": str(uuid.uuid4()), "submission_key": str(uuid.uuid4()),
               "snapshot_sha256": source_sha256(files), "dispatch_requested_at": iso(dispatch_wall),
               "deadline_at": iso(dispatch_wall + dt.timedelta(seconds=60))}
    task = {"id": str(uuid.uuid4()), "cancel_requested_at": None}
    job = journal.report["job"]
    job.update(task_id=task["id"], attempt_id=attempt["id"], submission_key=attempt["submission_key"],
               dispatch_requested_at=attempt["dispatch_requested_at"], deadline_at=attempt["deadline_at"],
               job_id=None, cancel_attempted=False, terminal_confirmed=False,
               workload="fixed_trusted_sleep_120_seconds", generated_source_executed=False,
               resource_termination_verified=False)
    journal.save()

    def save_after_dispatch():
        try:
            journal.save()
        except OSError:
            # Storage failure must not prevent already-created resource cleanup.
            job["journal_write_failed"] = True

    async def reconcile():
        try:
            result = await asyncio.wait_for(runner.reconcile(attempt["submission_key"]), 12.0)
            if result.get("status") == "found" and isinstance(result.get("job_id"), str):
                job["job_id"] = result["job_id"]
                job["reconciliation"] = "found"
            else:
                job["reconciliation"] = "unknown_submission_requires_manual_cleanup"
        except Exception:
            job["reconciliation"] = "provider_reconciliation_unavailable"
        save_after_dispatch()

    async def cancel_once():
        if job["terminal_confirmed"] or job["cancel_attempted"]:
            return
        if not job["job_id"]:
            await reconcile()
        if not job["job_id"]:
            job["manual_cleanup_required"] = True
            save_after_dispatch()
            return
        job.update(cancel_attempted=True, cancel_requested_at=iso(clock.now()),
                   cancel_request_elapsed_seconds=round(clock.monotonic() - dispatch_mono, 6))
        save_after_dispatch()
        began = clock.monotonic()
        try:
            ack = await asyncio.wait_for(runner.cancel(job["job_id"]), 12.0)
            job["cancel_acknowledged"] = ack.get("acknowledged") is True
            job["cancel_ack_latency_seconds"] = round(clock.monotonic() - began, 6)
        except Exception:
            job["cancel_acknowledged"] = False
            job["cancel_error_code"] = "cancel_outcome_unknown"
        save_after_dispatch()

    async def deadline_worker():
        # Event-loop timers may wake early within their clock resolution.
        # The monotonic deadline, rather than a sleep return, authorizes expiry.
        while (remaining := dispatch_mono + 60 - clock.monotonic()) > 0:
            await clock.sleep(remaining)
        await cancel_once()

    deadline_task = asyncio.create_task(deadline_worker())
    try:
        began = clock.monotonic()
        try:
            job_id = await asyncio.wait_for(runner.submit(task, attempt, files, contract), 15.0)
            job["job_id"] = job_id
            job["submission_ack_latency_seconds"] = round(clock.monotonic() - began, 6)
        except Exception:
            job["submission_error_code"] = "submission_outcome_unknown"
            await reconcile()
        save_after_dispatch()
        while clock.monotonic() < dispatch_mono + 95:
            if job["job_id"]:
                try:
                    observation = await asyncio.wait_for(runner.observe(job["job_id"]), 12.0)
                    state = observation.get("status")
                    job["last_observed_status"] = state if state in {
                        "unknown", "submitted", "running", "passed", "failed", "cancelled", "infrastructure_failed"
                    } else "unknown"
                    if state == "running" and "first_observed_running_seconds" not in job:
                        job["first_observed_running_seconds"] = round(clock.monotonic() - dispatch_mono, 6)
                        ack = job.get("submission_ack_latency_seconds")
                        if ack is not None:
                            job["observed_provisioning_queue_upper_bound_seconds"] = max(
                                0, round(job["first_observed_running_seconds"] - ack, 6))
                    if observation.get("job_terminal") is True:
                        job["job_terminal_observed"] = True
                        job["backend_terminal_observed_at"] = iso(clock.now())
                    workload_finish = observation.get("workload_finished_at")
                    if workload_finish:
                        finished = timestamp(workload_finish).astimezone(dt.timezone.utc)
                        job["workload_finished_at"] = iso(finished)
                        job["dispatch_to_workload_finish_seconds"] = round((finished - dispatch_wall).total_seconds(), 6)
                    evidence = observation.get("termination_evidence")
                    reference = evidence.get("reference") if isinstance(evidence, dict) else None
                    stopped = confirmed_stop(observation, job["job_id"], clock.now(), not_before=dispatch_wall)
                    verified = stopped is not None
                    if verified:
                        elapsed = (stopped - dispatch_wall).total_seconds()
                        if elapsed < 0 or stopped > clock.now():
                            job["provider_time_invalid"] = True
                        else:
                            job.update(terminal_confirmed=True, resource_termination_verified=True,
                                       provider_stopped_at=iso(stopped), termination_evidence_kind=evidence["kind"],
                                       termination_reference_sha256=hashlib.sha256(reference.encode("utf-8")).hexdigest(),
                                       dispatch_to_provider_stop_seconds=round(elapsed, 6))
                            if job.get("cancel_requested_at"):
                                job["cancel_to_provider_stop_seconds"] = round(
                                    (stopped - timestamp(job["cancel_requested_at"])).total_seconds(), 6)
                    save_after_dispatch()
                except Exception:
                    job["observation_error_code"] = "provider_state_unmeasured"
                    save_after_dispatch()
            if job["terminal_confirmed"]:
                break
            if deadline_task.done() and not job["job_id"]:
                break
            await clock.sleep(1.0)
    finally:
        if not deadline_task.done():
            deadline_task.cancel()
        try:
            await deadline_task
        except asyncio.CancelledError:
            pass
        # On an interrupted probe, issue one cleanup request if none was attempted.
        # An acknowledgment is never substituted for confirmed provider termination.
        if not job["terminal_confirmed"] and not job["cancel_attempted"]:
            await cancel_once()
        job["manual_cleanup_required"] = not job["terminal_confirmed"]
        job["cancel_running_job_measured"] = bool(
            job["cancel_attempted"] and job.get("first_observed_running_seconds") is not None
            and job["terminal_confirmed"] and job.get("cancel_to_provider_stop_seconds", -1) >= 0)
        elapsed = job.get("dispatch_to_provider_stop_seconds")
        job["strict_60_second_sample_fit"] = bool(
            job["cancel_running_job_measured"] and elapsed is not None and elapsed <= 60)
        job["strict_60_bound_status"] = (
            "sample_fit" if job["strict_60_second_sample_fit"] else
            "sample_exceeded" if elapsed is not None and elapsed > 60 else "unmeasured")
        if job["resource_termination_verified"]:
            journal.report["unmeasured"] = [item for item in journal.report["unmeasured"]
                                              if item != "actual_infrastructure_termination"]
        if not job["terminal_confirmed"]:
            job["cleanup_instruction"] = (
                "Use the persisted job_id or exact mend-<submission_key> name to find and cancel the job in "
                "Nebius Jobs; obtain independent infrastructure termination evidence. Workload finishedAt or a terminal "
                "job status does not prove infrastructure termination. Do not submit another probe until reconciled.")
        save_after_dispatch()


def summarize(report, requested_calls):
    measurements = report["inference"]
    completed = [item for item in measurements if item.get("status") == "completed"]
    actual_tokens = sum(item.get("input_tokens", 0) + item.get("output_tokens", 0) for item in measurements)
    report["actual_reported_inference_tokens"] = actual_tokens
    report["measured_generation_calls"] = len(completed)
    report["requested_generation_calls"] = requested_calls
    if not completed:
        report["ten_minute_projection"] = {"status": "unmeasured", "fits": None}
    else:
        durations = [item["latency_seconds"] for item in completed]
        inference = sum(durations) if len(completed) == 4 else 4 * max(durations)
        stop_elapsed = report["job"].get("dispatch_to_provider_stop_seconds")
        overrun = max(0, stop_elapsed - 60) if stop_elapsed is not None else None
        subtotal = 240 + inference + 4 * (overrun or 0)
        report["ten_minute_projection"] = {
            "status": "partial_measured_lower_bound" if len(completed) == 4 else "partial_extrapolation_not_verified",
            "job_budgets_seconds": 240, "queue_is_inside_job_budget": True,
            "inference_seconds": round(inference, 6), "observed_stop_overrun_per_job_seconds": overrun,
            "subtotal_seconds": round(subtotal, 6),
            "remaining_outside_job_budget_seconds": round(600 - subtotal, 6),
            "fits": False if subtotal > 600 else None,
            "unmeasured_outside_job_phases": ["source_artifact_transfer", "receipt_finalization", "orchestration_overhead"],
        }
    running = report["job"].get("first_observed_running_seconds")
    report["provisioning_consumed_job_budget"] = running is not None and running >= 60
    report["live_release_ready"] = False


async def run_live(config, args, journal):
    # The CLI assembly below supplies no independent termination reader. A paid
    # run cannot establish its advertised stop measurement, regardless of keys
    # or the probe-image approval flag. Keep the injected measurement functions
    # usable, but fail this unintegrated entry point before allocating clients.
    blockers = ["independent_stop_evidence_unconfigured"]
    if blockers:
        journal.report.update(
            source="blocked_preflight", provider_requests=0, blockers=blockers,
            required_action=(
                "Integrate and review an independent infrastructure-termination "
                "evidence reader in the live spike assembly before paid probing. "
                "A cancel acknowledgement or terminal job status is not stop proof."
            ),
        )
        journal.save()
        raise MendError(blockers[0], journal.report["required_action"], 503)
    model = runner = None
    try:
        model = TokenFactoryClient(config.factory_key, config.model_id,
            input_price_per_million=config.input_price, output_price_per_million=config.output_price,
            price_provenance=config.price_provenance)
        runner = NebiusRunner(config.iam_token, config.project_id, config.image,
            subnet_id=config.subnet_id, platform=config.platform, preset=config.preset,
            release_enabled=True, report_reader=None)
        clock = Clock()
        await measure_inference(model, journal, calls=args.generation_calls,
            max_output_tokens=args.max_output_tokens, cost_cap=config.cost_cap, clock=clock)
        await measure_job(runner, journal, clock=clock)
        summarize(journal.report, args.generation_calls)
        journal.save()
    finally:
        if runner:
            runner.close()
        if model:
            model.close()


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="No provider requests; default behavior")
    mode.add_argument("--run-live", action="store_true", help="Explicitly authorize paid provider probe requests")
    result.add_argument("--generation-calls", type=int, choices=range(1, 5), default=1)
    result.add_argument("--max-output-tokens", type=int, choices=range(1, 8193), default=2048)
    result.add_argument("--output", type=Path)
    return result


def main(argv=None, env=None):
    args = parser().parse_args(argv)
    environment = os.environ if env is None else env
    if not args.run_live:
        report = base_report()
        report.update(required_environment_names=list(REQUIRED_ENV), generation_calls=args.generation_calls,
                      provider_requests=0, operator_flag_required="--run-live",
                      warning="Live mode makes paid requests. Separate timing image required; production stays blocked.")
        if args.output:
            Journal(args.output, report)
        print(json.dumps(report, sort_keys=True, indent=2))
        return 0
    journal = None
    try:
        config = ProbeConfig.from_env(environment)
        path = args.output or Path("var") / ("phase1-spike-" + str(uuid.uuid4()) + ".json")
        report = base_report("live_measurement")
        journal = Journal(path, report)
        asyncio.run(run_live(config, args, journal))
        print(json.dumps(journal.report, sort_keys=True, indent=2))
        return 0 if journal.report["job"].get("terminal_confirmed") else 2
    except KeyboardInterrupt:
        if journal:
            journal.report["probe_interrupted"] = True
            try:
                journal.save()
            except OSError:
                journal.report["journal_write_failed"] = True
            print(json.dumps(journal.report, sort_keys=True, indent=2))
        else:
            print('{"error_code":"probe_interrupted_before_dispatch"}')
        return 130
    except (MendError, OSError) as error:
        code = error.code if isinstance(error, MendError) else "probe_journal_unavailable"
        if journal:
            journal.report["error_code"] = code
            try:
                journal.save()
            except OSError:
                journal.report["journal_write_failed"] = True
            print(json.dumps(journal.report, sort_keys=True, indent=2))
        else:
            print(json.dumps({"error_code": code, "live_release_ready": False}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
