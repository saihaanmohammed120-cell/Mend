"""Dedicated scheduler and deadline processes; durable records survive process exits."""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal

from .bootstrap import build_runtime
from .domain import MendError

LOG = logging.getLogger("mend.worker")


async def serve(runtime, role, stopped=None):
    if runtime.settings.mode == "database_only":
        runtime.close()
        raise MendError("release_blocked", "Provider workers are unavailable in database-only mode.", 503)
    stopped = stopped or asyncio.Event()
    active = {}
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stopped.set)
        except (NotImplementedError, RuntimeError):
            pass
    try:
        while not stopped.is_set():
            for task_id, job in list(active.items()):
                if job.done():
                    try:
                        job.result()
                    except asyncio.CancelledError:
                        pass
                    except Exception:
                        LOG.error("Task worker failed; persisted execution requires reconciliation.")
                    del active[task_id]
            try:
                if role == "deadline":
                    await runtime.service.deadline_tick()
                else:
                    tasks = await asyncio.to_thread(runtime.service.store.call, "pending", {"limit": 20})
                    for task in tasks:
                        if len(active) >= 4:
                            break
                        if task["id"] not in active:
                            active[task["id"]] = asyncio.create_task(runtime.service.run_task(task["id"]))
            except MendError as error:
                LOG.warning("Worker operation blocked: %s", error.code)
            except Exception:
                LOG.error("Worker operation failed; durable records were retained.")
            try:
                await asyncio.wait_for(stopped.wait(), timeout=0.1 if role == "deadline" else 0.5)
            except TimeoutError:
                pass
    finally:
        for job in active.values():
            job.cancel()
        await asyncio.gather(*active.values(), return_exceptions=True)
        runtime.close()


def main():
    parser = argparse.ArgumentParser(description="Mend durable backend worker")
    parser.add_argument("--role", required=True, choices=("orchestrator", "deadline"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        runtime = build_runtime()
        asyncio.run(serve(runtime, args.role))
    except MendError as error:
        parser.exit(2, "Mend configuration blocked: " + error.code + "\n")


if __name__ == "__main__":
    main()
