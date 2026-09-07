# Payload OS · Notation Systems

Notation Systems is a systems and intelligence firm for the physical economy. It
builds computational representations of physical systems from authorized
geospatial, remote-sensing, operational and scientific source material, and turns
that material into provenance-bearing corpora through acquisition, extraction,
normalization, identity, ontology, computation, storage, indexing, verification,
release, correction and recall.

**The products are three APIs — Caravan, Tradewind and Landshark — each delivered
as an HTTP feed and a set of MCP tools over one corpus.** This repository holds
**Payload OS, the internal terminal** the firm operates, monitors and navigates
its backend from. It is not a product and not a fourth API. Positioning is set in
[`docs/ECONOMIC_ARCHITECTURE.md`](docs/ECONOMIC_ARCHITECTURE.md), corrected by the
founder on 2026-09-06.

## What is actually here

Read this before anything else, because the rest of the repository is careful
about it and a reader should be too.

| | |
|---|---|
| Corpora with records | Caravan only. Tradewind and Landshark are declared and empty |
| The Caravan corpus | 3 releases, 21 records, 2 retractions, 7 sources — committed, synthetic, `fixture_only: true` on every response |
| Admitted records | **0.** The admission ruling exists, the write boundary carries an admission status, and the response pipeline refuses to serve a row that never crossed the gate. No candidate has been admitted |
| Live sources | None acquired. Two connectors are implemented and operator-gated; collection needs an explicit flag the operator holds |
| Independent verification | None. Verification here is internal recompute, stated on every release. V0 and V1 of six tiers are reached |
| Customers, bills, deliveries | None. The delivery ledger is specified and empty |

Roughly 45 domain modules carry the system's own claims **as data with tests over
them**, so that a claim about the system fails a test when it stops being true
rather than quietly ageing in prose. The pattern throughout: every module states
what exists, what does not, and the mistake the absence invites.

## The corpus, and the contract over it

Certified releases with production records, manifests, sources and
intelligence-rights schedules. Records carrying value, unit, basis,
machine-readable uncertainty, validity bounds, **both clocks**, provenance,
evidence class and a stable `notation://` identity. As-of answers that refuse
rather than guess. Push retractions for correction and recall.

Distribution is the fixture-backed feed under `/api/v1`, the stream, and twelve
MCP tools (`npm run mcp`). The Caravan ruling workbench turns a claim, a declared
use, a tolerance and two clocks into an inspectable ruling — `ADMITTED`,
`ADMITTED_WITH_CONDITIONS`, `PENDING_EVIDENCE`, `REFUSED`, `SUPERSEDED`,
`REVOKED` — and is optional: the corpus is valuable without it.

## The model, as data

Each of these is a module with tests, rendered on `/model` or `/api`, and
documented. None of them acquires anything or claims a capability the repository
does not have.

- **Doctrine** — five fabrics, three states of information, seven rules with
  where each is enforced and which test proves it, verification tiers.
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Storage** — six classes of information, the store each asks for, and the
  invariant each store must not break. PostgreSQL is selected and wired for
  records; the rest are local files and fixtures.
  [`docs/STORAGE.md`](docs/STORAGE.md)
- **Correction and identity** — downstream invalidation, the specified-and-empty
  delivery ledger, one identity core with three per-line identifier families and
  the absent cross-line join.
  [`docs/CORRECTION_AND_IDENTITY.md`](docs/CORRECTION_AND_IDENTITY.md)
- **Metering** — what a lap is, and the half of a response receipt that would
  have to exist before a bill line could point at one.
  [`docs/METERING.md`](docs/METERING.md)
- **Space as a working dimension** — the display was the easy half. A cell key no
  finer than the source's own stated uncertainty, a geodesic verdict on whether
  two positions can be told apart, and the four other jobs space does once it
  stops being a display attribute. Three sensor families, and the semantic
  convergence that is the actual gap.
  [`docs/SPATIAL_DERIVATION.md`](docs/SPATIAL_DERIVATION.md)
