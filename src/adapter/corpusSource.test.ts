/**
 * The system's report about itself, derived rather than asserted.
 *
 * One number carries the whole discipline here: how many records have crossed
 * the admission gate. It has exactly three honest answers — a count read from
 * the store, a count of zero read from the store, and UNKNOWN when it could not
 * be read — and the third must never collapse into the second.
 */
import { describe, expect, it, vi } from 'vitest';
import { compressionAvailable } from '@/domain/compression';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { ADMITTED_PROVENANCE, FixtureCorpusSource, LiveCorpusSource } from './corpusSource';

/**
 * A LiveCorpusSource with its lazily-imported database replaced by the grouped
 * tallies the real query returns, so the test exercises the same arithmetic.
 */
function live(tallies: Array<{ provenance: string; rows: number }> | Error): LiveCorpusSource {
  const source = new LiveCorpusSource();
  const database = {
    db: { select: () => ({ from: () => ({ groupBy: async () => tallies }) }) },
    records: { provenance: 'provenance' },
  };
  Reflect.set(source, 'database', async () => {
    if (tallies instanceof Error) throw tallies;
    return database;
  });
  return source;
}

describe('the admitted count is read, not assumed', () => {
  it('answers UNKNOWN from a process that holds no store, because it cannot see admission at all', async () => {
    const reading = await new FixtureCorpusSource().admittedRecords();
    expect(reading.count).toBe('UNKNOWN');
    expect(reading.because).toMatch(/an unreadable count is not a zero/);
  });

  it('answers zero from a store that holds no gate-stamped row, and says it read one', async () => {
    const reading = live([{ provenance: 'DEMONSTRATION', rows: 2 }]);
    const result = await reading.admittedRecords();
    expect(result.count).toBe(0);
    expect(result.because).toMatch(/holds 2 rows/);
    expect(result.because).toMatch(/This is a read of the store and not an assumption/);
  });

  it('counts only what the gate stamps, so seeded demonstration rows can never read as admitted', async () => {
    const result = await live([
      { provenance: 'DEMONSTRATION', rows: 9 }, { provenance: 'LIVE_CAPTURE', rows: 2 }, { provenance: 'BACKFILLED', rows: 1 },
    ]).admittedRecords();
    expect(result.count).toBe(3);
    expect(result.because).toMatch(/3 of 12 rows/);
    expect(ADMITTED_PROVENANCE).not.toContain('DEMONSTRATION');
  });

  it('answers UNKNOWN when a configured store cannot be read, rather than reporting a zero it did not observe', async () => {
    const result = await live(new Error('connection refused')).admittedRecords();
    expect(result.count).toBe('UNKNOWN');
    expect(result.because).toMatch(/failed connection/);
  });
});

describe('the compression standing follows the count', () => {
  it('holds the admitted-record step blocked at zero and at UNKNOWN, for different stated reasons', () => {
    const unknown = compressionAvailable(CARAVAN_CORPUS, 'UNKNOWN');
    const none = compressionAvailable(CARAVAN_CORPUS, 0);
    expect(unknown.availableNow).toBe(none.availableNow);
    expect(unknown.statement).toMatch(/an unreadable count is not a zero/);
    expect(none.statement).toMatch(/no record has been admitted/);
    expect(unknown.statement).not.toEqual(none.statement);
  });

  /**
   * The upgrade trigger: the first admitted record moves the standing without an
   * edit here. Two steps wait on ADMITTED_RECORD, not one, so the count goes
   * three-of-five to five-of-five on the first admission.
   */
  it('releases every blocked step the moment one record is admitted', () => {
    const before = compressionAvailable(CARAVAN_CORPUS, 0);
    expect(before.availableNow).toBe(3);
    expect(before.translationSteps).toBe(5);
    expect(before.blocked.map((step) => step.needs)).toEqual(['ADMITTED_RECORD', 'ADMITTED_RECORD']);

    const after = compressionAvailable(CARAVAN_CORPUS, 1);
    expect(after.availableNow).toBe(5);
    expect(after.blocked).toEqual([]);
    expect(after.statement).toMatch(/All 5 translation steps collapse/);
  });
});

describe('the two sources answer the same question', () => {
  it('declares admittedRecords on the interface, so a third source cannot omit it', () => {
    for (const source of [new FixtureCorpusSource(), new LiveCorpusSource()]) {
      expect(typeof source.admittedRecords).toBe('function');
    }
    expect(vi.isMockFunction(FixtureCorpusSource.prototype.admittedRecords)).toBe(false);
  });
});
