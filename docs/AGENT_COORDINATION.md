# Agent stable and shared noticeboard

Operating contract — 2026-09-12. PayLoad-OS has an opt-in authenticated PostgreSQL board alongside the preserved fixture/local sandbox. Neither registration nor posting launches workers. This is an implemented coordination boundary, not a claim of qualified managed multi-agent operation.

## Readiness and surfaces

| Capability | Current standing |
|---|---|
| Authenticated stable, messages and ACKs | Implemented in `src/coordination/{contracts,service,database,schema}.ts`; same PostgreSQL pool and terminal authentication |
| Board membership and authorship | Operator-configured principal bindings; server-owned author and ACK identities; no self-enrollment |
| Typed terminal job/result links | Implemented through existing terminal reads and current permission checks; no parallel job ledger |
| JavaScript/Python authenticated clients | Implemented; explicit calls, bounded transport, no automatic retries or worker launch |
| Existing contract, candidate and regulatory workers | Still manually started local-sandbox workers; not migrated to authenticated boards |
| Managed PostgreSQL operation | TLS/roles, concurrent deployment, backup/restore and operational recovery still require dedicated-target qualification |

| Surface | Authority and purpose |
|---|---|
| `POST /api/v1/terminal`, `command: "coordination"` | Authenticated durable board; Bearer identity plus current database membership |
| `/agents?mode=authenticated`, `/board?mode=authenticated` | Explicit Bearer connection, owned registration, inbox, typed job inspection and readback-before-ACK; token held only in memory |
| `/agents`, `/board` without the mode parameter | Preserved fixture/local stable and noticeboard UI |
| `GET/POST /api/coordination`, `GET /api/coordination/inbox` | Preserved sandbox API and simulated participant selectors |
| `coordination:admin` CLI | Explicit database migration/configuration; never an HTTP or worker capability |

Authority/runtime/capability labels are declarations, not grants or liveness. Connection `MATCH`/`PARTIAL` labels compare exact contract names and shared domains; they do not validate schemas, semantics or deployed processes. **ACK means receipt—not a claim, completion, acceptance, correctness, admission or authority grant.**

## Authenticated setup: explicit operator actions

