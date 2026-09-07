import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_PROVENANCE,
  COST_LOSS,
  estimateQueryCost,
  MEASUREMENTS,
  measurementFor,
  planCondition,
  type QueryShape,
} from './queryCost';

describe('a cost that was recorded, said as recorded', () => {
  it('answers a size the benchmark actually ran with the number it recorded', () => {
    const estimate = estimateQueryCost('AS_OF', 1_000_000);
    expect(estimate.basis).toBe('MEASURED');
    expect(estimate.p50Ms).toBe(141.6);
    expect(estimate.on).toEqual([{ size: 1_000_000, p50Ms: 141.6 }]);
    expect(estimate.because).toContain('not a model of it');
  });

  it('interpolates only between two points that were run, and names them', () => {
    const estimate = estimateQueryCost('AS_OF', 500_000);
    expect(estimate.basis).toBe('INTERPOLATED');
    expect(estimate.on.map((point) => point.size)).toEqual([100_000, 1_000_000]);
    expect(estimate.p50Ms).toBeGreaterThan(4.0);
    expect(estimate.p50Ms).toBeLessThan(141.6);
    expect(estimate.because).toContain('actually run');
  });

  it('carries the conditions on the estimate rather than beside it', () => {
    expect(estimateQueryCost('AS_OF', 1_000).conditions).toBe('IN_PROCESS_SYNTHETIC_NO_STORE');
    expect(BENCHMARK_PROVENANCE.detail).toContain('no store, no network and no concurrency');
  });
});

describe('the refusal that matters', () => {
  /**
   * A projected curve would be the most convincing number on the page, because
   * it would carry a decimal point.
   */
  it('refuses past the last recorded point rather than extrapolating', () => {
    const estimate = estimateQueryCost('AS_OF', 50_000_000);
    expect(estimate.basis).toBe('OUTSIDE_MEASURED_RANGE');
    expect(estimate.p50Ms).toBe('UNKNOWN');
    expect(estimate.because).toContain('would invent a number');
  });

  it('refuses below the first recorded point too', () => {
    expect(estimateQueryCost('AS_OF', 10).p50Ms).toBe('UNKNOWN');
  });

  it('refuses a shape nobody benchmarked, and says an unmeasured path is not a cheap one', () => {
    const estimate = estimateQueryCost('SUBJECT_TIMELINE' as QueryShape, 1_000);
    expect(estimate.basis).toBe('NOT_MEASURED');
    expect(estimate.p50Ms).toBe('UNKNOWN');
    expect(estimate.because).toContain('not a cheap one');
    expect(estimate.costClass).toBeNull();
  });

  it('refuses a size that is not one', () => {
    expect(estimateQueryCost('AS_OF', -1).p50Ms).toBe('UNKNOWN');
    expect(estimateQueryCost('AS_OF', Number.NaN).p50Ms).toBe('UNKNOWN');
  });
});

describe('scans and prepared indexes are told apart', () => {
  it('names the class of every measured shape', () => {
    expect(measurementFor('AS_OF')!.costClass).toBe('SCAN');
    expect(measurementFor('RESTATEMENT_EXPOSURE')!.costClass).toBe('SCAN');
    expect(measurementFor('DEPENDENCY_FAN_OUT')!.costClass).toBe('PREPARED_INDEX');
  });

  /** The whole difference between a scan and an index, in the numbers. */
  it('shows the scan growing with the corpus and the prepared walk staying flat', () => {
    const scanSmall = estimateQueryCost('AS_OF', 1_000).p50Ms as number;
    const scanLarge = estimateQueryCost('AS_OF', 1_000_000).p50Ms as number;
    expect(scanLarge / scanSmall).toBeGreaterThan(1_000);
    const walkSmall = estimateQueryCost('DEPENDENCY_FAN_OUT', 1_000).p50Ms as number;
    const walkLarge = estimateQueryCost('DEPENDENCY_FAN_OUT', 1_000_000).p50Ms as number;
    expect(walkLarge).toBeLessThanOrEqual(walkSmall);
  });

  it('states the build cost of the prepared index rather than hiding it in the walk', () => {
    expect(estimateQueryCost('DEPENDENCY_INDEX_BUILD', 1_000_000).p50Ms).toBe(710.6);
    expect(measurementFor('DEPENDENCY_INDEX_BUILD')!.what).toContain('amortised');
  });

  it('keeps records and edges apart, so neither is passed where the other belongs', () => {
    expect(estimateQueryCost('AS_OF', 1_000).sizeUnit).toBe('records');
    expect(estimateQueryCost('DEPENDENCY_FAN_OUT', 1_000).sizeUnit).toBe('edges');
  });
});

