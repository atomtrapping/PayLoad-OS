import type { Metadata } from 'next';
import Link from 'next/link';
import { getCorpusSource } from '@/adapter/corpusSource';
import { Panel, Readout, Rule } from '@/components/hud/Instrument';
import { WorkspaceAtlas } from '@/components/shell/WorkspaceAtlas';
import { CONSOLE_LOSS, CONSOLE_STATE_MEANING, LOCAL_RAILS, readConsole, type ConsoleRow, type ConsoleState } from '@/domain/console';
import { EPISTEMIC_OF_CONSOLE } from '@/domain/epistemic';
import { fmtUtc } from '@/lib/format';

export const metadata: Metadata = { title: 'Console' };
export const dynamic = 'force-dynamic';

/**
 * The terminal's home.
 *
 * This route was a redirect into the release catalogue, so opening the
 * operating system put you in a product listing. A control system's home is
 * the system: which store answered, what the admitted count reads, what the
 * gate has ruled, and which rails are refusing right now.
 *
 * The readings are taken here because taking them needs a store connection and
 * an environment. What they mean is decided in `src/domain/console.ts`, which
 * has neither and is held to having neither.
 *
 * Nothing on this page writes. The command that enables a rail is printed as
 * text an operator runs in their own terminal, not as a button: a console that
 * can start a rail is a second actor with its own unlogged state, which is the
 * same argument the capture scheduler makes for deciding and never running.
 */
export default async function ConsolePage() {
  const source = getCorpusSource();
  const [corpora, admitted, ledger] = await Promise.all([
    source.listCorpora(),
    source.admittedRecords(),
    source.admissionLedger(),
  ]);
  const console_ = readConsole({
    readAt: new Date().toISOString(),
    origin: source.origin,
    admitted,
    ledger,
    corpora: {
      corpora: corpora.length,
      releases: corpora.reduce((n, c) => n + c.releases.length, 0),
      records: corpora.reduce((n, c) => n + c.records.length, 0),
      retractions: corpora.reduce((n, c) => n + c.retractions.length, 0),
    },
    // Read here, never in the domain module: a pure derivation that reaches for
    // process.env is not pure, and this one is tested as though it were.
    rails: {
      PRODUCTION: process.env.PAYLOAD_PRODUCTION_LOCAL === '1',
      STATE_KERNEL: process.env.PAYLOAD_STATE_KERNEL_LOCAL === '1',
      COORDINATION: process.env.PAYLOAD_COORDINATION_LOCAL === '1',
      SOURCE_COLLECTION: process.env.PAYLOAD_SOURCE_COLLECTION === '1',
      SELF_CAPTURE: process.env.PAYLOAD_SELF_CAPTURE_LOCAL === '1',
    },
  });

  return (
    <div className="p-3 sm:p-4 max-w-[1100px] mx-auto w-full flex flex-col gap-4" data-testid="console">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>NotationsOS console</h1>
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          What this terminal can see about itself, read at <span className="ts">{fmtUtc(console_.readAt)}</span>. The products are at{' '}
          <Link href="/releases" style={{ color: 'var(--info)' }}>Releases</Link>; this page is the backend they are produced from.
        </p>
      </header>

      {/* What this terminal can see about itself begins with what it consists
          of. The rail is a good list and a poor map; the atlas is the same
          registry as a figure, and it is here because this is where someone
          who does not yet know what is in this system arrives. */}
      <WorkspaceAtlas />

      <div className="grid gap-3 lg:grid-cols-3">
        {console_.panels.map((panel) => (
          <Panel
            key={panel.id}
            testId={`console-${panel.id.toLowerCase()}`}
            label={panel.title}
            right={<span className="mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{panel.rows.length}</span>}
          >
            <p className="m-0 mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>{panel.asks}</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {panel.rows.map((row) => <ConsoleRowItem key={row.id} row={row} />)}
            </ul>
          </Panel>
        ))}
      </div>

      <Panel label="What the console does not do" testId="console-loss">
        <p className="m-0 mb-2 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="console-because">{console_.because}</p>
        <div className="hud-stamp">
          <span data-k="WRITES">{console_.writes}</span>
          <span data-k="METHOD">{console_.method}</span>
        </div>
        <ul className="m-0 mt-2 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
          {CONSOLE_LOSS.map((loss) => <li key={loss}>{loss}</li>)}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * One reading. A row without a number carries its state word instead, drawn on
 * the epistemic scale, because a dash in a column of counts reads as a zero and
 * this system spends a great deal of effort upstream keeping those apart.
 */
function ConsoleRowItem({ row }: { row: ConsoleRow }) {
  const state: ConsoleState = row.state;
  return (
    <li className="flex flex-col gap-1" data-console-row={row.id} data-console-state={state}>
      {row.reading === undefined
        ? (
          <div className="hud-readout" data-layout="row" data-epistemic={EPISTEMIC_OF_CONSOLE[state]}>
            <span className="hud-readout-label">{row.label}</span>
            <span className="hud-readout-value" title={CONSOLE_STATE_MEANING[state]}>{state}</span>
          </div>
        )
        : <Readout label={row.label} value={row.reading} state={EPISTEMIC_OF_CONSOLE[state]} unit={row.unit} layout="row" testId={`console-reading-${row.id}`} />}
      <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{row.because}</span>
      {row.enableWith && (
        <code className="surface-inset px-2 py-1 mono text-[11.5px] self-start" data-enable-with={row.id} style={{ color: 'var(--text-secondary)' }}>{row.enableWith}</code>
      )}
    </li>
  );
}

/** Named so the rail list stays reachable from a test without re-deriving it. */
export const CONSOLE_RAIL_COUNT = LOCAL_RAILS.length;

/** Kept beside the page so the section rule reads the same as everywhere else. */
export { Rule };
