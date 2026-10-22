ARG PYTHON_BASE_IMAGE
FROM ${PYTHON_BASE_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/mend
COPY deploy/timing_probe.py /opt/mend/timing_probe.py
USER 10001:10001
ENTRYPOINT ["python", "-I", "/opt/mend/timing_probe.py"]
