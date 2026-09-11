# Open questions

Architectural decisions this repository has not taken. Every entry below was a
`- [ ]` box in `docs/architecture-map/`, an Obsidian canvas built on
2026-09-06 for brainstorming and last revised at `a728d3d` (2026-09-08). The map is archived
under `docs/archive/architecture-map/`; the questions are here because they
were the only thing in it written down nowhere else.

`docs/` records decisions taken. This records the ones outstanding, which is a
different and shorter list, and one that should get shorter rather than longer.

**115 questions across 63 parts.** None has been ticked. A question
answered here should be struck from this file and the answer recorded wherever
the decision lives — a module header, a doc, or a constraint.

The status beside each part is the one the archived card carried when it was
last revised, and several are stale: the Admission authority card said
`ABSENT` while `src/domain/admission.ts` had been 405 lines for a day. Read
a status as evidence about 2026-09-08, not about now.


## Acquisition Fabric — world → evidence

### Acquisition area of the workbench

*As of 2026-09-08: SURFACE*

- [ ] Does this area deserve its own page (a source-by-source coverage map) once more than one source is connected?

### Evidence capture and receipts

*As of 2026-09-08: IMPLEMENTED*

- [ ] Should every rail share one evidence store with one catalog, or keep purpose-scoped roots?
- [ ] What is the retention and recall policy for evidence a source later withdraws?

### Sensor families and the concept mapping

*As of 2026-09-08: CONTRACT ONLY · NOTHING REGISTERED · NOTHING FUSED*

- [ ] What is the first corpus concept the mapping declares, and which family's vocabulary meets it first?
- [ ] Does the vertical datum go on the geometry, or on a separate elevation object with its own transform?
- [ ] Which reanalysis product, and is its revision schedule recorded as a source property before anything is captured?
- [ ] What is the gating threshold that turns "cloudy" into "optical unavailable", and who declares it?

### Source capture store and readback

*As of 2026-09-08: IMPLEMENTED · READ-ONLY ROUTE*

- [ ] Should readback grow into a general "evidence inspector" route across all rails?

### Source rights and use evaluation

*As of 2026-09-08: IMPLEMENTED*

- [ ] Is a single instant enough, or do windows of use need their own object?
- [ ] How is APPROVAL_REQUIRED resolved, by whom, and where is that recorded?

## Application layer — the NotationsOS workbench (Next.js)

### App shell, navigation and design system

*As of 2026-09-08: IMPLEMENTED*

- [ ] Is five areas right, or does Inquiry split into investigation and instruments as it grows?

### Candidates rail

*As of 2026-09-08: IMPLEMENTED*

- [ ] Should this fold into the production path, or stay as the process view while the path is the run view?

### Case workbench

*As of 2026-09-08: IMPLEMENTED · FIXTURE CASES*

- [ ] Is the case workbench the customer's tool, an internal reviewer's tool, or a demonstration of the profile contract?

### Corpus and product pages

*As of 2026-09-08: IMPLEMENTED*

- [ ] What does a customer-facing release page need that the internal one has too much of?

### Inquiry instrument pages

*As of 2026-09-08: IMPLEMENTED · SYNTHETIC PREVIEWS*

- [ ] Which of these instruments deserve a shared "experiment" shell (request, retained run, inspector) instead of four bespoke pages?

### Notation workspace

*As of 2026-09-08: IMPLEMENTED · LOCAL AUTHORING*

- [ ] Once exact authored evidence references persist, what does a notation need to become an admission candidate?

### Observation replay surface

*As of 2026-09-08: IMPLEMENTED · SYNTHETIC PREVIEW*

- [ ] What changes in the surface when the manifest is recorded rather than synthetic: a provenance lane, a download of the exact bytes?

### Production path workspace

*As of 2026-09-08: IMPLEMENTED · REAL RAIL OR FIXTURE MODE*

- [ ] What is the release stage's first real transition once admission exists?

## Compute / Decision Fabric — derived objects, never truth by default

### Clearance value-of-information experiment

*As of 2026-09-08: IMPLEMENTED · SYNTHETIC PREVIEW*

- [ ] Which real measurement decision (a survey, a sensor placement) would this design first?

### Estimation, constraints and invariant scoring

*As of 2026-09-08: SPECIFIED · NOTHING SOLVED · NOTHING SCORED*

- [ ] Which constraint family is declared first, and does the parcel-split identity earn it by doubling as an anomaly detector?
- [ ] What is the retained shape of a filter verdict, so a reliability can be fitted from it later?
- [ ] What independent reference is actually reachable, given that no live source is acquired?
- [ ] Does the elimination ordering belong in the parameter registry beside the other pinned parameters?

