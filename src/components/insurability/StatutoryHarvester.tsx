'use client';

import { useMemo, useState } from 'react';
import type { AdmittedRow } from '@/domain/admission';
import type { FieldPresence, StatutoryExtraction } from '@/domain/statutoryHarvest';
import { serveAdmittedAsOf, serveInForceAsOf } from '@/domain/statutoryServing';
import type { HarvestReport } from '@/adapter/statutoryHarvester';
import { Inspector } from '@/components/primitives/Inspector';
import { Section } from '@/components/primitives/Section';

export interface HarvesterInstant {
  value: string;
  label: string;
}

export interface StatutoryHarvesterProps {
  /** The run at its widest horizon. The clocks below narrow it; they never widen it. */
  report: HarvestReport;
  extractions: readonly StatutoryExtraction[];
  specimens: ReadonlyArray<{ captureId: string; jurisdiction: string; demonstrates: string }>;
  knowledgeInstants: readonly HarvesterInstant[];
  worldInstants: readonly HarvesterInstant[];
}

const PRESENCE_COLOR: Record<FieldPresence, string> = {
  PRESENT: 'var(--check-passed)',
  ABSENT: 'var(--check-na)',
  MALFORMED: 'var(--status-refused)',
  AMBIGUOUS: 'var(--status-conditional)',
};

const OUTCOME_COLOR: Record<string, string> = {
  RESOLVED: 'var(--check-passed)',
  ESTABLISHED: 'var(--check-passed)',
  ADMITTED: 'var(--status-admitted)',
  ADMITTED_WITH_CONDITIONS: 'var(--status-conditional)',
  BRACKETED: 'var(--status-conditional)',
  REFUSED: 'var(--status-refused)',
  UNRESOLVED: 'var(--status-refused)',
  AMBIGUOUS: 'var(--status-refused)',
  NO_USABLE_IDENTIFIER: 'var(--status-refused)',
};

const tone = (outcome: string) => OUTCOME_COLOR[outcome] ?? 'var(--text-muted)';

function Stat({ label, value, tint }: { label: string; value: string | number; tint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[84px]">
      <span className="label-sm">{label}</span>
      <span className="text-[18px] font-semibold tabular-nums" style={{ color: tint ?? 'var(--text-heading)' }}>{value}</span>
    </div>
  );
}

/**
 * The statutory rail, end to end and on one screen.
 *
 * The funnel is the argument: four documents supplied, three inside the build's
 * knowledge horizon, fourteen candidates, five admitted. Nothing here softens
 * the nine refusals — they are the two specimens the gate was right to stop, and
 * each one names the check it failed and why.
 *
 * The two clocks are separate controls because they are separate questions. The
 * knowledge clock asks what the corpus could have known by an instant. The world
 * clock asks what was in force at one. An order filed in February and effective
 * in April answers yes to the first in March and no to the second, and a single
 * slider that moved both would quietly conflate them.
 */
