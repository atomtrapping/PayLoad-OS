# Internal deployment candidate

This packages the existing Payload OS into one candidate Linux/amd64 image. The image has not been built or run in the current Windows qualification; Docker, Linux container behavior, real PostgreSQL TLS connectivity and Exoscale custody remain separate operator qualification gates. No deployment or provider access is performed by adding these files.

The host port is bound to `127.0.0.1:3000`; remote use requires an operator-controlled SSH tunnel. The image runs as UID/GID 10001 with a read-only root, dropped capabilities, bounded resources and explicitly mounted state. Do not expose it directly to an external interface.

## One terminal authority

Basic credentials protect the operator shell, assets and legacy local operational routes. They do not create terminal principals or confer reviewer authority. The exact `/api/v1/terminal` route requires the existing Bearer registry (`PAYLOAD_TERMINAL_PRINCIPALS`), and retains the same scopes, immutable review digests, grants and durable receipts used by the browser workbench and CLI. Bearer credentials do not grant access to the Basic-protected shell. Mutating Basic requests require the configured same-origin context; Bearer CLI requests may omit Origin, but any supplied Origin and forwarding metadata must match the configured loopback endpoint.

## Packaging and configuration

The Dockerfile builds the native kernel for Linux, production worker, terminal mining worker, terminal service and offline preflight. It includes only reviewed runtime files, not operator evidence, `.env` files, local credentials, host binaries or the optional local Iceberg toolchain. Base image digests are retained from the prototype; their current availability and the resulting image are not established by the offline tests.

Use `compose.yaml` only with an already-built, qualified `PAYLOAD_IMAGE`. Supply a protected `PAYLOAD_RUNTIME_ENV_FILE`, an existing writable `PAYLOAD_STATE_ROOT` owned for UID 10001, `PAYLOAD_OPERATOR_PASSWORD_PATH` and `PAYLOAD_POSTGRES_CA_PATH`. The runtime env must supply a canonical database URL, `PAYLOAD_OPERATOR_USERNAME` and the existing terminal principal registry. No password or Bearer token belongs in the repository, image, command output or Compose file. The internal origin is fixed to `http://127.0.0.1:3000`; database TLS is certificate-verified using the mounted CA.

The base profile uses conserve limits and disables terminal object retention. `compose.normal.yaml` raises explicit resource limits. `compose.sos.yaml` selects SOS and the terminal retention prefix only when explicitly included; supply the trusted SOS endpoint/region/bucket/access-key configuration and `PAYLOAD_SOS_SECRET_PATH`. This enables configuration, not an implicit publisher. Local object retention and the local Iceberg qualification are not internal-deployment fallbacks.

## Explicit process roles

The entrypoint defaults to `web`. Passing `worker` runs the existing terminal computation loop; passing `publisher` runs the existing publication outbox and requires configured SOS retention. All roles pass the same offline configuration preflight. Publication remains bound to the exact reviewed destination and current unexpired, unrevoked authorization, and verifies retained object bytes before acknowledgement.

No role performs migrations, seeds corpora, starts collectors, runs local Iceberg, or activates principal-capital activity at boot. Schema installation and connectivity/storage qualification must be separately authorized and completed before use. The provided composition starts only the web process; starting additional roles is an explicit operator operation using the same qualified image and protected configuration, not another control plane.

## Verification commands

`npm run test:deployment` checks synthetic runtime inventories and packaging boundaries. `npm run test:build-traces` checks trace policy. After building, `npm run test:access-smoke` starts isolated production Next children with synthetic credentials, exercises both loopback and container-style URL metadata, and refuses outbound connections. These are local checks, not Docker or provider qualification. `npm run terminal:qualify` remains the separate real-process/browser terminal workflow qualification.