### GAT IFC audit instrument

*As of 2026-09-08: PINNED ENGINE · SPECIALIST*

- [ ] Which audited quantities become corpus records, under which predicate and evidence class?

### Recorded observation replay

*As of 2026-09-08: CONTRACT + COMPILER · SYNTHETIC MANIFEST*

- [ ] What replaces the point estimate: a factor graph over the same manifest, with the same blockers vocabulary?
- [ ] Which real manifest first: Boreas, a Samsara trace, or a self-recorded session?

### Registration and access geometry

*As of 2026-09-08: IMPLEMENTED · SYNTHETIC PREVIEW*

- [ ] Should distance semantics become a named service with versions (Euclidean, geodesic, permitted-network)?

### Scalar Gaussian benchmark

*As of 2026-09-08: BASELINE · SYNTHETIC*

- [ ] What is the first non-scalar baseline, and does it reuse the benchmark store?

### Scientific model roles

*As of 2026-09-08: DOCTRINE*

- [ ] Which model family is the first to earn a service boundary, and what is its evidence contract?

### Spatial inquiry (floor access)

*As of 2026-09-08: IMPLEMENTED · MANUAL ANNOTATION*

- [ ] How does a GAT-audited IFC model become a layout with provenance instead of a manual annotation?

## Coordination layer — participants, requests, results

### Board (messages and acknowledgements)

*As of 2026-09-08: IMPLEMENTED · LOCAL POSTING*

- [ ] Which messages should become typed commands on a rail rather than prose?

### Coordination ledger and contract

*As of 2026-09-08: IMPLEMENTED · payload.coordination.v1*

- [ ] Is the ledger the right home for admission requests and approvals (APPROVAL_REQUIRED resolution)?

### Stable (agents and apparatus)

*As of 2026-09-08: IMPLEMENTED · LOCAL REGISTRATION*

- [ ] Should Codex, the Claude sessions and the founder be registered participants with contracts, so the board records their handoffs?

## Corpus Fabric — evidence → candidates, releases, products

### Candidate builds and comparison

*As of 2026-09-08: IMPLEMENTED · UNADMITTED*

- [ ] What makes a candidate "ready": a schema check, a reviewer, a profile evaluation, or all three?
- [ ] Should comparison become a correction proposal object?

### Certified release manifest and production record

*As of 2026-09-08: COMMITTED · UNSIGNED*

- [ ] Which stage statuses should be machine-derived from rail receipts instead of authored?

### Corpus object model

*As of 2026-09-08: THE PRODUCT · FIXTURE-BACKED*

- [ ] What is the canonical schema registry: one per corpus, per domain product, or shared?
- [ ] How does a record reference its evidence exactly (artifact id + digest + locator) once authored references land?

### Correction and recall machinery

*As of 2026-09-08: MODELLED · LEDGER SPECIFIED AND EMPTY*

- [ ] What is the extraction lineage object that lets a corrected record reach the compute runs that read its artifact?
- [ ] Where does admission record candidate ancestry without leaking rail identifiers into a release?
- [ ] Should a delivered-record snapshot be retained per release so product taint is a lookup rather than a recomputation?

### Identity core and cross-line join

*As of 2026-09-08: KEYS RUN ACROSS THREE LINES · RESOLUTION ABSENT*

- [ ] What exactly is in a resolution decision object, and who may issue one?
- [ ] Which link types earn their own evidence requirements first?
- [ ] At what resolution is a spatial cell useful without implying a relationship?
- [ ] Which of the four co-located pairs would a resolution decision actually be issued for, and on what evidence?

### Information products

*As of 2026-09-08: SPECIFIED · FIXTURE-COVERED*

- [ ] What is the second product, and does it share the delivered-record contract?
- [ ] How is coverage reported to a customer when a field is refused for rights reasons?

### Local production rail

*As of 2026-09-08: IMPLEMENTED · OPT-IN · LOOPBACK*

- [ ] Which commands are missing for the milestone path: ATTACH_EVIDENCE to a notation, ADMIT, RELEASE?
- [ ] Should the rail be one worker or one worker per fabric?

### Normalization adapters

*As of 2026-09-08: TWO ADAPTERS*

- [ ] What is the adapter contract that a third source could implement without touching the rail?
- [ ] Where do units, ontology and temporal reconciliation live: in adapters or in a later corpus compile step?

### Vessel state and the port set

*As of 2026-09-08: TYPED · NOTHING ACQUIRED · NOTHING ADJUDICATED*

