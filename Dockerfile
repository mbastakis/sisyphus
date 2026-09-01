# Sisyphus production image: React frontend + FastAPI backend + pinned
# Taskwarrior 3.x, served as one container (plan §11).
#
# Durable paths:
#   /config  generated taskrc + boards.yaml (mount to persist/customize)
#   /data    Taskwarrior/TaskChampion replica (mount to persist)
#
# NOTE: do not scale this image horizontally against one shared /data path;
# one backend process owns one replica (plan §7).

ARG TASK_VERSION=3.4.2
ARG TASK_SHA256=d302761fcd1268e4a5a545613a2b68c61abd50c0bcaade3b3e68d728dd02e716

FROM docker.io/library/ubuntu:24.04 AS taskwarrior-build
ARG TASK_VERSION
ARG TASK_SHA256

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=/root/.cargo/bin:${PATH}

RUN apt-get -o Acquire::Retries=5 update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        curl \
        git \
        gzip \
        tar \
        uuid-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.81.0

WORKDIR /usr/src

RUN curl -fsSLO "https://github.com/GothenburgBitFactory/taskwarrior/releases/download/v${TASK_VERSION}/task-${TASK_VERSION}.tar.gz" \
    && printf '%s  task-%s.tar.gz\n' "${TASK_SHA256}" "${TASK_VERSION}" | sha256sum -c - \
    && tar xzf "task-${TASK_VERSION}.tar.gz" \
    && cmake -S "task-${TASK_VERSION}" -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
        -DENABLE_TLS_NATIVE_ROOTS=ON \
    && cmake --build build --parallel "$(nproc)" \
    && cmake --install build \
    && task --version

FROM docker.io/library/node:22-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM docker.io/library/ubuntu:24.04 AS backend-build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get -o Acquire::Retries=5 update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
COPY backend/ /src/backend/
RUN /root/.local/bin/uv venv /opt/venv --python /usr/bin/python3 \
    && /root/.local/bin/uv pip install --python /opt/venv/bin/python /src/backend

FROM docker.io/library/ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PATH=/opt/venv/bin:${PATH}
ENV SISYPHUS_HOST=0.0.0.0
ENV SISYPHUS_PORT=8080
ENV SISYPHUS_REPOSITORY=cli
ENV SISYPHUS_STATIC_DIR=/app/static
ENV SISYPHUS_LOG_FORMAT=json

RUN apt-get -o Acquire::Retries=5 update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libstdc++6 \
        libuuid1 \
        python3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app /config /data \
    && chown -R 1000:1000 /app /config /data

COPY --from=taskwarrior-build /usr/local/ /usr/local/
COPY --from=backend-build /opt/venv /opt/venv
COPY --from=frontend-build /src/frontend/dist/ /app/static/
COPY config/boards.yaml /app/boards.default.yaml
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod 0755 /app/entrypoint.sh \
    && chown -R 1000:1000 /app

USER 1000:1000
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
    CMD ["python3", "-c", "import urllib.request,os;urllib.request.urlopen(f\"http://127.0.0.1:{os.environ.get('SISYPHUS_PORT','8080')}/api/v1/health\", timeout=4)"]

ENTRYPOINT ["/app/entrypoint.sh"]
