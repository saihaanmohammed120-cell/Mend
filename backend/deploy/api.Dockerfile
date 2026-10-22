ARG PYTHON_BASE_IMAGE
FROM ${PYTHON_BASE_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MEND_MODE=database_only MEND_LIVE_ENABLED=false
WORKDIR /app
COPY requirements.runtime.lock ./
RUN python -m pip install --no-cache-dir --require-hashes -r requirements.runtime.lock
COPY pyproject.toml ./
COPY mend ./mend
RUN python -m pip install --no-cache-dir --no-deps --no-build-isolation . \
    && mkdir -p /var/lib/mend/artifacts \
    && chown -R 10001:10001 /var/lib/mend
USER 10001:10001
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "mend.bootstrap:create_app_from_env", "--factory", "--host", "0.0.0.0", "--port", "8000"]
