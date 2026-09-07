import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease, releaseRecords } from './corpus';
import {
  buildSlice,
  CATALOG_LOSS,
  CORRECTION_RATE_GATE,
  gradeFrom,
  type SliceSpec,
} from './catalogSlice';

const release = currentRelease(CARAVAN_CORPUS);
const SPEC: SliceSpec = {
  sliceId: 'caravan-lot-state-2026-09',
  title: 'Caravan lot state',
  question: 'What quantity and condition were recorded for these lots, by whom, and as knowable when?',
  releaseId: release.releaseId,
};

type Grade = Parameters<typeof buildSlice>[2];

/** The manifest, whether or not the slice was cut. A reader is entitled to it either way. */
const described = (spec: Partial<SliceSpec> = {}, grade: Grade = 'DEMONSTRATION') => {
  const built = buildSlice(CARAVAN_CORPUS, { ...SPEC, ...spec }, grade);
  // `records` is the discriminant; a manifest survives a refusal but not a
  // missing release.
  if (built.records === null && built.manifest === null) throw new Error(built.because);
  return built.manifest!;
};

/** A cut that may be shipped. Reaching it at all requires a sellable manifest. */
const cut = (spec: Partial<SliceSpec> = {}, grade: Grade = 'ADMITTED') => {
  const built = buildSlice(CARAVAN_CORPUS, { ...SPEC, ...spec }, grade);
  if (built.records === null) throw new Error(built.because);
  return built;
};

