# Agent stable and shared noticeboard

Operating contract — 2026-09-12. PayLoad-OS already has a shared stable and board; this document maps their current local behavior and the next integration boundary. It does **not** claim production-safe multi-agent coordination. Registration and posting launch no workers.

## Readiness

| Capability | Current standing | Implementation |
|---|---|---|
| Stable, declared contracts and connections | Implemented; declarations, not authenticated agents or running processes | `src/coordination/{types,ledger,seed}.ts`, `/agents` |
| Threads, directed handoffs, broadcasts and inbox | Implemented in fixture/local scope | `ledger.ts`, `inbox.ts`, `/board` |
| Message and ACK persistence | Opt-in, seed-pinned local file; no PostgreSQL board adapter | `src/coordination/store.ts` |
| Contract/build-inspection workers | Manually started deterministic local workers; no model or fleet manager | `contract-review.ts`, `candidate-build-review.ts` |
| Regulatory review worker | Reads a digest-pinned retained capture; posts and reads back its result before ACK; no source collection or state mutation | `regulatory-agent.ts`, `npm run agent:regulatory -- --once` |
| Authenticated board participants and memberships | Not implemented; ingress authentication does not bind message authors | `src/coordination/http.ts` |
| Reviewed mining jobs, leases and retained results | Implemented separately; not linked to board messages | `src/terminal/service.ts` and existing execution ledger |
| PostgreSQL board and typed job/result links | Next increment; no inactive scaffold or automatic migration added | Plan below |

## Existing surfaces and rules

| Surface | Contract |
|---|---|
| `/agents` | Stable search, definition/connection inspectors and opt-in local registration |
| `/board` | Topic/kind filters, threads, directed/broadcast posting, replies, ACKs and manual refresh |
| `GET /api/coordination` | Full scoped snapshot: participants, messages, ACKs, connections, release contexts |
| `POST /api/coordination` | Exact `register`, `post` or `acknowledge` command; updated snapshot on success |
| `GET /api/coordination/inbox` | Participant inbox with sequence pagination and optional acknowledged/broadcast messages |
| `clients/javascript/coordination.mjs`, `clients/python/payload_coordination.py` | Dependency-free clients for those same endpoints |

A participant declares id/version, purpose, kind, authority, runtime, status, domains, inputs, outputs, capabilities and reference. `REFERENCE`, `PLANNED` and `LOCAL` describe definitions, not liveness. Connections match exact input/output names and common domains; `MATCH`/`PARTIAL` are contract declarations, not execution permission or schema/semantic verification.

The repository binds the board to `firm:coordination-demo`; available release contexts currently come from Caravan fixtures. Message kinds are `NOTE`, `REQUEST`, `HANDOFF`, `BLOCKER`, `RESULT`. Null recipient means broadcast; HANDOFF requires another registered recipient. Replies preserve their parent's topic and exact release/build/knowledge context. There are no edit/delete commands.

Identical author/request-id retries preserve the original message and timestamp; changed payloads return `IDEMPOTENCY_CONFLICT`. Changed definitions require new participant ids. Only the directed recipient may ACK; a broadcast permits another in-scope participant with the applicable domain. **ACK records receipt—not a work claim, completion, acceptance, correctness, admission or authority grant.**

## Local operation

From the repository root, with dependencies already installed, use separate terminals:

```sh
npm run dev:coordination
# In another terminal: register and run one pass, then post a request.
npm run agent:contract-review -- --once
# Optional separate worker, using an existing operator-selected evidence root:
npm run agent:candidate-build-review -- --once --root .payload/evidence
```

The server binds `127.0.0.1`, uses `PORT` or 3000, and sets `PAYLOAD_COORDINATION_LOCAL=1`. Visit `http://127.0.0.1:3000/agents` and `/board`. Without that flag, the board is read-only fixtures. Both modes remain `fixture_only: true`; local mode reports `LOCAL_SANDBOX`, `LOCAL_FILE`, `canWrite: true`. Use demonstration messages, never secrets or protected customer workloads.

The contract worker registers `agent.contract-review.v1` and handles directed REQUEST/HANDOFF messages with topic `contract-review` and body exactly `{"participantId":"agent.release"}`. Run the same command again after posting. A plain command also runs once; `--watch` repeats passes with a two-second wait. `PAYLOAD_COORDINATION_URL` selects the worker server, defaulting to `http://127.0.0.1:3000`.

The candidate worker registers `agent.candidate-build-review.v1`; topic is `candidate-build-review`, context must be null, and body is exactly `{"buildId":"…","expectedDigest":"sha256:…"}` using the full retained build digest, not its membership root. Its URL must be an HTTP literal-loopback origin; only the operator's `--root` selects evidence. It reads back the bound result before ACK, exposes no raw evidence, and grants no current retrieval rights. See [candidate-build worker](CANDIDATE_BUILD_REVIEW_WORKER.md).

After contract-worker registration, enter this in a Node REPL from the repository root:

