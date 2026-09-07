/**
 * What a release condition can say.
 *
 * The first version was one subject, one predicate, one scalar comparison. That
 * expresses "gross quantity at most 40.05 t" and nothing else — not detention,
 * which accrues past a free window; not an accessorial, which triggers on an
 * event class; not a truck-ordered-not-used, which is a condition on something
 * *not* happening; and nothing with an "or" in it. Every real freight or trade
 * term has at least one of those, so a grammar without them forces a
 * counterparty to restate their rate confirmation as a scalar comparison, and
 * nobody does that. Their terms have to compile into this, not be replaced by
 * it.
 *
 * So: five node kinds, composable, with the counterparty's own wording carried
 * verbatim on every node. The compiled form is what the corpus evaluates; the
 * agreed text is what a dispute reads, and neither is derived from the other.
 *
 * THREE-VALUED, AND THE ORDERING MATTERS
 *
 * A node answers GRANTED, WITHHELD or NOT_ADJUDICABLE, and composition is
 * Kleene-ordered rather than boolean. In ALL_OF a definite failure outranks an
 * unknown: if one leg is definitely unmet, the whole is unmet whatever the
 * others could not decide. In ANY_OF a definite success outranks an unknown for
 * the same reason. What is never allowed is an unknown quietly becoming a
 * false, which is the collapse the whole system is built against and which
 * ordinary boolean composition performs silently.
 *
 * THE ONE THAT LOOKS EASY AND IS NOT
 *
 * A condition on something not happening — truck ordered not used, no damage
 * recorded, no customs hold — cannot be settled by failing to find a record.
 * The absence of a record is a fact about the corpus and not about the world.
 * So DID_NOT_OCCUR requires a declared coverage record: something that says
 * this window was watched. Without one the node is NOT_ADJUDICABLE, and it says
 * why rather than answering the easy way.
 */

export type NodeVerdict = 'GRANTED' | 'WITHHELD' | 'NOT_ADJUDICABLE';
export type ScalarTest = 'AT_LEAST' | 'AT_MOST' | 'EQUALS' | 'EXISTS';

export interface ConditionBase {
  /** The counterparty's own wording for this leg, kept verbatim. Never generated. */
  agreedText: string;
}

/** A value compared against a bound. The original grammar, now one kind among several. */
export interface ScalarNode extends ConditionBase {
  kind: 'SCALAR';
  subjectId: string;
  predicate: string;
  test: ScalarTest;
  value?: number | string;
}

/** An event class: it happened, or — with declared coverage — it did not. */
export interface EventNode extends ConditionBase {
  kind: 'EVENT';
  subjectId: string;
  predicate: string;
  expect: 'OCCURRED' | 'DID_NOT_OCCUR';
  /**
   * Required for DID_NOT_OCCUR: a predicate whose record declares the window was
   * watched. Absence of a record is not evidence of absence, so without this
   * the node refuses rather than reading silence as a no.
   */
  coveragePredicate?: string;
}

/** Time accruing past a free window: detention, demurrage, layover. */
export interface DurationNode extends ConditionBase {
  kind: 'DURATION';
  subjectId: string;
  startPredicate: string;
  endPredicate: string;
  /** Free time before anything is chargeable. */
  freeSeconds: number;
  test: 'AT_LEAST' | 'AT_MOST';
  /** Chargeable seconds the test is against, after the free window is removed. */
  seconds: number;
}

export interface AllOfNode extends ConditionBase { kind: 'ALL_OF'; of: readonly ConditionNode[] }
export interface AnyOfNode extends ConditionBase { kind: 'ANY_OF'; of: readonly ConditionNode[] }

export type ConditionNode = ScalarNode | EventNode | DurationNode | AllOfNode | AnyOfNode;

export interface ResolvedFact {
  recordId: string;
  value: string | number;
  unit?: string;
  /** World time the record's validity begins, used as the event instant. */
  validFrom: string;
}

/** How a node reaches the corpus. The grammar never touches a release itself. */
export type FactResolver = (subjectId: string, predicate: string) => { fact: ResolvedFact | null; because: string };

