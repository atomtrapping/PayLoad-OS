/**
 * The two present keys run across three lines; the third key stays absent.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURE_CORPORA } from '@/fixtures';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { TRADEWIND_CORPUS } from '@/fixtures/tradewind/release';
import { LANDSHARK_CORPUS } from '@/fixtures/landshark/release';
import {
  BLOCKING_MEANING, CROSS_LINE_LOSS, CROSS_LINE_METHOD, blockPair, crossLineStanding, linePositions,
  type BlockingOutcome, type LinePosition,
} from './crossLineJoin';

const standing = crossLineStanding(FIXTURE_CORPORA);
const pair = (left: string, right: string) => standing.pairs.find((p) => p.left.subjectId === left && p.right.subjectId === right)!;

describe('the blocking keys now run across lines', () => {
  it('reads every line, because all three carry declared positions', () => {
    expect(standing.lines.map((l) => l.domain)).toEqual(['CARAVAN', 'TRADEWIND', 'LANDSHARK']);
    expect(standing.lines.every((l) => l.positions > 0)).toBe(true);
    expect(standing.method).toBe(CROSS_LINE_METHOD);
  });

  /** The moat's own shape: a cargo flow, a freight instrument and a parcel, in one cell. */
  it('blocks the cargo lot, the freight instrument and the parcel together at the loading terminal', () => {
    const triangle = [
      pair('LOT-5B-221', 'INST-TW-C5'),
      pair('LOT-5B-221', 'PARCEL-NL-0442'),
      pair('INST-TW-C5', 'PARCEL-NL-0442'),
    ];
    for (const p of triangle) {
      expect(p.outcome).toBe('CO_LOCATED');
      expect(p.comparedCell).toBe('u14ze9');
      expect(p.overlap).not.toBeNull();
    }
    // Three lines, pairwise, and the pairs are cross-line only.
    expect(new Set(triangle.flatMap((p) => [p.left.domain, p.right.domain]))).toEqual(new Set(['CARAVAN', 'TRADEWIND', 'LANDSHARK']));
    expect(standing.pairs.every((p) => p.left.domain !== p.right.domain)).toBe(true);
  });

  it('blocks the second lot to its own yard parcel and to nothing at the terminal', () => {
    expect(pair('LOT-7C-104', 'PARCEL-BR-1207').outcome).toBe('CO_LOCATED');
    expect(pair('LOT-7C-104', 'PARCEL-NL-0442').outcome).toBe('NOT_CO_LOCATED');
    expect(pair('LOT-5B-221', 'PARCEL-BR-1207').outcome).toBe('NOT_CO_LOCATED');
  });

  it('compares at the coarser of the two precisions, never the finer', () => {
    // Caravan's lot states ±250 m and Tradewind's route ±400 m: the comparison
    // is made at the resolution the vaguer of the two supports.
    const p = pair('LOT-5B-221', 'INST-TW-C5');
    expect(p.comparedAtPrecision).toBe(Math.min(p.left.key!.precision, p.right.key!.precision));
    expect(p.left.key!.boundedByM).toBe(250);
    expect(p.right.key!.boundedByM).toBe(400);
    expect(p.because).toMatch(/the coarser of/);
  });
});

describe('the join that still does not exist', () => {
  it('resolves nothing, whatever the keys found', () => {
    expect(standing.coLocated).toBeGreaterThan(0);
    expect(standing.resolved).toBe(0);
    expect(standing.resolutionState).toBe('ABSENT');
    expect(standing.because).toMatch(/block together and 0 are resolved/);
    expect(standing.because).toMatch(/resolution decision object/);
  });

  it('says in every co-located pair that co-location establishes nothing', () => {
    for (const p of standing.pairs.filter((x) => x.outcome === 'CO_LOCATED')) {
      expect(p.because).toMatch(/establishes nothing else/);
      expect(p.because).toMatch(/no resolution between them/);
    }
    expect(BLOCKING_MEANING.CO_LOCATED).toMatch(/says nothing about whether the subjects are related/);
  });
});

describe('a position with no stated uncertainty is neither co-located nor apart', () => {
  it('refuses the comparison rather than assuming a radius', () => {
    const unkeyable = standing.pairs.filter((p) => p.outcome === 'NOT_KEYABLE');
    expect(unkeyable.length).toBeGreaterThan(0);
    for (const p of unkeyable) {
      expect(p.comparedAtPrecision).toBeNull();
      expect(p.comparedCell).toBeNull();
      expect(p.because).toMatch(/NO_STATED_UNCERTAINTY/);
      expect(p.because).toMatch(/default radius would have invented the answer/);
      // Every unkeyable pair involves the parcel whose registry published no precision.
      expect([p.left.subjectId, p.right.subjectId]).toContain('PARCEL-NL-0511');
    }
    expect(standing.lines.find((l) => l.domain === 'LANDSHARK')!.unkeyable).toBe(1);
  });
});

describe('the same place at different times is not co-location', () => {
  it('separates the spatial answer from the temporal one', () => {
    const left = linePositions(CARAVAN_CORPUS).find((p) => p.subjectId === 'LOT-5B-221')!;
    const right = linePositions(LANDSHARK_CORPUS).find((p) => p.subjectId === 'PARCEL-NL-0442')!;
    expect(blockPair(left, right).outcome).toBe('CO_LOCATED');
    // The same two cells, moved apart in valid time only.
    const later: LinePosition = { ...right, validFrom: '2030-01-01T00:00:00Z', validTo: '2030-02-01T00:00:00Z' };
    const moved = blockPair(left, later);
    expect(moved.outcome).toBe('NO_TIME_OVERLAP');
    expect(moved.comparedCell).toBe('u14ze9');
    expect(moved.because).toMatch(/same place at different times is not co-location/);
  });
});

describe('the rights guard runs before the keys do', () => {
  it('never keys a position the seat may not read', () => {
    // The counterparty's own delivery point is on a book registration with no
    // EXPORT right, so it does not leave the corpus and cannot be blocked on.
    const drawn = linePositions(TRADEWIND_CORPUS).map((p) => p.recordId);
    expect(drawn).toEqual(['TW-0104']);
    expect(TRADEWIND_CORPUS.records.some((r) => r.recordId === 'TW-0103' && r.predicate === 'location.position')).toBe(true);
    expect(standing.pairs.some((p) => p.left.recordId === 'TW-0103' || p.right.recordId === 'TW-0103')).toBe(false);
  });
});

describe('what the derivation gives up', () => {
  it('states its losses, beginning with co-location not being a relationship', () => {
    expect(CROSS_LINE_LOSS[0]).toMatch(/Co-location is not a relationship/);
    expect(CROSS_LINE_LOSS.join(' ')).toMatch(/coarser of the two precisions, never the finer/);
    expect(CROSS_LINE_LOSS.join(' ')).toMatch(/resolved is the literal 0/);
    for (const outcome of Object.keys(BLOCKING_MEANING) as BlockingOutcome[]) expect(BLOCKING_MEANING[outcome].length).toBeGreaterThan(0);
  });
});
