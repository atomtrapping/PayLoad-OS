# The industrial evidence corpus programme

Two specifications, carried in this repository as data rather than as prose that
can rot: `src/domain/industrialCorpus.ts` (what is assembled) and
`src/domain/coverageUniverse.ts` (where, for whom, and to what depth). The
surfaces at [`/corpora`](../src/app/corpora/page.tsx) and
[`/coverage`](../src/app/coverage/page.tsx) read those modules, so the page and
the plan cannot disagree, and the structural tests that hold the plan to its own
rules hold the pages to them too.

## The standing, first

**Nothing named here is integrated, connected, licensed or collected. No region
is entered and no corridor is maintained.**

Forty-two sources are shortlisted. Each carries four gates — access, coverage,
cost and redistribution rights — and every one of them is `NOT_TESTED`, because
none has been tested. Both readouts are derived rather than stored:
`acquisitionStanding()` counts an integration as a candidate whose four gates
have all passed, and `coverageStanding()` counts corridors from a table that is
empty. Tests pass synthetic passed candidates and synthetic corridors and require
the counts to move, so the zeros mean something in both directions rather than
being a number someone typed.

That discipline is the whole point. A shortlist that reads as an inventory is
precisely the failure this evidence substrate exists to prevent: a source named
on a page is not a source the system holds, and a corpus described is not a
corpus assembled.

## The question

> Which organization operates which facility, producing or handling what,
> connected to which markets through which infrastructure, under what
> constraints — and what evidence supports that account at a particular time?

Satellite imagery, customs statistics, port notices, supplier documents and
economic series become more useful when they contribute to answering it
together. That is what makes this a connected corpus rather than a collection of
unrelated feeds.

## Eight corpora, and the chains that keep their objects distinct

| # | Corpus | What it answers |
| --- | --- | --- |
| 1 | Facilities, organizations and geographic infrastructure | Which organization operates which facility, and where it physically is |
| 2 | Satellite imagery and physical-change observations | What has visibly changed at a site, and when it was observed |
| 3 | Weather, water, environmental exposure and utility dependencies | What physical and utility conditions a site or corridor was operating under |
| 4 | Ports, shipping, corridors and logistics events | How goods actually move, and what state a particular movement is in |
| 5 | Trade flows, product classifications and market structure | Where goods are traded, under which classification, and how the pattern is changing |
| 6 | Economics, prices and operating-cost drivers | What a thing costs, under which terms, and what was actually paid |
| 7 | Regulations, tariffs, permits and qualification requirements | Which rules apply to this product, origin, destination, site and date |
| 8 | Materials, qualifications, projects and private operating evidence | What this site has documented capability to do, and what the supplied lots actually did |

Each corpus carries the object chains it must keep distinct, and each chain
states the confusions collapsing it would produce. A `ChainFigure` draws them on
the surface, because the separateness of the objects is the thing a reader has to
see first:

- **Identity and place** — legal entity → operating organization → physical
  facility → parcel → entrance or access point → network connection. *A
  registered office is not necessarily a factory. A mapped building is not
  necessarily operated by the organization whose name appears nearby. A port
  location is not the same object as an individual terminal or berth.*
- **Observation** — source measurement → derived feature or change assessment →
  association with an industrial entity. *"An externally visible structure
  changed" is not "the supplier expanded production capacity."*
- **Utility dependency** — infrastructure nearby → infrastructure connected →
  contracted service → confirmed available capacity → recorded interruptions.
- **Movement** — port → terminal → service → voyage → vessel → shipment →
  container → recorded event, with event standing (planned, estimated, reported
  actual, independently reconciled) as its own chain.
- **Statistical observation** — reporter, partner, flow, product code and
  edition, period, value, quantity, source release, revision status. *Aggregate
  trade data is not a supplier graph. A statistical unit value is not a supplier
  quotation.*
- **Cost** — market reference → quoted commercial terms → realized transaction
  cost, and commodity family → material grade → specification → supplier offer →
  order → invoice.
- **Requirement** — published source → interpreted requirement → reviewed
  executable rule → assessment under that rule. *A notification is not an enacted
  requirement.*
- **Project state** — announced → approved → funded → tendered → contracted →
  under construction → commissioned. *An announcement does not enter the supply
  model as available production capacity.*

## Rights are separate entries

A single public/not-public flag is inadequate: attribution obligations vary by
theme and by upstream contribution, and some sources carry their own licence
conditions on top. Five rights are answered separately, on the `SourceOperation`
vocabulary this repository already evaluates in `src/data-os/source-policy.ts`:

| Right | Operation | The question |
| --- | --- | --- |
| Storage | `INGEST` | May the retrieved bytes be retained here, and for how long? |
| Report display | `PUBLISH` | May this be shown to a customer, a tenant, or the public? |
| Derived product | `DERIVE` | May something computed from it be sold or delivered? |
| Raw redistribution | `EXPORT` | May the source material itself leave this system? |
| Model training | `MODEL_TRAINING` | May it be used to fit a model? |

