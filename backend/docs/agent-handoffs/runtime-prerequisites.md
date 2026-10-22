# Runtime prerequisites inventory — 2026-10-12

## Scope and result

Read-only prerequisite inventory for the three genuine FastAPI HTTP tests and one isolated PostgreSQL migration test. No application source, PRD, TRD v1.2, or lifecycle behavior changed. No dependency installation, network fetch, database connection, framework substitute, or database substitute was attempted.

**Result:** this environment has neither the required genuine HTTP packages nor PostgreSQL tooling, and no approved dependency bundle route was discovered. These four integration gates remain unexecuted; package import checks and structural tests are not integration evidence.

## Exact commands and observed evidence

Working directory: `/workspace/scratch/ca486ef6d53d/mend-backend`.

```sh
cat pyproject.toml
```

Project dependencies are `fastapi>=0.115,<1`, `uvicorn>=0.30,<1`, `cryptography>=44,<47`; optional test dependency is `httpx>=0.27,<1`. Python requirement is `>=3.11`.

```sh
command -v python python3 pip pip3 uv postgres initdb pg_ctl psql docker podman
```

Output contained only:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python
/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3
/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/pip
/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/pip3
/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/uv
```

For each interpreter, the following read-only probe was run:

```sh
python - <<'PY'
import sys, importlib.util
print('interpreter:', sys.executable)
print('version:', sys.version)
for name in ('fastapi','starlette','httpx','pydantic','psycopg','psycopg2','asyncpg','sqlalchemy','pytest','uvicorn'):
    spec = importlib.util.find_spec(name)
    print(name, spec.origin if spec else 'NOT INSTALLED')
PY
```

The same script was also invoked with `/usr/bin/python3`.

| Interpreter | Actual version | Package findings |
| --- | --- | --- |
| Primary runtime Python | 3.12.14, Clang 22.1.3 | Only `pydantic` found among these names; all other names `NOT INSTALLED` |
| `/usr/bin/python3` | 3.12.3, GCC 13.3.0 | Every checked name `NOT INSTALLED` |

Primary `pydantic` path was `/opt/codex/runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages/pydantic/__init__.py`.

An additional `importlib.metadata.version` probe on the primary interpreter reported `cryptography 50.0.1`, outside the project's declared `>=44,<47` range. Other outputs were `pydantic 2.13.5`, `anyio NOT INSTALLED`, `h11 NOT INSTALLED`, `certifi NOT INSTALLED`, `idna 3.19`, `typing-extensions 4.16.0`, and `annotated-types 0.8.0`. A valid dependency bundle must resolve the declared project ranges and transitive dependencies; merely adding the three missing top-level HTTP packages would not establish a supported environment.

```sh
python -m pip cache dir
python -m pip cache list
uv cache dir
ls -la /root/.cache /root/.cache/codex-runtimes
ls -la /var/cache/apt/archives /usr/lib/postgresql /var/lib/postgresql
```

Observed: pip cache directory `/root/.cache/pip`, output `No locally built wheels cached.`; uv cache path `/root/.cache/uv` did not exist. `/root/.cache` contained `codex-runtimes` and `ezdxf`; `codex-runtimes` contained only a symlink to the installed primary runtime. Apt archives contained only `lock` and `partial`, no cached `.deb`. PostgreSQL directories did not exist. A local `rg --files` inventory of `/workspace`, `/opt/codex`, `/tmp`, `/usr/local/lib`, and `/usr/lib`, filtered for the missing package/tool names and `.whl`/`.deb` files, found no matching framework/database distribution. The only wheel found was ensurepip's bundled `pip-25.0.1-py3-none-any.whl`.

```sh
cat /opt/codex/runtimes/codex-primary-runtime/runtime.json
```

Actual installed bundle was `26.1004.11800`, format version 2, Python 3.12.14. Native dependencies listed were `libheif`, `jxrlib`, `libreoffice-headless`, `poppler`, and `git`. No PostgreSQL runtime was listed.

Database configuration was checked for presence only, without printing values:

```sh
python - <<'PY'
import os
for name in ('MEND_TEST_DATABASE_DSN', 'MEND_TEST_DATABASE_ISOLATED'):
    print(name, 'SET' if os.environ.get(name) else 'NOT SET')
PY
```

Actual output:

```text
MEND_TEST_DATABASE_DSN NOT SET
MEND_TEST_DATABASE_ISOLATED NOT SET
```

## Boundary and next prerequisite

Outbound network scope is limited to `chatgpt.com`, `git.chatgpt-team.site`, and the supplied OpenAI blob/S3 host patterns. PyPI, GitHub, Ubuntu apt repositories, and other package registries are outside that scope; no request was made to them and no proxy, connector, remote sandbox, or alternate hostname was used to bypass that scope.

HTTP execution needs an operator-provided genuine compatible framework/client dependency bundle on an allowed host or installed in the local environment, including transitive dependencies. PostgreSQL execution additionally needs genuine `psql` and an explicitly isolated fresh Supabase-compatible development database with the migration-owner permissions required by the existing fixtures. An approved package source or installed local dependencies plus an isolated test database are concrete external prerequisites. No endpoint or credentials were invented or probed.

## Root reconciliation after this inventory

The dependency range above records the original inventory, not the final declaration. Root corrected `pyproject.toml` from `cryptography>=44,<47` to `cryptography==50.0.1`, matching the genuinely installed and exercised distribution. Actual authentication regression execution: 19 tests, zero failures/skips, process exit 0 (see `docs/verification/runtime-auth-pin.txt`). No dependency installation occurred. Missing HTTP packages and PostgreSQL prerequisites remain blockers.
