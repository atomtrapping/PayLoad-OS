import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { captureSuppliedDocument, extractFiling } from '@/domain/statutoryHarvest';
import { runHarvest, runSpecimenHarvest, reportHarvest, type HarvestRun } from './statutoryHarvester';
import {
  databaseConfigured,
  notRequested,
  persistHarvest,
  persistenceVerdict,
} from './statutoryPersistence';
import {
  NAIC_REGISTRY,
  STATUTORY_SPECIMENS,
  STATUTORY_SPECIMEN_CONTEXT,
} from '@/fixtures/insurability/statutoryFilings';

const AUTHORITY = 'authority:notations-corpus-board';
const RULED_AT = '2026-04-02T00:00:00.000Z';

/**
 * The specimens re-declared as operator captures, so the paths that only a
 * non-drafted run can reach are reachable in a test. Local to this file on
 * purpose: nothing in the fixtures claims an operator captured anything.
 */
function asOperatorCapture(captureIds: readonly string[] = STATUTORY_SPECIMENS.map((s) => s.declaration.captureId)): HarvestRun {
  const documents = STATUTORY_SPECIMENS
    .filter((entry) => captureIds.includes(entry.declaration.captureId))
    .map((entry) => ({ declaration: { ...entry.declaration, beganAs: 'OPERATOR_CAPTURE' as const }, text: entry.text }));
  return runHarvest(documents, NAIC_REGISTRY, 'operator-build', '2026-05-01T00:00:00.000Z', STATUTORY_SPECIMEN_CONTEXT, AUTHORITY, RULED_AT);
}

const originalUrl = process.env.DATABASE_URL;
afterEach(() => { process.env.DATABASE_URL = originalUrl; });

describe('admitting and writing are two acts', () => {
  it('defaults to nothing written, and says the canonical count is unchanged', () => {
    const state = notRequested();
    expect(state.outcome).toBe('NOT_REQUESTED');
    expect(state.written).toBe(0);
    expect(state.canonicalStateMutated).toBe(false);
    expect(state.because).toContain('admitting a candidate and writing a row are two acts');
  });

  it('states persistence in the served report rather than leaving it to be inferred', () => {
    const report = reportHarvest(runSpecimenHarvest(), '2026-05-01T00:00:00.000Z', null);
    expect(report.records.admitted).toBe(5);
    expect(report.persistence.canonicalStateMutated).toBe(false);
    expect(report.persistence.outcome).toBe('NOT_REQUESTED');
    // And what would happen if it were asked for, which is the honest warning.
    expect(report.persistence.wouldBe).toBe('REFUSED_DRAFTED_SPECIMEN');
  });
});

describe('a drafted specimen may cross the gate and may never be written', () => {
  /**
   * The hole this closes. The specimen context declares BACKFILLED, which is
   * what a republished regulatory order genuinely is and which the gate stamps
   * onto the row — so a row descending from bytes typed in this repository
   * would sit in the records table indistinguishable from one descending from
   * a real filing. The refusal has to happen on the capture.
   */
  it('refuses the specimen run on the capture, not on the row', () => {
    const verdict = persistenceVerdict(runSpecimenHarvest())!;
    expect(verdict.outcome).toBe('REFUSED_DRAFTED_SPECIMEN');
    expect(verdict.canonicalStateMutated).toBe(false);
    expect(verdict.because).toContain('indistinguishable in the records table');
  });

  it('names every drafted capture it refused', () => {
    const verdict = persistenceVerdict(runSpecimenHarvest())!;
    for (const id of ['fl-oir-302214-26-co', 'ca-cdi-2026-04', 'tx-tdi-2026-8871']) {
      expect(verdict.because).toContain(id);
    }
  });

  it('still admits and still serves the specimen — the refusal is about writing alone', () => {
    const run = runSpecimenHarvest();
    expect(run.receipt.counts.admitted).toBe(5);
    expect(run.receipt.rows).toHaveLength(5);
  });

  it('refuses a run in which even one capture is drafted', async () => {
    const mixed = runHarvest(
      [
        { declaration: { ...STATUTORY_SPECIMENS[0].declaration, beganAs: 'OPERATOR_CAPTURE' }, text: STATUTORY_SPECIMENS[0].text },
        { declaration: STATUTORY_SPECIMENS[2].declaration, text: STATUTORY_SPECIMENS[2].text },
      ],
      NAIC_REGISTRY, 'mixed-build', '2026-05-01T00:00:00.000Z', STATUTORY_SPECIMEN_CONTEXT, AUTHORITY, RULED_AT,
    );
    const state = await persistHarvest(mixed, { corpusId: 'c', releaseId: 'r', authority: AUTHORITY, ruledAt: RULED_AT });
    expect(state.outcome).toBe('REFUSED_DRAFTED_SPECIMEN');
    expect(state.canonicalStateMutated).toBe(false);
  });

  /** Reached before any connection is opened, so the refusal that matters does not depend on the environment. */
  it('refuses a drafted run even when a database is configured', () => {
    process.env.DATABASE_URL = 'postgres://unused.invalid/db';
    expect(databaseConfigured()).toBe(true);
    expect(persistenceVerdict(runSpecimenHarvest())!.outcome).toBe('REFUSED_DRAFTED_SPECIMEN');
  });
});