export function StatutoryHarvester({ report, extractions, specimens, knowledgeInstants, worldInstants }: StatutoryHarvesterProps) {
  const widest = knowledgeInstants[knowledgeInstants.length - 1]!.value;
  const [asOf, setAsOf] = useState<string>(widest);
  const [inForceAt, setInForceAt] = useState<string>('');
  const [selected, setSelected] = useState<string | null>(null);

  const rows: AdmittedRow[] = useMemo(
    () => (inForceAt ? serveInForceAsOf(report.rows, asOf, inForceAt) : serveAdmittedAsOf(report.rows, asOf)),
    [report.rows, asOf, inForceAt],
  );

  const filing = report.filings.find((entry) => entry.captureId === selected) ?? null;
  const extraction = extractions.find((entry) => entry.captureId === selected) ?? null;
  const specimen = specimens.find((entry) => entry.captureId === selected) ?? null;
  const rulingsFor = (captureId: string) => report.rulings.filter((ruling) => ruling.recordId.includes(`${captureId}#`));
  const admittedFor = (captureId: string) => rulingsFor(captureId).filter((ruling) => ruling.outcome !== 'REFUSED').length;

  return (
    <div className="flex flex-col gap-5">
      <Section title="The rail, stage by stage" id="hv-stages">
        <div className="surface p-3 flex flex-wrap items-center gap-x-6 gap-y-3" data-testid="harvester-stages">
          <Stat label="Supplied" value={report.records.captured + report.records.captureRefused} />
          <span aria-hidden className="opacity-40">→</span>
          <Stat label="Captured" value={report.records.captured} />
          <span aria-hidden className="opacity-40">→</span>
          <Stat label="In horizon" value={report.filings.length} />
          <span aria-hidden className="opacity-40">→</span>
          <Stat label="Candidates" value={report.records.candidates} />
          <span aria-hidden className="opacity-40">→</span>
          <Stat label="Admitted" value={report.records.admitted} tint="var(--status-admitted)" />
          <Stat label="Refused" value={report.records.refused} tint="var(--status-refused)" />
          <span aria-hidden className="opacity-40">→</span>
          <Stat label="Served" value={rows.length} tint="var(--info)" />
        </div>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          Nothing on this page was collected. Capture begins at bytes the operator supplies, and the rail has no path to a network:
          reaching a regulator is the operator&rsquo;s act, under their credentials and their reading of the source&rsquo;s terms.
        </p>
      </Section>

      <Section title="Two clocks, two questions" id="hv-clocks">
        <div className="surface p-3 flex flex-col gap-3" data-testid="harvester-clocks">
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 min-w-[240px] flex-1">
              <span className="label-sm">Knowledge time — what the corpus knew by then</span>
              <select
                className="surface-inset px-2 py-1.5 text-[12.5px] rounded"
                value={asOf}
                onChange={(event) => setAsOf(event.target.value)}
                data-testid="harvester-as-of"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--border-default)' }}
              >
                {knowledgeInstants.map((instant) => <option key={instant.value} value={instant.value}>{instant.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-[240px] flex-1">
              <span className="label-sm">World time — what was in force then</span>
              <select
                className="surface-inset px-2 py-1.5 text-[12.5px] rounded"
                value={inForceAt}
                onChange={(event) => setInForceAt(event.target.value)}
                data-testid="harvester-in-force"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--border-default)' }}
              >
                <option value="">Not asked — knowledge time only</option>
                {worldInstants.map((instant) => <option key={instant.value} value={instant.value}>{instant.label}</option>)}
              </select>
            </label>
          </div>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="harvester-clock-note">
            {inForceAt
              ? `${rows.length} of ${report.rows.length} rows were both knowable by ${asOf} and in force at ${inForceAt}. A row can be one without the other: a consent order filed in February taking effect in April is knowable two months before it binds anyone.`
              : `${rows.length} of ${report.rows.length} rows were knowable by ${asOf}. This is not a claim that they were in force then — ask the world-time question for that.`}
          </p>
        </div>
      </Section>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0 flex-1 w-full">
          <Section title="Filings in the build" id="hv-filings">
            <div className="surface overflow-x-auto" tabIndex={0}>
              <table className="w-full text-[12.5px] border-collapse min-w-[640px]">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                    <th scope="col" className="px-3 py-2 font-semibold">Filing</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Jurisdiction</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Subject</th>
                    <th scope="col" className="px-3 py-2 font-semibold">World time</th>
                    <th scope="col" className="px-3 py-2 font-semibold text-right">Admitted</th>
                  </tr>
                </thead>
                <tbody>
                  {report.filings.map((entry) => (
                    <tr key={entry.captureId} style={{ borderTop: '1px solid var(--border-subtle)' }} data-testid={`harvester-filing-${entry.captureId}`}>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="mono text-left underline-offset-2 hover:underline"
                          style={{ color: selected === entry.captureId ? 'var(--accent-strong)' : 'var(--info)' }}
                          onClick={() => setSelected(selected === entry.captureId ? null : entry.captureId)}
                          aria-expanded={selected === entry.captureId}
                        >
                          {entry.captureId}
                        </button>
                      </td>
                      <td className="px-3 py-2 mono">{entry.jurisdiction}</td>
                      <td className="px-3 py-2"><span className="label-sm" style={{ color: tone(entry.identity.outcome) }}>{entry.identity.outcome}</span></td>
                      <td className="px-3 py-2"><span className="label-sm" style={{ color: tone(entry.worldTime.outcome) }}>{entry.worldTime.outcome}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{admittedFor(entry.captureId)} / {entry.candidates}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.excluded.length > 0 && (
              <div className="surface-inset p-3 flex flex-col gap-1" data-testid="harvester-excluded">
                <span className="label-sm">Excluded by the knowledge horizon ({report.knownThrough})</span>
                {report.excluded.map((entry) => (
                  <p key={entry.extractionId} className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="mono">{entry.extractionId}</span> — {entry.because}
                  </p>
                ))}
              </div>
            )}
          </Section>

          <Section title={inForceAt ? 'Rows knowable and in force' : 'Rows the corpus holds'} id="hv-rows">
            <div className="surface overflow-x-auto" tabIndex={0}>
              <table className="w-full text-[12.5px] border-collapse min-w-[760px]">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                    <th scope="col" className="px-3 py-2 font-semibold">Subject</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Predicate</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Value</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Valid from</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Knowable</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.recordId} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="px-3 py-2 mono">{row.subjectCanonicalId}</td>
                      <td className="px-3 py-2 mono">{row.predicate}</td>
                      <td className="px-3 py-2">{String(row.value)}{row.unit ? <span className="unit"> {row.unit}</span> : null}</td>
                      <td className="px-3 py-2 ts">{row.validFrom}</td>
                      <td className="px-3 py-2 ts">{row.knownAt}</td>
                      <td className="px-3 py-2 mono">{row.basis ?? '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="harvester-rows-empty">
                      Nothing at these clocks. An empty answer here is the corpus saying it held nothing then, which is not the same as saying nothing was happening.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Why the gate refused" id="hv-refusals">
            <div className="surface p-3 flex flex-col gap-2" data-testid="harvester-tally">
              {report.refusalTally.length === 0
                ? <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Nothing was refused in this build.</p>
                : report.refusalTally.map((entry) => (
                  <div key={entry.check} className="flex items-center gap-3">
                    <span className="label-sm min-w-[190px]" style={{ color: 'var(--status-refused)' }}>{entry.check}</span>
                    <span className="tabular-nums text-[12.5px]">{entry.count} candidate{entry.count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                A refused candidate stays on the rail with its reasons. It has not been deleted, hidden or quietly retried.
              </p>
            </div>
          </Section>
        </div>

        {filing && extraction && (
          <Inspector
            id="harvester-inspector"
            kicker={filing.jurisdiction}
            title={filing.captureId}
            subtitle={specimen?.demonstrates}
            onClose={() => setSelected(null)}
            focusOnNarrow
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="label-sm">Subject resolution — {filing.identity.outcome}</span>
                <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{filing.identity.because}</p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="label-sm">World time — {filing.worldTime.outcome}</span>
                <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{filing.worldTime.because}</p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="label-sm">Extracted header</span>
                <table className="w-full text-[12px] border-collapse">
                  <tbody>
                    {extraction.fields.map((field) => (
                      <tr key={field.field} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td className="py-1 pr-2 mono align-top">{field.field}</td>
                        <td className="py-1 pr-2 align-top"><span className="label-sm" style={{ color: PRESENCE_COLOR[field.presence] }}>{field.presence}</span></td>
                        <td className="py-1 align-top break-words">{field.value !== null ? String(field.value) : (field.raw ?? <span style={{ color: 'var(--text-muted)' }}>—</span>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  ABSENT means the document said nothing. MALFORMED means it said something this grammar cannot read — which is not the same, and the printed text is kept.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="label-sm">Rulings</span>
                {rulingsFor(filing.captureId).map((ruling) => (
                  <div key={ruling.recordId} className="surface-inset p-2 flex flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="mono text-[11.5px] break-all">{ruling.recordId.split('#')[1]}</span>
                      <span className="label-sm shrink-0" style={{ color: tone(ruling.outcome) }}>{ruling.outcome}</span>
                    </div>
                    {ruling.failed.map((failure) => (
                      <p key={failure.check} className="m-0 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="label-sm" style={{ color: 'var(--status-refused)' }}>{failure.check}</span> {failure.because}
                      </p>
                    ))}
                    {ruling.conditions.map((condition) => (
                      <p key={condition} className="m-0 text-[11.5px]" style={{ color: 'var(--status-conditional)' }}>Condition: {condition}</p>
                    ))}
                  </div>
                ))}
                {filing.skipped.map((entry) => (
                  <p key={entry.field} className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                    <span className="mono">{entry.field}</span> produced no candidate. {entry.because}
                  </p>
                ))}
              </div>
              <dl className="kv text-[12px]">
                <dt>Artifact</dt><dd className="hash break-all">{filing.artifactDigest}</dd>
                <dt>Knowable</dt><dd className="ts">{filing.knownAt}</dd>
                <dt>Source time</dt><dd className="ts">{filing.sourceTime ?? '—'}</dd>
              </dl>
            </div>
          </Inspector>
        )}
      </div>
    </div>
  );
}
