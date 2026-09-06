---
title: "Storage (polyglot persistence)"
status: "ONE STORE SELECTED · FIVE DECLARED"
group: "Runtimes, local stores and verification"
tags:
  - architecture-map
  - layer/runtime
---

# Storage (polyglot persistence)

**State:** `ONE STORE SELECTED · FIVE DECLARED`  
**Group:** Runtimes, local stores and verification  
**Map:** [[Payload OS Architecture]]

> Six classes of information ask for six kinds of store. One is now selected: PostgreSQL holds the corpus tables and the adapter reads them when a database is configured, falling back to the committed demonstration when none is. The other five remain candidates.

## What it is

- Recorded as data in `src/domain/storage.ts` and rendered on `/product`, in the same honest-present-state pattern as the fabrics and the projection engines.
- Every class carries the access pattern that asks for that store kind, the candidate technologies, the fabric that owns the information, what holds it here today, the doctrine invariant the store must not break, and what has to be true before choosing one.
- PostgreSQL is wired for the records class. The other five classes are held by local content-addressed files under operator-selected `.payload/` roots and by committed fixtures.
- The records store arrived before the admission authority, which the sequence said should come first. Until admission exists, nothing stops an unadmitted candidate being written into a canonical-shaped row.

## Where it lives

- `src/domain/storage.ts`, `src/domain/storage.test.ts`
- `/product` section "Where the corpus is stored"
- `docs/STORAGE.md`

## Boundaries

- A candidate is not a selection: a selection would appear as a dependency and a running service, not as prose.
- The lakehouse follows the admission authority, never the other way round; holding candidates in it would imply they were admitted.
- An edge requires evidence, and embedding similarity is never a canonical relation.
- A test holds the declared dependencies and the stated state in step, in both directions: a store dependency without a service class fails, and so does a service class with no dependency behind it. It is what caught the corpus moving onto PostgreSQL.

## Connects to

- ← [[Admission authority]] — the lakehouse waits on it
- ← [[Corpus object model]] — the information these stores would hold
- ← [[Evidence capture and receipts]] — object storage is the class already enforced
- → [[Earth Twin (CesiumJS)]] — geospatial positions are drawn from declared records

## Open questions

- [ ] Which class earns a real store first, and what volume makes local files stop being enough?
- [ ] Does the object store come before or after the admission authority, given it is the only class already at volume?
- [ ] Where do frames and transforms live so a coordinate is never separated from what produced it?

## Notes

_Brainstorm here._
