# Regulatory Manager

The Regulatory Manager is Payload OS's external government-observation layer. It turns retained source captures into grouped regulatory events and review proposals for the firm's systems without treating an observed publication as accepted fact.

Its pipeline is:

```
official source -> immutable capture -> normalized observations -> event clusters
                -> declared source independence -> conflicts -> review proposals
```

The resulting proposals can ask four consumers to reassess tracked state:

| Target | What the proposal asks it to reconsider |
| --- | --- |
| `PAYLOAD_CAPABILITY_GRAPH` | Capability availability, compliance conditions, timing and operating cost |
| `COMMERCIAL_AGENT` | Buyer obligations, public funding, procurement signals and emerging operating needs |
| `NOTATIONS_TERMINAL` | A market narrative to investigate beside measured market and liquidity evidence |
| `ENTERPRISE_APPARATUS` | Organization, project and system assumptions affected by government action |

Every proposal is `PENDING_HUMAN_REVIEW`, carries its observation IDs and required evidence, has a null proposed state, and declares `stateMutation: false`. The manager never admits a record, changes canonical state, authorizes an action or establishes legal effect.

## What the project already had

Payload OS already contained most of the hard boundaries this subsystem needs:

- The statutory harvester captures, extracts and rules on supplied insurance-regulator documents under a declared grammar.
- The acquisition layer pins the FL OIR, CA CDI and TX TDI hosts, supports bounded schedules, stores original bytes before parsing and reopens history without contacting the source.
- The source transport refuses redirects, private destinations, response ambiguity and excessive bodies.
- The coordination board already supports local agents that post a result before acknowledging their input.
- The terminal now has authenticated identities, scoped reads and reviewed durable computation.

What was absent was a source-neutral record of a regulatory event and a process that groups coverage, keeps common origins from counting as independent confirmations, detects conflicts, applies a knowledge horizon and proposes downstream work.

## Federal Register capture

`src/acquisition/federalRegister.ts` adds the first broad change-feed adapter. It pins `www.federalregister.gov/api/v1/documents.json`, accepts only a newest-first publication-date query of at most 31 days and 100 results, and uses the shared capture store and its permanent request budgets.

FederalRegister.gov documents are classified as `OFFICIAL_GOVERNMENT_MIRROR`, not as an official legal edition. The site's own [API documentation](https://www.federalregister.gov/developers/documentation/api/v1) says the API is public and keyless, and the same page's legal-status notice says the site is an informational rendition and directs legal reliance to the official edition. The adapter therefore preserves source links and stated dates while returning `legalEffectEstablished: false`.

An operator can capture one bounded window:

```powershell
$env:PAYLOAD_SOURCE_COLLECTION = '1'
npm run source -- federal-register-capture --request examples/regulatory/federal-register-request.json
Remove-Item Env:PAYLOAD_SOURCE_COLLECTION
```

Historical inspection performs no network request:

```powershell
npm run source -- federal-register-inspect --request-id federal-register-2026-09-12
```

The capture response's `acquisition.contentDigest` is the evidence reference a Regulatory Manager request must pin. A changed or missing digest is refused rather than silently replaced with the latest capture.

## Observation contract

`payload.regulatory-observation.v1` retains:

- source ID, source class, stable source-item ID and HTTPS URL;
- publication and collection times;
- immutable evidence digest and artifact ID;
- jurisdiction, authority, instrument identity, kind and title;
- event kind, stated effective time, source statement and optional normalized value;
- associated entities and topics;
- `independenceKey`, which names the common origin behind coverage.

The event vocabulary covers rules, proposed rules, notices, executive actions, bills, enacted law, amendments, repeal, injunctions, appropriations, contract awards, grants and sanctions. The Federal Register bridge currently produces rules, proposed rules, notices and presidential documents. Legislation, procurement, grant and sanction feeds can enter the same manager contract when their official-source adapters are added.

## Grouping and corroboration

The manager groups observations by jurisdiction, instrument identity and event kind. Repeat captures keep the same source-item identity. Reports, social posts and wire stories derived from one government release must share its `independenceKey`, so ten copies remain one declared origin.

Support is descriptive:

- `SINGLE_SOURCE`
- `REPEATED_ONE_ORIGIN`
- `INDEPENDENT_SUPPORT_WITHOUT_PRIMARY`
- `PRIMARY_AND_INDEPENDENT_SUPPORT`
- `OFFICIAL_LEGAL_TEXT_OBSERVED`
- `CONFLICTED`

These labels describe the supplied evidence graph. They are not truth grades. Differing non-null effective dates or normalized asserted values create `CONFLICTED`; the cluster exposes the values and every proposal requires conflict resolution.

## Agent operation

`agent.regulatory-manager.v1` is a local derived agent. It accepts a board request that pins a Federal Register capture ID, content digest, knowledge horizon and watch definitions. It reads the retained capture, runs the manager, posts a bounded result, reads that result back and only then acknowledges the request. It does not fetch a source itself.

Start the local coordination service, post a request shaped like `examples/regulatory/agent-request.json` after replacing the digest, and run:

```powershell
npm run agent:regulatory -- --once
```

Use `--watch` for bounded polling of the local board. The agent's output contains counts, the manager report digest and up to ten proposal summaries. Larger reports stay represented by exact counts and an omitted-proposal count rather than overflowing the coordination message.

## Current boundary and next sources

This integration implements the bounded FederalRegister.gov API contract and verifies it with offline fixtures, including the zero-result response shape. The source branch reported a prior live capture; that provider interaction was not repeated or independently qualified during this port. A successful capture establishes only what the mirror returned: collection remains operator-enabled, the source registration is an internal qualification with republication review open, and every resulting state proposal still requires review.

The implementation was selectively integrated from commit `365aa29cb7588ab8fa5afb6ed4ed8a528787e69a` on `codex/regulatory-manager`. The shared immutable capture rail, terminal authentication and grant authority remain unchanged. Invalid non-null PDF links are quarantined instead of becoming missing links, and a newly posted agent result must read back exactly before its request is acknowledged. The agent uses only the existing local sandbox board; it is not an internal-deployment Bearer worker or a second terminal control plane.

The next source work should add official adapters in this order:

1. An official legislation status feed, so introduction, passage, assent and commencement remain distinct events.
2. Official procurement and award feeds, with award amount, recipient identity and modification history kept separate.
3. Budget, grant and subsidy flows, preserving authorization, obligation and disbursement as different states.
4. Sanctions and trade-policy lists, with effective and revocation times.
5. Secondary reporting and social sources, used for discovery and corroboration only after their common-origin keys are made explicit.

None of those adapters should gain a second HTTP transport or a private admission path. They should use the shared immutable capture rail and feed the same review-gated manager contract.