- **Estimation** — a constraint is a measurement with `R = 0`, so constraints are
  beliefs with provenance; certainty is harvested in proportion to declared
  confidence; a violated constraint is evidence about the constraint; and a
  solver informs the corpus but never decides an identity. With the four tiers of
  invariant scoring and the reference channel they must never feed.
  [`docs/ESTIMATION.md`](docs/ESTIMATION.md)
- **The maritime layer** — the vessel as the state the sensor families were
  defined around, dispatch typed as a *prior* so intent-versus-track stays
  signal, and the port as a time-indexed set whose membership is a ruling with
  both clocks, where an unknown set is never an empty one.
  [`docs/MARITIME.md`](docs/MARITIME.md)
- **The carrier, congruence and the serving boundary** — the punch card rather
  than the proof: credibility lives in the estate, the rulings and the two
  clocks, and no cryptography moves it. Plus what a transport can enforce that a
  key cannot, and the three rules a reasoner over the surface is held to.
  [`docs/CARRIER_AND_CONGRUENCE.md`](docs/CARRIER_AND_CONGRUENCE.md)
- **Legacy trade as backfill** — the strongest thing the past can offer this
  corpus, and why: records adversarially audited at creation, conserving mass and
  money so the constraint stack can adjudicate history, carrying institutional
  custody and printed vintages, sharing the live ontology natively, and absolutely
  archive-gated. With the coverage bound, the claim-not-truth grade and the
  extraction cost that falls with time.
- **The projection fabric** — one router, one routing table, and every engine
  routed to rather than installed. OpenUSD enters as a scene target and never a
  store, because composition resolves opinions silently where this corpus
  preserves them; the hyperbolic manifold enters as the tier below the corpus,
  where void renders void.
  [`docs/PROJECTION_FABRIC.md`](docs/PROJECTION_FABRIC.md)

An editable [architecture map](docs/architecture-map/Payload%20OS%20Architecture.md)
— an Obsidian canvas with one note per part, 63 of them — draws the fabrics,
layers and flows as they exist on the branch.

## The surfaces

`/model` is the operating model as data. `/products`, `/releases`, `/stream`,
`/retractions` and `/api` are the corpus and its distribution. `/cases`,
`/rulings`, `/replay`, `/profiles` and `/evidence` are the workbench.
`/production` and `/candidates` are the rail before admission. `/notations` is
authored local state over a Rust kernel. `/agents` and `/board` are coordination.

Four instruments are synthetic previews and say so on the page: the
[Earth Twin](docs/EARTH_TWIN.md) at `/earth` (a keyless CesiumJS globe served
from this origin, drawing each record where its subject's own `location.position`
record declares — and, beneath the globe, what the corpus can *derive* from those
same positions rather than only draw), Spatial Inquiry at `/spatial`,
[registration and access](docs/REGISTRATION_ACCESS.md) at `/compute/registration`,
[clearance value of information](docs/CLEARANCE_VOI.md) at `/compute/clearance`,
and [observation replay](docs/RECORDED_OBSERVATION_REPLAY.md) at
`/compute/observations`.

## The local rails

Opt-in, loopback-only, operator-driven, and none of them a public control.

- The [production API](docs/LOCAL_PRODUCTION_WORKFLOW.md) connects corpus and
  source registration → byte capture → evidence inspection → fixed Carrier
  normalization → candidate-build inspection, with stage receipts and exact
  retries. The [production path](docs/PRODUCTION_PATH.md) at `/production` drives
  it and names every blocker.
- [Evidence intake](docs/LOCAL_EVIDENCE_INTAKE.md),
  [normalization](docs/LOCAL_NORMALIZATION.md) and
  [candidate builds](docs/LOCAL_CANDIDATE_BUILDS.md) each evaluate their own
  permission and produce unadmitted candidates or a recorded quarantine.
- The [pinned GAT IFC inspector](docs/GAT_INSPECTOR.md) audits preserved IFC
  evidence through an exactly pinned engine and keeps the original report, a safe
  projection and an execution receipt as distinct identities.
- The [FMCSA connector](docs/LOCAL_SOURCE_CONNECTORS.md) and the
  [Samsara adapter](docs/SAMSARA_CONNECTOR.md) are operator-only and bounded.
  Collection requires a flag the operator holds; historical inspection never
  reconnects. The [21-source program](docs/SOURCE_CONNECTION_PROGRAM.md) records
  what each subsequent connector is blocked on.
