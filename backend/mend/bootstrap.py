"""Explicit application assembly. Live safety gates cannot be replaced by an env toggle."""
from __future__ import annotations

import os
import logging
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from .artifacts import ArtifactStore, artifact_key, validate_storage_key, _check_data, _expiry
from .auth import SupabaseAuthenticator
from .config import Settings
from .domain import MendError
from .fakes import FixtureModel, FixtureRunner
from .inference import TokenFactoryClient
from .local_store import LocalTestStore
from .repository import SupabaseRepository
from .runner import NebiusRunner
from .service import TaskService
from .transport import JsonTransport


class DiskTestArtifacts:
    """Descriptor-scoped immutable fixture bytes; never live download evidence."""
    source = "local_test"

    def __init__(self, root):
        try:
            self.root = Path(os.path.abspath(os.fspath(root)))
            descriptor = self._open_root(create=True)
            os.close(descriptor)
        except (OSError, TypeError, ValueError):
            raise MendError("artifact_config", "Local artifact root is invalid or unavailable.", 503) from None

    @staticmethod
    def _directory(parent, name, create):
        if create:
            try:
                os.mkdir(name, mode=0o700, dir_fd=parent)
                os.fsync(parent)
            except FileExistsError:
                pass
        return os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)

    def _open_root(self, create=False):
        current = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            for component in self.root.parts[1:]:
                child = self._directory(current, component, create)
                os.close(current)
                current = child
            return current
        except BaseException:
            os.close(current)
            raise

    def _parent(self, key, create=False):
        parts = validate_storage_key(key).split("/")
        current = self._open_root(create)
        try:
            for component in parts[:-1]:
                child = self._directory(current, component, create)
                os.close(current)
                current = child
            return current, parts[-1]
        except BaseException:
            os.close(current)
            raise

    @staticmethod
    def _failure(error, reading=False):
        import errno
        if reading and error.errno == errno.ENOENT:
            return MendError("artifact_not_found", "Local fixture artifact was not found.", 404)
        if error.errno in (errno.ELOOP, errno.ENOTDIR, errno.EISDIR):
            return MendError("artifact_scope", "Artifact paths must use real directories and regular files.", 409)
        return MendError("artifact_unavailable", "Local fixture artifact storage is unavailable.", 503)

    def put(self, task_id, user_id, key, data):
        import secrets
        scoped = artifact_key(task_id, user_id, key)
        data = _check_data(data)
        parent = None
        temporary = None
        try:
            parent, name = self._parent(scoped, create=True)
            temporary = ".pending-" + secrets.token_hex(16)
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                                 mode=0o600, dir_fd=parent)
            with os.fdopen(descriptor, "wb") as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
            os.link(temporary, name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
            os.fsync(parent)
        except FileExistsError:
            raise MendError("artifact_write_rejected", "Immutable artifact already exists.", 409) from None
        except OSError as error:
            raise self._failure(error) from None
        finally:
            if parent is not None:
                try:
                    if temporary is not None:
                        try:
                            os.unlink(temporary, dir_fd=parent)
                        except FileNotFoundError:
                            pass
                        except OSError:
                            logging.getLogger("mend.runtime").error("Temporary fixture artifact cleanup failed.")
                finally:
                    os.close(parent)
        return scoped

    def get(self, key):
        import stat
        parent = None
        descriptor = None
        try:
            parent, name = self._parent(key)
            descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent)
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode):
                raise MendError("artifact_scope", "Artifact objects must be regular files.", 409)
            if not 1 <= metadata.st_size <= 1048576:
                raise MendError("artifact_limit", "Artifact must contain 1–1048576 bytes.")
            with os.fdopen(descriptor, "rb") as stream:
                descriptor = None
                return _check_data(stream.read(1048577))
        except OSError as error:
            raise self._failure(error, reading=True) from None
        finally:
            if descriptor is not None:
                os.close(descriptor)
            if parent is not None:
                os.close(parent)

    def signed_download(self, key, expires_seconds=60):
        seconds = _expiry(expires_seconds)
        self.get(key)
        return "local_test://artifacts/" + validate_storage_key(key) + "?expires_seconds=" + str(seconds)


