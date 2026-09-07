import type { Metadata } from 'next';
import Link from 'next/link';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { StatutoryHarvester, type HarvesterInstant } from '@/components/insurability/StatutoryHarvester';
import { reportHarvest, runSpecimenHarvest } from '@/adapter/statutoryHarvester';
import { serveAdmittedAsOf, serveInForceAsOf } from '@/domain/statutoryServing';
import { STATUTORY_SPECIMENS } from '@/fixtures/insurability/statutoryFilings';

export const metadata: Metadata = {
  title: 'Statutory Harvester',
  description: 'Insurance-regulator filings from supplied bytes to admitted records: capture, extract, build, admit, serve.',
};

const HOUR = 3600 * 1000;
const shift = (instant: string, ms: number) => new Date(Date.parse(instant) + ms).toISOString();
const unique = (values: readonly string[]) => [...new Set(values)].sort();

/**
 * The instants worth offering on each clock, derived from the run rather than
 * written down, so the controls stay honest when the specimens change. Each
 * label says how many rows the instant admits, because a clock control whose
 * effect you cannot see is a control nobody moves.
 */
export default function HarvesterPage() {
  const run = runSpecimenHarvest();
  const report = reportHarvest(run, run.receipt.ruledAt, null);
  const rows = run.receipt.rows;

  const knownAts = unique(rows.map((row) => row.knownAt));
  const validFroms = unique(rows.map((row) => row.validFrom));
  const knowledge: string[] = rows.length
    ? [shift(knownAts[0], -HOUR), ...knownAts, run.receipt.ruledAt]
    : [run.receipt.ruledAt];
  const world: string[] = validFroms.length ? [shift(validFroms[0], -24 * HOUR), ...validFroms, shift(validFroms[validFroms.length - 1], 24 * 90 * HOUR)] : [];

  const knowledgeInstants: HarvesterInstant[] = unique(knowledge).map((value) => ({
    value,
    label: `${value} — ${serveAdmittedAsOf(rows, value).length} of ${rows.length} rows knowable`,
  }));
  const widest = knowledgeInstants[knowledgeInstants.length - 1].value;
  const worldInstants: HarvesterInstant[] = unique(world).map((value) => ({
    value,
    label: `${value} — ${serveInForceAsOf(rows, widest, value).length} of ${rows.length} rows in force`,
  }));

  return (
    <>
      <FixtureBanner note="Drafted specimens, not captures. The bytes were written in this repository; the admission gate they cross is the real one." />
      <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-sm">Acquisition</span>
            <span className="label-sm" style={{ color: 'var(--status-admitted)' }}>{report.records.admitted} admitted</span>
            <span className="label-sm" style={{ color: 'var(--status-refused)' }}>{report.records.refused} refused</span>
            <span className="label-sm">FL OIR · CA CDI · TX TDI</span>
          </div>
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Statutory filing harvester</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            The insurance-regulator rail, from bytes somebody kept to records the corpus holds:
            capture, extract under a declared per-jurisdiction grammar, build candidates under a knowledge horizon, admit at the gate, serve as of a clock.
            {' '}This is the first rail here whose candidates reach <span className="mono">ADMITTED</span>, and not because a check was relaxed &mdash;
            a regulator&rsquo;s order names an issued NAIC code and declares its own effective date, so the two stages the{' '}
            <Link href="/candidates" style={{ color: 'var(--info)' }}>census rail</Link> is missing arrive as testimony instead of inference.
            The same run is served at{' '}
            <span className="mono">/api/v1/insurability/harvester</span>.
          </p>
        </header>
        <StatutoryHarvester
          report={report}
          extractions={run.extractions}
          specimens={STATUTORY_SPECIMENS.map((entry) => ({ captureId: entry.declaration.captureId, jurisdiction: entry.declaration.jurisdiction, demonstrates: entry.demonstrates }))}
          knowledgeInstants={knowledgeInstants}
          worldInstants={worldInstants}
        />
      </div>
    </>
  );
}
