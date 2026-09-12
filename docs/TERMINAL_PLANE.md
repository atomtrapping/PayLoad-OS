# The control plane a terminal plugs into

Payload OS is a data control and mining substrate. NotationsOS is one terminal
over it — the firm's own — and it is not the only one there should be. A second
terminal, belonging to a customer or to another system, should be able to plug
in and operate the substrate: ask it things, be answered some of them, be
refused the rest with a reason, and leave a record of having asked.

The difference between that and a feed with a schema is three facts about every
call. Who is asking. What for. And whether that party, for that purpose, may
have this. `docs/ECONOMIC_ARCHITECTURE.md` has always said the products are
distributed over HTTP feeds and MCP tools; `src/domain/servingBoundary.ts`
argued that a tool surface is the first transport here that could carry a
purpose, and then measured what was actually enforced and found nothing. This
is that argument made executable.

## The shape of it

| Piece | Where | What it holds |
| --- | --- | --- |
| What the substrate can do | `src/domain/capabilityRegistry.ts` | Every capability: its kind, what it would change, what gates it, whether it reaches an estate, and how a caller reaches it today |
| The vocabulary and the decision | `src/domain/terminalPlane.ts` | Terminal classes, declarable purposes, what each purpose admits, the session, `admitCapability`, `admitCall`, the receipt |
| The only door | `src/mcp/serve.ts` | `serveToolCall` and `serveCapabilityCall`: validate, resolve the corpus, admit, refuse or propose, dispatch only on an admitted read, receipt every time |
| The operator's own terminal | `src/mcp/server.ts` | Opens one declared `FIRM_INTERNAL` session and routes its own calls through the same door |
| The standing | `src/domain/servingBoundary.ts` | `servingStanding()`, reporting the governed tool surface and the unauthenticated feed apart |

## A terminal is a party, and a party has a class

The rights model already decides against an audience — `INTERNAL`, `CUSTOMER`,
`PUBLIC` — so a terminal is not a new kind of thing. It is a party calling at
one of those audiences, declared when the session opens.

## A purpose is declared once, from the one vocabulary

The purposes a terminal may declare are the corpus's own permitted uses. There
is no second vocabulary of API scopes to keep in agreement with the first; that
mismatch is the failure the discovery ledger's rights columns already refuse
(`artifact_rights_are_permitted_uses`). Which uses a class may declare is
derived from the audience each use is evaluated at, so a use added to the
corpus is declarable by exactly the class its own request names.

| Class | May declare |
| --- | --- |
| `CUSTOMER` | Customer delivery |
| `PUBLIC` | Redistribution |
| `FIRM_INTERNAL` | Acquisition, normalization, aggregation, internal research, proprietary strategy |

Two uses are declarable by nobody, and the refusal is stated rather than
expressed as an omission. **Model training** is refused at the type level
because it is not a use of an answer but a copy of the corpus into a form that
no longer carries its receipts. **Trading** is prohibited outright by the rights
matrix.

## Read is governed by purpose; operate is governed by authorization

A purpose is the right question for a read and the wrong one for everything
else. Running a mining workload, assessing coverage, compiling a dossier,
writing a notation: these change state, spend something, or produce a record
that outlives the call. No declared purpose authorizes that. An authorization
does, and the governance kernel already holds one
(`src/db/executionLedger.ts`).

So a capability declares which of three kinds it is, and the plane treats each
differently.

| Kind | What the plane does |
| --- | --- |
| `READ` | Answers it under the declared purpose, as before |
| `OPERATE` | Never runs it. The ask becomes a proposal naming the terminal as counterparty and carrying the side effects the capability declared |
| `ADMIT` | Refuses it to every terminal but the firm's own. Putting material into the corpus is the firm's act |

The side effects come from the capability, not from the caller.
`operation_proposal.declared_side_effects` exists so a reviewer is told what an
act would change before it changes anything; a caller supplying that list would
be a caller describing its own act. The plane copies the registry's list, so a
terminal cannot understate what it asked for.

