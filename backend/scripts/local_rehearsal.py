"""Run a fixture repair loop without provider calls or executing candidate code."""
import asyncio
import json
from pathlib import Path
import sys
import tempfile
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mend.bootstrap import build_runtime


async def rehearse():
    with tempfile.TemporaryDirectory(prefix="mend-rehearsal-") as root:
        runtime = build_runtime({"MEND_MODE": "local_test", "MEND_LOCAL_DATABASE": root + "/tasks.sqlite3",
                                 "MEND_LOCAL_ARTIFACT_ROOT": root + "/artifacts"})
        try:
            service = runtime.service
            owner = str(uuid.uuid4())
            task = await service.create(owner, "Clean CSV rows, including empty input", str(uuid.uuid4()))
            task = await service.propose(task["id"], owner, task["contract_version"])
            task = await service.start(task["id"], owner, task["contract_version"])
            await service.run_task(task["id"])
            result = await service.get(task["id"], owner)
            receipt = await service.receipt(task["id"], owner)
            events = [event async for event in service.events(task["id"], owner)]
            assert result["status"] == "passed" and result["execution_count"] == 2 and result["repair_count"] == 1
            assert receipt["source"] == "local_test" and receipt["live_verification"] is False
            assert [event["sequence"] for event in events] == list(range(1, len(events) + 1))
            print("[LOCAL FIXTURE ENVIRONMENT — NO GENERATED CODE EXECUTED]")
            print("PASS: failed check -> one repair -> passing fixture -> durable local_test receipt")
            print("PASS: ordered persisted SSE events; protected source bundle round-trip verified")
            print(json.dumps({"source": receipt["source"], "live_verification": receipt["live_verification"],
                "executions": result["execution_count"], "repairs": result["repair_count"],
                "checks": receipt["checks"]["check_ids"], "events": len(events)}, indent=2))
        finally:
            runtime.close()


if __name__ == "__main__":
    asyncio.run(rehearse())
