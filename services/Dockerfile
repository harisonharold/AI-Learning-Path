# syntax=docker/dockerfile:1
# One image for api-py and worker-py (different commands in Compose).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv PATH=/opt/venv/bin:$PATH
ARG HTTPS_PROXY
ARG NO_PROXY
RUN --mount=type=secret,id=extra_ca sh -c \
  'if [ -s /run/secrets/extra_ca ]; then export PIP_CERT=/run/secrets/extra_ca SSL_CERT_FILE=/run/secrets/extra_ca; fi; pip install --no-cache-dir uv==0.11.32'
WORKDIR /repo
COPY pyproject.toml uv.lock ./
COPY services/common services/common
COPY services/api-py services/api-py
COPY services/worker-py services/worker-py
RUN --mount=type=secret,id=extra_ca sh -c \
  'if [ -s /run/secrets/extra_ca ]; then export PIP_CERT=/run/secrets/extra_ca SSL_CERT_FILE=/run/secrets/extra_ca; fi; uv sync --frozen --all-packages --no-dev'
RUN useradd --system --no-create-home atlas
USER atlas