An operate ask comes back saying what it now waits on, in the kernel's order: a
decision packet naming the action by digest, a review of that digest by a
registered human or policy principal (an agent cannot be the reviewer), and an
execution authorization of the same digest. And it says the thing a caller
would otherwise learn by waiting:

> No execution authorization can be granted at all today: the row names a
> corpus release by foreign key and no release has been admitted.

Every operate ask is therefore recordable and unauthorizable. That is the
honest state of the substrate, and the plane states it at the moment of asking
rather than leaving a proposal to sit.

## The estates are a property of the capability

`servingBoundary.ts` names four estates that leave the wall on no transport.
A capability that would expose any of them says so, and the plane refuses it to
anyone outside the firm whatever its kind and whatever purpose is declared.
Coverage assessment is the live example the survey turned up: deciding that one
artifact conflicts with another is a disagreement-layer judgement.

## A tool is admitted by what it serves

Each tool reaches a capability, and the capability says what it hands back —
release metadata, records, an aggregate, a manifest, a ruling, a receipt. A
purpose admits kinds rather than tool names. A tool that reaches nothing in the
registry is unreachable, refused as `CAPABILITY_UNKNOWN`, and a test refuses the
omission: a new tool cannot be served without describing what it reaches.

This used to be a second table of tool-to-served-kind beside the registry,
which is one fact in two places and therefore a place they can differ. The
plane now derives it.

No purpose lists `ESTATE` among the kinds it admits, and a test holds that as
well as the capability-level rule above: the corpus is served under a purpose,
the estates are served to nobody, on any transport.

## A session cannot widen itself

The declared purpose and the corpus scope are fixed at the open. A terminal
that wants more opens a session that says so and is answerable for saying it;
it does not escalate inside one. A scope is not widened by asking outside it,
and a declaration is not extended by calling after it expires. This is the
structural form of the standing rule that an agent may not alter its own limits.

## Every call is admitted or refused, and the order is the argument

`admitCapability` decides in one order over declared inputs, and `admitCall`
reaches it through a tool name:

1. The session's own standing. One that could not be opened answers nothing.
2. The window. A call after `expiresAt` is refused.
3. The tool is on the surface, when the ask came through a tool name.
4. The capability is described. What the registry does not describe is not
   reachable.
5. The estates, unconditionally, so no refusal reads as though some purpose
   might reach them.
6. The corpus against the declared scope. This binds every kind of ask and not
   only reads: a terminal asking to re-assess a corpus it never named should be
   told that, rather than handed a proposal for an act it had no standing to
   ask about.
7. The kind. An admission is refused outside the firm and proposed inside it;
   an operate becomes a proposal; a read is measured against the purpose.

There are three outcomes, not two. `PROPOSAL_REQUIRED` is not a refusal wearing
a softer word: the terminal asked for something that changes the world, the ask
was recorded, and a human decides. Calling that REFUSED would tell the caller to
go away; calling it ADMITTED would say something ran.

A refusal is a successful return carrying a code, a reason and a remedy — never
an error and never silence, the same discipline the feed's refusals already
keep. Malformed arguments stay tool errors, checked before admission, so a
caller who mistyped an instant is told that rather than told its purpose does
not admit the tool. And a capability that is admitted but that nothing plumbs
answers `unreachable` rather than a refusal, because "you may, and it is not
wired" and "you may not" are different answers.

## What the scope check reaches

A call naming a corpus is checked directly. A call naming a release has its
corpus resolved from the source first — a lookup the boundary makes about its
own inventory, not an answer served to the caller. A call naming neither, which
today is the rulings, the factoring receipts and the dispatch events, is not
narrowed by scope, because those identifiers do not carry a corpus and inventing
a mapping from their prefixes would be a guess enforcing a policy. Those calls
are still admitted or refused by purpose.

## What this does not do