- Local [observation replay](docs/RECORDED_OBSERVATION_REPLAY.md), the
  [scalar benchmark](docs/SCIENTIFIC_BASELINE.md), the
  [registration experiment](docs/REGISTRATION_ACCESS.md) and the
  [clearance experiment](docs/CLEARANCE_VOI.md) run on explicitly synthetic
  inputs and retain evidence-bound runs. None claims fusion, accuracy, admission
  or field validation.
- A [Rust notation state kernel](docs/LOCAL_NOTATION_STATE_KERNEL.md) backs
  `/notations`: stable-ID notations, explicit relations, undo and redo, versioned
  local saves. Authored workspace state, never canonical corpus state.

## Run

```
npm install
npm run dev            # http://localhost:3000 → /releases; coordination is read-only
npm run dev:coordination # http://127.0.0.1:3000; local stable and board writes enabled
npm run dev:state-kernel # http://127.0.0.1:3000/notations; requires Rust, local notation state enabled
npm run dev:production # local acquisition/inspection APIs; GAT requires separate pinned bootstrap
npm run agent:contract-review -- --once # in a second terminal; register and run a local review pass
npm run build && npm start
```

The state-kernel launcher builds the locked Rust crate before enabling the loopback workspace. Preview does not save; Save revalidates against the exact saved base version, and Reload checks every stored version through Rust. Local notation history lives separately in `.payload/notation-state`. No production identity, permissions service, corpus admission or customer delivery is supplied by this milestone.

The coordination launcher binds to `127.0.0.1` and uses `PORT` when set, otherwise port 3000. Visit `/agents` to inspect and register definitions and `/board` to post, reply and acknowledge. Local history persists in the git-ignored `.payload/coordination/events.json`. Selecting an author simulates an identity; it is not authentication. The same `GET` / `POST /api/coordination` JSON interface and `GET /api/coordination/inbox` are available to C++, Rust, Python and JavaScript clients; dependency-free JavaScript and Python clients are included under `clients/`.

Run the contract reviewer once to register `agent.contract-review.v1`, post a directed `REQUEST` with topic `contract-review` and body `{"participantId":"agent.release"}`, then run it again to receive a result. `--watch` repeats passes with a two-second wait. Each pending-work pass starts its inbox scan at zero; durable acknowledgements exclude handled inputs. `PAYLOAD_COORDINATION_URL` selects the worker's local server URL. See [Agent coordination](docs/AGENT_COORDINATION.md) for the two-terminal workflow, client examples, cursor semantics and recovery behavior.

To exercise local evidence intake without a web server, use the included synthetic notice:

```sh
npm run evidence -- capture --request examples/evidence/request.json --input examples/evidence/notice.txt
npm run evidence -- inspect --acquisition demo-caravan-local-notice-001
```

The default store is `.payload/evidence`; `--root <directory>` selects another local root. An identical retry returns the original acquisition and timestamp; a changed valid, policy-allowed request under the same id conflicts, while invalid requests fail earlier checks. Inspection recomputes policy at the original capture time and byte/receipt integrity without returning raw bytes or modifying storage. It grants no current access or retention permission and checks no subsequent external revocation. Inputs are bounded at 8 MiB and metadata at 64 KiB. See [Local evidence intake](docs/LOCAL_EVIDENCE_INTAKE.md) for exact status, storage and recovery boundaries. The declaration is not independent authorization, and the local files are not production storage or canonical corpus state.

To exercise the separate normalized-candidate path, use the synthetic Carrier example, whose declaration permits both ingestion and derivation:

```sh
npm run evidence -- capture --request examples/carrier/acquisition.json --input examples/carrier/source.json
npm run evidence -- normalize --request examples/carrier/normalization.json
npm run evidence -- inspect-normalization --normalization demo-caravan-carrier-normalization-001
```

