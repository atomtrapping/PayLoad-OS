/**
 * The gate, called.
 *
 * Every test that named `admitRecords` before this one read its source text as
 * a string: that it declares `authority: string`, that it does not contain a
 * literal authority, that no third file writes the records table. Those are
 * real properties and they are structural. Not one of them calls the function.
 *
 * So the one door that could ever move the admitted count off zero had never
 * been executed. The invariant said 0 and the machinery that would change that
 * number was untested — which is the least defensible gap in a system whose
 * whole thesis is that a record's provenance is checkable.
 *
 * The database module is substituted for a recorder. That is not a compromise
 * on the test's part: what is being asserted here is the door's behaviour —
 * which rows it writes, for which candidates, in what order, inside one
 * transaction — and every one of those is visible at the call boundary. The
 * SQL dialect is drizzle's problem and is exercised by drizzle's own tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdmissionCandidate } from '@/domain/admission';

interface Written { table: string; values: Record<string, unknown> }

const written: Written[] = [];
let transactions = 0;
let openTransactions = 0;
let maxOpenTransactions = 0;

/** A recorder shaped like the two drizzle calls the door actually makes. */
function makeTx() {
  return {
    insert(table: { name?: string } & Record<string, unknown>) {
      const name = tableName(table);
      return {
        values(values: Record<string, unknown>) {
          return {
            onConflictDoNothing() {
              written.push({ table: name, values });
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
}

/**
 * drizzle's table objects carry their SQL name on a symbol, so the name is
 * read off it rather than guessed from the import order. A test that matched
 * tables positionally would keep passing if two inserts were swapped, which is
 * exactly the mistake it exists to catch.
 */
function tableName(table: Record<string | symbol, unknown>): string {
  for (const key of Object.getOwnPropertySymbols(table)) {
    const value = table[key];
    if (typeof value === 'string' && value.length > 0 && /^[a-z_]+$/.test(value)) return value;
  }
  return String((table as { name?: string }).name ?? 'unknown');
}

vi.mock('@/db/index', () => ({
  db: {
    async transaction(run: (tx: ReturnType<typeof makeTx>) => Promise<void>) {
      transactions += 1;
      openTransactions += 1;
      maxOpenTransactions = Math.max(maxOpenTransactions, openTransactions);
      try {
        await run(makeTx());
      } finally {
        openTransactions -= 1;
      }
    },
  },
}));

const { admitRecords } = await import('./admitRecords');

const AUTHORITY = 'role:corpus-steward';
const RULED_AT = '2026-09-08T12:00:00Z';

function candidate(over: Partial<AdmissionCandidate> = {}): AdmissionCandidate {
  return {
    candidateId: 'cand-1',
    buildId: 'build-9',
    recordId: 'REC-1',
    subjectCanonicalId: 'notation://subject/facility-1',
    assertion: { subjectId: 'FACILITY-1', predicate: 'condition.moisture', value: 12.4, unit: '%', basis: 'As received' },
    origin: 'MEASURED',
    evidenceClass: { claimStrength: 'reported', productionClass: 'measured', interest: 'unknown' },
    provenance: { artifactDigest: 'a'.repeat(64), capturedAt: '2026-09-08T06:00:00Z' },
    provenanceClass: 'LIVE_CAPTURE',
    sourceTime: '2026-09-08T05:30:00Z',
    conditions: [],
    validFrom: '2026-09-08T06:00:00Z',
    knownAt: '2026-09-08T09:00:00Z',
    rightsDecision: 'PERMITTED',
    ...over,
  };
}

const run = (candidates: readonly AdmissionCandidate[], authority = AUTHORITY) =>
  admitRecords({ corpusId: 'caravan.specialty-cargo', releaseId: 'REL-CAR-2026.09.01', authority, ruledAt: RULED_AT, candidates });

const rowsIn = (table: string) => written.filter((entry) => entry.table === table);

beforeEach(() => {
  written.length = 0;
  transactions = 0;
  openTransactions = 0;
  maxOpenTransactions = 0;
});

describe('the door writes what the gate admitted, and only that', () => {
  it('resolves each table by its real SQL name, so nothing here is asserted positionally', async () => {
    // If the name lookup failed, every row would land under 'unknown' and the
    // "no record was written" assertions below would pass vacuously.
    await run([candidate()]);
    expect(new Set(written.map((entry) => entry.table))).toEqual(new Set(['admission_ruling', 'records', 'record_ancestry']));
    expect(written.some((entry) => entry.table === 'unknown')).toBe(false);
  });

  it('writes a record row, its ruling and its ancestry for an admitted candidate', async () => {
    const result = await run([candidate()]);
    expect(result.admitted).toEqual(['REC-1']);
    expect(result.refused).toEqual([]);

    expect(rowsIn('records')).toHaveLength(1);
    expect(rowsIn('admission_ruling')).toHaveLength(1);
    expect(rowsIn('record_ancestry')).toHaveLength(1);

    const record = rowsIn('records')[0].values;
    expect(record.recordId).toBe('REC-1');
    expect(record.corpusId).toBe('caravan.specialty-cargo');
    // The provenance column is what separates an admitted row from a seeded
    // one, and it comes off the ruling rather than off this function.
    expect(record.provenance).toBe('LIVE_CAPTURE');
  });

  it('writes a ruling and NO record for a candidate the gate refused', async () => {
    // A refusal is not deleted and not hidden: it stays with the checks it
    // failed, which is the only reason the ruling table is worth having.
    const result = await run([candidate({ rightsDecision: 'PROHIBITED' })]);
    expect(result.admitted).toEqual([]);
    expect(result.refused.map((entry) => entry.recordId)).toEqual(['REC-1']);

    expect(rowsIn('admission_ruling')).toHaveLength(1);
    expect(rowsIn('admission_ruling')[0].values.outcome).toBe('REFUSED');
    expect(rowsIn('records')).toHaveLength(0);
    expect(rowsIn('record_ancestry')).toHaveLength(0);
  });

  it('rules on a mixed batch and keeps each candidate’s outcome its own', async () => {
    const result = await run([
      candidate({ candidateId: 'cand-1', recordId: 'REC-1' }),
      candidate({ candidateId: 'cand-2', recordId: 'REC-2', rightsDecision: 'UNDECIDED' }),
      candidate({ candidateId: 'cand-3', recordId: 'REC-3', assertion: null }),
    ]);
    expect(result.admitted).toEqual(['REC-1']);
    expect(result.refused.map((entry) => entry.recordId).sort()).toEqual(['REC-2', 'REC-3']);
    // Three rulings, one record. A batch does not admit as a batch.
    expect(rowsIn('admission_ruling')).toHaveLength(3);
    expect(rowsIn('records')).toHaveLength(1);
    expect(rowsIn('record_ancestry')).toHaveLength(1);
    expect(rowsIn('record_ancestry')[0].values.recordId).toBe('REC-1');
  });
});

describe('the door cannot supply its own authority', () => {
  it('passes the caller’s authority through to every ruling it writes', async () => {
    await run([candidate()], 'role:release-manager');
    expect(rowsIn('admission_ruling')[0].values.authority).toBe('role:release-manager');
    expect(rowsIn('record_ancestry')[0].values.authority).toBe('role:release-manager');
  });

  it('refuses when the authority is the admission method itself, and still writes the refusal', async () => {
    // The gate's own rule, exercised through the door rather than asserted
    // about its source text: a process cannot admit on its own behalf.
    const { ADMISSION_METHOD } = await import('@/domain/admission');
    const result = await run([candidate()], ADMISSION_METHOD);
    expect(result.admitted).toEqual([]);
    expect(rowsIn('records')).toHaveLength(0);
    expect(rowsIn('admission_ruling')).toHaveLength(1);
    expect(rowsIn('admission_ruling')[0].values.outcome).toBe('REFUSED');
    expect(result.refused[0].because).toMatch(/AUTHORITY_IS_NOT_THE_PROCESS/);
  });
});

describe('a row can never exist without the ruling that produced it', () => {
  it('writes everything in exactly one transaction, and never nests one', async () => {
    await run([candidate({ recordId: 'REC-1' }), candidate({ candidateId: 'cand-2', recordId: 'REC-2' })]);
    expect(transactions).toBe(1);
    expect(maxOpenTransactions).toBe(1);
    expect(openTransactions).toBe(0);
  });

  it('writes every ruling before any record, so a partial failure leaves no orphan row', async () => {
    await run([
      candidate({ candidateId: 'cand-1', recordId: 'REC-1' }),
      candidate({ candidateId: 'cand-2', recordId: 'REC-2' }),
    ]);
    const firstRecord = written.findIndex((entry) => entry.table === 'records');
    const lastRuling = written.map((entry) => entry.table).lastIndexOf('admission_ruling');
    expect(lastRuling).toBeLessThan(firstRecord);
  });

  it('keeps ancestry out of the record row, where doctrine rule 2 says it belongs', async () => {
    await run([candidate()]);
    const record = rowsIn('records')[0].values;
    for (const forbidden of ['candidateId', 'buildId', 'runId']) expect(record[forbidden]).toBeUndefined();
    expect(JSON.stringify(record)).not.toContain('build-9');
    // And the join still exists, one table over.
    expect(rowsIn('record_ancestry')[0].values.buildId).toBe('build-9');
    expect(rowsIn('record_ancestry')[0].values.candidateId).toBe('cand-1');
    expect(rowsIn('record_ancestry')[0].values.releaseId).toBe('REL-CAR-2026.09.01');
  });
});

describe('what the door reports back', () => {
  it('counts admitted and refused, and says admission is not truth', async () => {
    const result = await run([candidate(), candidate({ candidateId: 'cand-2', recordId: 'REC-2', rightsDecision: 'PROHIBITED' })]);
    expect(result.because).toContain('1 of 2 admitted by role:corpus-steward');
    expect(result.because).toContain('1 refused, and every ruling was written whatever its outcome');
    expect(result.because).toMatch(/may be versions, not that their claims are true/);
  });

  it('writes nothing at all for an empty batch, and does not pretend it ruled', async () => {
    const result = await run([]);
    expect(result.admitted).toEqual([]);
    expect(result.refused).toEqual([]);
    expect(written).toHaveLength(0);
  });
});
