'use client';

import { useState } from 'react';
import {
  BENCHMARK_PROVENANCE,
  COST_LOSS,
  estimateQueryCost,
  MEASUREMENTS,
  planCondition,
  type QueryShape,
} from '@/domain/queryCost';

/** Sizes worth asking about: the four that were run, and two that were not. */
const SIZES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1_000, label: '1,000' },
  { value: 10_000, label: '10,000' },
  { value: 100_000, label: '100,000' },
  { value: 500_000, label: '500,000 (between two runs)' },
  { value: 1_000_000, label: '1,000,000' },
  { value: 50_000_000, label: '50,000,000 (past the last run)' },
];

const BASIS_TONE: Record<string, string> = {
  MEASURED: 'var(--check-passed)',
  INTERPOLATED: 'var(--status-conditional)',
  OUTSIDE_MEASURED_RANGE: 'var(--status-refused)',
  NOT_MEASURED: 'var(--status-refused)',
};

const show = (ms: number | 'UNKNOWN') =>
  ms === 'UNKNOWN' ? 'UNKNOWN' : ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms`;

/**
 * The read paths with their recorded cost, and the refusal where none was
 * recorded.
 *
 * Two things are on purpose. A scan and a prepared index are labelled
 * differently, because the whole difference between them is visible in the
 * numbers — the scan grows with the corpus, the walk stays flat and pays its
 * cost once at build. And the condition tree states the assumption behind
 * scaling it: five legs is what ran, so every other leg count is that figure
 * scaled, and the assumption is shown rather than folded in.
 */
export function QueryCostPanel() {
  const [size, setSize] = useState<number>(1_000_000);
  const [legs, setLegs] = useState<number>(5);
  const plan = planCondition(legs, size);

  return (
    <div className="flex flex-col gap-3" data-testid="query-cost">
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 min-w-[220px] flex-1">
          <span className="label-sm">Corpus size</span>
          <select
            className="surface-inset px-2 py-1.5 text-[12.5px] rounded"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--border-default)' }}
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
            data-testid="cost-size"
          >
            {SIZES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-[220px] flex-1">
          <span className="label-sm">Condition legs</span>
          <select
            className="surface-inset px-2 py-1.5 text-[12.5px] rounded"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--border-default)' }}
            value={legs}
            onChange={(event) => setLegs(Number(event.target.value))}
            data-testid="cost-legs"
          >
            {[1, 3, 5, 8].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
      </div>

      <div className="surface overflow-x-auto" tabIndex={0}>
        <table className="w-full text-[12.5px] border-collapse min-w-[640px]">
          <thead>
            <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
              <th scope="col" className="px-3 py-2 font-semibold">Read path</th>
              <th scope="col" className="px-3 py-2 font-semibold">Class</th>
              <th scope="col" className="px-3 py-2 font-semibold text-right">p50</th>
              <th scope="col" className="px-3 py-2 font-semibold">Basis</th>
            </tr>
          </thead>
          <tbody>
            {MEASUREMENTS.map((measurement) => {
              const estimate = estimateQueryCost(measurement.shape as QueryShape, size);
              return (
                <tr key={measurement.shape} style={{ borderTop: '1px solid var(--border-subtle)' }} data-testid={`cost-${measurement.shape}`}>
                  <td className="px-3 py-2">
                    <span className="mono">{measurement.shape}</span>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{measurement.what}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="label-sm" style={{ color: measurement.costClass === 'SCAN' ? 'var(--status-refused)' : 'var(--check-passed)' }}>
                      {measurement.costClass}
                    </span>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>per {measurement.sizeUnit}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: estimate.p50Ms === 'UNKNOWN' ? 'var(--status-refused)' : 'var(--text-heading)' }}>
                    {show(estimate.p50Ms)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="label-sm" style={{ color: BASIS_TONE[estimate.basis] }}>{estimate.basis}</span>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{estimate.because}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="surface-inset p-3 flex flex-col gap-1" data-testid="cost-condition">
        <span className="label-sm">
          A {legs}-leg condition over {size.toLocaleString()} records — {show(plan.totalMs)}
        </span>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{plan.because}</p>
        {legs !== 5 && plan.totalMs !== 'UNKNOWN' && (
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--status-conditional)' }}>
            Assumption carried: <span className="mono">{plan.assumption}</span>. The benchmark ran five legs and only five.
          </p>
        )}
      </div>

      <details>
        <summary className="cursor-pointer text-[12.5px]" style={{ color: 'var(--info)' }}>What these numbers do not say</summary>
        <ul className="m-0 mt-2 pl-4 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
          {COST_LOSS.map((entry) => <li key={entry}>{entry}</li>)}
          <li>Conditions: <span className="mono">{BENCHMARK_PROVENANCE.conditions}</span> — {BENCHMARK_PROVENANCE.detail}</li>
        </ul>
      </details>
    </div>
  );
}