Every source also records coverage, refresh behaviour, expected latency,
authentication, rate limits, schema and parser version, retention rules,
attribution and permitted outputs — whether or not it is ever integrated.

## Clocks that must not be collapsed

Satellite observation: acquisition, processing, publication, retrieval,
admission. Weather forecast: issue time and valid time. Trade statistic:
described period, release date, revision. Regulation: publication, effective
interval, amendment, interpretation approval. Shipment event: planned, estimated,
reported actual, received, corrected.

Two rules ride with them. **A newly acquired record describing an earlier event
does not move the time this system knew it.** And **"nothing was found" and "the
source was unavailable, incomplete, or not searched" are different answers** —
acquisition failures belong in coverage records, never in apparently clean
operational results. Both are the same discipline the corpus surfaces already
apply to an unreadable count.

## The coverage universe

The mandate is a specialization beneath the firm's broader one:

> Notation Systems develops evidence-backed industrial, trade and infrastructure
> intelligence across selected markets in Asia, Africa, Latin America, the
> Pacific and Eastern Europe — connecting local records and physical observations
> to cross-border commercial decisions.

It turns on one distinction: **broad geographic discovery; selective, deep
operational coverage; customer-specific decisions.** Six regions are the
ambition, not a promise of equally deep coverage of six enormous regions, and
they do not run the same product — the Pacific does not copy the Asian
manufacturing product and African site intelligence does not copy a European
parcel model. Each region names public evidence that already exists *and* what
that evidence does not establish, because the opportunity is the gap between the
two and either half alone misdescribes it.

**The unit of coverage is a corridor, not a country:** a product or process, its
supplier facilities, its transport dependencies, its destination requirements and
the buyer's commitments. "Cover Vietnam" does not tell an acquisition system
which documents matter, which facilities need identity resolution, or what
freshness is sufficient. A corridor does — which is why expansion follows a
customer's dependency chain rather than a map, why a chain crossing regional
categories stays one connected inquiry, and why two suppliers in different
countries are not independent alternatives when they share an upstream processor
or a transport route.

**Three coverage levels** make depth statable rather than hedged:

| Level | What is maintained | What may reasonably be sold | What it does not support |
| --- | --- | --- | --- |
| Reference | Geographic and statistical context, source catalogues, entity candidates | Discovery and contextual analysis, with limitations visible | A point on the map is not a verified facility |
| Assessed | Resolved identities, assembled evidence, domain evaluation, documented review | A purchasing packet, facility dossier or site screen | An assessed facility is not a continuously monitored supplier |
| Monitored | Continuing updates, freshness requirements, dependencies, owned exceptions | A recurring intelligence service, exposure feed or operational monitor | Monitoring is a commitment about the updates, not a guarantee about the subject |

A customer request promotes a bounded subject from reference into assessment;
demonstrated recurring demand justifies monitoring.

**Three geographic dimensions stay apart** — customer location (who pays, whose
decision, whose obligations), asset and counterparty location (where evidence is
acquired and interpreted), and the trade and dependency network (which further
jurisdictions, facilities, services and routes must be represented). Keeping them
apart is what allows Western-buyer-led commercialization on geographically
neutral infrastructure: a regional manufacturer buying the same class of service
later must not require a conceptual redesign, and North American and Western
European data stays in the corpus because the destination side is half of every
corridor.

**Regional modules, not separate platforms.** A module carries source adapters,
identifiers, original-language terminology, translation handling, spatial layers,
requirements and local verification channels. The substrate keeps supplying
identity, provenance, state, access, computation records, releases and warrants.
Regional differences belong in the evidence and the interpretation, not in
independent databases that gradually disagree about the same organization.

**The separation rule:** *jurisdiction, observed condition and evidentiary
uncertainty must remain separate.* Missing information does not become a negative
supplier judgment; a country-level statistic does not become a facility-level
fact; a remotely sensed change does not become proof of ownership, capacity or
material quality. Where remote observation cannot answer the question, the system
names the confirmation needed and routes it to a provider — local inspectors,
laboratories, engineers, registry specialists and authorized operators are
evidence partners, not intermediaries the architecture assumes it can eliminate.

## How it would be measured, and what would be bought

Decision coverage, not volume: assets correctly resolved, questions supported by
current evidence, unresolved identity matches, source-update failures, review
effort, false alerts, and cost per refreshed facility or completed packet.

The purchase test: **will this additional source change a decision, close a
required evidence gap, or materially reduce the cost of maintaining the
product?** An expensive feed that adds impressive-looking context but changes
none of those is a poor early purchase.

The first valuable assembled object is a supplier–facility–material–route–
requirement dossier that remains current. From the same corpus: a purchasing
packet, a site screen, an exposure alert, a freight reconciliation, or a
machine-readable API response. The information asset is the connection between
physical observations, commercial records and institutional rules and actual
customer dependencies — not the volume of downloaded data.
