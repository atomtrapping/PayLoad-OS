import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { STACK, WHAT_IS_BEING_CLAIMED, compressionAvailable } from './compression';

describe('what compresses and what must not', () => {
  it('names an artifact for every collapse and an answerable party for every retention', async () => {
    const { existsSync } = await import('node:fs');
    for (const step of STACK) {
      expect(step.today.length, step.id).toBeGreaterThan(40);
      if (step.layer === 'TRANSLATION') {
        // A step that collapses with no artifact named is a step somebody is still doing, uncounted.
        expect(step.compressedBy, step.id).toBeDefined();
        expect(existsSync(step.compressedBy!), `${step.id} names ${step.compressedBy}`).toBe(true);
        expect(step.requires, step.id).toBeDefined();
        expect(step.answerable).toBeUndefined();
      } else {
        expect(step.answerable, step.id).toBeDefined();
        expect(step.ifCompressed!.length, step.id).toBeGreaterThan(60);
        expect(step.compressedBy).toBeUndefined();
      }
    }
  });

  it('keeps three judgment layers, and each names what compressing it would actually be', () => {
    const judgment = STACK.filter((s) => s.layer === 'JUDGMENT');
    expect(judgment.map((s) => s.id)).toEqual(['ADMISSION', 'UNDERWRITING', 'CLOSING']);
    expect(judgment.find((s) => s.id === 'ADMISSION')!.answerable).toContain('not the method being admitted');
    expect(judgment.find((s) => s.id === 'UNDERWRITING')!.answerable).toContain('Never the witness');
    expect(judgment.find((s) => s.id === 'CLOSING')!.ifCompressed).toContain('compel settlement');
  });

  it('claims translation rather than intermediaries', () => {
    expect(WHAT_IS_BEING_CLAIMED.isNot).toContain('Most of them are doing judgment');
    expect(WHAT_IS_BEING_CLAIMED.theTest).toContain('still doing, uncounted');
  });

  it('derives what actually collapses today, and it is not everything', () => {
    const now = compressionAvailable(CARAVAN_CORPUS, 0);
    expect(now.judgmentSteps).toBe(3);
    expect(now.translationSteps).toBe(5);
    // The steps needing an admitted record are blocked, because there are none.
    expect(now.blocked.map((b) => b.id).sort()).toEqual(['MULTI_HOP_SETTLEMENT', 'RE_EXAMINATION']);
    expect(now.availableNow).toBe(3);
    expect(now.statement).toContain('a property of the trail rather than of the design');
  });

  it('opens the blocked steps when the corpus supplies the grade, and never the judgment ones', () => {
    const admitted = compressionAvailable(CARAVAN_CORPUS, 1);
    expect(admitted.blocked).toEqual([]);
    expect(admitted.availableNow).toBe(5);
    expect(admitted.statement).toContain('remain by design');
    expect(admitted.judgmentSteps).toBe(3);

    // And an empty corpus collapses almost nothing.
    const empty = compressionAvailable({ ...CARAVAN_CORPUS, records: [] }, 0);
    expect(empty.availableNow).toBe(1);
  });
});
