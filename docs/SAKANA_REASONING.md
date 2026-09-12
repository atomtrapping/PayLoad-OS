# Sakana reasoning support on the Exoscale backend

Decision recorded 2026-09-08: Sakana AI is the preferred reasoning supplier and
source of selected reasoning/optimization tooling for Notation Systems. Exoscale
remains the infrastructure target. The firm's product remains licensed data and
analytics; the reasoning layer is an internal operating capability.

Status updated 2026-09-12: a disabled-by-default Sakana Responses API adapter,
strict context/candidate contracts, offline preview, and a
[local prepare/dispatch/inspect workflow](REASONING_WORKFLOW.md) are implemented.
The workflow pins prepared packets, policy, instructions and the serialized provider
body, records an attempt before dispatch, and retains candidates or safe failure
records for inspection.
No Sakana account call, model download, Exoscale provisioning
or deployment has occurred. A separate [local TreeQuest tooling increment](SAKANA_TOOLING.md)
now installs and exercises the open library without using this hosted adapter.
The current Exoscale image inventory does not package
this new CLI; a qualified reasoning worker/image integration remains a separate step.

## Architecture

```text
Exoscale target
  NotationsOS + product operations
     → permission-scoped retrieval / operator-prepared context
     → reasoning gateway: context boundary, limits, provenance
         → Sakana hosted API (external processing)
         → local TreeQuest context-selection worker (metadata only)
         → later: isolated ShinkaEvolve research worker
     ← unadmitted reasoning candidate + citations + usage
     → deterministic checks and human review
     → existing admission / commercial / delivery gates
  PostgreSQL: authoritative application and operational records
  SOS: original evidence, exact releases and retained result artifacts
```

Sakana is a supplier choice, not an authority assignment. A fluent answer cannot
create source rights, admit a fact, merge an identity, change a pricing floor or
send a customer message. Commercial reasoning explains the existing evaluator's
result and prepares questions; the deterministic evaluator keeps its decisions.
The initial adapter has no tools and cannot execute model-generated actions.

