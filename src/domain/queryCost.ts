/**
 * What a read costs, said by the system rather than inferred by the reader.
 *
 * The product noun is "indexed and queryable". There is no index, and until
 * `scripts/bench-query.ts` ran there was no number either — the cost of a query
 * was a thing you worked out by reading `queryAsOf` and noticing it filters the
 * whole array twice. That is the same shape of gap the corpus refuses
 * everywhere else: a claim nobody derived, sitting where a measurement belongs.
 *
 * So this is the measurement, made addressable. It answers "what will this
 * cost" from points that were actually recorded, and refuses to answer where
 * they were not.
 *
 * THE REFUSAL THAT MATTERS
 *
 * Outside the measured range the answer is UNKNOWN, not an extrapolation.
 * Scans look linear on a log plot until the point where they stop — allocation
 * pressure, cache behaviour, a GC that starts mattering — and the benchmark
 * already shows the top of its own range bending. Projecting past the last
 * point would be inventing a number of exactly the kind the rest of this
 * codebase exists to refuse, and it would be the most persuasive one on the
 * page because it would carry a decimal.
 *
 * That is `admittedRecords: number | 'UNKNOWN'` again, one layer over: an
 * unmeasured cost is not a fast one, and an unreadable count is not a zero.
 *
 * WHAT THESE NUMBERS ARE NOT
 *
 * They are one process, in memory, with no store, no network and no
 * concurrency. A real deployment will beat them on the composite lookup —
 * Postgres does that far better than an array filter — and lose to them on
 * every hop this benchmark does not have. Carried on every estimate as
 * `conditions`, because a number whose conditions travelled separately from it
 * is a number that will eventually be quoted without them.
 */
export const COST_METHOD = 'notationsos.query-cost.v1';

/** The read paths the benchmark exercised. */
export type QueryShape =
  | 'AS_OF'
  | 'CONDITION_5_LEG'
  | 'RESTATEMENT_EXPOSURE'
  | 'DEPENDENCY_FAN_OUT'
  | 'DEPENDENCY_INDEX_BUILD';

/**
 * How the cost grows. `SCAN` touches the whole corpus whatever the answer's
 * size; `PREPARED_INDEX` is built once and then costs its own reach.
 */
export type CostClass = 'SCAN' | 'PREPARED_INDEX';

export type CostBasis =
  /** A point the benchmark recorded at exactly this size. */
  | 'MEASURED'
  /** Between two recorded points, and named which two. */
  | 'INTERPOLATED'
  /** Past the ends of what was recorded. Refused. */
  | 'OUTSIDE_MEASURED_RANGE'
  /** This shape was never benchmarked. */
  | 'NOT_MEASURED';

export interface MeasuredPoint {
  /** Records for the corpus paths; edges for the dependency paths. */
  size: number;
  p50Ms: number;
}

export interface ShapeMeasurement {
  shape: QueryShape;
  costClass: CostClass;
  /** What `size` counts, so a caller cannot pass edges where records belong. */
  sizeUnit: 'records' | 'edges';
  points: readonly MeasuredPoint[];
  what: string;
}

/**
 * The recorded points, from `scripts/bench-query.ts`.
 *
 * This module is the source and `docs/QUERY_PERFORMANCE.md` is the account of
 * it; a test reads the document's table back and fails if the two disagree, so
 * the prose cannot drift away from the numbers it describes.
 */
export const BENCHMARK_PROVENANCE = Object.freeze({
  script: 'scripts/bench-query.ts',
  conditions: 'IN_PROCESS_SYNTHETIC_NO_STORE',
  detail: 'One process, in memory, synthetic records never written, with no store, no network and no concurrency. A deployment will beat these on a composite lookup and lose to them on every hop this had none of.',
});

