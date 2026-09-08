# Delivery records and internal usage

Notation Systems licenses boutique data and analytics packages. Internal usage
telemetry helps account for the work of preparing them. A compute run, agent
invocation or inspection is an internal operation; it does not establish a
customer charge or an additional hosted-compute offering.

`src/domain/metering.ts` records the present response-receipt contract,
`/products` renders it, and its tests hold those claims to the fields carried by
the current demonstration interface. This document supersedes the earlier
three-business and per-clean-room-hour pricing formulation.

## What delivery needs to identify

A package specifies the information, version, coverage and permitted use being
licensed. A delivery record must identify what was supplied and to whom. That
record can support both a commercial record and a later correction notice;
internal preparation telemetry has a different purpose.

The current HTTP response envelope has a content half and an incomplete event
half:

| Field | Meaning | State |
|---|---|---|
| `corpus_release` | The release represented | Carried |
| `parameter_set_version` | The declared parameter version | Carried |
| `verification_rung` | The stated verification level | Carried |
| `data_class` | Real or synthetic classification | Carried |
| `response_id` | This particular response | Absent |
| `response_digest` | Commitment to everything returned | Absent |
| `recipient_id` | Who received it | Absent |
| `unit` | The usage category, if metered | Absent |
| `served_at` | When it was delivered | Absent |

`meteringReadiness()` checks those fields; it does not declare delivery or billing
ready from release provenance alone. The demonstration remains synthetic and
unbillable. A prospective package artifact is not itself evidence that a
customer received it.

## One delivery ledger

`DELIVERY_LEDGER` in `src/domain/correction.ts` specifies recipient, release,
returned records and delivery time. The ledger is empty. Retractions need to
reach holders of affected information, so the same delivery identity should
support correction tracking. A receipt that identifies no recipient cannot
prove that obligation was completed.

The billing contract and prices remain undecided. The repository selects no
per-query tariff, customer-compute price, clean-room charge or share of a
customer's settlement. Internal compute runs can inform preparation costs
without being sold as customer execution.

## Internal usage categories

- Query: an answered corpus request, including a typed refusal.
- Compute run: a retained internal derivation with declared inputs and methods.
- Agent invocation: a tool call through the existing MCP interface.

These categories are not currently metered. The existing instruments retain
local run artifacts and the MCP surface exposes tools, but neither establishes
an identified customer delivery.

## Integration and scope

The existing HTTP and MCP interfaces let customers apply their own computation
to licensed data. A packaged output should preserve the information's version,
provenance and use terms through that handoff. The firm operates the production
system internally; hosted customer workloads, proprietary trading and settlement
are outside the active offering. Existing source and trading restrictions remain
in force.

Issued-identifier resolution and source-comparison mechanisms now exist.
Retained production identity history, calibrated source quality and a populated
delivery ledger have not been established. They are useful production
capabilities to develop for a specific package, not proof of commercial
defensibility or a completed customer service.