The supplied [SakanaAI repository organization](https://github.com/orgs/SakanaAI/repositories)
contains API integration material, executable research tools, benchmarks and model
research. Those have different roles. A repository's presence there does not
establish a supported hosted service, self-hostable frontier model or license to
use a separate model checkpoint or dataset.

## Selected tools and their roles

| Component | What the upstream project provides | Intended role here | Adoption status |
|---|---|---|---|
| [Fugu](https://github.com/SakanaAI/fugu) | A multi-model system accessed through Sakana's hosted API; repo contains integration material | General internal synthesis, extraction planning and commercial review | REST adapter implemented; no live call |
| [TreeQuest](https://github.com/SakanaAI/treequest) | Python answer-tree search with AB-MCTS and caller-supplied generation/scoring | Bounded search over competing extraction plans or analytic candidates | [Local context-selection worker implemented](SAKANA_TOOLING.md); not an LLM |
| [ShinkaEvolve](https://github.com/SakanaAI/ShinkaEvolve) | LLM-driven program evolution around an executable evaluator | Improve normalization, query or computational algorithms against frozen correctness tests | Separate research-worker pilot; no install |
| [ALE-Bench](https://github.com/SakanaAI/ALE-Bench) | Score-based algorithmic contest evaluation, including routing/scheduling | Optional evaluation harness and comparison ideas | Evaluation only; upstream states it is not an officially supported product |
| [AI Scientist v2](https://github.com/SakanaAI/AI-Scientist-v2) | An automated experimental research workflow that executes generated code | Optional isolated scientific-method experiments | Deferred; not the production control loop |
| [Doc-to-LoRA](https://github.com/SakanaAI/doc-to-lora) | Reference code that internalizes document context in model adapters | Experimental comparison against version-pinned retrieval | Deferred until correction, provenance and removal tests exist |
| [KAME](https://github.com/SakanaAI/kame) | Spoken-dialogue inference stack | Optional voice interface if later needed | Deferred; upstream oracle path sends text to OpenAI and default ASR uses Google |
| [Continuous Thought Machines](https://github.com/SakanaAI/continuous-thought-machines) | Research architecture and task experiments | Long-term model research | Not selected as the firm's general LLM |

These assignments are engineering judgments for our mandate. TreeQuest and
ShinkaEvolve require generation backends and task-specific scoring; they are not
themselves foundation-model endpoints. Their useful outputs need independent
correctness checks. Local worker execution on Exoscale does not establish local
model inference if a worker calls an external API.

ShinkaEvolve exposes local and SLURM launch options, pricing snapshots and optional
external telemetry. A pilot must pin a reviewed revision and dependencies, disable
unapproved telemetry/network discovery, freeze the evaluator and dataset, and
limit proposal/evaluation counts. Start with a synthetic normalization optimization:
score throughput only after every held-out output matches the existing normalizer.
Do not give the worker production credentials, mutable evaluator files or a path
to deploy its winning code. See the upstream [runtime guidance](https://github.com/SakanaAI/ShinkaEvolve).

The implemented TreeQuest worker uses fixed generation and scoring over declared
source metadata; it makes no LLM calls. Its next benchmark should compare coverage,
token use and latency with a simple greedy selection baseline. It independently
verifies search transitions and scores, but does not establish source relevance or
rights. See [Local Sakana tooling](SAKANA_TOOLING.md) for the pinned Python runtime,
commands and limits. Any later LLM-backed search needs its own fixed call budget and
tests of abstention, citation accuracy, field fidelity, latency and observed cost.

## Hosted model selection

Sakana documents `https://api.sakana.ai/v1` and the Responses API. This adapter
supports `fugu` as the initial default, explicit `fugu-ultra-v1.1` for a separately
evaluated deeper tier, and `sakana-namazu-v1.0` as an optional Japanese-specialized
model. Namazu is distinct from Fugu's multi-model orchestration. Model availability
must be confirmed with the actual account before use. [API setup](https://console.sakana.ai/get-started),
[model reference](https://console.sakana.ai/models).

Fugu routes through external model providers; its API-key configuration can restrict
the ordinary Fugu pool. The adapter cannot verify those console settings. Do not
assume Ultra supports exactly the same exclusions. The reviewed account configuration
must establish allowed processing destinations, retention/training settings, source
permissions and the applicable model tier. Sakana's standard API terms, checked
2026-09-12 and effective 2026-07-21, exclude the EEA, UK and Switzerland. They also
prohibit personal-information input and sensitive data, and describe training use
with an opt-out. Confirm account/service-location eligibility and reviewed data
handling before activation. A Swiss Exoscale deployment does not qualify this
hosted service, and changing the egress location is not a qualification method.
[Sakana API terms](https://console.sakana.ai/terms-of-service).

Sakana exposes orchestration usage separately for some models, and the documented
output-token limit does not bound all Ultra orchestration. The adapter preserves the
provider's usage object, including nested fields; missing usage remains unknown.
It does not calculate a bill or claim a hard spend ceiling. Before deployment,
establish account spend controls and a durable firm-wide admission budget, and
reconcile against billed usage. [Usage fields](https://console.sakana.ai/models),
[pricing documentation](https://console.sakana.ai/pricing).

## Run and inspect locally

Use the [retained reasoning workflow](REASONING_WORKFLOW.md) when preparing a
candidate for review. It binds the packet to a policy and exact instructions/body,
rechecks expiry after recording the attempt, and refuses a second dispatch after
an unfinished or failed attempt. Historical candidates remain inspectable using
their retained body even after the formatter changes. The original commands below
remain available for compatibility; the direct `run` command does not retain a
workflow receipt or prevent a new process from making another call.

```powershell
npm run reasoning -- preview --request examples/reasoning-synthetic.json
```

Preview is entirely offline and shows the exact instructions and serialized input
with a digest. It requires no account or secret and does not claim a model result.

For a later authorized synthetic live qualification, configure:

```text
PAYLOAD_REASONING_PROVIDER=sakana
PAYLOAD_SAKANA_MODEL=fugu
PAYLOAD_SAKANA_PROCESSING_REVIEW_REF=<reviewed-account-and-provider-pool-reference>
SAKANA_API_KEY_FILE=<absolute-mounted-secret-path>
PAYLOAD_SAKANA_TIMEOUT_MS=120000
PAYLOAD_SAKANA_MAX_OUTPUT_TOKENS=2048
```

Then explicitly invoke:

```powershell
npm run reasoning -- run --request examples/reasoning-synthetic.json --allow-external
```

Local mode also accepts `SAKANA_API_KEY`; define exactly one key source. Internal
deployment mode requires the file. No secrets enter browser configuration, CLI
previews, results or errors. Output is JSON on stdout; use the firm's controlled
operator storage when retaining real authorized outputs. CLI errors contain safe
codes and never provider error bodies. A timeout or failure after dispatch leaves
provider execution and billing unconfirmed; there is no automatic retry.

## Implemented boundaries

- Strict input contract: operator-prepared public or synthetic text, question,
  references, observation times, source standing and external-processing basis.
  Private classifications are rejected. The declaration is trusted operator input,
  not automated inspection of content or a source-policy proof. Do not expose this
  function as an untrusted HTTP endpoint. A source being publicly visible is not
  sufficient permission to send it to a model.
- Input limit 32 KiB; response-body limit 256 KiB; output limit 2,048 tokens;
  timeout at most 120 seconds; one in-flight call per Node process. Limits can be
  lowered. The process slot stays occupied until transport/body work settles.
  Replicas and separate CLI processes do not share a fleet budget.
- Fixed official HTTPS destination, redirect refusal, TLS bypass refusal, no
  automatic retries, model-selected URLs, provider fallback or built-in tools.
  Generated function calls and incomplete/refused provider responses are rejected.
- Strict answer shape and source-ID membership checks. All retained outputs are
  unadmitted candidates with exact input/body/response digests, requested/reported
  model identities and source-content digests. Internal model reasoning traces are
  not emitted. The candidate is a local operational record, not canonical admission.
- Citation membership is a syntactic check. It does not establish entailment,
  truth, independent verification or faithful preservation of source standing.
  Human/evaluator review remains necessary; the general reasoning-witness rules
  are not declared solved by this adapter.

The adapter does not retrieve corpus data, consume board messages, launch Python
research tools, modify commercial reports or write a production result ledger.
The local workflow adds retained files and a synthetic-only bridge over the
deterministic commercial evaluator. That bridge prepares explanation context while
preserving the evaluator's result; it does not authorize outreach or delivery.
No existing production route or customer interface is wired to call the adapter.

## Qualification sequence

1. Confirm deployment region/account eligibility, approved provider pool and
   processing terms. Supply a scoped secret and account budget; use synthetic data.
2. Verify one real API response and usage record. Exercise timeout, refusal,
   truncation and correction cases. Confirm no credentials or protected context
   appear in logs.
3. Build a trusted context assembler over exact releases and current source-use
   checks. Bind source scope and recipient/provider authorization. Extend the
   existing local records to a qualified production ledger and add shared budget
   reservation/reconciliation. Local policy expiry and declared source-age checks
   are not a source-permission resolver or a spend ceiling.
4. Package a separate bounded reasoning worker for Exoscale; integrate explicit
   authenticated requests from internal agents. Preserve current product gates.
5. Benchmark the implemented local TreeQuest worker against a greedy baseline.
   Separately qualify an isolated ShinkaEvolve pilot with frozen held-out tests
   before installation or generation-backend activation.

The infrastructure boundary is tracked in [Exoscale implementation](EXOSCALE_IMPLEMENTATION.md);
the existing sales worker is documented in [Commercial agent](COMMERCIAL_AGENT.md).