export const MEASUREMENTS: readonly ShapeMeasurement[] = Object.freeze([
  {
    shape: 'AS_OF', costClass: 'SCAN', sizeUnit: 'records',
    what: 'One as-of answer. Filters the whole record array twice per call, so it costs the corpus rather than the answer.',
    points: [{ size: 1_000, p50Ms: 0.031 }, { size: 10_000, p50Ms: 0.283 }, { size: 100_000, p50Ms: 4.0 }, { size: 1_000_000, p50Ms: 141.6 }],
  },
  {
    // Five legs is what the benchmark ran. It is recorded as five rather than
    // divided into one, because the division would be an assumption about how
    // cost scales in legs and the benchmark never varied that number.
    shape: 'CONDITION_5_LEG', costClass: 'SCAN', sizeUnit: 'records',
    what: 'A five-leg condition tree, end to end. The grammar resolves each leg through its own as-of, so the tree costs its legs times a full scan.',
    points: [{ size: 1_000, p50Ms: 0.362 }, { size: 10_000, p50Ms: 4.2 }, { size: 100_000, p50Ms: 66.8 }, { size: 1_000_000, p50Ms: 2346 }],
  },
  {
    shape: 'RESTATEMENT_EXPOSURE', costClass: 'SCAN', sizeUnit: 'records',
    what: 'Exposure over a corpus, bounded by a knowledge time.',
    points: [{ size: 1_000, p50Ms: 0.05 }, { size: 10_000, p50Ms: 1.0 }, { size: 100_000, p50Ms: 21.9 }, { size: 1_000_000, p50Ms: 404.5 }],
  },
  {
    shape: 'DEPENDENCY_FAN_OUT', costClass: 'PREPARED_INDEX', sizeUnit: 'edges',
    what: 'Reaching what depends on a restated record, over a prepared adjacency. Costs its own closure and not the graph.',
    points: [{ size: 1_000, p50Ms: 0.012 }, { size: 100_000, p50Ms: 0.009 }, { size: 1_000_000, p50Ms: 0.009 }],
  },
  {
    shape: 'DEPENDENCY_INDEX_BUILD', costClass: 'PREPARED_INDEX', sizeUnit: 'edges',
    what: 'Preparing that adjacency once, so the walks after it are flat. Real, and amortised.',
    points: [{ size: 1_000, p50Ms: 0.165 }, { size: 100_000, p50Ms: 34.2 }, { size: 1_000_000, p50Ms: 710.6 }],
  },
]);

export interface CostEstimate {
  method: typeof COST_METHOD;
  shape: QueryShape;
  size: number;
  sizeUnit: 'records' | 'edges' | null;
  costClass: CostClass | null;
  basis: CostBasis;
  /** Never a number outside the measured range. UNKNOWN is an answer here. */
  p50Ms: number | 'UNKNOWN';
  /** The recorded points this stands on, so a reader can check the arithmetic. */
  on: readonly MeasuredPoint[];
  conditions: typeof BENCHMARK_PROVENANCE.conditions;
  because: string;
}

export function measurementFor(shape: QueryShape): ShapeMeasurement | undefined {
  return MEASUREMENTS.find((entry) => entry.shape === shape);
}

/**
 * Pure: what one read of this shape costs at this size.
 *
 * Interpolates only between recorded points and refuses outside them. The
 * refusal is the feature: a scan's curve is knowable where it was run and a
 * guess everywhere else, and the guess would be the most convincing number on
 * the page because it would have a decimal point.
 */
export function estimateQueryCost(shape: QueryShape, size: number): CostEstimate {
  const measurement = measurementFor(shape);
  const base = { method: COST_METHOD, shape, size, conditions: BENCHMARK_PROVENANCE.conditions } as const;
  if (!measurement) {
    return { ...base, sizeUnit: null, costClass: null, basis: 'NOT_MEASURED', p50Ms: 'UNKNOWN', on: [],
      because: `No benchmark recorded ${shape}, so nothing here knows what it costs. An unmeasured path is not a cheap one.` };
  }
  const { points, costClass, sizeUnit } = measurement;
  const shell = { ...base, sizeUnit, costClass };
  if (!Number.isFinite(size) || size < 0) {
    return { ...shell, basis: 'NOT_MEASURED', p50Ms: 'UNKNOWN', on: [], because: `${String(size)} is not a size, so there is nothing to estimate.` };
  }

  const exact = points.find((point) => point.size === size);
  if (exact) {
    return { ...shell, basis: 'MEASURED', p50Ms: exact.p50Ms, on: [exact],
      because: `Recorded at ${size.toLocaleString()} ${sizeUnit}: ${exact.p50Ms} ms p50. This is the measurement, not a model of it.` };
  }

  const low = [...points].reverse().find((point) => point.size < size);
  const high = points.find((point) => point.size > size);
  if (!low || !high) {
    const first = points[0], last = points[points.length - 1];
    return { ...shell, basis: 'OUTSIDE_MEASURED_RANGE', p50Ms: 'UNKNOWN', on: [first, last],
      because: `${size.toLocaleString()} ${sizeUnit} is outside the recorded range of ${first.size.toLocaleString()}–${last.size.toLocaleString()}. Projecting past the last point would invent a number, and a ${costClass === 'SCAN' ? 'scan' : 'prepared index'} is knowable where it was run and a guess everywhere else.` };
  }

  const span = high.size - low.size;
  const p50Ms = Number((low.p50Ms + ((size - low.size) / span) * (high.p50Ms - low.p50Ms)).toFixed(3));
  return { ...shell, basis: 'INTERPOLATED', p50Ms, on: [low, high],
    because: `Between the recorded ${low.size.toLocaleString()} (${low.p50Ms} ms) and ${high.size.toLocaleString()} (${high.p50Ms} ms) ${sizeUnit}. Straight-line between two points that were actually run, and stated as such rather than as a model.` };
}

