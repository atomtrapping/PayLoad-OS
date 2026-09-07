# What compresses, and what must not

`src/domain/compression.ts`, rendered at [`/model#pm-compression`](../src/app/model/page.tsx).

The distrust stack between two counterparties is mostly **translation**: the same
facts re-keyed into each party's system, the same cargo re-examined by each side,
the same settlement reconciled across hops, and a dispute file assembled from
paper at the end. None of that work adds information. It exists because neither
party can read the other's records and believe them, so each rebuilds the facts
privately and the rebuilds are then reconciled against each other.

That layer compresses, and compressing it is the commercial case: one verified
artifact and one execution event in place of a stack of private reconstructions,
and one canonical contract everyone compiles into in place of pairwise
translation between every pair of participants.

Underneath sits a layer that must not compress, and the difference is not a
matter of degree. **Translation moves information between representations
without deciding anything. Judgment decides, and someone is answerable.** A
system that compressed judgment would remove the person who is liable while
keeping the appearance that someone still is — not efficiency, laundering.

So the claim is not that the intermediaries were removed. Most of them are doing
judgment, and the ones doing translation were doing it because nothing else could
be believed.

## The five that collapse

| Today | Collapses into | Machinery |
|---|---|---|
| Each party re-keys the same lot with its own identifiers | One record, one stable identity across every projection | `corpus.ts` |
| Every pair of participants builds an adapter to the other's formats | One canonical contract each compiles into once, own wording carried verbatim | `conditionGrammar.ts` |
| Each side inspects the same thing because neither trusts the other's number | One receipted observation both can read, with evidence class, uncertainty, both clocks | `admission.ts` |
| Money moves through hops, each reconciling its own record | One execution event whose finality is a property of the medium | `ConditionalCustodyEscrow.sol` |
| A dispute argued from two privately assembled document files | One replayable adjudication, which exists whether or not the route closes | `routeClosure.ts` |

**The test:** for every step that collapses, name the artifact that replaces it.
A step that collapses with no artifact named is a step somebody is still doing,
uncounted. A test asserts every named artifact exists on disk.

## The three that stay

| Judgment | Who is answerable | What compressing it would be |
|---|---|---|
| **Admission** — whether a candidate becomes corpus state | A named authority that is not the method being admitted | Manufacturing corpus state and attributing it to a ruling nobody made |
| **Underwriting** — pricing the risk and bearing the loss | Whoever carries the exposure. Never the witness | The witness taking a position on the outcomes it adjudicates, losing the neutrality that made both parties willing to use it |
| **Closing** — both parties acting on the adjudication | Both counterparties, jointly | Whoever holds the receipt could compel settlement |

## And it is graded

A translation step only collapses at the trust grade the trail actually supplies.
Two parties stop re-examining the cargo when one receipted observation is good
enough for both, and "good enough" is a property of the evidence rather than of
the ambition.

`compressionAvailable` computes it rather than asserting it. Over the committed
corpus today: **3 of 5** translation steps collapse. Re-examination and multi-hop
settlement are blocked, because both need an admitted record. The compression
becomes available when the corpus does, and not before.

### The admitted count is not a defaulted zero

`admittedRecords` is a **required** argument of type `number | 'UNKNOWN'`, and it
is deliberately not read from the `Corpus` value — admission lives at the write
boundary and a corpus carries no admission status, so anything reporting a count
has to have gone and looked.

A caller with no store access must pass `'UNKNOWN'`, not `0`. *"None have been
admitted"* and *"I could not check"* are different facts and only one of them is
a claim about the world. Both block the same steps, and the blocked reasons say
which is which — `no record has been admitted` versus `the admitted count is not
readable from here, and an unreadable count is not a zero`.

`/model` is a server component over the committed fixtures with no store access,
so it passes `'UNKNOWN'` and renders that. Removing the default is what stops the
number rotting: a call site that acquires store access has to change the argument
to compile, rather than silently continuing to report a stale zero.

The three judgment steps do not compress at any grade.
