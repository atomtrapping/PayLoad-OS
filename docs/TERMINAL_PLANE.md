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
| The vocabulary and the decision | `src/domain/terminalPlane.ts` | Terminal classes, declarable purposes, what each tool serves, what each purpose admits, the session, `admitCall`, the receipt |
| The only door | `src/mcp/serve.ts` | `serveToolCall`: validate, resolve the corpus, admit or refuse, dispatch only on admission, receipt either way |
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

## A tool is admitted by what it serves

Each tool declares its kind — release metadata, records, an aggregate, a
manifest, a ruling, a receipt — and each purpose admits kinds rather than tool
names. A tool added to the surface without a kind is unreachable, refused as
`TOOL_UNCLASSIFIED`, and a test refuses the omission: a new tool cannot be
served without saying what leaves through it.

The estates are a kind no purpose lists. That is the two-part rule enforced
rather than described: the corpus is served under a purpose, the estates are
served to nobody, on any transport, and a test flips a tool to `ESTATE` and
checks that every declarable purpose refuses it.

## A session cannot widen itself

The declared purpose and the corpus scope are fixed at the open. A terminal
that wants more opens a session that says so and is answerable for saying it;
it does not escalate inside one. A scope is not widened by asking outside it,
and a declaration is not extended by calling after it expires. This is the
structural form of the standing rule that an agent may not alter its own limits.

## Every call is admitted or refused, and the order is the argument

`admitCall` decides in one order over declared inputs:

1. The session's own standing. One that could not be opened answers nothing.
2. The window. A call after `expiresAt` is refused.
3. The tool is on the surface, and has said what it serves.
4. The estates, unconditionally, so no refusal reads as though some purpose
   might reach them.
5. The purpose against what the tool serves.
6. The corpus against the declared scope.

A refusal is a successful return carrying a code, a reason and a remedy — never
an error and never silence, the same discipline the feed's refusals already
keep. Malformed arguments stay tool errors, checked before admission, so a
caller who mistyped an instant is told that rather than told its purpose does
not admit the tool.

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

It does not persist the receipts. They are returned and not yet written to a
ledger, so a pattern of asking is visible to whoever holds the call and not to
the system. That is the next increment, and it is where "recorded against a
party" stops being a shape and starts being a fact.

## The HTTP feed is unchanged

52 route handlers under `src/app/api` still answer without a session, against a
declared viewer class rather than a party. `servingStanding()` reports the two
surfaces separately for exactly that reason: one number over both would read as
though the feed were governed too.

## Verified

`src/domain/terminalPlane.test.ts` (18): the declarable-purpose derivation
against `sourceUseRequests`, so the two audiences cannot drift; every tool
classified and nothing that is not on the surface; an unclassified tool refused;
the estates unreachable from every declarable purpose; each refusal with a
reason and a remedy; the order, including a session that could not be opened
refusing before anything else; the receipt.
`src/mcp/serve.test.ts` (10): the corpus resolved from a corpus argument, from a
release identifier, and undefined where the call names neither; the same tool
answered for one session and refused for another; nothing served on a refusal;
malformed arguments still a tool error.
`src/architecture.test.ts`: nothing but the governed surface dispatches a tool.
