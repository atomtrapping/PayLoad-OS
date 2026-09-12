# Local reasoning runs

The reasoning workflow prepares a reviewable request before any hosted model call,
retains its policy, validated input, instructions and serialized provider request
body, and records the attempt before dispatch. A successful answer remains an
`UNADMITTED` candidate requiring review. This is local operator tooling; it does
not deploy a worker or connect a production agent route.

Run commands from the repository root. `preview`, `prepare`, `prepare-commercial`
and `inspect` make no external requests and need no Sakana credential. `dispatch`
requires enabled Sakana configuration and `--allow-external`.

## Prepare a request

```powershell
npm run reasoning -- prepare --request examples/reasoning-synthetic.json --policy examples/reasoning-run-policy.json
```

The request follows `notation.reasoning-request.v1`: a question, task, classification,
external-processing basis and declared sources. The policy follows
`notation.reasoning-run-policy.v1` and binds:

| Field | Meaning |
| --- | --- |
| `id` | Operator policy identifier |
| `model` | `fugu`, `fugu-ultra-v1.1` or `sakana-namazu-v1.0` |
| `reviewRef` | Reference to the reviewed processing configuration |
| `timeoutMs` | Positive timeout, at most 120,000 milliseconds |
| `maxOutputTokens` | Positive output limit, at most 2,048 tokens |
| `expiresAt` | Policy expiry as an ISO timestamp with timezone |
| `allowedTasks` | Nonempty selection of `EVIDENCE_SUMMARY`, `COMMERCIAL_REVIEW`, `EXTRACTION_PLAN` |
| `allowedClassifications` | Allowed `SYNTHETIC` or `PUBLIC` classification |
| `maxSourceAgeHours` | Maximum declared source age, from 1 to 8,760 hours |

The included policy is an offline example, restricted to synthetic packets and
expiring 2026-10-01. Its review reference explicitly indicates that it is not an
approved provider review. A live policy requires an operator's actual processing
review, scope and expiry decision; copying the example does not supply that review.

Preparation validates and retains the normalized packet, policy, literal model
instructions and exact serialized provider request body under a content-derived
64-character hexadecimal run ID. The body contains no authorization headers.
The original input file's JSON whitespace and formatting are not retained. Copy
the returned ID for inspection and dispatch.
The files live in `.payload/reasoning-runs` by default. An operator can select the
directory using `PAYLOAD_REASONING_RUN_DIR` or `--root <directory>`; use the same
directory for subsequent commands.

Treat these records as controlled operator data: the prepared packet contains the
source text. Public visibility and a caller's classification are not proof of
external-processing rights. The workflow validates declared values; it does not
inspect the account console, resolve source rights or detect all sensitive content.

## Prepare a commercial review

`prepare-commercial` accepts a raw commercial request, runs the existing
deterministic evaluator locally, and prepares a reasoning packet from that result.
The bridge is limited to synthetic requests and an explicit synthetic processing
basis. Every offer and intent must be marked synthetic, and `INTERNAL_ONLY` offers
are rejected even if so marked. These declarations are not content inspection.
The bridge must not be used to send the actual firm catalog or buyer data.

```powershell
npm run reasoning -- prepare-commercial --request examples/commercial-reasoning-synthetic.json --policy examples/reasoning-run-policy.json --basis "Operator-created synthetic fixture; no real buyer or source data." --at 2026-09-12T00:00:00Z
```

Use `--at <ISO-timestamp>` to fix the evaluator's observation time for a reproducible
fixture. Repeat the exact timestamp, request, basis and policy to reuse the same
identity while the instructions and request formatting remain unchanged. Omitting
`--at` evaluates at the current time, producing a fresh report and run identity;
it does not resume the earlier run.

The reasoner's task is to explain the deterministic result and identify unresolved
questions. It cannot change qualification, price bounds, permissions, commercial
decisions or delivery gates.

The older `examples/commercial-agent-request.json` includes an actual catalog offer
marked `synthetic: false` and is intentionally unsuitable for this bridge. Use the
dedicated fully synthetic fixture above.