describe('the condition tree, and the assumption behind scaling it', () => {
  /** Five legs is what ran. It is not divided into one and multiplied back. */
  it('reports the five-leg tree as measured rather than as a scaling', () => {
    const plan = planCondition(5, 1_000_000);
    expect(plan.measuredFiveLeg.basis).toBe('MEASURED');
    expect(plan.totalMs).toBe(2346);
    expect(plan.because).toContain('the tree the benchmark ran, not a scaling of it');
  });

  it('names the assumption on every other leg count, as a field rather than a footnote', () => {
    const plan = planCondition(3, 1_000_000);
    expect(plan.assumption).toBe('COST_SCALES_LINEARLY_IN_LEGS');
    expect(plan.totalMs).toBeCloseTo(1407.6, 1);
    expect(plan.because).toContain('never varied the leg count');
    expect(plan.because).toContain('nothing has measured');
  });

  it('makes the multiplier visible where the tree is authored', () => {
    const one = planCondition(1, 1_000_000).totalMs as number;
    const eight = planCondition(8, 1_000_000).totalMs as number;
    expect(eight / one).toBeCloseTo(8, 5);
  });

  it('is unknown wherever the tree it scales from is unknown', () => {
    const plan = planCondition(5, 50_000_000);
    expect(plan.totalMs).toBe('UNKNOWN');
    expect(plan.because).toContain('a share of unknown is unknown');
  });

  it('refuses a leg count that is not one', () => {
    expect(planCondition(0, 1_000).totalMs).toBe('UNKNOWN');
    expect(planCondition(2.5, 1_000).totalMs).toBe('UNKNOWN');
  });
});

describe('the numbers and the account of them cannot drift apart', () => {
  /**
   * `docs/QUERY_PERFORMANCE.md` is the prose; this module is the source. A
   * document quoting numbers the code no longer holds is the ordinary way a
   * measurement rots, so the table is read back and compared.
   */
  it('holds every measured point stated in the document', () => {
    const doc = readFileSync('docs/QUERY_PERFORMANCE.md', 'utf-8');
    const asOf = measurementFor('AS_OF')!;
    const fiveLeg = measurementFor('CONDITION_5_LEG')!;
    const exposure = measurementFor('RESTATEMENT_EXPOSURE')!;
    for (const [size, row] of [[1_000, '1,000'], [10_000, '10,000'], [100_000, '100,000'], [1_000_000, '1,000,000']] as const) {
      const line = doc.split('\n').find((entry) => entry.startsWith(`| ${row} |`));
      expect(line, `the document should carry a row for ${row} records`).toBeTruthy();
      const cells = line!.split('|').map((cell) => cell.replace(/\*/g, '').trim());
      // The document writes thousands with separators and bolds its headline
      // figures; both are prose, not data.
      const ms = (cell: string) => {
        const bare = cell.replace(/,/g, '').trim();
        return bare.endsWith('µs') ? Number(bare.replace(' µs', '')) / 1000 : Number(bare.replace(' ms', ''));
      };
      expect(ms(cells[2]), `as-of at ${row}`).toBeCloseTo(asOf.points.find((p) => p.size === size)!.p50Ms, 4);
      expect(ms(cells[4]), `five-leg condition at ${row}`).toBeCloseTo(fiveLeg.points.find((p) => p.size === size)!.p50Ms, 4);
      expect(ms(cells[5]), `restatement exposure at ${row}`).toBeCloseTo(exposure.points.find((p) => p.size === size)!.p50Ms, 4);
    }
  });

  it('names the script that produced them', () => {
    const doc = readFileSync('docs/QUERY_PERFORMANCE.md', 'utf-8');
    expect(doc).toContain(BENCHMARK_PROVENANCE.script);
  });
});

describe('what the numbers do not say, carried with them', () => {
  it('states the four losses, including that a cost is not a defect', () => {
    expect(COST_LOSS.length).toBeGreaterThanOrEqual(4);
    const joined = COST_LOSS.join(' ');
    expect(joined).toContain('no store, no network and no concurrency');
    expect(joined).toContain('An unmeasured cost is not a fast one');
    expect(joined).toContain('A cost is not a defect');
    expect(joined).toContain('p50 is not a latency budget');
    expect(joined).toContain('five legs and only five');
  });

  it('measures every shape it declares', () => {
    for (const measurement of MEASUREMENTS) {
      expect(measurement.points.length, measurement.shape).toBeGreaterThanOrEqual(3);
      expect(measurement.what.length).toBeGreaterThan(0);
      const sizes = measurement.points.map((point) => point.size);
      expect([...sizes].sort((a, b) => a - b), `${measurement.shape} points must ascend`).toEqual(sizes);
    }
  });
});
