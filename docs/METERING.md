# Usage as telemetry

The performance of the production system generates usage; usage generates
telemetry; telemetry is a product. Every query against a corpus, every compute
run over it and every agent invocation through it is a lap.

`src/domain/metering.ts` carries this as data, `/products` renders it, and
`src/domain/metering.test.ts` holds the claims to what the code actually does.

## The claim, checked

The strategic claim is that billing is traceable by construction, because every
response is receipted. **That is half true today, and the half that is missing is
the half that makes a bill attributable.**

A response receipt has two halves. The **content** half says what the corpus was.
The **event** half says which response this is and who received it.

| Field | Half | State |
|---|---|---|
| `corpus_release` | What the corpus was | Carried, in the envelope and a header |
| `parameter_set_version` | What the corpus was | Carried, in the envelope and a header |
| `verification_rung` | What the corpus was | Carried, in the envelope and a header |
| `data_class` | What the corpus was | Carried, in the envelope and a header |
| `response_id` | Which response | **Absent** |
| `response_digest` | Which response | **Absent** |
| `recipient_id` | To whom | **Absent** |
| `unit` | Which lap | **Absent** |
| `served_at` | When | **Absent** |

`meteringReadiness()` computes this rather than asserting it. A bill could say
what the corpus was; it could not yet say which response it is charging for, or
to whom. Nothing counts a lap today, and `data_class: synthetic` on every
response is also what makes the demonstration unbillable — a lap over a
demonstration is not a lap.

## One ledger, two obligations

The metering entry and the recall entry are the same object. A retraction has to
reach everyone holding an affected record; a bill has to name what each recipient
consumed. Both need recipient, release, what was returned and when. It is
specified once, as `DELIVERY_LEDGER` in `src/domain/correction.ts`, and it is
empty because no customer exists.

## Meter the usage; do not become the rails

Bill like a telemetry vendor, not like a payments network. Metering needs
receipts, not liability.

- **Not a settlement participant.** Taking a share of transfers between other
  parties absorbs liability and payment-company obligations, and none of it is
  supported by the asset. The asset is the corpus, not the money movement.
- **Not an infrastructure toll.** Charging a platform for running on a substrate
  reverses the direction that actually holds: data gravity kept workloads local,
  it did not pay data providers rent.
- **Not the tax.** A firm that taxes every use of a format eventually has the tax
  taken from it. Meter what the firm produced, not what others do with their own
  machines.

Instead the tariff is on access to the corpus and compute over it: per query, per
compute run, per clean-room hour. Each is a thing the firm performed and can
produce a receipt for.

## Where the firm plugs in

**As a dependency.** The API is the evidence-bounded data source that customer
compute calls. Their function imports the client; every invocation carries
provenance context; receipt digests appear in their own structured logs, so a run
over these records emits audit-grade telemetry in the customer's own
observability stack. Invisible, everywhere, metered. It is absent: it needs a
published client, a response receipt for it to log, and an identified caller —
the last two being the missing half above.

**Not as a provider.** The inverse, where other platforms run on the firm's
substrate and pay for it, is rejected: it makes the firm a settlement
participant, absorbing liability the corpus does not support.

## One asset, three ways

| Pillar | Sells | Here |
|---|---|---|
| Data products | The telemetry itself, as the three APIs | All three lines have a demonstration corpus behind one fixture feed; none is live and none is metered, because nothing has been delivered |
| Hosting and compute | Runs of it, over authorized releases | The instruments run locally on the operator's machine; no hosted execution exists |
| Proprietary capital | Nothing: it trades on the same exhaust, under a separate governance boundary | Absent, and separated by declaration: no source permits proprietary strategy or trading |

## If customers federate

Customers who pool their holdings replicate the aggregate corpus. Anyone can
resell a fact; a consortium can resell all of them.

The defence is that the identity and decision estates do not pool. A shared
format is not a shared resolution: two members can exchange records and still not
agree on which two identifiers name the same carrier, at what time, on what
evidence — and neither holds the other's corrections. What cannot be pooled is
the resolution decisions, the calibration of each source, and the corrected
history.

**None of the three is implemented.** Resolution is absent, corroboration scoring
is absent, and the delivery ledger is specified and empty. The defence is a
statement of what to build, not a claim about what protects the firm today.
