/**
 * When a fact became true, as distinct from when a register was read.
 *
 * The census adapter says this itself and spells it
 * NOT_ESTABLISHED_BY_SNAPSHOT. Reading a register on Tuesday tells you what the
 * register held on Tuesday. It does not tell you when the thing became so, and
 * a system that used the read time as the world time would date every fact to
 * the moment it happened to look — which is a fabrication that grows worse the
 * less often you look.
 *
 * So this stage takes what the evidence actually offers and answers one of
 * three ways.
 *
 * ESTABLISHED, when something declares the instant: a source's own effective
 * date, or an observation with a time of its own — a weighbridge ticket knows
 * when it weighed.
 *
 * BRACKETED, when two reads of the same register disagree. If it said X on
 * Monday and Y on Friday, the change happened after Monday and by Friday. That
 * is real information and it is *not* a valid-from: reporting the earlier bound
 * would claim the fact held before it did, the later bound would claim it did
 * not hold when it may have, and reporting the midpoint would invent a moment
 * nothing observed. So a bracket is returned as a bracket and the caller may
 * not flatten it.
 *
 * REFUSED, for a bare snapshot, which is the ordinary case and the one worth
 * being blunt about: a single read establishes nothing about world time at all.
 */
import type { ISODateTime } from './types';

export const WORLD_TIME_METHOD = 'notationsos.world-time.v1';

export type TimeEvidence =
  /** The source states when the fact took effect. The only kind that resolves cleanly. */
  | { kind: 'SOURCE_DECLARED_EFFECTIVE'; at: ISODateTime; declaredBy: string }
  /** An observation with a time of its own: a weighing, a survey, a berth entry. */
  | { kind: 'OBSERVATION_INSTANT'; at: ISODateTime; observedBy: string }
  /** One read of a register. Establishes when it was read and nothing else. */
  | { kind: 'SNAPSHOT_READ'; at: ISODateTime; register: string }
  /** Two reads that disagree: the change is after the earlier and by the later. */
  | { kind: 'BRACKETED_BY_READS'; unchangedAt: ISODateTime; changedBy: ISODateTime; register: string };

export type WorldTimeOutcome = 'ESTABLISHED' | 'BRACKETED' | 'REFUSED';

export interface WorldTime {
  outcome: WorldTimeOutcome;
  /** Set only when ESTABLISHED. A bracket does not produce one, on purpose. */
  validFrom: ISODateTime | null;
  /** Set only when BRACKETED: the fact became true after the first and by the second. */
  bracket: { after: ISODateTime; by: ISODateTime } | null;
  because: string;
}

/** Pure: what the evidence establishes about when the fact became true. */
export function establishWorldTime(evidence: TimeEvidence): WorldTime {
  switch (evidence.kind) {
    case 'SOURCE_DECLARED_EFFECTIVE':
      return {
        outcome: 'ESTABLISHED', validFrom: evidence.at, bracket: null,
        because: `${evidence.declaredBy} declares the fact effective from ${evidence.at}. That is the source stating its own world time rather than this system inferring one.`,
      };
    case 'OBSERVATION_INSTANT':
      return {
        outcome: 'ESTABLISHED', validFrom: evidence.at, bracket: null,
        because: `${evidence.observedBy} observed it at ${evidence.at}, and an observation carries its own instant. This is when the observation happened, which is not a claim that the state began then.`,
      };
    case 'SNAPSHOT_READ':
      return {
        outcome: 'REFUSED', validFrom: null, bracket: null,
        because: `${evidence.register} was read at ${evidence.at}, which establishes when it was read and nothing about when the fact became true. Using a read time as a world time dates every fact to the moment somebody looked.`,
      };
    case 'BRACKETED_BY_READS': {
      if (!(evidence.unchangedAt < evidence.changedBy)) {
        return {
          outcome: 'REFUSED', validFrom: null, bracket: null,
          because: `The two reads of ${evidence.register} are not ordered (${evidence.unchangedAt} is not before ${evidence.changedBy}), so they bracket nothing.`,
        };
      }
      return {
        outcome: 'BRACKETED', validFrom: null,
        bracket: { after: evidence.unchangedAt, by: evidence.changedBy },
        because: `${evidence.register} was unchanged at ${evidence.unchangedAt} and changed by ${evidence.changedBy}, so the transition lies between them. That is a bound and not an instant: the earlier bound would claim the fact held before it did, the later would claim it did not hold when it may have, and a midpoint would invent a moment nothing observed.`,
      };
    }
  }
}

export const WORLD_TIME_LOSS = [
  'A read time is not a world time. One snapshot establishes when a register was read and refuses to say more.',
  'A bracket is a bound, not an instant, and may not be flattened to one. Both ends are wrong as a valid-from and the middle is invented.',
  'An observation instant is when the observation happened. It is not a claim that the state began at that moment, only that it held then.',
  'A declared effective date is the source stating its own world time. It is testimony like any other and inherits whatever the source is worth.',
] as const;