It does not verify that a declaration is true. A terminal that declares
counterparty diligence and trains a model on the answer has lied, and the answer
to a lie is evidence and a rights action, not a transport control. What changed
is that there is now a declaration to be false, recorded against a party, at an
instant, which is what makes the second pull answerable.

It does not authenticate the identity a session asserts. The identity is taken
as given by whatever opened the session; binding it to a credential is a
separate, later thing, and `servingStanding()` says so rather than reading as
though the boundary were closed.

It does not meter or price a call. The receipt carries the fields a bill line
needs — a party, a request, a served instant — because those are the same fields
a rights decision needs, but nothing counts them yet.

It does not keep the record beyond the process. `src/mcp/serve.ts` takes an
optional sink and writes every ask to it, and `src/governance/terminalStore.ts`
is a sink over the real tables — but it opens its own PGlite, so the record
lives and dies with the process. Giving it a provisioned database is a change
of constructor, not of design.

A sink that throws does not fail the call. The plane's answer is not made wrong
by the recorder being unavailable, so a failed write is counted and reported on
the response as `unrecorded` rather than swallowed or raised.

## What the substrate holds afterwards

`src/db/terminalLedger.ts` is where a pattern of asking stops being visible only
to whoever held the call. Three tables.

| Table | Holds |
| --- | --- |
| `terminal_capability` | One row per capability, seeded from the registry, with its kind and whether it reaches an estate |
| `terminal_session` | The declaration: party, class, one purpose, the corpora named, the window it stands for |
| `served_call` | One row per ask — admitted, refused or proposed — with the capability, the corpus, the instant and why |

The registry is a table rather than a `CHECK` over 161 strings because the
guards need to reason about a capability's kind, and a `CHECK` cannot. A call
naming a capability the registry does not describe has no row to point at,
which is the plane's refusal held a second time for a writer that never heard
of the plane.

The rules the plane enforces are enforced here again, from the row:

- The `(class, purpose)` pairs are generated from `declarablePurposes`, so a
  customer terminal declaring internal research is refused by the database.
  Model training and trading are refused to every class.
- A session is written once. A widening is a new session a party is answerable
  for; an `UPDATE` would be the escalation-inside-one the design refuses.
- A call carries its session's window, tied back by composite key, and must
  fall inside it. A declaration is not extended by calling after it.
- Only a `READ` may be `ADMITTED`. A row saying an operate was served is not
  accepted, whatever produced it. An `ADMIT` is refused to any session that is
  not the firm's own.
- Each outcome carries what it must: a refusal its code, a proposal its
  proposal, an admission neither.
- A proposed call points at `operation_proposal`, and two deferred guards keep
  the pair honest — the proposal's `operation_kind` is the capability that was
  asked for, and its `counterparty` is the terminal that asked.

A refusal is recorded as fully as an answer, because a pattern of being refused
is the pattern worth seeing.

The vocabulary the three modules share lives in
`src/domain/terminalVocabulary.ts`, alone, importing only the corpus's rights
words. A database module that had to pull in the MCP tool list to learn what a
terminal class is would be a layering mistake with a runtime cost.

## The HTTP feed is unchanged

52 route handlers under `src/app/api` still answer without a session, against a
declared viewer class rather than a party. `servingStanding()` reports the two
surfaces separately for exactly that reason: one number over both would read as
though the feed were governed too.

## What is in the registry

161 capabilities, from a subsystem-by-subsystem reading of the code.

| | Count |
| --- | --- |
| Reads | 62 |
| Operates | 91 |
| Admissions | 8 |
| Reaching an estate | 24 |
| Reachable by a terminal today | 12 |

The twelve are the corpus reads, which are the tools on the surface. Everything
else is the substrate a terminal cannot yet operate: the mining engine, the
whole dossier lifecycle from the ask to the correction, the production and
evidence rails, the notation kernel, spatial inquiry and the Earth twin, the
projection fabric, the governed editorial, commercial, treasury, capacity,
warrant and state planes, the product desks, and the governance kernel's own
acts. 39 entries are reachable by nothing at all; 63 are reachable only from
inside the application.