describe('the other two refusals', () => {
  it('writes nothing when nothing was admitted, because a refusal is not a version', () => {
    // The Texas order alone: identity resolves, world time is refused, so no candidate is admitted.
    const verdict = persistenceVerdict(asOperatorCapture(['tx-tdi-2026-8871']))!;
    expect(verdict.outcome).toBe('NOTHING_ADMITTED');
    expect(verdict.because).toContain('not a version');
  });

  it('reports an absent database as a fact about the environment, not about the candidates', () => {
    process.env.DATABASE_URL = '';
    const verdict = persistenceVerdict(asOperatorCapture())!;
    expect(verdict.outcome).toBe('NO_DATABASE');
    expect(verdict.because).toContain('admissible and unwritten');
  });

  it('treats an empty DATABASE_URL as no database', () => {
    process.env.DATABASE_URL = '   ';
    expect(databaseConfigured()).toBe(false);
  });

  it('lets an operator-captured, admitted run through the verdict when a database exists', () => {
    process.env.DATABASE_URL = 'postgres://unused.invalid/db';
    expect(persistenceVerdict(asOperatorCapture())).toBeNull();
  });
});

describe('this is not a second writer', () => {
  /** architecture.test.ts fails on a third writer; this states the intent at the module. */
  it('inserts nothing itself and routes through the one sanctioned door', () => {
    const source = readFileSync('src/adapter/statutoryPersistence.ts', 'utf-8');
    expect(source).not.toMatch(/\binsert\(/);
    expect(source).toContain("await import('@/db/admitRecords')");
  });

  it('supplies no authority of its own', () => {
    const source = readFileSync('src/adapter/statutoryPersistence.ts', 'utf-8');
    expect(source).toMatch(/authority: target\.authority/);
    expect(source).not.toMatch(/authority:\s*['"`][a-z]/i);
  });
});

describe('a capture that was refused never reaches the question', () => {
  it('does not count a document that failed capture as drafted or as captured', () => {
    const broken = captureSuppliedDocument({ ...STATUTORY_SPECIMENS[0].declaration, knownAt: '2020-01-01T00:00:00.000Z' }, STATUTORY_SPECIMENS[0].text);
    expect(broken.capture).toBeNull();
    const run = runHarvest(
      [{ declaration: { ...STATUTORY_SPECIMENS[0].declaration, beganAs: 'OPERATOR_CAPTURE', knownAt: '2020-01-01T00:00:00.000Z' }, text: STATUTORY_SPECIMENS[0].text }],
      NAIC_REGISTRY, 'broken-build', '2026-05-01T00:00:00.000Z', STATUTORY_SPECIMEN_CONTEXT, AUTHORITY, RULED_AT,
    );
    expect(run.extractions).toHaveLength(0);
    expect(run.captureRefusals).toHaveLength(1);
    expect(persistenceVerdict(run)!.outcome).toBe('NOTHING_ADMITTED');
  });

  it('extracts what it captured, so beganAs on the extraction is the supplier’s word unchanged', () => {
    const captured = captureSuppliedDocument({ ...STATUTORY_SPECIMENS[0].declaration, beganAs: 'OPERATOR_CAPTURE' }, STATUTORY_SPECIMENS[0].text);
    expect(captured.capture).not.toBeNull();
    expect(extractFiling(captured.capture!).beganAs).toBe('OPERATOR_CAPTURE');
  });
});
