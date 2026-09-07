# The settlement bridge

`src/chain/` and `contracts/ConditionalCustodyEscrow.sol`.

The adjudication happens off-chain, in a corpus with two clocks and a correction
tape. The contract does the part a corpus cannot: **commit**. Once the primary
tranche moves it has moved — visibly, attributably, irreversibly — which is the
off-chain rule *a release never un-fires* turned from a discipline into a
property of the medium.

That is the honest division. The corpus says what is true and what it has since
had to unsay; the ledger says what was irrevocably done about it, and when. The
chain is a magnifier of the epistemics above it in both directions: it makes an
honest ruling enforced, and it makes a flattened vocabulary or an unpriced window
equally enforced, forever. Consensus has no sense of doubt.

## What is here

| File | What it is |
|---|---|
| `src/chain/keccak.ts` | Keccak-256, written out rather than imported |
| `src/chain/eip712.ts` | Typed-data hashing: `encodeType`, `hashStruct`, `domainSeparator`, `typedDataDigest` |
| `src/chain/adjudicationReceipt.ts` | The receipt built from a real `ReleaseDecision`, and the digest a signature would be taken over |
| `contracts/ConditionalCustodyEscrow.sol` | Deposit, staged release, and the post-release paths |

**Two things this repository does not have, said plainly.** There is no Solidity
compiler here, so the contract is unbuilt and untested against a VM. And nothing
in `src/chain` signs anything: `buildReceipt` returns the digest a signature
would be taken over, and producing one is an operator act with an operator key.

What *is* checked is the class of mismatch a compiler would never catch: the
EIP-712 type string, the struct field order and every enum value are agreements
between two languages, and `solidityConformance.test.ts` holds them to each
other. If they drift, verification fails silently on-chain — or two
differently-wrong encodings agree and money moves on a meaning neither side
holds.

The hashing is checked against published values rather than against itself:
Keccak-256 against the canonical vectors including the empty string, and EIP-712
against the specification's own worked example, whose domain separator, struct
hash and final digest are all published.

## What crosses the seam, and why each field exists

A conventional oracle receipt carries a value and a timestamp. This one carries
four more things, and each is there because leaving it out is a specific failure.

**`standing`** — `DEMONSTRATION` or `BINDING`. The admission gate is enforced in
this repository, which is worth nothing to a contract that cannot see it. It
rides on the signed struct so the contract refuses a fixture-fed release itself
rather than trusting that nobody upstream erred. **Every receipt this system can
build today is `DEMONSTRATION`, and the contract rejects all of them.** That is
not a placeholder — it is the gate reaching the chain.

**`postRelease`** — the terminal state, not a boolean. A withdrawal removes
support; a correction supplies a contrary finding. A contract handed one flag for
both routes money identically for each, which is the general-oracle failure
committed at the last mile. The four states cross separately and the contract
branches separately.

**`clockProvenance`** — which as-of question the knowledge time answers. Two
clocks meaning different things and arriving as the same `uint256` is the
conflation the corpus refuses at the type level, re-imported by a wire format
that flattened it. The contract accepts only `WHAT_WE_HELD`.

**`proofDigest`** — a commitment to the proof that the adjudication ran as
declared. The ordering is: physical evidence → adjudication → proof over the
adjudication → and only then the settlement layer. The venue is the **terminus**
of a verification chain, never an entry point to one, so there is no
ingestion-side oracle surface at all: every on-chain event is downstream of a
proof. The contract refuses a zero proof digest for anything binding, which makes
that ordering structural rather than procedural. Nothing proves anything here
yet, so every receipt this system builds carries zero — and is refused twice
over, once for standing and once for proof.

**`observedLongestLagSeconds`** beside the declared `exposureWindowSeconds` — the
chain enforces whatever window is signed and cannot tell whether it is right.
Carrying the measured basis beside the declared parameter means a reader sees
that the window rests on a corpus that has observed almost nothing, rather than
inferring that a signed number is an estimated one. The chain makes an exposure
enforceable; only an estate makes it correct.

