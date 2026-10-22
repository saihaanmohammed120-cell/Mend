#!/usr/bin/env bash
# Build local images only; credentials, pushing and provider deployment are separate.
set -euo pipefail

task_backend_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
task_python_base="${PYTHON_BASE_IMAGE:-}"
if [[ ! "$task_python_base" =~ ^[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[a-f0-9]{64}$ ]]; then
  printf '%s\n' 'Blocked: PYTHON_BASE_IMAGE must be an operator-supplied image reference pinned with @sha256 and a 64-character digest.' >&2
  exit 2
fi

task_api_tag="${MEND_API_BUILD_TAG:-mend-api:local}"
task_runner_tag="${MEND_RUNNER_BUILD_TAG:-mend-runner:local}"
task_spike_tag="${MEND_SPIKE_BUILD_TAG:-mend-spike:local}"
for task_image_tag in "$task_api_tag" "$task_runner_tag" "$task_spike_tag"; do
  if [[ ! "$task_image_tag" =~ ^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$ ]]; then
    printf '%s\n' 'Blocked: build tags must be plain image tags without whitespace, shell syntax or digest references.' >&2
    exit 2
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Blocked: Docker is not available; no images were built.' >&2
  exit 3
fi
if [[ ! -s "$task_backend_root/requirements.runtime.lock" ]]; then
  printf '%s\n' 'Blocked: the hashed API runtime dependency lock is missing or empty.' >&2
  exit 2
fi

docker build --build-arg "PYTHON_BASE_IMAGE=$task_python_base" --tag "$task_api_tag" --file "$task_backend_root/deploy/api.Dockerfile" "$task_backend_root"
docker build --build-arg "PYTHON_BASE_IMAGE=$task_python_base" --tag "$task_runner_tag" --file "$task_backend_root/deploy/runner.Dockerfile" "$task_backend_root"
docker build --build-arg "PYTHON_BASE_IMAGE=$task_python_base" --tag "$task_spike_tag" --file "$task_backend_root/deploy/spike.Dockerfile" "$task_backend_root"
