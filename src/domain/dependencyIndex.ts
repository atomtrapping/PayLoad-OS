/**
 * What depends on a record, so a correction can reach it.
 *
 * The corpus has ancestry and it runs backwards: record_ancestry answers "where
 * did this record come from" — one row, one candidate, one build. Nothing
 * answers the other direction. A retraction carries affectedRecordIds and
 * affectedRulingIds, which means whoever writes the retraction has to already
 * know every dependent by hand, and a dependent they forget is a dependent that
 * never hears. That is the industry's standard silent failure: corrections that
 * do not reach the things built on them, so the correction tape is honest and
 * the downstream is stale, and nothing in the system can tell.
 *
 * This is the forward edge. A thing that depends on a record declares that it
 * does, at the moment it comes to depend on it — a release including it, a
 * ruling citing it, a derived record computed from it, an answer served over it,
 * an attestation taken across it. The index is then a closure: restate one
 * record and walk to everything that stands on it, and on that, and on that.
 *
 * TWO PROPERTIES THAT ARE THE WHOLE POINT
 *
 * The fan-out reports a *consequence*, never a verdict. A dependent of a
 * corrected record is restated and needs re-evaluating; a dependent of a
 * withdrawn record is unsupported, which is not the same and must not be
 * reported as though a contrary fact had arrived. WITHDRAWN IS NOT FALSE, one
 * hop out.
 *
 * And the reach is honest about itself. This is a closure over *declared*
 * edges. Something that depends on a record and never said so is not in the
 * index, cannot be reached, and — the part worth saying out loud — cannot be
 * counted as absent either. The index reports what it covers rather than
 * implying it covers everything, because a dependency graph that quietly claims
 * completeness is worse than none: it converts an unknown into a clean bill.
 */
import type { ISODateTime } from './types';

export const DEPENDENCY_METHOD = 'notationsos.dependency-index.v1';

export type DependentKind = 'RELEASE' | 'RULING' | 'DERIVED_RECORD' | 'SERVED_ANSWER' | 'ATTESTATION';

export const DEPENDENT_KIND_MEANING: Record<DependentKind, string> = {
  RELEASE: 'A release that carries the record. Correcting the record does not edit the release; the release stays what it was and a later one supersedes it.',
  RULING: 'A ruling that cited the record as evidence. A restatement means the ruling was reached on facts that have since moved.',
  DERIVED_RECORD: 'A record computed from the record. This is the edge that makes the closure transitive, and the one most easily left undeclared.',
  SERVED_ANSWER: 'An answer already delivered over the record. It cannot be recalled, only followed by a correction notice to whoever received it.',
  ATTESTATION: 'An attestation taken across the record. It attested what was held at its instant and remains true about that instant; what changed is the ground under it.',
};

/** Declared by the dependent, at the moment it comes to depend. Never inferred. */
export interface DependencyEdge {
  dependent: { kind: DependentKind; id: string };
  /** The record depended upon. */
  dependsOn: string;
  declaredAt: ISODateTime;
  /** How the dependency arose, in the dependent's own terms. */
  because: string;
}

export type Restatement = 'CORRECTION' | 'WITHDRAWAL';

/** What a restatement means for something standing on it. Never a verdict. */
export type Consequence = 'RESTATED' | 'UNSUPPORTED';

export const CONSEQUENCE_MEANING: Record<Consequence, { meaning: string; andSo: string }> = {
  RESTATED: {
    meaning: 'A record this stands on was corrected: a different value now holds.',
    andSo: 'It must be re-evaluated against the corrected facts. Whether the conclusion changes is the re-evaluation’s answer and not this index’s.',
  },
  UNSUPPORTED: {
    meaning: 'A record this stands on was withdrawn, with nothing put in its place.',
    andSo: 'The support is gone and nothing contrary has been established. Reporting this as a finding against the dependent would manufacture a fact the corpus did not supply.',
  },
};

export interface Reached {
  dependent: { kind: DependentKind; id: string };
  consequence: Consequence;
  /** Records restated at the root of this dependent's path, nearest first. */
  through: string[];
  /** Hops from the restated record. One means it depended directly. */
  depth: number;
  because: string;
}

