"""Export an actual unsigned backend fixture receipt, never executing candidate code."""
import asyncio
import json
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))
from mend.artifacts import LocalArtifacts, verify_bundle
from mend.domain import curated_contract
from mend.fakes import FixtureModel, FixtureRunner
from mend.local_store import LocalTestStore
from mend.service import TaskService


async def export(destination):
    # Refuse existing destinations so a verification fixture cannot overwrite user work.
    destination.mkdir(parents=True, exist_ok=False)
    store = LocalTestStore()
    try:
        artifacts = LocalArtifacts()
        service = TaskService(store, FixtureModel(), FixtureRunner(), artifacts,
                              {"poll_interval_seconds": 0.001})
        user = str(uuid.uuid4())
        task = await service.create(user, "Offline IDE receipt fixture", str(uuid.uuid4()))
        task = await service.propose(task["id"], user, task["contract_version"], curated_contract())
        await service.start(task["id"], user, task["contract_version"])
        await service.run_task(task["id"])
        receipt = await service.receipt(task["id"], user)
        assert receipt["source"] == "local_test" and receipt["live_verification"] is False
        raw = store.call("get_task", {"task_id": task["id"], "user_id": user})
        files = verify_bundle(artifacts.get(raw["receipt"]["bundle_storage_key"]), receipt["snapshot_sha256"])
        workspace = destination / "workspace"
        workspace.mkdir()
        for name, content in files.items():
            (workspace / name).write_bytes(content.encode("utf-8"))
        (destination / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Exported actual backend local_test receipt and exact final fixture source; no candidate code executed.")
    finally:
        store.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python test/export-fixture.py NEW_OUTPUT_DIRECTORY")
    asyncio.run(export(Path(sys.argv[1]).resolve()))