Use the same store root for all three commands. This fixed adapter parses captured UTF-8 JSON up to 64 KiB, preserves source-scoped identity and explicit missingness, and leaves canonical identity unresolved. A contract mismatch records a quarantine with no candidate; source bytes are not moved. Normalization and inspection return JSON with exit `0` for a normalized run, `2` for a persisted quarantine and `1` for an error. Inspection recomputes the parser and original declared DERIVE decision, not a current access grant. See [Local normalization](docs/LOCAL_NORMALIZATION.md) for the exact schema, historical retries, provenance and nonclaims. The original notice remains ingestion-only.

Then select 1–64 normalization ids in an explicit candidate-build request. Set its `knownThrough` at or after each candidate's knowledge time and no later than the build time:

```sh
npm run evidence -- build-candidates --request <manifest.json>
npm run evidence -- inspect-candidate-build --build <build-id>
```

The builder reopens every selected normalization and its source bytes, rejects missing/quarantined members and duplicate source-scoped identities, and persists references and metadata without copying candidate data fields. It does not scan for members or choose a current version. Reordered identical requests preserve the original build and time; inspection recomputes the original decisions without granting current access. Builds remain `UNADMITTED` and do not feed the public API. See [Local candidate builds](docs/LOCAL_CANDIDATE_BUILDS.md) for the request shape, cutoff, source-class and DERIVE rules, storage limits and recovery behavior.

`npm run evidence -- compare-candidate-builds --request <manifest.json>` compares two inspected local builds by exact source-id/source-record-id tuples and normalization/candidate references. It requires full build digests, identical definition/contract/purpose and nondecreasing build/cutoff times. The deterministic report is not saved and includes no invented comparison time; it distinguishes reference changes without inferring field changes, corrections or retractions. Source identifiers are included, but raw bytes, candidate fields and policy bodies are not. See [Local candidate comparison](docs/LOCAL_CANDIDATE_COMPARISON.md) for the request template and limits. This creates no new build, current-use grant, board post or released change feed.

With the local coordination server running, `npm run agent:candidate-build-review -- --once` registers a separate build-inspection worker. Send it a directed request with topic `candidate-build-review`, `context: null` and exact JSON body `{ "buildId": "…", "expectedDigest": "sha256:…" }`, using the full `build.digest` returned by inspection, not `recordsRoot`. Run it again to obtain a redacted build-level result and acknowledgement. Its evidence root is selected only by the operator's `--root` flag, not the message. Saved results are validated and read back before acknowledgement; a failed receipt reuses the historical observation, while a new request obtains a new inspection. See [Candidate-build review worker](docs/CANDIDATE_BUILD_REVIEW_WORKER.md) for the complete client example, loopback-only configuration and simulated-identity limits. This grants no current retrieval rights or admission authority.

## Check

```
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest: node tests for selectors/fixtures, jsdom tests for screens
python -m unittest discover -s tests/python -v # standard-library coordination client checks
npm run stamp:digests  # recompute committed sha256 digests after editing a fixture
npm run e2e            # playwright: smoke, axe (WCAG 2.2 AA), keyboard, mobile, no horizontal document overflow
npm run screenshots    # writes docs/screenshots/*.png
npm run mcp            # MCP server over the fixture feed (stdio)
```

Playwright uses the environment's Chromium when `PW_CHROMIUM_PATH` is set (for example `/opt/pw-browsers/chromium`); otherwise its own download.

## Read

