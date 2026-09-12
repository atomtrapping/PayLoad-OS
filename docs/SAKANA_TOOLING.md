# Local Sakana tooling

Implemented 2026-09-08: an actual **TreeQuest 0.3.2 ABMCTS-A** Python worker,
connected to NotationsOS through its existing bounded process pool, strict
TypeScript verification and optional immutable object storage. This is an
operator-engageable context-selection tool, not a hosted API placeholder.

The separate `reasoning` command / [hosted adapter](SAKANA_REASONING.md) is preserved.
`sakana:tools` never invokes it. No model endpoint, generated code, source URL
fetching, admission, customer delivery or cloud provisioning occurs here.

## What it does

An operator supplies a small metadata packet: required coverage labels and weights,
candidate source identities/digests/knownAt/standing, token estimates, and limits.
TreeQuest chooses search parents; a fixed extension function adds a feasible
source, and a fixed evaluator scores the union of declared coverage labels. The
result includes the search trace and selected source metadata. TypeScript
independently recomputes every trace score, parent transition, source/token budget,
and final selection. Refused and withdrawn candidates cannot be selected.

This lets Caravan, Landshark and Tradewind experiment with one shared context
budgeting mechanism. It does **not** establish factual relevance, resolve original
evidence, verify source rights, infer corrections, or provide an LLM. Caller-supplied
standing, rights basis, digests and timestamps are declarations. Before real
retrieval, a trusted product adapter must resolve them against retained evidence,
the chosen vintage and recipient permissions. No public HTTP/MCP endpoint is added.

Every result remains `UNADMITTED` and `reviewRequired`. It cannot bypass the existing
admission or delivery gates. Compare usefulness and latency with a simple greedy
selection baseline before putting tree search on a product's default path; bounded
search is not guaranteed optimal, and this initial evaluator may not need it.

## Engage it locally

Run from the repository root. Preview needs only the existing Node dependencies:

```powershell
npm run sakana:tools -- preview --request examples/sakana-context-search.json
```

Install the minimal, pinned Python dependencies into a dedicated directory using
CPython 3.12. This is an explicit package download; it is not done by the command:

```powershell
python -m pip --isolated install --only-binary=:all: --index-url https://pypi.org/simple --target .stamp/sakana-python -r tools/sakana/requirements.txt
```

Configure the operator-owned runtime and explicitly authorize local execution:

```powershell
$env:PAYLOAD_SAKANA_TOOLS = '1'
$env:PAYLOAD_SAKANA_TOOLS_PYTHON = (Get-Command python).Source
$env:PAYLOAD_SAKANA_TOOLS_DEPENDENCIES = (Resolve-Path .stamp/sakana-python).Path
npm run sakana:tools -- run --request examples/sakana-context-search.json --allow-local --store .payload/sakana-runs
```

Use the absolute path of a real Python executable if `python` is a launcher or
Windows Store alias. The synthetic example uses explicitly declared placeholder
digests, not real source objects. Without `--store`, the result is returned only on
stdout. With it, the request and candidate are stored/read back through the existing
`FileContentAddressedStore`; the response includes their exact content digests and
storage keys. Identical request bytes reuse the same object. Run timestamps are
measured, so repeat runs can retain distinct candidates with the same search output.
An interrupted pair can leave an unreferenced request object, not a partial overwrite.
There is no automatic pruning or claim of transactional publication to PostgreSQL/SOS.

## Throttles and isolation

| Limit | Normal | `PAYLOAD_EXECUTION_PROFILE=conserve` |
| --- | --- | --- |
| Search iterations | Up to 128 | Up to 32; larger requests refuse |
| Worker deadline | 60 seconds | 15 seconds |
| Input / combined stdout-stderr | 64 KiB / 1 MiB | Same |
| Candidates / requirements | 64 / 32 | Same |
| Selected sources / token estimates | Up to 16 / 32,768 | Same |
| Native math threads | 1 | 1 |

The existing shared `production` process pool supplies concurrency admission,
busy refusals and process telemetry. `PAYLOAD_MAX_CHILD_PROCESSES` can lower its
capacity. These are **per-process** controls, not a host-wide distributed scheduler.
The candidate records elapsed time, effective limits, input/output/worker digests
and the declared requirements-file digest. That file digest is not installed-byte
attestation. TreeQuest itself must report the exact expected package version.

Python is invoked with fixed argv, `-I -S -B`, an explicit dependency directory and
a minimal environment without provider keys or Python startup hooks. The request
cannot choose executable paths, imports, code or model endpoints. The worker only
calls the fixed metadata evaluator. Timeouts retain the pool slot until process
close. This is **not an OS security sandbox** or a memory quota: do not use this
process wrapper to run untrusted programs. For an Exoscale worker, package the pinned
runtime in a separately qualified non-root image, deny network egress, and enforce
container CPU/memory/PID limits. The existing Node/Rust image has not been changed
to include Python. No Exoscale image or deployment is qualified by this local test.

## Verification

```powershell
npx vitest run src/reasoning/local-tools.test.ts src/reasoning/local-cli.test.ts
python tools/sakana/test_worker.py
```

Python tests use `.stamp/sakana-python` by default or the explicit
`NOTATIONS_SAKANA_TEST_DEPENDENCIES` directory. They exercise the actual library,
not a stub. The normal TypeScript suite remains offline and does not require Python;
it tests the independent verifier and transport boundary with injected results.

## Further Sakana adoption

The [official TreeQuest repository](https://github.com/SakanaAI/treequest) is
Apache-2.0; it supplies search, not a base model. The dependency file deliberately
omits its plotting and JAX/PyMC extras. This first tool needs no GPU or model API.

[ShinkaEvolve](https://github.com/SakanaAI/ShinkaEvolve) is the next candidate for
isolated, evaluator-driven normalization/query optimization. It is **not installed
or activated**: first choose an approved generation backend, freeze correctness
fixtures, and establish a container/OS execution sandbox with no production
credentials. Use held-out exact-output checks before rewarding speed. No generic
remote-execution hook has been added in anticipation of it.

Fugu's hosted API and Sakana's open libraries have different boundaries. Cloning
[Fugu](https://github.com/SakanaAI/fugu) does not self-host its model service. Its
[standard hosted terms](https://console.sakana.ai/terms-of-service) must be checked
for the actual service location, input-data classes and use: they currently exclude
Switzerland, among other territories. Do not equate an Exoscale-local search worker
with permission to send Swiss-hosted or restricted data to a hosted model. This
increment enables no external model call and changes no external-provider settings.