## Inspect and dispatch

```powershell
npm run reasoning -- inspect --run-id <64-character-run-id>
```

Inspection reads retained records and verifies their digests, including the
candidate's body digest against the retained original body. Historical inspection
does not regenerate that body with the current formatter. Review the prepared
request, instructions and policy before enabling a hosted call. For an eligible,
reviewed account, the active configuration must match the prepared model, timeout,
output-token limit and processing review reference:

```text
PAYLOAD_REASONING_PROVIDER=sakana
PAYLOAD_SAKANA_MODEL=fugu
PAYLOAD_SAKANA_PROCESSING_REVIEW_REF=<same-reviewRef-as-policy>
PAYLOAD_SAKANA_TIMEOUT_MS=120000
PAYLOAD_SAKANA_MAX_OUTPUT_TOKENS=2048
SAKANA_API_KEY_FILE=<absolute-mounted-secret-path>
```

Local mode also accepts `SAKANA_API_KEY`; set exactly one key source. Internal
deployment mode requires the file. Credentials are not part of prepared records.
The adapter remains disabled unless the operator enables it. Dispatch is explicit:

```powershell
npm run reasoning -- dispatch --run-id <64-character-run-id> --allow-external
```

Dispatch rechecks policy expiry, permitted task/classification, declared source age
and agreement with the active configuration. It refuses a fresh dispatch if the
current instructions or generated provider body differ from the prepared version.
It creates an attempt receipt before the provider request, then rechecks expiry and
source age after claiming the run so filesystem delay cannot silently bypass those
checks. Only one process can create that receipt for a given run in the same local
store. Candidates and safe failure receipts are retained for later inspection;
provider error bodies and credentials are not retained.

After successful completion, repeating dispatch returns the retained historical
candidate without another provider call. This does not renew source permissions or
make the historical answer current. An unfinished attempt is
`DISPATCH_UNCONFIRMED`; a failed call also remains unconfirmed and cannot be resent
through that run. No reset, receipt deletion or automatic retry command exists.
A timeout or interrupted process does not establish whether the provider executed
or billed the request. Inspect the retained evidence and resolve that uncertainty
before considering a separately authorized new run.

Inspection preserves observed timestamps even if the host clock moved backward.
`clockOrder: NON_MONOTONIC` flags recorded ordering inconsistent with the attempt,
start or completion sequence; it does not discard an otherwise valid provider
result. `NO_ROLLBACK_OBSERVED` only describes the recorded timestamps. Freshness
checks still depend on the operator host's wall clock.

## Boundaries and next integration

The create-only receipt protects one run within one operator-controlled local
directory. A second directory, a changed packet/policy/instructions/body, or the
legacy direct `run` command is a different dispatch path. This is not a provider
idempotency guarantee, distributed scheduler, shared spend budget or transactional
PostgreSQL/SOS ledger.
The filesystem must be trusted; digest verification detects accidental alteration
but is not a signature or protection against an administrator replacing all files.

Each run directory contains `prepared.json`, then `attempt.json` if dispatch was
claimed, and `result.json` or `failure.json` when recorded. An interrupted attempt
may have neither final record. Publication is create-only and readback checks
record identities, digests and relationships; this is not a multi-file transaction.
The filesystem must support atomic hard-link creation. Flushing the file before
publication supports process-crash recovery; it does not promise power-loss
durability or physical write-once storage.

The existing adapter limits inputs to 32 KiB, response bodies to 256 KiB, output
tokens to 2,048 and transport time to 120 seconds. Retained run-file reads are
bounded to 768 KiB. Token and timeout bounds do not cap all Fugu orchestration
costs. Usage is retained as reported, with absent values remaining unknown.

The local [TreeQuest worker](SAKANA_TOOLING.md) is already implemented as a separate
metadata-selection tool. It is not connected to dispatch and calls no LLM. A
production context assembler, authenticated internal route, shared budget ledger,
qualified Exoscale image and source-permission resolver remain future work.