export interface NodeOutcome {
  verdict: NodeVerdict;
  /** Every record this leg stood on. A dispute begins here. */
  reliedOn: string[];
  because: string;
}

const TEST_PROSE: Record<ScalarTest, string> = {
  AT_LEAST: 'at least', AT_MOST: 'at most', EQUALS: 'exactly', EXISTS: 'answerable at all',
};

function compareScalar(test: ScalarTest, actual: number | string, expected: number | string | undefined): boolean {
  if (test === 'EXISTS') return true;
  if (expected === undefined) return false;
  if (test === 'EQUALS') return String(actual) === String(expected);
  const left = Number(actual), right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return test === 'AT_LEAST' ? left >= right : left <= right;
}

function evaluateScalar(node: ScalarNode, resolve: FactResolver): NodeOutcome {
  const { fact, because } = resolve(node.subjectId, node.predicate);
  if (!fact) return { verdict: 'NOT_ADJUDICABLE', reliedOn: [], because };
  const met = compareScalar(node.test, fact.value, node.value);
  const stated = node.test === 'EXISTS' ? 'existence' : `${TEST_PROSE[node.test]} ${node.value}${fact.unit ? ` ${fact.unit}` : ''}`;
  return {
    verdict: met ? 'GRANTED' : 'WITHHELD',
    reliedOn: [fact.recordId],
    because: `${fact.recordId} states ${fact.value}${fact.unit ? ` ${fact.unit}` : ''} against a condition of ${stated}, so this leg ${met ? 'holds' : 'does not hold'}. A statement about the record, not about the cargo.`,
  };
}

function evaluateEvent(node: EventNode, resolve: FactResolver): NodeOutcome {
  const { fact, because } = resolve(node.subjectId, node.predicate);
  if (node.expect === 'OCCURRED') {
    return fact
      ? { verdict: 'GRANTED', reliedOn: [fact.recordId], because: `${fact.recordId} records ${node.predicate} for ${node.subjectId}.` }
      : { verdict: 'NOT_ADJUDICABLE', reliedOn: [], because: `${because} No record places this event, and the absence of a record is not evidence that it did not happen.` };
  }
  if (fact) {
    return { verdict: 'WITHHELD', reliedOn: [fact.recordId], because: `${fact.recordId} records ${node.predicate}, and this leg required that it did not occur.` };
  }
  if (!node.coveragePredicate) {
    return {
      verdict: 'NOT_ADJUDICABLE', reliedOn: [],
      because: 'This leg asks that something did not occur and names no coverage record. Finding nothing is a fact about the corpus and not about the world, so it cannot settle the question. Declare a predicate whose record states that the window was watched.',
    };
  }
  const coverage = resolve(node.subjectId, node.coveragePredicate);
  if (!coverage.fact) {
    return {
      verdict: 'NOT_ADJUDICABLE', reliedOn: [],
      because: `Nothing records ${node.predicate}, and the declared coverage ${node.coveragePredicate} is itself unavailable: ${coverage.because} An unwatched silence says nothing.`,
    };
  }
  return {
    verdict: 'GRANTED', reliedOn: [coverage.fact.recordId],
    because: `${coverage.fact.recordId} declares the window watched and nothing records ${node.predicate}, so the non-occurrence is attributed rather than assumed.`,
  };
}

const instant = (iso: string): number | null => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

