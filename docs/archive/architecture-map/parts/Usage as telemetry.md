---
title: "Usage as telemetry"
status: "MODELLED · NOTHING METERED · EVENT HALF ABSENT"
group: "Firm, domain products and customers"
tags:
  - architecture-map
  - layer/firm
---

# Usage as telemetry

**State:** `MODELLED · NOTHING METERED · EVENT HALF ABSENT`  
**Group:** Firm, domain products and customers  
**Map:** [[NotationsOS Architecture]]

> Every query, compute run and agent invocation over a corpus is a lap. A lap is billable by construction only when the response it produced can be pointed at afterwards. Today a response says what the corpus was and not which response it is or who received it.

## What it is

- Four units of usage — query, compute run, agent invocation, clean-room hour — each defined precisely enough to count, and none counted today.
- A response receipt in two halves: the content half (release, parameter set, verification rung, data class) is carried in the envelope and in headers; the event half (response id, response digest, recipient, unit, served at) is absent.
- `meteringReadiness()` computes the gap rather than asserting the conclusion, and a test holds the carried fields in step with the headers a response actually sets.
- The boundary: meter the usage, do not become the rails. Not a settlement participant, not an infrastructure toll, not the tax.
- The federation risk and the defence, stated as work to do rather than protection already held.

## Where it lives

- `src/domain/metering.ts`, `src/domain/metering.test.ts`
- `/products` section "Usage, and what a bill could point at"
- `docs/METERING.md`

## Boundaries

- Nothing here prices, invoices or invents a customer: no rate, no currency, no subscriber.
- A lap over a demonstration is not a lap; every response declares `data_class: synthetic`.
- Metering needs receipts, not liability. Bill like a telemetry vendor, not a payments network.

## Connects to

- → [[Correction and recall machinery]] — the metering entry and the recall entry are one delivery ledger
- → [[Identity core and cross-line join]] — the estate that cannot be pooled by a consortium
- ← [[Corpus feed API v1]] — the envelope that carries the content half
- ← [[Customers and distribution channels]] — the tariff is on access and compute

## Open questions

- [ ] What issues a response id, and does it belong in the envelope, a header, or both?
- [ ] Is the response digest over the payload as sent, or over the selection that produced it?
- [ ] Does an identified caller arrive before or with the first real customer?

## Notes

_Brainstorm here._
