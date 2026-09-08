import { describe, expect, it } from 'vitest';
import { FIXTURE_CORPORA } from '@/fixtures';
import { recordPayload } from '@/adapter/feedShapes';
import { hydrateCorpusRecord, storageJson, timestamp, type StoredRecord } from './recordStorage';

describe('stored record compatibility and honest hydration', () => {
  it('round trips every committed demonstration record without adding admission claims', () => {
    for (const corpus of FIXTURE_CORPORA) {
      for (const record of corpus.records) {
        const stored: StoredRecord = {
          recordId: record.recordId, corpusId: corpus.corpusId, subjectId: record.subjectId, predicate: record.predicate,
          validFrom: record.validFrom, validTo: record.validTo ?? null, knownAt: record.knownAt,
          sourceTime: record.knownAt, acquisitionTime: record.knownAt, provenance: 'DEMONSTRATION',
          subjectCanonicalId: null, conditions: [], data: record,
        };
        expect(hydrateCorpusRecord(stored)).toEqual(record);
        expect(recordPayload(hydrateCorpusRecord(stored))).not.toHaveProperty('admission');
      }
    }
  });

  it('normalizes equivalent SQL and UTC timestamp formats for readback comparison', () => {
    expect(timestamp('2026-09-01 12:00:00+00')).toBe(timestamp('2026-09-01T12:00:00.000Z'));
  });

  it('refuses sub-millisecond instants rather than truncating persisted precision silently', () => {
    expect(() => timestamp('2026-09-01T12:00:00.1234Z')).toThrow('ADMISSION_INVALID_TIMESTAMP');
  });

  it('refuses invalid calendar dates instead of moving them into the following month', () => {
    expect(() => timestamp('2026-02-30T12:00:00Z')).toThrow('ADMISSION_INVALID_TIMESTAMP');
  });

  it('rejects non-finite values instead of turning them into null in a storage commitment', () => {
    expect(() => storageJson({ value: Number.POSITIVE_INFINITY })).toThrow('ADMISSION_NONFINITE_VALUE');
    expect(() => storageJson({ value: Number.NaN })).toThrow('ADMISSION_NONFINITE_VALUE');
  });
});