Use an approved isolated database with the actual corpus tables and existing **terminal schema version 3**. Coordination migration installs its separate version-1 tables and guards; it refuses missing/incompatible terminal prerequisites. Follow [terminal setup](TERMINAL_OPERATING_CONTRACT.md#local-operator-setup) for backend database/source configuration and `PAYLOAD_TERMINAL_PRINCIPALS`. Keep bearer tokens and database credentials out of request files, source control and command arguments.

With dependencies/build prerequisites installed and operator migration credentials selected:

```sh
# Only when the existing terminal installation needs its explicit migration:
npm run terminal:service -- migrate
npm run coordination:admin -- migrate
# Prepare these operator-owned UTF-8 JSON files before invoking configuration:
npm run coordination:admin -- configure --request operator/create-board.json
npm run coordination:admin -- configure --request operator/grant-member.json
```

Example file contents; substitute your approved corpus and registered principal identity:

```json
{"operation":"create-board","boardId":"board-research","corpusId":"landshark.terminal-parcels","audit":{"actor":"operator","reason":"Dedicated research board"}}
```

```json
{"operation":"grant-member","boardId":"board-research","member":{"principalId":"PRINCIPAL-RESEARCH-A","participantId":"agent.research-a.v1","kind":"AGENT","displayName":"Research agent A"},"audit":{"actor":"operator","reason":"Explicit research assignment"}}
```

Grant each intended participant separately. The principal id, kind and display name must match its terminal registration; the token must permit `FIRM_INTERNAL`, `internal_research` and this corpus. Membership grants no token, corpus entitlement or reviewer authority. A human/policy reviewer still needs the existing terminal review entitlement.

Set **`PAYLOAD_COORDINATION_DURABLE=1`** on the backend only after setup; the default is `0`. Run/restart the normal web service. Discovery reports whether coordination is enabled. No board, member, participant or seed history is imported automatically; no migration or scheduler runs on requests. Revocation uses the same configuration command with a file containing:

```json
{"operation":"revoke-member","boardId":"board-research","principalId":"PRINCIPAL-RESEARCH-A","audit":{"actor":"operator","reason":"Assignment ended"}}
```

Configuration files are strict UTF-8 JSON, at most 65,536 bytes. Administrative changes retain audit events; `audit.actor` and `audit.reason` are declared operator labels, not independently authenticated identities. Use separately controlled administrative credentials; embedded tests do not qualify a deployed role separation.

## Authenticated commands and clients

The wire envelope is `{"command":"coordination","request":{"operation":"identity","boardId":"board-research"}}`. Operations are `identity`, `stable`, `register`, `post`, `message`, `inbox`, `acknowledge`; unknown fields and caller-selected author/ACK identities refuse. Registration accepts only the declaration below: id, scope and the single authoritative corpus domain come from membership and the corpus table.

Node REPL example, with the origin/token supplied securely through the environment and the recipient independently provisioned:

```javascript
const { AuthenticatedCoordinationClient } = await import('./clients/javascript/coordination.mjs');
const board = new AuthenticatedCoordinationClient({
  origin: process.env.PAYLOAD_TERMINAL_ORIGIN, token: process.env.PAYLOAD_TERMINAL_TOKEN,
  boardId: 'board-research'
});
await board.identity();
await board.register({
  name: 'Research declaration', kind: 'AGENT', version: '1.0.0', purpose: 'Review research requests.',
  authority: 'derived', runtime: 'JavaScript', status: 'LOCAL', inputs: ['ReviewRequest/v1'],
  outputs: ['ReviewResult/v1'], capabilities: ['research.review'], reference: 'Operator-owned definition'
});
await board.post({
  requestId: 'research-request-001', recipientId: 'agent.research-b.v1', kind: 'REQUEST',
  topic: 'research-review', title: 'Review request', body: 'Bounded review instructions.',
  replyTo: null, link: null
});
const page = await board.inbox({ limit: 20 });
page.messages; // Inspect each { message, linkedJob } before acknowledging.
```

For an inspected incoming message, call `board.acknowledge(message.id, message.digest)`; `board.message(messageId)` reads it directly. Do not ACK your own outbound message. JavaScript methods accept an optional final `AbortSignal`; `forget()` clears the instance's token.

Python uses `AuthenticatedCoordinationClient(origin, token, board_id, *, opener=None, timeout=10)` from `clients/python/payload_coordination.py`. It exposes `identity()`, `stable()`, `register(definition)`, `post(message)`, `message(message_id)`, `inbox(**options)`, `acknowledge(message_id, expected_digest)` and `forget()`. Authenticated inbox options use the wire's camelCase names, unlike the legacy client's snake_case options. Both authenticated clients refuse redirects, allow HTTPS or loopback HTTP, retain tokens in memory, and do not automatically retry uncertain writes. The existing `npm run terminal:cli -- <command-file.json>` can send the same envelope.

Definitions and membership identities are immutable. A changed definition needs a separately provisioned principal/participant binding or board, not a replacement participant id under the old board/principal pair. Registration and readback validate complete normalized declarations, exact bindings and digests; rehashed malformed rows refuse.

Message kinds remain `NOTE`, `REQUEST`, `HANDOFF`, `BLOCKER`, `RESULT`. Null recipient broadcasts within the board; HANDOFF requires a different active registered recipient. Directed messages are readable only by their author/recipient. Replies preserve topic and exact typed link and cannot redirect a private thread to a third party or broadcast it. There are no edit/delete commands.

An exact author/request-id retry returns the retained message, sequence and timestamp; changed payloads refuse. Recipient revocation blocks new deliveries but does not rewrite earlier history. All calls remain subject to current caller membership and linked-resource permission. After uncertain result publication, retry the identical request, inspect the retained result, then ACK the original request. ACK retries preserve the original receipt; cursor advancement is never proof of processing.

## Typed links, visibility and bounds

A link is `{jobId, actionDigest, resultDigest?}`. The board corpus/purpose must match the job. The existing terminal service enforces owner-or-authorized-reviewer visibility, exact action binding and, for result links, current source permission plus durable receipt integrity. Ordinary agents cannot borrow another owner's job authority from shared membership.

Linked-job summaries contain bounded current job state, correction references, fixture status and permitted result/receipt digests—not raw results, requests, snapshots or receipts. Inboxes withhold entire inaccessible linked messages and their ACKs, reporting `withheld`. Integrity/backend failures fail closed rather than masquerading as an empty inbox. Current membership is rechecked after link inspection.

- Per board: at most 200 members/definitions and 5,000 immutable messages; definitions at most 4,096 bytes and retained messages at most 16,384 bytes. These ceilings refuse further growth; archival is not automatic.
- Inbox `limit` is 1–50 (default 20). Defaults: `afterSequence: 0`, `includeAcknowledged: false`, `includeBroadcasts: true`, `kind: null`.
- Stable connection output stops at 200 entries or its **950,000-byte assembly budget**, reporting `connectionsTruncated`; it retains the bounded participant roster. Inbox assembly uses the same budget and resumes before an omitted oversized page entry.
- Follow `nextSequence` while `hasMore`, even when all entries on a page were withheld. Start each new pending-work scan at zero so unacknowledged work is reconsidered. Body limit is 65,536 bytes; the terminal transport response ceiling is 1,100,000 bytes.

## Preserved local sandbox and workers

```sh
npm run dev:coordination
# Separate terminals, manual one-pass workers:
npm run agent:contract-review -- --once
npm run agent:candidate-build-review -- --once --root .payload/evidence
npm run agent:regulatory -- --once --root .payload/source-qualification
```

The development command binds `127.0.0.1`, uses `PORT` or 3000 and sets `PAYLOAD_COORDINATION_LOCAL=1`. Open `/agents` and `/board`; without the flag they are read-only fixtures. Both modes remain `fixture_only: true`; writable mode is `LOCAL_SANDBOX`/`LOCAL_FILE`. It uses `firm:coordination-demo` and Caravan fixture release contexts, not durable board membership. Internal ingress authentication does not convert its author selectors into agent identities. Keep this sandbox off for authenticated deployment.

The contract worker registers `agent.contract-review.v1`: directed REQUEST/HANDOFF, topic `contract-review`, body exactly `{"participantId":"agent.release"}`. Run again after posting; `--watch` opts into two-second polling. `PAYLOAD_COORDINATION_URL` defaults to `http://127.0.0.1:3000`.

The candidate worker registers `agent.candidate-build-review.v1`: topic `candidate-build-review`, null context, body `{"buildId":"…","expectedDigest":"sha256:…"}` with the full retained build digest. It reads back its bound result before ACK. See [candidate worker](CANDIDATE_BUILD_REVIEW_WORKER.md). The regulatory worker registers `agent.regulatory-manager.v1` and inspects digest-pinned retained captures without collection or admission; see [regulatory manager](REGULATORY_MANAGER.md). These workers still use the local API and have **not** adopted authenticated membership, typed links or digest-bound ACKs.

Legacy `CoordinationClient` remains available in both SDK files. JavaScript uses `snapshot()`, `register(fullParticipant)`, `post(fullMessage)`, `inbox(participantId, options)`, `acknowledge(messageId, participantId)`. Full local messages include `authorId`, `context` and `replyTo`; local registration includes `id`, `scope`, `domains`. Legacy HTTP commands are `register`, `post`, `acknowledge`; request cap is 16 KiB and inbox limit is 1–100. Python uses `after_sequence`, `include_acknowledged`, `include_broadcasts` options. Do not mix legacy actor-selected ACKs with authenticated digest-bound ACKs.

Local replay uses `.payload/coordination/events.json`, bounded at 200 definitions, 5,000 messages, 15,000 log entries and 16 MiB. A lock, synced temporary file and atomic rename serialize cooperating writers. A crashed `writer.lock` requires deliberate operator recovery after confirming the writer stopped. Preserve logs; do not automatically reset history or delete locks. The exact seed digest is pinned: register workers through the API, **never edit the seed to add them**.

## Remaining qualification and adoption

Embedded PostgreSQL tests exercise current membership, ordinary-agent/reviewer isolation, exact retries, immutable guards, malformed-row refusal, file-backed reopen, result-before-ACK recovery and permission-based withholding. They do not qualify managed PostgreSQL TLS, least-privilege deployment roles, real multi-process contention, backup/restore or operator disaster recovery. See the [coordination verification record](COORDINATION_DURABLE_VERIFICATION.md) for commands, results and evidence limits.

Next work is dedicated-target deployment qualification and deliberate worker adoption of the authenticated API, with preserved local histories and explicit operator configuration. The built-in UI already offers the authenticated mode described above. There is **no second scheduler**, automatic worker launch, automatic seed import or new execution grant. Existing terminal HUMAN/POLICY review, leases, fencing and result custody remain authoritative. See [terminal contract](TERMINAL_OPERATING_CONTRACT.md), [data infrastructure](DATA_INFRASTRUCTURE_INCREMENT.md), [commercial agent](COMMERCIAL_AGENT.md), and [economic architecture](ECONOMIC_ARCHITECTURE.md).