function evaluateDuration(node: DurationNode, resolve: FactResolver): NodeOutcome {
  const start = resolve(node.subjectId, node.startPredicate);
  const end = resolve(node.subjectId, node.endPredicate);
  if (!start.fact || !end.fact) {
    const missing = !start.fact ? node.startPredicate : node.endPredicate;
    return { verdict: 'NOT_ADJUDICABLE', reliedOn: [], because: `The duration needs both ends and ${missing} does not resolve: ${!start.fact ? start.because : end.because}` };
  }
  const from = instant(start.fact.validFrom), to = instant(end.fact.validFrom);
  if (from === null || to === null) {
    return { verdict: 'NOT_ADJUDICABLE', reliedOn: [start.fact.recordId, end.fact.recordId], because: 'One end of the duration is not a readable instant.' };
  }
  const elapsed = Math.max(0, (to - from) / 1000);
  const chargeable = Math.max(0, elapsed - node.freeSeconds);
  const met = node.test === 'AT_MOST' ? chargeable <= node.seconds : chargeable >= node.seconds;
  return {
    verdict: met ? 'GRANTED' : 'WITHHELD',
    reliedOn: [start.fact.recordId, end.fact.recordId],
    because: `${(elapsed / 3600).toFixed(2)} h elapsed between ${start.fact.recordId} and ${end.fact.recordId}, less ${(node.freeSeconds / 3600).toFixed(2)} h free, leaves ${(chargeable / 3600).toFixed(2)} h chargeable against a condition of ${node.test === 'AT_MOST' ? 'at most' : 'at least'} ${(node.seconds / 3600).toFixed(2)} h.`,
  };
}

/**
 * Pure: evaluate a condition tree three-valued.
 *
 * ALL_OF lets a definite failure outrank an unknown, ANY_OF lets a definite
 * success outrank one, and neither ever turns an unknown into a false.
 */
export function evaluateNode(node: ConditionNode, resolve: FactResolver): NodeOutcome {
  switch (node.kind) {
    case 'SCALAR': return evaluateScalar(node, resolve);
    case 'EVENT': return evaluateEvent(node, resolve);
    case 'DURATION': return evaluateDuration(node, resolve);
    case 'ALL_OF':
    case 'ANY_OF': {
      if (node.of.length === 0) {
        return { verdict: 'NOT_ADJUDICABLE', reliedOn: [], because: 'A composite with no legs decides nothing, and an empty conjunction is not a truth.' };
      }
      const parts = node.of.map((child) => evaluateNode(child, resolve));
      const reliedOn = [...new Set(parts.flatMap((p) => p.reliedOn))];
      const decisive: NodeVerdict = node.kind === 'ALL_OF' ? 'WITHHELD' : 'GRANTED';
      const otherwise: NodeVerdict = node.kind === 'ALL_OF' ? 'GRANTED' : 'WITHHELD';
      const label = node.kind === 'ALL_OF' ? 'every leg' : 'at least one leg';
      const decisiveParts = parts.filter((p) => p.verdict === decisive);
      if (decisiveParts.length > 0) {
        return { verdict: decisive, reliedOn, because: `${decisiveParts.length} of ${parts.length} legs are decisive here: ${decisiveParts.map((p) => p.because).join(' ')}` };
      }
      const unknown = parts.filter((p) => p.verdict === 'NOT_ADJUDICABLE');
      if (unknown.length > 0) {
        return { verdict: 'NOT_ADJUDICABLE', reliedOn, because: `${unknown.length} of ${parts.length} legs could not be decided, and an undecided leg is not a failed one: ${unknown.map((p) => p.because).join(' ')}` };
      }
      return { verdict: otherwise, reliedOn, because: `${label} holds. ${parts.map((p) => p.because).join(' ')}` };
    }
  }
}

/** Every distinct subject the tree touches, so a caller can see its reach before running it. */
export function subjectsOf(node: ConditionNode): string[] {
  if (node.kind === 'ALL_OF' || node.kind === 'ANY_OF') return [...new Set(node.of.flatMap(subjectsOf))].sort();
  return [node.subjectId];
}

/** The agreed text of every leg, in order, which is what a dispute reads. */
export function agreedTextOf(node: ConditionNode): string[] {
  if (node.kind === 'ALL_OF' || node.kind === 'ANY_OF') return [node.agreedText, ...node.of.flatMap(agreedTextOf)];
  return [node.agreedText];
}

/** The common case, so a single comparison stays a one-liner. */
export const scalar = (
  subjectId: string, predicate: string, test: ScalarTest, value: number | string | undefined, agreedText: string,
): ScalarNode => ({ kind: 'SCALAR', subjectId, predicate, test, value, agreedText });