- `docs/ECONOMIC_ARCHITECTURE.md` — authoritative positioning: the information manufacturer, two operating businesses, a separately governed principal-capital activity, and how this repository reflects each.
- `docs/PHASE0_RECON.md` — what the sibling repositories contain, verbatim vocabulary, conflicts, recorded ambiguities.
- `docs/COMPANY_MANDATE.md` — the company mandate, customer categories, economic architecture, and Payload OS product structure.
- `docs/SYNTHESIZED_ARCHITECTURE.md` — five fabrics, seven doctrine invariants, historical concept mapping and target runtime/projection responsibilities; implemented boundaries are explicit.
- `docs/PROJECTION_FABRIC.md` — exact fixture ProjectionSpec, read-only preview example, identity-preserving records/graph, rights/time gates and explicit missing geometry; no renderer implementation.
- `docs/UX_ARCHITECTURE.md` — object model, navigation, projections, component boundaries, the authority boundary.
- `docs/WORKSPACE_DESIGN.md` — the design language, the one shell, the inspector pattern, the notation and candidate-production slices built on it, and the verification receipt.
- `docs/PRODUCTION_PATH.md` — the production path: seven stages with states derived from the rail's receipts, identities and recovery, the real source readback, the notation and release blockers, and the receipt.
- `docs/EARTH_TWIN.md` — the Payload OS Earth Twin: the projection fabric's CesiumJS instrument built on God's Eye View's globe stack, keyless and offline, with every layer's source and state, the corpus asked for honestly, the signal-source registry, the staged plan and the receipt.
- `docs/AGENT_COORDINATION.md` — the shared agent/apparatus stable, scoped board and inbox, contract synastry, JavaScript/Python clients, local worker and Bench references.
- `docs/LOCAL_EVIDENCE_INTAKE.md` — local source-policy evaluation, content-addressed evidence, acquisition receipts, inspection and Bench-derived boundaries.
- `docs/LOCAL_SOURCE_CONNECTORS.md` — operator-only live FMCSA Company Census qualification, strict transport, original-byte capture, permanent request bounds and historical inspection.
- `docs/SAMSARA_CONNECTOR.md` — offline-tested, operator-only single-vehicle GPS history; retained fleet authorization, current-use gates, private-storage limits and source observation semantics. No live fleet qualification.
- `docs/CLEARANCE_VOI.md` — exact finite-state measurement design, shared geometric dependencies, loss/cost comparisons, hypothetical posterior inspector and current-use-gated local evidence runs.
- `docs/SOURCE_CONNECTION_PROGRAM.md` — 21-source market-value queue, exact initial scope, access/rights blockers and sequential acceptance requirements.
- `docs/LOCAL_NORMALIZATION.md` — fixed Caravan Carrier parsing, separate derivation permission, source-scoped candidates, quarantine and read-only recomputation.
- `docs/LOCAL_CANDIDATE_BUILDS.md` — explicit time-bounded candidate membership, build-time derivation permission, reference roots and historical inspection; no canonical admission.
- `docs/LOCAL_CANDIDATE_COMPARISON.md` — read-only exact local build comparison, source-scoped reference changes and deterministic ephemeral reports; no semantic diff or released change feed.
- `docs/LOCAL_NOTATION_STATE_KERNEL.md` — Rust notation commands, undo/redo, versioned local storage and the complete frontend save/reload milestone; no Bevy or canonical admission.
- `docs/CANDIDATE_BUILD_REVIEW_WORKER.md` — manually launched board-to-local-build inspection, bounded results, result-before-receipt recovery and authority limits.
- `docs/INTERACTION_SPEC.md` — status transitions, refusal interaction, replay, supersession, visibility.
- `docs/DEMO_CASE.md` — the fixtures, why they are synthetic, what they demonstrate, what is unvalidated.
- `docs/STORAGE.md` — six classes of information, the store each asks for, the invariant each must not break, and the sequence in which one earns its place.
- `docs/CORRECTION_AND_IDENTITY.md` — downstream invalidation per class of derived artifact, the delivery ledger, as-of as a contract feature, and the identity core with the absent cross-line join.
- `docs/METERING.md` — the lap, the two halves of a response receipt, the metering boundary, and the federation risk stated as work to do.
- `docs/SPATIAL_DERIVATION.md` — space as resolver, join key, validity clock and inference engine; the cell key bounded by stated uncertainty; the three sensor families and the semantic convergence that is the actual gap.
- `docs/ESTIMATION.md` — constraints as observations with provenance, the factor graph they live in, the two disciplines written before the first solve, and the four tiers of invariant scoring with the reference channel they must never feed.
- `docs/MARITIME.md` — the vessel as state rather than feed, dispatch as a prior, the port as a time-indexed set, and the closure residual that a single-channel holder cannot produce.
- `docs/CARRIER_AND_CONGRUENCE.md` — the punch card rather than the proof, the archival test, congruence as one name for three mechanisms, the direction of authority in interoperation, the serving boundary, and the three rules a reasoner is held to.

## Layout