export interface FanOut {
  restated: string[];
  kind: Restatement;
  reached: Reached[];
  /** The deepest chain walked, which is what a transitive derivation costs. */
  maxDepth: number;
  /** What this closure covers, said rather than implied. */
  coverage: string;
  because: string;
}

/**
 * Pure: everything that declared a dependency on the restated records, and on
 * anything reached from them.
 *
 * Cycle-safe by construction: a dependent is visited once, at the shallowest
 * depth it is reached, so a derived record that transitively depends on itself
 * terminates instead of looping.
 */
export function fanOut(
  edges: readonly DependencyEdge[],
  restated: readonly string[],
  kind: Restatement,
): FanOut {
  // Forward adjacency: record -> the things standing on it.
  const standing = new Map<string, DependencyEdge[]>();
  for (const edge of edges) {
    standing.set(edge.dependsOn, [...(standing.get(edge.dependsOn) ?? []), edge]);
  }

  const consequence: Consequence = kind === 'WITHDRAWAL' ? 'UNSUPPORTED' : 'RESTATED';
  const seen = new Map<string, Reached>();
  let frontier: Array<{ recordId: string; through: string[]; depth: number }> =
    [...new Set(restated)].map((recordId) => ({ recordId, through: [recordId], depth: 0 }));
  let maxDepth = 0;

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const step of frontier) {
      for (const edge of standing.get(step.recordId) ?? []) {
        const key = `${edge.dependent.kind}:${edge.dependent.id}`;
        // First arrival wins: the shallowest path is the one worth reporting,
        // and revisiting is what turns a diamond into an infinite walk.
        if (seen.has(key)) continue;
        const depth = step.depth + 1;
        maxDepth = Math.max(maxDepth, depth);
        seen.set(key, {
          dependent: edge.dependent,
          consequence,
          through: step.through,
          depth,
          because: `${edge.because} ${CONSEQUENCE_MEANING[consequence].andSo}`,
        });
        // A derived record is itself a record, so the closure continues through it.
        if (edge.dependent.kind === 'DERIVED_RECORD') {
          next.push({ recordId: edge.dependent.id, through: [edge.dependent.id, ...step.through], depth });
        }
      }
    }
    frontier = next;
  }

  const reached = [...seen.values()].sort((a, b) => a.depth - b.depth || (a.dependent.id < b.dependent.id ? -1 : 1));
  return {
    restated: [...new Set(restated)],
    kind,
    reached,
    maxDepth,
    coverage: `This is the closure over ${edges.length} declared ${edges.length === 1 ? 'edge' : 'edges'}. Something that depends on one of these records and never declared it is not here, cannot be reached, and is not shown to be absent either — an index that implied completeness would turn an unknown into a clean bill, which is worse than having no index at all.`,
    because: reached.length === 0
      ? `Nothing declared a dependency on ${[...new Set(restated)].join(', ')}. That is a statement about the declared edges and not about the world.`
      : `${reached.length} ${reached.length === 1 ? 'dependent' : 'dependents'} stand on ${[...new Set(restated)].length} restated ${[...new Set(restated)].length === 1 ? 'record' : 'records'}, at up to ${maxDepth} ${maxDepth === 1 ? 'hop' : 'hops'}. Each is ${consequence}, which is a consequence to act on rather than a verdict about it.`,
  };
}

/** Every record a dependent stands on, directly. The backward view, for a dispute. */
export function standsOn(edges: readonly DependencyEdge[], dependentId: string): DependencyEdge[] {
  return edges.filter((edge) => edge.dependent.id === dependentId);
}

export const FAN_OUT_LOSS = [
  'The closure covers declared edges. An undeclared dependent is unreachable and is not reported as absent, because the index cannot tell the difference between nothing depending on a record and nobody having said so.',
  'A consequence is not a verdict. RESTATED means re-evaluate; it does not mean the conclusion changes. UNSUPPORTED means the support is gone; it does not mean anything contrary was established.',
  'Reaching a dependent is not notifying it. This computes who must be told; telling them is a delivery with its own record.',
  'A served answer cannot be recalled. It is reached so that whoever received it can be sent a correction, not so the answer can be edited.',
  'An attestation stays true about the instant it attested. What moved is the ground beneath it, which is why it is reached rather than invalidated.',
] as const;