- [ ] Which port is the base case, and what declares its berths and anchorages?
- [ ] Does a membership ruling live as a corpus record, or as its own ledger with a record projection?
- [ ] What is the minimum channel set that makes a closure residual worth retaining?

## Doctrine and governance (applies to every layer)

### Five fabrics and the architectural cycle

*As of 2026-09-08: DOCTRINE AS DATA*

- [ ] Is the State Fabric a service, a library, or a contract that several rails honour? Today it is mostly absent.
- [ ] Where does "Act" live in this repository? Nothing acts yet; is that the right boundary for a corpus company?

### Semantic separations kept in every surface

*As of 2026-09-08: HOUSE VOCABULARY*

- [ ] Which separations should become closed vocabularies in contracts rather than conventions in prose?
- [ ] Is there a separation missing for "synthetic input vs recorded input" beyond the replay surface?

### Seven doctrine rules and their enforcement

*As of 2026-09-08: BOUND · TESTED*

- [ ] Which rule would a real admission service most easily break, and what test would catch it?
- [ ] Should the rules be checked at runtime (a validator at the boundary) as well as in tests?

### The computation carrier and congruence

*As of 2026-09-08: DOCTRINE · TWO OF FOUR CARD PROPERTIES · NOTHING EXPORTED*

- [ ] What is the one run shape, and which of the five existing shapes does it generalise?
- [ ] Does the decoding specification live in this repository, or does it have to live outside it to mean anything?
- [ ] Which computation classes cross the ruling boundary first, and therefore earn a card first?

### Verification tiers V0–V5

*As of 2026-09-08: V0, V1 REACHED*

- [ ] What is the smallest step to V2: a signing key policy, a release signer, or a manifest countersignature by a second process?
- [ ] Which customer would value V3 first, and on which corpus?

## Firm, domain products and customers

### Customers and distribution channels

*As of 2026-09-08: DECLARED*

- [ ] Which channel is validated first: the feed, the MCP tools, or a report?
- [ ] What does a customer need to see in a release to trust a correction?

### Domain products (Caravan, Tradewind, Landshark)

*As of 2026-09-08: THE THREE FLAGSHIP PRODUCTS · ALL THREE CARRY A CORPUS*

- [ ] What is the first Tradewind or Landshark source whose rights are actually clear, and can be captured rather than declared?
- [ ] Which corpus objects are shared across the three products, and which are domain-specific?

### Notation Systems and NotationsOS

*As of 2026-09-08: AUTHORITATIVE POSITIONING*

- [ ] Which corpus is the first one a customer can rely on end to end, and what is its release cadence?
- [ ] What is the minimum "finished inventory" that justifies a first paid feed?

### The serving boundary and the reasoner

*As of 2026-09-08: SPECIFIED · NOTHING ENFORCED · NO CALLER IDENTIFIED*

- [ ] What is the smallest honest purpose vocabulary, and who validates a declaration?
- [ ] Does an identified caller arrive with the first customer, or before one as a precondition?
- [ ] Which of the three reasoner rules is enforceable at the tool boundary rather than in a prompt?

### Usage as telemetry

*As of 2026-09-08: MODELLED · NOTHING METERED · EVENT HALF ABSENT*

- [ ] What issues a response id, and does it belong in the envelope, a header, or both?
- [ ] Is the response digest over the payload as sent, or over the selection that produced it?
- [ ] Does an identified caller arrive before or with the first real customer?

## Projection Fabric — representations, APIs and instruments

### Corpus feed API v1

*As of 2026-09-08: IMPLEMENTED · FIXTURE-BACKED*

- [ ] What is the versioning and deprecation contract for the feed once a real corpus ships?

### Earth Twin (CesiumJS)

*As of 2026-09-08: PRESENT · KEYLESS · OFFLINE*

- [ ] What is the first evidence-backed geography beyond declared positions: a Samsara trace, a facility footprint?

### MCP server and tools

*As of 2026-09-08: IMPLEMENTED · STDIO*

- [ ] Which customer agent workflow is the first to consume the tools, and what refusal shapes does it need?

### Projection spec and compiler

*As of 2026-09-08: IMPLEMENTED · READ-ONLY*

- [ ] Which projection is next after GLOBE: MAP over observations, GRAPH over record incidence, or TIME?

### Ruling projections and result manifests

*As of 2026-09-08: IMPLEMENTED · FIXTURE CASES*

- [ ] Should the relying-party projection become a feed endpoint with its own rights evaluation?

### Scene interchange and the learned tier