```
src/domain      corpus types and as-of selectors (corpus.ts); the operating model as data (product.ts); workbench view model and selectors; domains
                and the system's own claims as data with tests over them: doctrine, storage, correction, identity, metering, spatialKey, spatialDerivation,
                sensorFamilies, earthComplex, usdProjection, constraints, factorGraph, invariantScoring, eventClosure, vessel, portSet, admission,
                responsePipeline, computationCard, computationCarrier, servingBoundary, reasoningWitness, referenceGround, actuarial, legacyTrade
src/adapter     CorpusSource and CaseSource seams; feed payload builders; fixture implementations only
src/projection  closed ProjectionSpec, full fixture-source snapshot descriptor and replaceable records/graph compiler; engine routing only, no renderer dependencies
native/state-kernel small Rust notation command/replay kernel; stable IDs, explicit relations and inverse history, no renderer or filesystem
src/state-kernel fixed native-process adapter, loopback contract and immutable local saved versions; not domain canonical state
src/data-os     Bench-derived source policy/capture, local evidence store, fixed Carrier parser, candidate builds and read-only reference comparison; no canonical corpus admission
src/acquisition operator-only source requests, fixed FMCSA and Samsara HTTPS transports, source parsers, immutable capture history and CLIs; no customer API
src/coordination agent/apparatus definitions, scope and message rules, contract matching, participant inbox, deterministic contract/build-inspection workers and opt-in local event log
clients         dependency-free JavaScript and Python coordination clients
scripts         local server launcher, contract-review and candidate-build-review workers; evidence intake/normalization/candidate-build entry points
examples/evidence synthetic notice and operator-declared intake manifest
examples/carrier synthetic Carrier JSON, acquisition declaration and normalization request
src/mcp         MCP tools over the same feed payloads, and the stdio server
src/domain/informationProduct.ts  the first information product as data, held to the corpus by its test: every field exists, every released record meets the stated evidence requirement, the customer question is answerable through the feed at two knowledge times
src/domain/deliveredRecord.ts     the ten questions a delivered record answers, mapped to payload fields; its test holds every record the feed delivers to all ten
src/domain/doctrine.ts   the architecture carried forward as data: five fabrics, three states of information, seven rules with where each is enforced and which tests prove it, verification tiers (docs/ARCHITECTURE.md is the prose; /model renders it)
src/domain/projection.ts the projection instruments' questions and roles and the routing table as data, over the one router in src/projection/spec.ts; a test checks the table against the router for every combination
src/architecture.test.ts structural doctrine: browser and page layers take only types and the pure policy evaluator from the rails; the rails import nothing from above; every projection leaves the corpus untouched and identities intact
src/fixtures/production  the candidate-production demonstration: pipeline.ts runs examples/ through the real local rails at fixed instants; demo.json is its committed output, drift-tested and separation-tested
src/fixtures    Caravan corpus releases, records, retractions and rights; profile and cases; manifest builder; digest plan; committed digests
src/components  primitives, case workspace, ruling viewer, replay, queue, intake, shell
src/app         operating model: /model (a permanent redirect from /product)
                corpus: /releases, /releases/[releaseId], /stream, /retractions, /api, /api/v1/* (fixture feed)
                workbench: /cases, /cases/new, /cases/[caseId], /rulings, /rulings/[rulingId], /replay/[caseId], /profiles, /evidence
                coordination: /agents, /board, /api/coordination, /api/coordination/inbox (read-only fixtures or local sandbox)
                product: /products (the first information product, caravan.lot-state.v0: customer question, subjects, fields with evidence requirements, freshness, permitted uses, correction at two knowledge times, the ten-question delivered-record contract, the acceptance target)
                production: /candidates (the local rail's acquisitions, normalizations, candidate build and refusals, all UNADMITTED; reproduced from examples/ by npm run stamp:production)
                projection: /api/projections/sources/[releaseId] (descriptor GET), /api/projections/preview (read-only POST over pinned fixture releases)
                instruments: /earth (Earth Twin, with the derivation beneath the globe), /spatial, /compute/registration, /compute/clearance, /compute/observations, /replay, /frontier, /factoring, /dispatch-liability
tests/e2e       Playwright smoke, accessibility, keyboard, mobile, overflow guard, screenshots
```
