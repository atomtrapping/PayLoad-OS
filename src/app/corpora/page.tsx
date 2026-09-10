import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import { CorpusRegister } from '@/components/corpora/CorpusRegister';
import {
  ACQUISITION_PATH, ACQUISITION_PATTERNS, BUILD_PHASES, CENTRAL_QUESTION, CLOCKS,
  DECISION_COVERAGE_MEASURES, FIRST_ASSEMBLED_OBJECT, FIRST_RELEASE_SCOPE, FIRST_SCOPE_PRIORITY,
  KNOWLEDGE_RULE, PURCHASE_TEST, SEPARATE_RIGHTS, SILENCE_RULE, SOURCE_REGISTRY_FIELDS, THE_ASSET,
} from '@/domain/industrialCorpus';

export const metadata: Metadata = { title: 'Evidence corpora' };

/**
 * The industrial evidence corpus programme.
 *
 * Eight corpora assembled around one question, the sources shortlisted for
 * each, and the machinery they would share. Everything on this page is read
 * from `src/domain/industrialCorpus.ts`, so the plan and the page cannot
 * disagree, and the tests that hold the plan to its own rules hold this page
 * to them too.
 *
 * The page says what it is before it says anything else. Nothing here is
 * acquired.
 */
export default function CorporaPage() {
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Evidence corpora</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          A connected industrial evidence corpus around facilities, materials, trade flows, transport networks,
          operating costs and applicable rules — not a collection of unrelated feeds.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>SPECIFICATION</span>
        <span style={{ color: 'var(--accent)' }}>No source named here is integrated, connected, licensed or collected.</span>
        <span>Each is an acquisition candidate, and each still has to pass an access, coverage, cost and redistribution-rights test.</span>
      </div>

      <div className="surface p-3">
        <p className="label-sm m-0 mb-1">The question the eight answer together</p>
        <p className="m-0 text-[13px]" data-testid="central-question" style={{ color: 'var(--text-primary)' }}>{CENTRAL_QUESTION}</p>
        <p className="m-0 mt-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          Satellite imagery, customs statistics, port notices, supplier documents and economic series become more
          useful when they contribute to answering it together.
        </p>
      </div>

      <CorpusRegister />

      <Section title="One path, not eight platforms" id="acquisition-path">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={ACQUISITION_PATH} label="The acquisition path every corpus runs through" />
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            These corpora extend the existing acquisition and evidence substrate rather than creating eight
            independent platforms. The path starts at a customer question and ends at something deliverable.
          </p>
        </div>
      </Section>

      <Section title="Six reusable acquisition patterns" id="acquisition-patterns">
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Acquisition patterns">
            <thead><tr><th scope="col">Pattern</th><th scope="col">Work it handles</th></tr></thead>
            <tbody>
              {ACQUISITION_PATTERNS.map((pattern) => (
                <tr key={pattern.id}>
                  <td>{pattern.name}</td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{pattern.handles.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Rights are separate entries" id="separate-rights">
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Separate rights">
            <thead><tr><th scope="col">Right</th><th scope="col">Operation</th><th scope="col">The question it answers</th></tr></thead>
            <tbody>
              {SEPARATE_RIGHTS.map((right) => (
                <tr key={right.right}>
                  <td>{right.right}</td>
                  <td className="mono text-[12px]">{right.operation}</td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{right.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          Five separate answers, on the operation vocabulary this repository already evaluates in
          <code className="mono"> src/data-os/source-policy.ts</code>. A single public/not-public flag would be
          inadequate: attribution obligations vary by theme and by upstream contribution, and some sources carry
          their own licence conditions on top. Every source also records {SOURCE_REGISTRY_FIELDS.join(', ')} —
          whether or not it is ever integrated.
        </p>
      </Section>

      <Section title="Clocks that must not be collapsed" id="clocks">
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Clocks">
            <thead><tr><th scope="col">Record</th><th scope="col">Times</th><th scope="col">What collapsing them would lose</th></tr></thead>
            <tbody>
              {CLOCKS.map((clock) => (
                <tr key={clock.kind}>
                  <td>{clock.kind}</td>
                  <td className="text-[12px]"><ChainFigure objects={clock.times} label={`${clock.kind}: times`} /></td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{clock.collapsing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" data-testid="knowledge-rule" style={{ color: 'var(--text-secondary)' }}>{KNOWLEDGE_RULE}</p>
        <p className="m-0 text-[12px]" data-testid="silence-rule" style={{ color: 'var(--text-secondary)' }}>{SILENCE_RULE}</p>
      </Section>

      <Section title="What would be built first" id="phases">
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Build phases">
            <thead><tr><th scope="col">Phase</th><th scope="col">Build and run</th><th scope="col">Deliverable</th><th scope="col">Validation</th></tr></thead>
            <tbody>
              {BUILD_PHASES.map((phase) => (
                <tr key={phase.order}>
                  <td><span className="mono">{phase.order}</span> {phase.title}</td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{phase.build}</td>
                  <td className="text-[12px]">{phase.deliverable}</td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{phase.validation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="surface p-3 flex flex-col gap-2">
          <p className="label-sm m-0">The illustrative first scope</p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            {FIRST_RELEASE_SCOPE.supplierFacilities} named supplier facilities, {FIRST_RELEASE_SCOPE.ports} ports,
            {' '}{FIRST_RELEASE_SCOPE.productFamilies} product family, {FIRST_RELEASE_SCOPE.originJurisdictions} origin
            jurisdiction and {FIRST_RELEASE_SCOPE.destinationMarkets} Western destination market.
          </p>
          <p className="m-0 text-[11.5px]" data-testid="scope-standing" style={{ color: 'var(--status-conditional)' }}>
            {FIRST_RELEASE_SCOPE.standing.replace(/_/g, ' ').toLowerCase()}.
          </p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{FIRST_RELEASE_SCOPE.extends}</p>
          <div>
            <p className="label-sm m-0 mb-1.5">Source priority within that scope</p>
            <ChainFigure objects={FIRST_SCOPE_PRIORITY} label="Source priority within the first scope" />
            <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              The order is what prevents a beautiful but commercially disconnected satellite archive.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Measured by decision coverage" id="measures">
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Decision coverage measures">
            <thead><tr><th scope="col">Measure</th><th scope="col">Why it is the one to watch</th></tr></thead>
            <tbody>
              {DECISION_COVERAGE_MEASURES.map((measure) => (
                <tr key={measure.id}>
                  <td className="text-[12.5px]">{measure.measure}</td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{measure.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="purchase-test"><span className="label-sm">The purchase test</span> {PURCHASE_TEST}</p>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            An expensive feed that adds impressive-looking context but changes none of those is a poor early purchase.
          </p>
          <p className="m-0 text-[12.5px]"><span className="label-sm">The first valuable assembled object</span> {FIRST_ASSEMBLED_OBJECT}</p>
          <p className="m-0 text-[12.5px]" data-testid="the-asset"><span className="label-sm">The information asset</span> {THE_ASSET}</p>
        </div>
      </Section>
    </div>
  );
}
