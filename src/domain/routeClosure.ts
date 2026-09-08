/**
 * A route has three states, and the third is the one that gets lost.
 *
 * OPEN: evidence flowing, adjudication live, nothing final.
 * CLOSED: the proof verified, the settlement layer executed, terminal.
 * UNCLOSED: the verification ran and the proof exists — and the closing never
 * fired.
 *
 * Systems that model two states treat the third as an error, a timeout or a
 * dangling row. It is none of those. An unclosed route is a *bilateral
 * instrument*: a verified, signed, replayable adjudication of two parties'
 * contested facts, whose validity is now defined between exactly those two
 * parties rather than by any machinery. It is what a card that was punched but
 * never run through the counterparty's tabulator became — an inter-company
 * claim, settled by correspondence or by a court, not by the machine.
 *
 * That is not the mechanism failing. It is the mechanism's fallback, and it
 * carries a specific value: the parties hold something stronger than the
 * documents they would otherwise argue from, because the adjudication is
 * deterministic and any expert can re-run it. The evidence was produced and
 * billed either way; only the settlement did not happen.
 *
 * THE PROPERTY THAT MAKES IT WORK
 *
 * Closing is a settlement event and not a verification event. The proof can be
 * produced unilaterally — either party can ask for the adjudication. The
 * closing cannot: it requires both counterparties to have wired the same
 * arrangement, and the machinery executes their joint act rather than imposing
 * its own.
 *
 * A closing that fired on one party's say-so would let whoever holds the proof
 * compel settlement, and the witness would stop being neutral the moment that
 * became possible — it would be adjudicating in favour of whoever ran to the
 * contract first. So non-coercion is not politeness here; it is what lets both
 * counterparties keep using the same witness. The parties who trust the
 * adjudication close on it. The parties who do not still hold it, and both come
 * back for the next route.
 */

export type RouteState = 'OPEN' | 'CLOSED' | 'UNCLOSED';

export interface RouteStateProperties {
  state: RouteState;
  what: string;
  finality: string;
  /** Who can rely on it, which is the property that most distinguishes the three. */
  audience: string;
  /** What happens when a fact it rested on is later restated. */
  correction: string;
  proves: string;
  money: string;
}

export const ROUTE_STATES: readonly RouteStateProperties[] = [
  {
    state: 'OPEN',
    what: 'Evidence is flowing and the adjudication is live. Nothing is final and nothing is owed.',
    finality: 'None. Every value may still move.',
    audience: 'The system and whoever is entitled to read the corpus.',
    correction: 'Ordinary supersession. A restatement changes what the next ruling would say.',
    proves: 'Nothing yet. An open route is a question being asked.',
    money: 'Held, if anything was deposited at all.',
  },
  {
    state: 'CLOSED',
    what: 'The adjudication was proven, the settlement layer executed, and the route is terminal.',
    finality: 'Enforced by the medium. A closing does not un-fire, and reversing it needs a new visible act rather than a quiet one.',
    audience: 'Anyone. A stranger with no relationship to this system can verify it and never has to ask us anything.',
    correction: 'The correction tape keeps running and cannot reach the closing. A later restatement is a supersession against a closed route, which is what the exposure buffer is for.',
    proves: 'That this route closed, on this proof, at this instant, under this authority.',
    money: 'Settled by the venue. Not ours at any point.',
  },
  {
    state: 'UNCLOSED',
    what: 'The verification ran and the proof exists. The closing never fired, because closing takes both parties and one of them did not come.',
    finality: 'None, and it never acquires any. It stays contestable.',
    audience: 'Exactly two parties. It is a private instrument, and its validity is whatever those two and their counsel make of it.',
    correction: 'Supersession continues to apply in full. Nothing here is protected from being restated, because nothing was committed.',
    proves: 'That the facts were adjudicated and the verification ran — and that the closing did not happen, which is itself a fact about the parties rather than about the cargo.',
    money: 'Unsettled. What the parties hold is a proof-backed claim, and after the declared deadline the deposit returns to the depositor.',
  },
];

export const CLOSING_IS_BILATERAL = {
  rule: 'The system verifies; the parties close.',
  unilateral: 'Verification. Either party may ask for the adjudication, and the answer does not depend on who asked.',
  joint: 'Closing. It executes an arrangement both counterparties wired, and the machinery never supplies the missing consent.',
  ifItWereNot: 'A closing that fired on one party’s say-so would let whoever holds the proof compel settlement, and the witness would be adjudicating in favour of whoever reached the contract first. Neutrality is not a stance here — it is the reason both counterparties can use the same witness.',
} as const;

/** What an unclosed route is worth, said plainly, because it is easy to record as a failure. */
export const UNCLOSED_IS_NOT_FAILURE = {
  produced: 'The adjudication happened, the evidence is retained, and the corpus carries it. That work is not undone by the absence of a settlement.',
  worth: 'Two counterparties holding a completed adjudication of their contested facts have a stronger instrument than the documents they would otherwise argue from, because it is deterministic and any appointed expert can re-run it.',
  butNot: 'It is not a judgment, not enforceable, and not binding on anyone. It is testimony, and the parties remain free to disregard it.',
  andTheHonestPart: 'A route that does not close says something about the parties and nothing about the cargo. Recording it as a defect of the evidence would be the system blaming its own inputs for a decision two humans made.',
} as const;

/**
 * Pure: which state a route is in.
 *
 * `closedAt` set means CLOSED and outranks everything, because a closing is
 * terminal. Otherwise a route is UNCLOSED once its declared deadline has passed
 * without one — a deadline that must be declared up front, because a route with
 * no deadline is not open, it is a deposit with no way out.
 */
export function routeStateAt(
  route: { closedAt?: string; closingDeadline: string },
  atInstant: string,
): { state: RouteState; because: string } {
  if (route.closedAt !== undefined) {
    return { state: 'CLOSED', because: `Closed at ${route.closedAt}. A closing is terminal and this reading cannot change.` };
  }
  if (atInstant >= route.closingDeadline) {
    return {
      state: 'UNCLOSED',
      because: `The declared closing deadline of ${route.closingDeadline} passed without a closing. What the parties hold is the adjudication, as a private instrument between them, and the deposit is reclaimable.`,
    };
  }
  return { state: 'OPEN', because: `Before the declared closing deadline of ${route.closingDeadline}. Nothing is final.` };
}