describe('the manifest is derived from the records, not written beside them', () => {
  it('counts what the bounds actually selected', () => {
    const all = cut();
    expect(all.manifest.recordCount).toBe(releaseRecords(CARAVAN_CORPUS, release).length);
    expect(all.records).toHaveLength(all.manifest.recordCount);
    expect(all.excluded).toBe(0);
  });

  it('reports coverage per predicate, with the subjects each reaches', () => {
    const manifest = described();
    expect(manifest.coverage.length).toBeGreaterThan(0);
    for (const entry of manifest.coverage) {
      expect(entry.records).toBeGreaterThan(0);
      expect(entry.subjects).toBeGreaterThan(0);
      expect(entry.subjects).toBeLessThanOrEqual(entry.records);
    }
    expect(manifest.coverage.reduce((total, entry) => total + entry.records, 0)).toBe(manifest.recordCount);
  });

  it('censuses the evidence classes rather than summarising them into one word', () => {
    const manifest = described();
    expect(manifest.evidence.length).toBeGreaterThan(1);
    expect(manifest.evidence.reduce((total, entry) => total + entry.records, 0)).toBe(manifest.recordCount);
    for (const entry of manifest.evidence) {
      expect(entry.productionClass).toBeTruthy();
      expect(entry.claimStrength).toBeTruthy();
      expect(entry.interest).toBeTruthy();
    }
  });

  it('digests its own derived content, so a changed extract cannot reuse a manifest', () => {
    const wide = described();
    const narrow = described({ predicates: ['quantity.gross'] });
    expect(wide.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(wide.digest).not.toBe(narrow.digest);
    expect(described().digest).toBe(wide.digest);
  });
});

describe('bounds are stated, including their absence', () => {
  it('says UNBOUNDED rather than leaving an axis to be assumed', () => {
    const manifest = described();
    expect(manifest.bounds.subjectTypes).toBe('UNBOUNDED');
    expect(manifest.bounds.predicates).toBe('UNBOUNDED');
  });

  it('carries the bounds it was given and counts what they excluded', () => {
    const narrow = cut({ predicates: ['quantity.gross'] });
    expect(narrow.manifest.bounds.predicates).toEqual(['quantity.gross']);
    expect(narrow.manifest.coverage.every((entry) => entry.predicate === 'quantity.gross')).toBe(true);
    expect(narrow.excluded).toBeGreaterThan(0);
    expect(narrow.manifest.recordCount + narrow.excluded).toBe(described().recordCount);
  });

  it('names the release and its cutoff, because an extract without one has no vintage', () => {
    const manifest = described();
    expect(manifest.release.releaseId).toBe(release.releaseId);
    expect(manifest.release.knowledgeCutoff).toBe(release.knownAt);
  });

  it('refuses a release the corpus does not carry', () => {
    const built = buildSlice(CARAVAN_CORPUS, { ...SPEC, releaseId: 'REL-NOT-A-RELEASE' }, 'ADMITTED');
    if (built.records !== null) throw new Error('a slice over a release the corpus does not carry should refuse');
    expect(built.manifest).toBeNull();
    expect(built.because).toContain('no cutoff and therefore no vintage');
  });
});

describe('what a manifest may not assert', () => {
  /** A Corpus value carries no admission status, so the grade is an argument. */
  it('will not sell demonstration records as the corpus', () => {
    const manifest = described({}, 'DEMONSTRATION');
    expect(manifest.readiness).toBe('NOT_FOR_SALE');
    expect(manifest.because).toContain('selling the demonstration as the corpus');
  });

  it('will not sell an unchecked grade either, for the reason an unreadable count is not a zero', () => {
    const manifest = described({}, 'UNKNOWN');
    expect(manifest.readiness).toBe('NOT_FOR_SALE');
    expect(manifest.because).toContain('an unchecked grade is not an admitted one');
  });

  it('sells only what crossed the gate', () => {
    expect(described({}, 'ADMITTED').readiness).toBe('SELLABLE');
  });

  it('refuses an empty extract rather than shipping a manifest describing nothing', () => {
    const empty = described({ predicates: ['predicate.that.does.not.exist'] }, 'ADMITTED');
    expect(empty.recordCount).toBe(0);
    expect(empty.readiness).toBe('NOT_FOR_SALE');
    expect(empty.because).toContain('An empty extract is not a product');
  });

  /** The gate already used for exposure, applied to the same mistake here. */
  it('counts corrections at every size and refuses a rate below the gate', () => {
    const manifest = described();
    expect(manifest.corrections.corrections + manifest.corrections.withdrawals).toBeGreaterThan(0);
    expect(manifest.corrections.ratePerRecord).toBe('NOT_PRICEABLE');
    expect(manifest.corrections.because).toContain('would be multiplied by a real portfolio');
    expect(CORRECTION_RATE_GATE.minimumRecords).toBeGreaterThan(CARAVAN_CORPUS.records.length);
  });

  it('states that coverage is not completeness', () => {
    const manifest = described();
    expect(manifest.loss.join(' ')).toContain('not a claim about the world');
    expect(manifest.loss.join(' ')).toContain('never that they are true');
  });
});

describe('an unsellable slice is described and not cut', () => {
  /**
   * The boundary the whole posture rests on. `admittedRow` settled this shape
   * one layer down: a refusal never yields a row, and no caller can obtain one
   * by ignoring an outcome it did not like.
   */
  it('returns no records at all when the manifest is not sellable', () => {
    for (const grade of ['DEMONSTRATION', 'UNKNOWN'] as const) {
      const built = buildSlice(CARAVAN_CORPUS, SPEC, grade);
      expect(built.records, grade).toBeNull();
      expect(built.manifest, `${grade} should still be described`).not.toBeNull();
      expect(built.manifest!.readiness).toBe('NOT_FOR_SALE');
    }
  });

  it('keeps the description, so a reader sees what the extract would have been', () => {
    const built = buildSlice(CARAVAN_CORPUS, SPEC, 'DEMONSTRATION');
    if (built.records !== null) throw new Error('a demonstration slice must not be cut');
    expect(built.manifest!.recordCount).toBeGreaterThan(0);
    expect(built.manifest!.coverage.length).toBeGreaterThan(0);
    expect(built.because).toContain('Described and not cut');
  });

  it('yields records only when the manifest is sellable', () => {
    const built = buildSlice(CARAVAN_CORPUS, SPEC, 'ADMITTED');
    expect(built.records).not.toBeNull();
    expect(built.manifest!.readiness).toBe('SELLABLE');
  });

  it('cuts nothing from an empty extract even at an admitted grade', () => {
    const built = buildSlice(CARAVAN_CORPUS, { ...SPEC, predicates: ['predicate.that.does.not.exist'] }, 'ADMITTED');
    expect(built.records).toBeNull();
  });

  it('says so in the loss, so the boundary is not only in the types', () => {
    expect(described().loss.join(' ')).toContain('described and not cut');
  });
});

describe('the grade comes from the count, and carries its unknown through', () => {
  it('maps an admitted count to a grade and an unreadable one to UNKNOWN', () => {
    expect(gradeFrom(3)).toBe('ADMITTED');
    expect(gradeFrom(0)).toBe('DEMONSTRATION');
    expect(gradeFrom('UNKNOWN')).toBe('UNKNOWN');
  });

  it('is the same three-valued rule the compression derivation uses', () => {
    expect(described({}, gradeFrom('UNKNOWN')).admissionGrade).toBe('UNKNOWN');
    expect(described({}, gradeFrom(0)).admissionGrade).toBe('DEMONSTRATION');
  });

  it('states the four things a closed catalog must not do', () => {
    expect(CATALOG_LOSS).toHaveLength(4);
    const joined = CATALOG_LOSS.join(' ');
    expect(joined).toContain('derived from the records it describes');
    expect(joined).toContain('UNKNOWN does not sell');
    expect(joined).toContain('refused below a stated gate');
    expect(joined).toContain('Coverage is not completeness');
  });
});
