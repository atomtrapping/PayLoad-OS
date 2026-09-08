# Boutique observation-product milestone

Notation Systems Inc. is an information technology company. We transform, organize, and license real-world data and analytics for business, risk, and market applications.

NotationsOS is the internal preparation system. This increment consolidates the reviewed frontend baseline `6dd691a` into `codex/payload-os-foundation`, preserving the foundation history and existing local artifacts. It repairs persistence and catalog boundaries and adds an operator-only observation-package workflow. It does **not** claim a licensed customer delivery or a completed pilot.

## Product and present authority

`caravan.company-census-observations`, specification 1.0.0, asks what a selected Company Census response reported about particular corporate USDOT identifiers, when it was captured, and which reported fields changed between captures. The contemplated buyers remain physical-economy brokers, asset/portfolio managers, and insurance/financing firms. Market demand for this particular package is not validated.

The profile selects at most 64 exact members of an existing FMCSA v2 candidate build. It requires complete dependency readback, an exact source identifier, current INTERNAL DERIVE permission for `source-qualification`, and captures no more than seven days old when beginning or resuming unfinished publication. It permits explicit missingness and unknown world-valid time. This is acceptance of a faithful internal observation package, **not canonical admission of physical-world facts**. The candidates remain UNADMITTED.

The retained FMCSA registration allows only internal source qualification. It does not establish unrestricted internal commercial use or customer export. `request-delivery` therefore writes a **refused attempt**, never a successful delivery receipt, and emits no data. A different commercial source-use basis, customer agreement and verified delivery integration are still required. No code change here grants those rights.

## Complete local path

```text
Exact retained FMCSA capture
  → original normalization and exact v2 candidate build
  → versioned observation-product profile
  → current internal-use check + quality checks
  → immutable package artifacts and release manifest
  → fresh-process readback and field-level vintage comparison
  → customer-export refusal under the current qualification policy
```

Each package has `records.jsonl`, `records.csv`, `dictionary.json`, `quality.json`, `changes.json`, and `terms.txt`, committed by `release.json`. `intent.json` records the original accepted request and clock. Publication is create-only, uses the existing bounded local-file primitives, and writes the release manifest last. A partial publication is unavailable until completed; an exact retry uses the retained intent. Changed requests, missing dependencies, altered bytes and rehashed unsupported claims fail rather than repairing history.

`releasedAt` is the original accepted intent time, not an independently observed filesystem-completion or customer-delivery time. A resumed incomplete build checks permissions and selected-capture freshness again at the invocation clock. Completed historical inspection/retry reproduces the original decisions; it does not renew present use permissions. Predecessor histories are recomputed with a 32-release bound and cycle refusal.

An unfinished comparison also rechecks current DERIVE permission for the preceding vintage; historical comparison inputs do not inherit the new-capture freshness limit. A new delivery attempt cannot be recorded before the release exists.

The initial v1 package format retains a specification-level dictionary. The v2 request/release format adds a complete column dictionary: all 15 source fields and all 79 CSV columns, including raw/presence/value/unit/interpretation. Both formats retain the same product specification and remain reproducible; v1 bytes are never rewritten to upgrade their dictionary.

JSONL is the exact normalized representation, including lineage and nulls. CSV is an explicitly declared spreadsheet view: formula/control-prefixed source strings are apostrophe-prefixed; presence and interpretation columns distinguish null, omitted and unresolved values. Numeric zero remains present. Geography remains reported country/state codes; filing dates remain date-only values; neither becomes precise geometry or an invented effective interval.

## Operator commands

```powershell
npm run boutique -- spec
npm run boutique -- build --request examples/sources/fmcsa-company-census-package.json
npm run boutique -- inspect --package-id fmcsa-census-80806-qualification-package-v1
npm run boutique -- build --request examples/sources/fmcsa-company-census-second-package.json
npm run boutique -- inspect --package-id fmcsa-census-80806-qualification-package-v2
npm run boutique -- request-delivery --request examples/sources/fmcsa-company-census-delivery-refusal.json
```

