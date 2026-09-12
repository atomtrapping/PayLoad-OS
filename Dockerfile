# Linux/amd64 validation image. Pins were read from Docker Official Images'
# registry manifests on 2026-09-08; no host Rust/Node output is copied.
FROM rust:1.96.0-bookworm@sha256:c993d32d95cc146bd12c84d66f0b924a6a96f3988325f39c144f2f9893dea120 AS kernel
WORKDIR /kernel
ENV CARGO_BUILD_JOBS=2
COPY native/state-kernel/Cargo.toml native/state-kernel/Cargo.lock ./
COPY native/state-kernel/src ./src
RUN cargo build --release --locked

FROM node:24.14.0-bookworm-slim@sha256:4bd6219054c8bebcd26a66bfd8ca0bd6e1024b4b97474c59bb7ee3bbcbef4fe8 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=4096 \
    PAYLOAD_DEPLOYMENT_MODE=local \
    PAYLOAD_SOURCE_COLLECTION=0 \
    PAYLOAD_SAMSARA_COLLECTION=0 \
    PAYLOAD_PRODUCTION_LOCAL=0 \
    PAYLOAD_STATE_KERNEL_LOCAL=0 \
    PAYLOAD_COORDINATION_LOCAL=0 \
    PAYLOAD_OPERATIONS_LOCAL=0 \
    GAT_INTEGRATION=0
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json next.config.ts postcss.config.mjs ./
COPY src ./src
COPY examples ./examples
COPY scripts ./scripts
RUN npm run production:build \
    && npm run terminal:build \
    && npm run terminal:service:build \
    && npm run deployment:build-preflight \
    && npm run build

# Stage only reviewed runtime roots, not the standalone directory's incidental
# tooling/configuration copies. The Next trace guard ran in the builder.
FROM builder AS package
RUN mkdir -p /runtime/.stamp /runtime/scripts /runtime/native/state-kernel/target/debug /runtime/.payload \
    && cp .next/standalone/server.js .next/standalone/package.json /runtime/ \
    && cp -R .next/standalone/.next .next/standalone/node_modules /runtime/ \
    && cp -R .next/static /runtime/.next/static \
    && cp -R public examples /runtime/ \
    && cp scripts/gat-audit-runner.py scripts/gat-source.mjs /runtime/scripts/ \
    && cp .stamp/production-worker.mjs .stamp/terminal-mining-worker.cjs .stamp/terminal-service.mjs .stamp/deployment-preflight.cjs /runtime/.stamp/
COPY deploy/entrypoint.sh /runtime/entrypoint.sh
COPY --from=kernel /kernel/target/release/notations-state-kernel /runtime/native/state-kernel/target/debug/notations-state-kernel
RUN node scripts/deployment-audit.mjs /runtime

FROM node:24.14.0-bookworm-slim@sha256:4bd6219054c8bebcd26a66bfd8ca0bd6e1024b4b97474c59bb7ee3bbcbef4fe8 AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PAYLOAD_DEPLOYMENT_MODE=internal \
    PAYLOAD_EXECUTION_PROFILE=conserve \
    GAT_INTEGRATION=0
COPY --from=package --chown=10001:10001 /runtime/ ./
USER 10001:10001
EXPOSE 3000
# Compose publishes this port on the HOST LOOPBACK ONLY. HOSTNAME inside the
# isolated container is not an authorization boundary.
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