## The refusals, and the failure each closes

| The contract refuses | Because |
|---|---|
| A receipt whose standing is not `BINDING` | Money must not move on a demonstration |
| A binding receipt with a zero `proofDigest` | The settlement layer is the terminus of a verification chain; an unproven adjudication must never reach it |
| A receipt whose clock is not the corpus knowledge time | This system cannot bound the source's clock, and settling on one nobody carries is fabrication |
| A post-release receipt whose window, condition or nonce disagree with **stored** terms | Verifying a signature over calldata lets a signed struct and the agreement it claims to describe diverge |
| Fewer than a threshold of **distinct** operator signatures | A single key is neither a commodity execution attestor nor an estate-bearing fact attestor — it is one point at which the whole estate can be forged |
| A high-`s` signature | Malleability would let one authorisation appear as two |
| A reused evidence digest | The same ruling must not fund two releases |
| Moving anything on `UNSUPPORTED_BY_WITHDRAWAL` | Nothing contrary has been established. The buffer freezes and the window extends pending a fresh ruling; diverting would be the contract asserting a finding the corpus explicitly did not make |

Signer rotation is timelocked and emits before it takes effect, because the first
real deposit makes this contract load-bearing and the migration story has to
exist before that, not after.

## A route has three states, not two

`src/domain/routeClosure.ts`.

**OPEN** — evidence flowing, adjudication live, nothing final.
**CLOSED** — proof verified, settlement executed, terminal.
**UNCLOSED** — the verification ran and the proof exists, and the closing never
fired.

Systems that model two states treat the third as an error, a timeout or a
dangling row. It is none of those. An unclosed route is a **bilateral
instrument**: a verified, signed, replayable adjudication of two parties'
contested facts, whose validity is now defined between exactly those two rather
than by any machinery. It is what a card that was punched but never run through
the counterparty's tabulator became — an inter-company claim, settled by
correspondence or by a court, not by the machine.

| | CLOSED | UNCLOSED |
|---|---|---|
| Finality | Enforced by the medium | None, and it never acquires any |
| Audience | Anyone, including strangers | Exactly two parties |
| Corrections | Cannot reach the closing; the buffer absorbs | Apply in full; nothing was committed |
| Money | Settled by the venue | Returns to the depositor after the deadline |

**Closing takes both parties.** The proof can be produced unilaterally — either
side may ask for the adjudication, and the answer does not depend on who asked.
The closing cannot: `accept()` is the counterparty's half, and `releasePrimary`
refuses without it. A closing that fired on one party's say-so would let whoever
holds the receipt compel settlement, and a witness that can be used to compel is
no longer neutral between the two parties who both have to trust it. Non-coercion
is not politeness here; it is what lets both counterparties keep using the same
witness.

**And a route with no deadline is not open — it is a deposit with no way out.**
`deposit` requires a closing deadline; after it passes with no release,
`reclaimUnclosed` returns the shares and records the state. Without that path the
first version of this contract locked funds forever whenever a condition simply
never fired, which is the commonest outcome and was the one it could not express.

An unclosed route is not a defect of the evidence. It says something about the
parties and nothing about the cargo.

## Yield, stated honestly

The escrow holds **vault shares**, not a balance it invents yield on. Yield is
whatever the vault produced between deposit and disbursement, obtained by asking
the vault (`convertToAssets`) rather than declared by a rate in this contract.
If the vault produced none, the settlement event reports none. There is no APY,
no accrual term and no interest rate anywhere in the file, and a test asserts
there is not.

## What this does not make true

Every precondition in the reckoning still stands: no admitted record, no
admission authority, no second channel on the event, no denominator. The bridge
is complete at demonstration grade and refuses itself at the last step, which is
the correct behaviour and not a limitation to be worked around.
