import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHarvest } from './statutoryHarvester';
import { persistHarvest } from './statutoryPersistence';
import { NAIC_REGISTRY, STATUTORY_SPECIMENS, STATUTORY_SPECIMEN_CONTEXT } from '@/fixtures/insurability/statutoryFilings';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';

const mocks = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('@/db/admitRecords', () => ({ admitRecords: mocks.write }));
// This suite checks forwarding and receipts with a mocked writer. The real
// projection/assertion binding is exercised by db/admitRecords.test.ts.
const target = { corpusId: 'test-corpus', releaseId: 'test-release', authority: 'test:steward', ruledAt: '2026-05-01T00:00:00.000Z', releaseRecords: [CARAVAN_CORPUS.records[0]] };
const run = () => runHarvest(
  STATUTORY_SPECIMENS.map((entry) => ({ declaration: { ...entry.declaration, beganAs: 'OPERATOR_CAPTURE' as const }, text: entry.text })),
  NAIC_REGISTRY, 'test-build', target.ruledAt, STATUTORY_SPECIMEN_CONTEXT, target.authority, target.ruledAt,
);
beforeEach(() => { vi.stubEnv('DATABASE_URL', 'postgres://unused.invalid/test'); mocks.write.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe('the persistence receipt counts actual inserts', () => {
  it.each([undefined, []])('does not call the writer without declared serving projections: %s', async (releaseRecords) => {
    expect(await persistHarvest(run(), { ...target, releaseRecords }))
      .toMatchObject({ outcome: 'PROJECTION_REQUIRED', written: 0, canonicalStateMutated: false });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('reports verified existing rows without claiming a canonical mutation', async () => {
    mocks.write.mockResolvedValue({ admitted: ['r1', 'r2'], inserted: [], existing: ['r1', 'r2'], refused: [], because: 'Read back unchanged.' });
    const result = await persistHarvest(run(), target);
    expect(result).toMatchObject({ outcome: 'EXISTING', written: 0, canonicalStateMutated: false });
    expect(result.because).toContain('2 identical rows verified');
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ releaseRecords: target.releaseRecords }));
  });

  it('counts only newly inserted rows in a mixed fresh/retry batch', async () => {
    mocks.write.mockResolvedValue({ admitted: ['r1', 'r2'], inserted: ['r2'], existing: ['r1'], refused: [], because: 'Read back.' });
    expect(await persistHarvest(run(), target)).toMatchObject({ outcome: 'WRITTEN', written: 1, canonicalStateMutated: true });
  });

  it('does not turn a transaction conflict into a successful receipt', async () => {
    mocks.write.mockRejectedValue(new Error('ADMISSION_WRITE_CONFLICT'));
    await expect(persistHarvest(run(), target)).rejects.toThrow('ADMISSION_WRITE_CONFLICT');
  });
});