*As of 2026-09-08: ROUTED · NOTHING WRITTEN · NOTHING EMBEDDED*

- [ ] What is the uncertainty encoding, concretely: sibling extent prims, material, or both?
- [ ] Does a prim path wait for the resolution decision, or start per subject and accept a migration?
- [ ] What is the interpolation mode for a time sample whose value holds over an interval and is undefined outside it?
- [ ] What renders void, visually, so absence reads as absence rather than as background?

## Runtimes, local stores and verification

### Runtimes and local stores

*As of 2026-09-08: NODE · RUST · PYTHON*

- [ ] Which rails should move from per-command processes to a long-lived local service, and what would that change about receipts?
- [ ] Do the `.payload/` roots need a single catalog?

### Sibling repositories and vendored contracts

*As of 2026-09-08: PINNED · READ-ONLY*

- [ ] When does the corpus contract move from a vendored copy to a published package, and who owns the version?

### Storage (polyglot persistence)

*As of 2026-09-08: ONE STORE SELECTED · FIVE DECLARED*

- [ ] Which class earns a real store first, and what volume makes local files stop being enough?
- [ ] Does the object store come before or after the admission authority, given it is the only class already at volume?
- [ ] Where do frames and transforms live so a coordinate is never separated from what produced it?

### Verification harness

*As of 2026-09-08: GREEN ON THE BRANCH*

- [ ] Which checks should run against a recorded (non-synthetic) manifest once one exists?
- [ ] Is a nightly full run worth the machine, or is per-push enough?

## Space as a working dimension

### Spatial derivation programme

*As of 2026-09-08: STATED · ONE OF SIX BUILT*

- [ ] Which single place and week make the strongest flow-through-geometry demonstration?
- [ ] Does a region become a first-class corpus object, or a query parameter with a receipt?
- [ ] What are the stated semantics of a detector's confidence, so it is a parameter rather than a number?

### Spatial key and geometric verdict

*As of 2026-09-08: BUILT · POINTS ONLY · NO RESOLUTION DECISION*

- [ ] Does the resolution bound belong on the key, or should a record carry its supportable precision as a field?
- [ ] When areal geometry arrives, is a boundary keyed by its covering cells or by a single containing cell?
- [ ] Should a `DISJOINT` verdict be retained as a recorded negative decision, or recomputed each time?

## State Fabric — validation, admission and canonical versions

### Admission authority

*As of 2026-09-08: PRESENT — superseded 2026-09-07, card not resynced*

- [ ] What does the admission contract take: candidate reference, profile, evidence references, reviewer identity, two clocks? What does it return: version, refusal, or approval-required?
- [ ] Is admission per record, per build, or per release?
- [ ] Who can run it, and where is its receipt retained?

### Notation state kernel (Rust)

*As of 2026-09-08: PRESENT · LOCAL · AUTHORED STATE ONLY*

- [ ] Does the future canonical `VersionStore` reuse this kernel's replay model, or is corpus state a different kernel?
- [ ] When does per-command process launch become the bottleneck, and is a resident kernel worth it?

### Three states of information (E, K, I)

*As of 2026-09-08: DOCTRINE AS DATA*

- [ ] Should every object carry its state letter as a field so a surface can never mislabel it?

## World: sources, rights and recorded material

### Demonstration corpus and Carrier fixtures

*As of 2026-09-08: FIXTURE · SYNTHETIC*

- [ ] Which fixture should be replaced first by real captured material, and what breaks when it is?

### FMCSA Company Census connector

*As of 2026-09-08: BOUNDED · LIVE-QUALIFIED · OPERATOR ONLY*

- [ ] What does "the same carrier, two captures, one correction" look like for this source?
- [ ] Which Census fields deserve a product predicate, and with what uncertainty semantics?

### Recorded dataset candidate (Boreas)

*As of 2026-09-08: CANDIDATE · NOT_IMPORTED*

- [ ] Is Boreas the right first recorded case, or is a smaller self-recorded session more checkable?
- [ ] What is the acceptance test for "independently checkable"?

### Samsara vehicle GPS connector

*As of 2026-09-08: BOUNDED · CREDENTIAL-GATED · NOT RUN HERE*

- [ ] Once captured, which product question does a GPS trace answer (movement, dwell, exposure), and for which customer?
- [ ] How do Samsara timestamps map onto the replay contract's clocks?

### Source inventory and connection queue

*As of 2026-09-08: 21 INVENTORIED · 1 CONNECTED*

- [ ] Which is the next source whose rights can be settled without a contract?
- [ ] Should readiness be a machine-checked state rather than a document column?
