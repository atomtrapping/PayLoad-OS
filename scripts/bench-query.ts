/**
 * How the read paths behave at volume.
 *
 * Everything the corpus asserts about itself is testable over 21 committed
 * records, and none of it says anything about how long an answer takes. The
 * factory's correctness is provable without inventory; the index's is not
 * provable without rows. So this makes rows — synthetic, in memory, never
 * written anywhere and never a fixture — and measures the paths a customer
 * would actually be waiting on.
 *
 * The records here are not corpus content and could not become it: they are
 * built in this process, used, and dropped. They exist to produce a number.
 *
 * Run: npx tsx scripts/bench-query.ts [maxN]
 */
import { CARAVAN_CORPUS } from '../src/fixtures/caravan/release';
import { currentRelease, queryAsOf, type Corpus, type CorpusRecord } from '../src/domain/corpus';
import { evaluateRelease, restatementExposure, type ReleaseCondition } from '../src/domain/collateralVehicle';
import { scalar, type ConditionNode } from '../src/domain/conditionGrammar';
import { buildDependencyIndex, fanOut, type DependencyEdge } from '../src/domain/dependencyIndex';

const PREDICATES = ['quantity.gross', 'condition.moisture', 'location.position', 'custody.loading_completed', 'contract.moisture_max'];
const template = CARAVAN_CORPUS.records[0];
const release = currentRelease(CARAVAN_CORPUS);

/** N synthetic records spread over S subjects, all knowable inside the release. */
function synthetic(n: number, subjects: number): CorpusRecord[] {
  const out: CorpusRecord[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const subject = `LOT-SYN-${i % subjects}`;
    out[i] = {
      ...template,
      recordId: `REC-SYN-${i}`,
      canonicalId: `notation://record/syn-${i}` as CorpusRecord['canonicalId'],
      subjectId: subject,
      subjectCanonicalId: `notation://subject/${subject}` as CorpusRecord['subjectCanonicalId'],
      predicate: PREDICATES[i % PREDICATES.length],
      value: 40 + (i % 100) / 100,
      validFrom: '2026-08-01T00:00:00Z',
      validTo: undefined,
      knownAt: '2026-08-20T00:00:00Z',
      retractedByRetractionId: undefined,
      supersededByRecordId: undefined,
    };
  }
  return out;
}

const corpusOf = (records: CorpusRecord[]): Corpus => ({ ...CARAVAN_CORPUS, records });

function measure(label: string, iterations: number, run: (i: number) => void): { label: string; p50: number; p95: number; perSec: number } {
  const samples: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i += 1) {
    const started = process.hrtime.bigint();
    run(i);
    samples[i] = Number(process.hrtime.bigint() - started) / 1e6;
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(iterations * 0.5)];
  const p95 = samples[Math.floor(iterations * 0.95)];
  return { label, p50, p95, perSec: p50 > 0 ? Math.round(1000 / p50) : Infinity };
}

const ms = (v: number) => (v >= 1 ? `${v.toFixed(1)} ms` : `${(v * 1000).toFixed(0)} µs`);

const fiveLeg = (subject: string): ReleaseCondition => ({
  conditionId: 'BENCH-5', agreedText: 'Five legs, as a rate confirmation carries.',
  root: {
    kind: 'ALL_OF', agreedText: 'All five terms.',
    of: PREDICATES.map((p) => scalar(subject, p, 'AT_MOST', 1e9, `${p} within bound`)) as ConditionNode[],
  },
});

const maxN = Number(process.argv[2] ?? 1_000_000);
const sizes = [1_000, 10_000, 100_000, 1_000_000].filter((n) => n <= maxN);

console.log('Synthetic, in memory, never written. Records are not corpus content.\n');
console.log('records   asOf p50     asOf p95     5-leg p50    exposure p50');
console.log('-------   ---------    ---------    ---------    ------------');

for (const n of sizes) {
  const corpus = corpusOf(synthetic(n, Math.max(1, Math.floor(n / 20))));
  const subject = 'LOT-SYN-0';
  const iterations = n >= 1_000_000 ? 20 : n >= 100_000 ? 100 : 400;

  const asOf = measure('asOf', iterations, () => {
    queryAsOf(corpus, release, { subjectId: subject, predicate: 'quantity.gross', validAt: '2026-08-15T00:00:00Z', knownAt: '2026-08-20T00:00:00Z', question: 'WHAT_WE_HELD' });
  });
  const condition = measure('5-leg', Math.max(5, Math.floor(iterations / 4)), () => {
    evaluateRelease(corpus, release, fiveLeg(subject), '2026-08-20T00:00:00Z');
  });
  const exposure = measure('exposure', Math.max(5, Math.floor(iterations / 4)), () => {
    restatementExposure(corpus);
  });

  console.log(
    `${String(n).padEnd(9)} ${ms(asOf.p50).padEnd(12)} ${ms(asOf.p95).padEnd(12)} ${ms(condition.p50).padEnd(12)} ${ms(exposure.p50)}`,
  );
}

// The fan-out is a different shape: it walks declared edges, not records.
console.log('\nedges     build p50    fanOut p50   reached');
console.log('-------   ---------    ---------    -------');
for (const e of [1_000, 100_000, 1_000_000].filter((x) => x <= maxN)) {
  const edges: DependencyEdge[] = new Array(e);
  for (let i = 0; i < e; i += 1) {
    edges[i] = {
      dependent: { kind: i % 3 === 0 ? 'DERIVED_RECORD' : 'RULING', id: `DEP-${i}` },
      dependsOn: i < 10 ? 'REC-ROOT' : `DEP-${i - 10}`,
      declaredAt: '2026-09-01T00:00:00Z', because: 'bench',
    };
  }
  const built = measure('build', 3, () => { buildDependencyIndex(edges); });
  const index = buildDependencyIndex(edges);
  const out = measure('fanOut', 20, () => { fanOut(index, ['REC-ROOT'], 'CORRECTION'); });
  console.log(`${String(e).padEnd(9)} ${ms(built.p50).padEnd(12)} ${ms(out.p50).padEnd(12)} ${fanOut(index, ['REC-ROOT'], 'CORRECTION').reached.length}`);
}