These requests pin actual retained local history. A fresh clone cannot recreate that history from hashes alone. Missing evidence must remain unavailable; do not change digests or substitute synthetic records to satisfy a request. Other authorized observations need their own capture, normalization, build and package requests.

The default root is `.payload/source-qualification`; `--root` or `PAYLOAD_SOURCE_QUALIFICATION_DIR` chooses the operator-owned evidence repository. No HTTP path, customer-selected filesystem root, automatic collection, or public package download is introduced. Package history remains ignored by Git and excluded from deployment assets. Production custody, access controls, backups and retention enforcement must be provisioned before using this local filesystem pattern for commercial/private inventory.

Exit 0 indicates a confirmed build/inspection; exit 2 indicates a retained customer-delivery refusal; exit 1 indicates request, permission, integrity or storage failure. An identical delivery-attempt retry returns its original historical refusal; a new current decision requires a new attempt ID. No command contacts or notifies a customer.

The example refusal names a synthetic recipient, not a customer. Executed at `2026-09-08T05:31:12.299Z`, it retained `sha256:407a34c6ff788142b89e87160baca41c9e5db3e0c2a4e1816ae92dfc7c32f5d7` with `dataEmitted: false` and `customerDelivered: false`. A separate process reproduced the same refusal and the CLI's exit code 2.

## Two executed real vintages

The previously retained 371-byte USDOT 80806 capture was packaged on 2026-09-08 at `05:13:13.612Z`. One new bounded Company Census request for the same corporate identifier was captured at `05:14:57.439Z`, normalized at `05:19:07.539Z`, built at `05:20:26.293Z`, and packaged at `05:22:22.784Z`.

| Artifact | Exact digest |
|---|---|
| Source bytes, both captures | `sha256:cf37d1d04131c3d0ccca0098d8f202c170eb094004efdafd9a9486f34f3b2095` |
| First internal package | `sha256:3e1ba43e16bacb44ab905328bf5c564d5252bb4677c6a3d88f4b088cdaf5f49d` |
| Second capture receipt | `sha256:618393dd557ed60586dae8188d6a198b9451914e0ff66ee55e96382c664a9d91` |
| Second normalization | `sha256:b7a65b64544b32e9cc112fe41e474fdbe07dac31bc5f510908d87199285f30ec` |
| Second candidate build | `sha256:0d2d40afeea923ca7e32f284f8b34d0bdbc6abd919ed22637b24d2a4aa89dd71` |
| Second internal package | `sha256:a8d4819a88ad6725d792094b4612836e201b62e2944ce3a9765e9dc50bd3fcda` |

The source values did **not** change. The correct result is `FIELDS_UNCHANGED`, with distinct capture/knowledge provenance and package digests. The implementation does not invent a correction to make a demonstration pass. Synthetic tests exercise changed fields, missingness and preservation of the preceding vintage. An independently justified source correction, a permitted customer delivery, affected-customer notification and customer evaluation remain unexecuted.

## Persistence and generic catalog repair

The existing PostgreSQL path now uses consistent connection configuration and transactionally distinguishes created rows, verified identical history and conflicting content. A complete explicit release projection is required before an admitted assertion can be read as a `CorpusRecord`; absent metadata is refused rather than invented. This preserves source/identity/time/evidence fields through readback. The database tests use embedded PostgreSQL (PGlite), not a deployed Cloud SQL instance.

New admitted rows require an open `CANDIDATE` target, cannot predate the evidence their ruling inspected, and cannot change a sealed release's cutoff-defined membership. Exact retained retries remain available after certification. Corpus/release locks serialize these checks with writes. This does not yet provide general backfill, production release creation/certification, or immutable membership tables. Projection-only metadata such as display labels, visibility and geometry remains explicitly supplied, not independently validated by admission.