```javascript
const { CoordinationClient } = await import('./clients/javascript/coordination.mjs');
const client = new CoordinationClient('http://127.0.0.1:3000');
const snapshot = await client.snapshot();
await client.register({
  id: 'agent.review.local-v1', name: 'Local review definition', kind: 'AGENT', version: '0.1.0',
  purpose: 'Record demonstration review notes.', authority: 'derived', runtime: 'JavaScript',
  status: 'LOCAL', scope: snapshot.scope, domains: ['CARAVAN'], inputs: ['CorpusRelease/v1'],
  outputs: ['ReviewNote/v1'], capabilities: ['release.review'], reference: 'Local demonstration'
});
await client.post({
  requestId: 'demo-contract-review-001', authorId: 'apparatus.coordination',
  recipientId: 'agent.contract-review.v1', kind: 'REQUEST', topic: 'contract-review',
  title: 'Review release-agent inputs', body: JSON.stringify({ participantId: 'agent.release' }),
  context: null, replyTo: null
});
// Rerun the contract worker in its terminal, then query this inbox:
const pending = await client.inbox('apparatus.coordination', {
  afterSequence: 0, limit: 50, includeAcknowledged: false, includeBroadcasts: false, kind: 'RESULT'
});
pending.messages; // Inspect the expected worker's result and its replyTo binding.
```

Then ACK an inspected result with `await client.acknowledge('<actual RESULT message id>', 'apparatus.coordination')`, substituting its returned id.

The HTTP forms are `{"operation":"register","participant":{…}}`, `{"operation":"post","message":{…}}`, and `{"operation":"acknowledge","messageId":"…","participantId":"…"}`. All command fields are required; bodies are limited to 16 KiB. Python exposes `register`, `post`, `acknowledge`, and `inbox(..., after_sequence=0, limit=50, include_acknowledged=False, include_broadcasts=False)`.

Inbox example: `GET /api/coordination/inbox?participant=agent.contract-review.v1&after=0&limit=50&acknowledged=false&broadcasts=false`. Limit is 1–100. Follow `nextSequence` while `hasMore`; start each new pending-work pass at zero. A cursor is a scan position, not a processing receipt. Persist a result before acknowledging; retry the same request id after uncertainty. Unsupported messages remain pending.

## Authority and recovery boundaries

The stable's authority/capability labels and selected author ids are simulated declarations. Current internal ingress can authenticate one operator, but does not establish participant ownership or multi-agent isolation. [Terminal execution](TERMINAL_OPERATING_CONTRACT.md) separately authenticates registered principals, scopes reads, requires exact HUMAN/POLICY review, and owns job claims, leases, results and custody. Board prose does not exercise those powers.

Local commands replay from `.payload/coordination/events.json`: maximum 200 definitions, 5,000 messages, 15,000 log entries and 16 MiB. An exclusive lock, synced temporary file and atomic rename serialize cooperating local writers. This is not a distributed, signed or independently verified ledger. A crashed writer can leave `writer.lock`; preserve history and establish that the writer stopped before operator recovery. Do not automatically delete locks or reset logs.

The log pins the exact seed digest. **Do not edit the seed to register new workers**: register through the API. Seed changes can make retained logs refuse replay; any migration must preserve original identities, ordering and acknowledgements explicitly.

## Next increment: one coordination module, one execution ledger

1. Add a server-bound service seam in `src/coordination` using the existing authenticated terminal principals. Bind authors, ACK actors and board membership server-side; retain a clearly separate fixture mode. Registration declarations must never grant capabilities or reviewer status.
2. Add a PostgreSQL message/ACK repository in the existing pool, with immutable event identities, exact idempotency conflicts, scoped bounded pagination and transactional writes. Use an explicit versioned migration; preserve local logs without automatic import, overwrite or seed reinterpretation.
3. Add typed board references to existing terminal job ids, reviewed action digests and retained result digests. Validate ownership, current scope and exact bindings before reads/writes. Job state must be read from the terminal ledger, never inferred from message text or ACKs.
4. Extend the existing clients and registers with authenticated “my inbox,” linked job/result views and bounded refresh. Use result-readback-before-ACK recovery. There is **no second scheduler**: terminal execution retains its existing review, claims, fencing and retry policy. Any future worker launch requires a separate explicit operator configuration.

## Acceptance gates for that increment

- Two authenticated agents exchange scoped requests/results; neither can impersonate the other's author/ACK identity or read another board.
- Concurrent identical posts produce one event; changed inputs refuse. Restart preserves participants, message sequence, timestamps and ACKs.
- Crash after result commit but before ACK recovers the same durable result without duplicate work history; ACK alone never marks a terminal job complete.
- Cross-corpus/job references and changed action/result digests refuse. Agents cannot replace HUMAN/POLICY review; stale execution claims cannot publish results.
- Two competing workers still use the existing terminal job lease/fence. Browser reload shows pending request, linked job, retained result and receipt without inventing completion.
- Existing fixture/local clients, worker recovery, ledger/inbox rules, UI retries and desktop/mobile accessibility remain covered by `src/coordination/*.test.ts`, API/UI tests, `tests/python/test_coordination_client.py` and `tests/e2e/coordination.spec.ts`.

These gates are a plan, not new qualification results. See also [commercial agent](COMMERCIAL_AGENT.md), [economic architecture](ECONOMIC_ARCHITECTURE.md), and [data infrastructure](DATA_INFRASTRUCTURE_INCREMENT.md).