Listing what is not wired is the point. A registry of only what is plumbed
would be a list of twelve tools; the map of the substrate is what shows where
the work is. And nothing is reachable by being absent from the registry: what
is not described is refused, which is the intended default.

Two honesties about the surveyed entries. Their served kinds, where they are
reads, are the registry's reading of what each would hand back rather than a
fact a caller has exercised, because nothing reaches them. And their side
effects are what the code was read to write; they are a reviewer's warning, so
they are stated broadly rather than narrowly, and a capability that changes
more than it says is a defect in that file.

## The navigator reads the same list

`/capabilities` in the built-in terminal draws the registry: the three kinds
and what the plane does with each, what an operate waits on and the fact that
no authority can be granted yet, then every capability grouped by area, with
its module, what it changes, what reaches it today and what authority it needs.
A capability reaching an estate is marked wherever it appears.

The operator's map and the plug-in contract used to be two things that could
disagree — a person read the pages, an integrator read the tool list, and
neither said what the substrate could do. They are one list now, and
`tests/e2e/capabilities.spec.ts` asserts the page against the registry rather
than against literals, so a row the page drops or a count it rounds fails.

`src/domain/capabilityRegistry.test.ts` holds the registry to the code: every
entry names a module that exists on disk, under the repository, and a broken
path fails the suite. Kinds, identifiers, served kinds and side effects are
checked for shape, no capability serves an estate, and the only capabilities
any transport reaches are the twelve corpus reads.

## Verified

`src/domain/terminalPlane.test.ts` (25): the declarable-purpose derivation
against `sourceUseRequests`, so the two audiences cannot drift; every tool
mapped onto a described capability and nothing that is not on the surface; every
capability described once, a read with a served kind and an operate with its
side effects; an undescribed capability refused; the estates refused outside the
firm on every purpose, and refused inside it when the capability serves them;
an operate turned into a proposal carrying the party, the purpose, the declared
side effects and what it waits on; the side effects taken from the capability
rather than the caller; an operate on an unscoped corpus refused rather than
proposed; an admission refused outside the firm and proposed inside it; each
refusal with a reason and a remedy; the receipt for both a read and a proposal.
`src/mcp/serve.test.ts` (14): the corpus resolved from a corpus argument, from a
release identifier, and undefined where the call names neither; the same tool
answered for one session and refused for another; nothing served on a refusal;
malformed arguments still a tool error; a capability asked for by name, an
undescribed one refused, and an operate dispatching nothing.
`src/architecture.test.ts`: nothing but the governed surface dispatches a tool.
`src/db/terminalLedger.test.ts` (30), against a real PostgreSQL engine in raw
SQL: the seed equals the registry; a call naming an undescribed capability, or
claiming a kind that is not the registry's, refused; a class declaring a
purpose it does not call at, and model training and trading for every class,
refused; a session that names no corpus or expires before it opens, refused;
a session rewritten, refused; a call outside its window, or carrying a window
or a class its session did not declare, refused; each outcome held to what it
must carry; an admitted operate refused and the proposal it should have been
accepted; an admission refused outside the firm and proposed inside it; a
proposal for another act or another party refused; and the authorization that
would run any of it refused, because it names a corpus release and there are
none. Two of the thirty run real asks through `admitCapability` and write the
receipts unedited, so a decision the plane can produce and the ledger will not
accept surfaces as a failure rather than at runtime.
`src/mcp/record.test.ts` (7): the live surface driven with a real store behind
it, writing the declaration once and every ask under it, a refusal with its
code, and an operate's proposal into the kernel with the side effects the
capability declared and the plane as its author; an ask that reached no
described capability refused and not written, because a ledger that invents
the thing it records is worse than one that says nothing; and the answer
standing when the sink throws, with the record reported incomplete.