export interface ConditionPlan {
  legs: number;
  records: number;
  /** The five-leg tree the benchmark actually ran, at this size. */
  measuredFiveLeg: CostEstimate;
  totalMs: number | 'UNKNOWN';
  costClass: CostClass | null;
  /** Named because it is one: the benchmark never varied the number of legs. */
  assumption: 'COST_SCALES_LINEARLY_IN_LEGS';
  because: string;
}

/**
 * What a condition tree costs, with both the multiplier and the assumption
 * behind it made visible where the tree is authored.
 *
 * This is the benchmark's sharpest finding turned into something a caller can
 * ask before writing the fifth leg: the grammar resolves each leg through its
 * own `queryAsOf`, so a five-term rate confirmation is five full corpus scans.
 *
 * The benchmark ran five legs and only five. Scaling from it means assuming
 * cost is linear in leg count — which the resolver's shape implies, since each
 * leg is an independent scan, and which nothing here has measured. So the
 * assumption is a field rather than a footnote: a reader who wants the number
 * without it has to delete it.
 */
export function planCondition(legs: number, records: number): ConditionPlan {
  const measuredFiveLeg = estimateQueryCost('CONDITION_5_LEG', records);
  const shell = { legs, records, measuredFiveLeg, costClass: measuredFiveLeg.costClass, assumption: 'COST_SCALES_LINEARLY_IN_LEGS' as const };
  if (!Number.isInteger(legs) || legs < 1) {
    return { ...shell, totalMs: 'UNKNOWN', because: `${String(legs)} is not a number of legs, so there is nothing to scale.` };
  }
  if (measuredFiveLeg.p50Ms === 'UNKNOWN') {
    return { ...shell, totalMs: 'UNKNOWN', because: `The five-leg tree costs an unknown amount at ${records.toLocaleString()} records, and a share of unknown is unknown. ${measuredFiveLeg.because}` };
  }
  const totalMs = Number(((measuredFiveLeg.p50Ms / 5) * legs).toFixed(3));
  return { ...shell, totalMs,
    because: legs === 5
      ? `${measuredFiveLeg.p50Ms} ms, recorded at five legs over ${records.toLocaleString()} records — the tree the benchmark ran, not a scaling of it. Each leg is a full corpus scan, so the cost is the resolver's shape rather than the condition's.`
      : `${totalMs} ms: the recorded five-leg cost of ${measuredFiveLeg.p50Ms} ms, scaled to ${legs} ${legs === 1 ? 'leg' : 'legs'}. The benchmark never varied the leg count, so this assumes cost is linear in legs — which the resolver implies, since each leg is an independent scan, and which nothing has measured.`,
  };
}

/** What the numbers do not say, carried with them. */
export const COST_LOSS = [
  'These are one process in memory with no store, no network and no concurrency. A deployment beats them on a composite lookup and loses to them on every hop this benchmark did not have.',
  'Outside the recorded range the answer is UNKNOWN rather than an extrapolation. An unmeasured cost is not a fast one, and a projected curve would be the most convincing number here precisely because it would carry a decimal.',
  'A cost is not a defect. Naming a scan as a scan says what it does, and the index that would replace it is a design pass that wants real cardinalities rather than synthetic ones.',
  'p50 is not a latency budget. The benchmark recorded a median and one p95; a serving surface needs tails, and nothing here has them.',
  'The condition tree was measured at five legs and only five. Every other leg count is that number scaled under a stated assumption, not a second measurement.',
] as const;