Hosted activation also depends on service eligibility: the Sakana API terms checked
2026-09-12 exclude the EEA, UK and Switzerland. See the
[integration guide](SAKANA_REASONING.md#hosted-model-selection) and the
[official terms](https://console.sakana.ai/terms-of-service). Local Sakana library
execution on Exoscale does not establish permission to use the hosted API.

No live model request or Exoscale provisioning was performed in this increment.

## Frozen integration snapshot — 2026-09-12

This checkout imports 37 selected optional commercial/reasoning/TreeQuest files
from the O prototype. Every file's SHA-256 was identical before and after its
capture and during a second whole-selection check. The copied contents matched
after LF/CRLF normalization before integration edits. This records the selected
snapshot, not a claim that O's later working tree is identical.

O subsequently changed `src/reasoning/cli.ts`, `src/reasoning/run-store.ts`,
`src/reasoning/workflow-cli.test.ts` and this workflow document. Those later edits
were not imported or overwritten. Reconcile them explicitly against this snapshot;
do not overlay the entire prototype onto the integrated operating system.

Integration changes derive commercial domains from the shared `DOMAIN_IDS`
registry, correct a test's fixed `NODE_ENV=production` expectation, and add actual
child-process tests for competing dispatches and abrupt exit after a durable
attempt. The focused suite passed 229 tests across nine files, and scoped lint
passed. Hosted transport was faked throughout; no model call, package installation,
Python worker activation or infrastructure deployment was performed.

These optional operator commands do not register terminal capabilities, create an
authorization service or replace the PostgreSQL result/publication history.
Commercial declarations remain non-binding; a local reasoning attempt is not a
shared spend budget, source-permission decision or customer-delivery authorization.
The separate `notations-terminal` application was not imported.

The following are **source** hashes (before = after), not hashes of the subsequently
adapted target files. The manifest commitment is SHA-256 of lexically sorted
`path<TAB>lowercase-source-sha256<LF>` lines:

`68932b37af7adc08b3493b405952c1640e064359adf046495a88a88db571eec2`

| Captured path | Source SHA-256 |
| --- | --- |
| `src/commercial/agent.ts` | `3c002ec9bcc4d5bbc484ee650f19323f2f98b9ff43f92274d843db656af5fc46` |
| `src/commercial/agent.test.ts` | `f52c30c443a1d682fbdc06660bcdcdd01efb02c337b4645e0a099a32de28a836` |
| `src/commercial/catalog.ts` | `0ba713c88a0a8c8e4618ae13fd4324d3b0f27711e638e692d06d6534b6b7b72c` |
| `src/commercial/cli.ts` | `a4d7c266464e460d0e025421f446a12a2a8e1c3fcef37a974d7f2c233da6c27e` |
| `src/commercial/cli.test.ts` | `0c634e0241544d2de280f425f0a7eca278ae532af4252674afd636837d8d02a9` |
| `src/commercial/contracts.ts` | `1327d9e0cdc9a6d9a77100ddc3d276d36c8225ac0f705b3ccf543dbb4d97f24f` |
| `src/commercial/definition.ts` | `04103010a3712b73dcc73fd5bf8cc27097da1a8d473fe17d60d0b2458099e5b0` |
| `src/commercial/reasoning.ts` | `0aaa413aa1d54788fa81165eb850d50d17d54c92cf9e46ddac6301f6304de6c0` |
| `src/commercial/reasoning.test.ts` | `3af8ce3946e5278629c526fbe9b6d4c74c3fd7ef969ee858be2ccb1541cb1991` |
| `src/reasoning/cli.ts` | `95e45396844f8aefe11fdc13253bea2d6c498532da1c5ec3903510892adbbf0e` |
| `src/reasoning/config.ts` | `942305dfc45754f353cb929832191f9f2c705b632fe8dad2d9adf8730cb26235` |
| `src/reasoning/contracts.ts` | `ae87c06d7c528940f017d6cb14d61d1633239a04fd1519a14b3d77f2f15dd4b5` |
| `src/reasoning/local-cli.ts` | `35f2fa122324112a6d2406da6e5523501d24d24810c7daad3d786afe86e16a68` |
| `src/reasoning/local-cli.test.ts` | `de2fa8268b9e6277a1b89eebe9ebb5400201399cbd647138229bfcb22acec703` |
| `src/reasoning/local-contracts.ts` | `f9c5365496dc54684cd3ed083cc9fda49c9f98d9c770fac924cc4abc4a168ee4` |
| `src/reasoning/local-tools.test.ts` | `090aaf9cba6d0f0e7eed93bbeebdc81a70b7e55a4d079d3dddb56637f5f96fae` |
| `src/reasoning/local-worker.ts` | `fa185893ad45a710416adb4d421ac728b95844ff0425250258a907fa2ccc1b00` |
| `src/reasoning/run-store.ts` | `ec476e1fb31fe72d2ef76aed67443222737814d9bc23a1970b974d95001640bd` |
| `src/reasoning/run-store.test.ts` | `8fcb306fff833b641befcd238ddf5b90c991f09351a85af0df73fff9eb168f3e` |
| `src/reasoning/sakana.ts` | `db4f9604e562586b7db28a13955155482e1c34fa2ead8b35948c719a41343b36` |
| `src/reasoning/sakana.test.ts` | `bacfc25be01277a6cd17aeda8b21fc3e35e59ab93a41bf95367ada0788d9c175` |
| `src/reasoning/workflow-cli.test.ts` | `c4c9527eeccf1487034092c05c6eeeb18dfa65d0dc5398c270641615df444aa6` |
| `tools/sakana/worker.py` | `4e71fc27dd3fd7d09d89d24a12b38b695a55a4b3aec0860a0c34807bdf22c77c` |
| `tools/sakana/test_worker.py` | `34410c3d6b24bbe11d8115360ecf8ce56736e93d64487f59cfde4f3a908205dc` |
| `tools/sakana/requirements.txt` | `aed59b7601da386866dc15ceceb1a74a84c0e48125b587f83765f12cd9b9d0d5` |
| `scripts/commercial.entry.ts` | `ac06c5b31b21ed378e28727e23f32d43c658108b711df851d6c4cac54a5f7c6d` |
| `scripts/reasoning.entry.ts` | `378f1d7d879e41f0de130ada54b23b9f8f778c7e2e40311cd2e92b4844a4140f` |
| `scripts/sakana-tools.entry.ts` | `891e9ef28459e9f70bec9e7270a892602957c282b25ffcd20fa062f50c2f1611` |
| `examples/commercial-agent-request.json` | `53400c12c7a69c73fef580aecd1d345e4531722324b4b192e33df23ba7fe0c7f` |
| `examples/commercial-reasoning-synthetic.json` | `b27f123d179ab16741d4791dc021d92f2b394c0d219502cba6e34b61551ebe1b` |
| `examples/reasoning-run-policy.json` | `92c027c2b281eda85df2481982ec6b3f3a2205fb2c0bd2d0bf80a076d30cbcbd` |
| `examples/reasoning-synthetic.json` | `df887163a83a3e0658897b8b9512886a6838ed5d76ca929629a4e2e58c21a144` |
| `examples/sakana-context-search.json` | `e016dd119dbd55124aec8ffd3a2e7f2b7cec8921414c3b2d48f244a6cdb90f93` |
| `docs/COMMERCIAL_AGENT.md` | `81a993bf0bdd685d051fc0300837fcdda5f8c5dc2436ba724c61a357f83bf1b8` |
| `docs/REASONING_WORKFLOW.md` | `f35e8bbe46680dff6effe2b396e66e646c25ce63e4b4294d7d4eaec101e318b6` |
| `docs/SAKANA_REASONING.md` | `9f82bdb57a6d60dad51151556621d4770b4ce5a0b6b3a976c16d37da9f055647` |
| `docs/SAKANA_TOOLING.md` | `1496a79a46dcda97658da9685ab3cb8a83f7e6603881551b7f7aa682868eba20` |