@dataclass
class Runtime:
    settings: Settings
    service: TaskService
    resources: list = field(default_factory=list, repr=False)

    def close(self):
        resources, self.resources = self.resources, []
        for resource in reversed(resources):
            close = getattr(resource, "close", None)
            if close:
                try:
                    close()
                except Exception:
                    logging.getLogger("mend.runtime").error("Resource cleanup failed; subsequent resources were still closed.")


def database_repository_from_env(env=None):
    """Build the real RPC adapter without provider or browser-session dependencies."""
    e = os.environ if env is None else env
    return SupabaseRepository(e.get("SUPABASE_URL", ""), e.get("SUPABASE_SERVICE_ROLE_KEY", ""))


def build_runtime(env=None):
    e = os.environ if env is None else env
    settings = Settings.from_env(e)
    if settings.live_enabled:
        # A trusted external report controller and strict provider stop evidence are
        # unresolved integration gates; a flag alone must never manufacture them.
        raise MendError("release_blocked", "Trusted report transport and measured provider safety must be integrated before live release.", 503)
    resources = []
    try:
        if settings.mode == "local_test":
            database = e.get("MEND_LOCAL_DATABASE", "var/tasks.sqlite3")
            if database != ":memory:":
                Path(database).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            store = LocalTestStore(database)
            resources.append(store)
            artifacts = DiskTestArtifacts(e.get("MEND_LOCAL_ARTIFACT_ROOT", "var/artifacts"))
            model, runner = FixtureModel(), FixtureRunner()
            config = {"live_enabled": False, "poll_interval_seconds": 0.1}
        elif settings.mode == "database_only":
            settings.validate_auth()
            store = database_repository_from_env(e)
            artifacts = ArtifactStore(settings.supabase_url, settings.supabase_service_role_key)
            # Draft/contract operations use the real database; Start remains blocked.
            model, runner = None, None
            config = {"live_enabled": False}
        else:
            settings.validate_auth()
            store = SupabaseRepository(settings.supabase_url, settings.supabase_service_role_key)
            artifacts = ArtifactStore(settings.supabase_url, settings.supabase_service_role_key)
            endpoint = settings.token_factory_url.rstrip("/")
            if endpoint == "https://api.tokenfactory.nebius.com":
                endpoint += "/v1"
            model = TokenFactoryClient(settings.token_factory_key, settings.model_id, endpoint,
                input_price_per_million=e.get("MEND_INPUT_PRICE_PER_MILLION") or None,
                output_price_per_million=e.get("MEND_OUTPUT_PRICE_PER_MILLION") or None,
                price_provenance=e.get("MEND_PRICE_PROVENANCE") or None)
            resources.append(model)
            runner = NebiusRunner(settings.nebius_iam_token, settings.nebius_project_id,
                settings.runner_image_digest, subnet_id=e.get("NEBIUS_SUBNET_ID", ""),
                platform=e.get("NEBIUS_PLATFORM", ""), preset=e.get("NEBIUS_PRESET", ""),
                release_enabled=False, report_reader=None)
            resources.append(runner)
            config = {"live_enabled": False}
        return Runtime(settings, TaskService(store, model, runner, artifacts, config), resources)
    except BaseException:
        for resource in reversed(resources):
            close = getattr(resource, "close", None)
            if close:
                close()
        raise


def create_app_from_env():
    # No invented local identity: browser authentication always uses real Supabase.
    from .api import create_app
    runtime = build_runtime()
    try:
        runtime.settings.validate_auth()
        transport = JsonTransport({urlsplit(runtime.settings.supabase_url).hostname})
        runtime.resources.append(transport)
        authenticator = SupabaseAuthenticator(runtime.settings, transport)
        app = create_app(runtime.service, runtime.settings, authenticator)
        app.state.mend_runtime = runtime
        application_lifespan = app.router.lifespan_context

        @asynccontextmanager
        async def lifespan(application):
            try:
                async with application_lifespan(application) as state:
                    yield state
            finally:
                runtime.close()

        app.router.lifespan_context = lifespan
        return app
    except BaseException:
        runtime.close()
        raise
