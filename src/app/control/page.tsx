import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import { GovernedActs } from '@/components/governance/GovernedActs';
import { RefusalRegister } from '@/components/governance/RefusalRegister';
import { TerminalWorkbench } from '@/components/terminal/TerminalWorkbench';
import { allActs } from '@/components/governance/acts';
import { GOVERNANCE_DEMONSTRATION } from '@/fixtures/governance/committed';
import { APPROVAL_IS_OF_A_DIGEST, REVOCATION_RULE } from '@/domain/executionEnvelope';
import {
  COMMAND_BAR_RULE, COMMAND_EXAMPLES, FIRM_LOOP, FIRM_QUESTIONS, FIRM_STATE_COMPONENTS,
  INTENT_PIPELINE, LAYER_CONTRACTS, MONOLITH_WARNING, OPERATING_PLANES, SEPARATIONS,
  TWIN_RULE, TWIN_STATES, TWIN_TRAVERSALS, WHY_PROVENANCE_MATTERS_HERE, planeStanding,
} from '@/domain/firmControlPlane';

export const metadata: Metadata = { title: 'Control plane' };

/**
 * The three names, and which planes actually exist.
 *
 * A page that drew ten boxes would imply ten planes. This one draws ten and
 * says which three of them this repository does not yet surface, because the
 * diagram is the easiest place in the whole system to overstate.
 */
export default function ControlPage() {
  const standing = planeStanding();
  const demo = GOVERNANCE_DEMONSTRATION;
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Control plane</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          The substrate, the authority and the surface, kept apart — and the planes each one covers.
        </p>
      </header>

      <TerminalWorkbench />

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>ARCHITECTURE</span>
        <span style={{ color: 'var(--accent)' }} data-testid="plane-standing">
          {standing.surfaced} of {standing.planes} planes have a surface here.
        </span>
        <span>Awaiting: {standing.awaiting.join(', ')}.</span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="label-sm m-0">Four sentences, each preventing something being built</p>
        <ul className="m-0 pl-4 flex flex-col gap-0.5 text-[13px]" data-testid="separations" style={{ color: 'var(--text-primary)' }}>
          {SEPARATIONS.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>

      <Section title="Governed operations, demonstrated" id="governed">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="governed-counts" style={{ color: 'var(--accent)' }}>
            {demo.counts.proposals} proposals through one kernel in two databases, and one refused before it was a row: {demo.counts.authorizations} authorized, {demo.counts.revocations} revoked, {demo.counts.dispatches} dispatched, {demo.counts.reconciliations} reconciled, {demo.counts.unresolved} unresolved; {demo.counts.refusals} rows refused by {demo.refusedBy.length} named guards.
          </p>
          <p className="m-0 text-[12.5px]" data-testid="approval-is-of-a-digest" style={{ color: 'var(--text-primary)' }}>{APPROVAL_IS_OF_A_DIGEST}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{REVOCATION_RULE}</p>
          <ul className="m-0 pl-4 flex flex-col gap-0.5 text-[12px]" data-testid="not-claimed" style={{ color: 'var(--status-conditional)' }}>
            {demo.notClaimed.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <div className="text-[11.5px]" data-testid="guards" style={{ color: 'var(--text-muted)' }}>
            <p className="m-0 mb-1">Guards that refused something:</p>
            <ul className="m-0 pl-0 list-none flex flex-wrap gap-1.5">
              {demo.refusedBy.map((guard) => <li key={guard} className="mono pill">{guard}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-2">
          <GovernedActs acts={allActs(demo)} label="Every governed act in the demonstration" selectionKey="act" />
        </div>
        <div className="mt-2">
          <RefusalRegister refusals={demo.refusals} testId="all-refusals" />
        </div>
      </Section>

      <Section title="Three names" id="names">
        <div className="surface p-3 flex flex-col gap-3">
          {LAYER_CONTRACTS.map((contract) => (
            <div key={contract.name} className="flex flex-col gap-1">
              <p className="m-0 text-[13px]" style={{ color: 'var(--text-heading)' }}>{contract.name}</p>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{contract.is}</p>
              <ChainFigure objects={contract.madeOf} label={`${contract.name} is made of`} />
              <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{contract.collapsing}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The planes" id="planes">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Plane</th><th scope="col">Observes or controls</th><th scope="col">Surface</th></tr></thead>
            <tbody>
              {OPERATING_PLANES.map((plane) => (
                <tr key={plane.plane} data-testid={`plane-${plane.plane}`}>
                  <td><span className="id">{plane.plane}</span></td>
                  <td className="cell-wide">{plane.controls}</td>
                  <td><span className="pill" style={{ color: plane.surfaced ? 'var(--ok)' : 'var(--text-muted)' }}>{plane.surfaced ? 'PRESENT' : 'NONE'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" data-testid="monolith-warning" style={{ color: 'var(--text-secondary)' }}>{MONOLITH_WARNING}</p>
      </Section>

      <Section title="An instruction becomes a query or a proposal" id="command">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={[...INTENT_PIPELINE]} label="The intent pipeline" emphasise="Query or proposal" />
          <p className="m-0 mt-1 text-[13px]" data-testid="command-bar-rule" style={{ color: 'var(--text-primary)' }}>{COMMAND_BAR_RULE}</p>
        </div>
        <div className="surface p-0 mt-2 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Instruction</th><th scope="col">Becomes</th><th scope="col">Plane</th></tr></thead>
            <tbody>
              {COMMAND_EXAMPLES.map((example) => (
                <tr key={example.instruction}>
                  <td className="cell-wide"><span style={{ color: 'var(--text-primary)' }}>{example.instruction}</span></td>
                  <td><span className="pill">{example.becomes}</span></td>
                  <td style={{ color: 'var(--text-muted)' }}>{example.plane}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="The twin as a control surface" id="twin">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="label-sm m-0">Clicking a facility traverses</p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            {TWIN_TRAVERSALS.map((entry) => <span key={entry} className="pill mr-1.5">{entry}</span>)}
          </p>
          <p className="label-sm m-0 mt-1">And must distinguish</p>
          <p className="m-0 text-[12.5px]" data-testid="twin-states" style={{ color: 'var(--text-secondary)' }}>
            {TWIN_STATES.map((state) => <span key={state} className="pill mr-1.5">{state}</span>)}
          </p>
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{TWIN_RULE}</p>
        </div>
      </Section>

      <Section title="The firm itself as state" id="firm">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={[...FIRM_LOOP]} label="The firm loop" />
          <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            One coherent state model, not one database: {FIRM_STATE_COMPONENTS.join(', ')}.
          </p>
          <ul className="m-0 mt-1 pl-4 flex flex-col gap-0.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            {FIRM_QUESTIONS.map((question) => <li key={question}>{question}</li>)}
          </ul>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="provenance-rule" style={{ color: 'var(--text-primary)' }}>{WHY_PROVENANCE_MATTERS_HERE}</p>
        </div>
      </Section>
    </div>
  );
}
