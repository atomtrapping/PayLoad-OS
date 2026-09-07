---
title: "The serving boundary and the reasoner"
status: "SPECIFIED · NOTHING ENFORCED · NO CALLER IDENTIFIED"
group: "Firm, domain products and customers"
tags:
  - architecture-map
  - layer/firm
  - layer/projection
---

# The serving boundary and the reasoner

**State:** `SPECIFIED · NOTHING ENFORCED · NO CALLER IDENTIFIED`
**Group:** Firm, domain products and customers
**Map:** [[Payload OS Architecture]]

> Serve the corpus under a purpose. Serve the estates never. And the reasoner is the most powerful witness in the system with no authority in it.

## What it is

- **Five axes** comparing an open surface with a tool surface: probing cost, schema exposure, receipt travel, intent, retention. Four favour the tool surface; retention favours neither, and the conversational frame is worse.
- **Intent as the upgrade**: a key says who, a call can say who and what for, and the rights model here has always decided against a purpose without a transport that could ask. Declaring a purpose is not proving one.
- **The two-part rule**: the corpus under a purpose, the estates never — calibration internals, source-reliability models, disagreement structure, identity decision records, on any transport.
- **Policy attestation**, which is not corpus attestation: prove that the policy ran rather than that a fact is true. Verifiable refusal, demonstrable filtering, and provenance served without substance. It enforces a boundary it does not draw.
- **Three rules for a reasoner** — explanations are projections not generations, a tier crossing in prose is an authored claim, and reasoning outputs are candidates — none of them enforced today.

## Where it lives

- `src/domain/servingBoundary.ts`, `src/domain/reasoningWitness.ts` with their tests
- `/api` sections "What a transport can enforce, and what it cannot" and "A reasoner over this surface"
- `docs/CARRIER_AND_CONGRUENCE.md`

## Boundaries

- No caller is identified, no call declares a purpose, nothing is metered, and rights are evaluated against a viewer class rather than against a party.
- Estate leakage is answered by never serving them, not by any transport or proof.
- General proving of corpus computation stays refused; policy attestation is a different boundary and is absent too.
- The surface is safe today because it is read-only, which is not the same as the rules being held.

## Connects to

- ← [[Corpus feed API v1]] and [[MCP server and tools]] — the surfaces this is about
- ← [[Source rights and use evaluation]] — the per-purpose decision that has never been asked at query time
- → [[Usage as telemetry]] — a recipient, a request identifier and a served instant are the same three fields a bill needs
- ← [[The computation carrier and congruence]] — the refusal that policy attestation sits beside without contradicting

## Open questions

- [ ] What is the smallest honest purpose vocabulary, and who validates a declaration?
- [ ] Does an identified caller arrive with the first customer, or before one as a precondition?
- [ ] Which of the three reasoner rules is enforceable at the tool boundary rather than in a prompt?

## Notes

_Brainstorm here._