The existing generic catalog preview no longer authorizes a sale from a caller-supplied grade or aggregate admitted count. Its v2 commitment covers exact selected records, release content/membership and correction content. An optional trusted verifier must establish the selected admission evidence, current source-use decisions and exact recipient agreement. No runtime customer verifier is wired by this increment, and demonstration/private records remain unshippable.

This observation-package workflow intentionally does not cast unresolved FMCSA observations into that physical-state release contract. A later production observation release should retain the same explicit identity and temporal limits.

Additional real-browser production-path verification exposed a pre-acquisition worker-capacity race: overlapping background catalog reads occupied both bounded local worker slots, causing the following operator capture to return `PRODUCTION_BUSY`. Catalog refreshes are now coalesced into a single in-flight read plus a requested follow-up. Worker limits and explicit command retry semantics are unchanged; a refusal never becomes an automatic capture retry.

## Remaining work toward a customer product

1. Establish a reviewed source-use basis permitting the intended commercial preparation and delivery.
2. Agree one product specification and acceptance question with an actual buyer; no customer or price is invented here.
3. Connect verified product authority and recipient agreement to a real delivery route and durable successful-delivery register.
4. Certify the persisted production release and demonstrate amendment/correction handling with supported evidence.
5. Complete deployment/custody/backup/restore validation and the customer pilot.

Further connectors, agents, spatial instruments and analytical models should be selected against those product requirements. Existing research remains available; it is not a substitute for these acceptance steps.

## Concurrent frontend work

The reviewed baseline consolidated here is `6dd691aa599e3ec8d49700704971bcdf749bcd00`. During verification, frontend commit `a728d3d63ddb294b7f52978930828073b364f936` appeared with POINT/POLYGON/EXTENT geometry and Earth Twin changes. It is **not merged by this increment**. Foundation history and this tested baseline are preserved.

That integration requires extending the strict POINT-only database projection schema, preserving both admission metadata and instant-aware runtime selectors, retaining the separate frozen v0 fixture-membership codec, and explicitly reviewing the changed Landshark fixture release/manifest digests. Follow-up verification must include database hydration, geometry/projection integrity, fixture digests and desktop/mobile Earth flows. It is not required to reproduce the internal Company Census packages.

## Verification on 2026-09-08

- Complete JavaScript/TypeScript suite: **4,898 passed**, 6 optional pinned-GAT integration tests skipped; 202 files passed. Includes 23 boutique-package tests, 19 embedded PostgreSQL tests, and the catalog-refresh regressions.
- Rust notation kernel: **29 tests passed**. Restored its original lockfile so the existing `--locked` commands remain reproducible.
- Repository typecheck, ESLint and production Next.js build passed. Build trace checks confirm local evidence and compiler scratch files are excluded.
- Desktop/mobile smoke and statutory-harvester browser suites: **75 passed**, 1 desktop skip for a mobile-only check, against the final build.
- Real Rust-kernel desktop/mobile browser suite: **10 passed**, using isolated temporary notation stores.
- Real local production acceptance: **4 passed**, including HTTP acquisition/comparison, the repaired browser production path and spatial inquiry; 1 optional pinned-GAT check skipped. Evidence stores were isolated temporary directories, not the operator's real FMCSA history.
- Dependency lock clean-install dry run passed. Existing dependency versions were unchanged; missing optional-platform lock entries were restored and the embedded PostgreSQL test dependency was pinned.
- Both real package versions reopened in separate processes; the final second-package build returned `EXISTING` with its original digest. All eight pre-existing source-history files retained their original SHA-256 hashes.

The full run initially found a Windows URL-to-path test defect and a legacy fixture-membership regression exposed by numeric timestamp repair. Both were repaired and the complete suite rerun. The historical fixture codec is now isolated from runtime time selection; committed fixture digest bytes were not restamped. Existing EarthTwin React `act` warnings remain non-failing; optional GAT checks were not activated by this milestone.
