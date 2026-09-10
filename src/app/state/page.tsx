import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import {
  APPLICABILITY_RULE, BASIS_MEANING, CAPACITY_IS_THE_CONNECTOR, CONTRADICTION_IS_A_STATE,
  CORRECTION_MOVES_KNOWLEDGE_NOT_THE_EVENT, ESTIMATE_CLOCKS, ESTIMATE_CLOCK_MEANING,
  ESTIMATE_CONTRACT, EVIDENTIAL_STANDING_RULE, OBSERVATION_BASES, PHYSICAL_BLOCKS,
  PHYSICAL_BLOCK_MEANING, REVISION_IS_WHAT_AUTHORIZATIONS_BIND_TO, REVISION_RULE,
  STATE_BLOCKED_ON, STATE_KIND_CONTRACTS, THREE_MEANINGS_RULE, stateStanding,
} from '@/domain/stateKinds';
import {
  CLUSTER_RULE, CO_LOCATION_RULE, INDUSTRIAL_CHAIN_RULE, INDUSTRIAL_STAGES, RELATIONSHIP_ROLES,
  ROLE_MEANING, STAGE_CONTRACTS, TRANSPORT_CHAIN_RULE, TRANSPORT_STAGES,
} from '@/domain/capacityCoupling';

export const metadata: Metadata = { title: 'State and coupling' };

/**
 * Three meanings of state, and the mechanism that connects land to movement.
 *
 * They share a page because they share a mistake: reading a record as the
 * world, and reading the first event of a chain as evidence for the last.
 */
export default function StatePage() {
  const standing = stateStanding();
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>State and coupling</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          What the world is doing, what the evidence supports, and what the system has committed — kept apart.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>CONTRACT</span>
        <span style={{ color: 'var(--accent)' }} data-testid="state-standing">
          {standing.subjects} subjects declared across {standing.kinds} kinds.
        </span>
        <span>{STATE_BLOCKED_ON[0]}</span>
      </div>

      <Section title="Three meanings" id="kinds">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Kind</th><th scope="col">Is</th><th scope="col">Independent</th><th scope="col">Collapsing it</th></tr></thead>
            <tbody>
              {STATE_KIND_CONTRACTS.map((contract) => (
                <tr key={contract.kind} data-testid={`kind-${contract.kind}`}>
                  <td><span className="id">{contract.kind}</span></td>
                  <td className="cell-wide">{contract.is}</td>
                  <td><span className="pill">{contract.independentOfTheRecord ? 'of the record' : 'no'}</span></td>
                  <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{contract.collapsing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12.5px]" data-testid="three-meanings" style={{ color: 'var(--text-primary)' }}>{THREE_MEANINGS_RULE}</p>
      </Section>

      <Section title="Two clocks on an estimate" id="clocks">
        <div className="surface p-3 flex flex-col gap-2">
          {ESTIMATE_CLOCKS.map((clock) => (
            <p key={clock} className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="id">{clock}</span> — {ESTIMATE_CLOCK_MEANING[clock]}
            </p>
          ))}
          <p className="m-0 mt-1 text-[13px]" data-testid="correction-rule" style={{ color: 'var(--text-primary)' }}>{CORRECTION_MOVES_KNOWLEDGE_NOT_THE_EVENT}</p>
          <div className="mt-1 flex flex-col gap-0.5">
            {ESTIMATE_CONTRACT.map((field) => (
              <p key={field.field} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="id">{field.field}</span> — {field.answers}
                {field.previouslyHomeless && <span className="pill ml-1.5" style={{ color: 'var(--accent)' }}>new</span>}
              </p>
            ))}
          </div>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="applicability" style={{ color: 'var(--accent)' }}>{APPLICABILITY_RULE}</p>
        </div>
      </Section>

      <Section title="Three bases that arrive through the same pipe" id="bases">
        <div className="surface p-3 flex flex-col gap-1.5">
          {OBSERVATION_BASES.map((basis) => (
            <p key={basis} className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="id">{basis}</span> — {BASIS_MEANING[basis]}
            </p>
          ))}
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-primary)' }}>{EVIDENTIAL_STANDING_RULE}</p>
        </div>
      </Section>

      <Section title="Operational state" id="operational">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="contradiction" style={{ color: 'var(--text-primary)' }}>{CONTRADICTION_IS_A_STATE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{REVISION_RULE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{REVISION_IS_WHAT_AUTHORIZATIONS_BIND_TO}</p>
        </div>
      </Section>

      <Section title="The physical vector, and its connector" id="physical">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={[...PHYSICAL_BLOCKS]} label="The physical blocks" emphasise="CAPACITY" />
          <div className="mt-1 flex flex-col gap-0.5">
            {PHYSICAL_BLOCKS.map((block) => (
              <p key={block} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="id">{block}</span> — {PHYSICAL_BLOCK_MEANING[block]}
              </p>
            ))}
          </div>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="capacity-connector" style={{ color: 'var(--text-primary)' }}>{CAPACITY_IS_THE_CONNECTOR}</p>
        </div>
      </Section>

      <Section title="Four things that are not each other" id="chain">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={[...INDUSTRIAL_STAGES]} label="The industrial chain" emphasise="ACTUAL_PRODUCTION" />
          <div className="mt-1 flex flex-col gap-1">
            {STAGE_CONTRACTS.map((stage) => (
              <p key={stage.stage} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="id">{stage.stage}</span> does not establish {stage.doesNotEstablish.toLowerCase()}
                {' '}<span style={{ color: 'var(--text-muted)' }}>{stage.failsWhen}</span>
              </p>
            ))}
          </div>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="industrial-chain" style={{ color: 'var(--accent)' }}>{INDUSTRIAL_CHAIN_RULE}</p>
          <div className="mt-2">
            <p className="label-sm m-0 mb-1.5">And on the transport side</p>
            <ChainFigure objects={[...TRANSPORT_STAGES]} label="The transport chain" emphasise="OBSERVED_SHIPMENT" />
            <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{TRANSPORT_CHAIN_RULE}</p>
          </div>
        </div>
      </Section>

      <Section title="Four roles a spatial match does not establish" id="roles">
        <div className="surface p-3 flex flex-col gap-1.5">
          {RELATIONSHIP_ROLES.map((role) => (
            <p key={role} className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="id">{role}</span> — {ROLE_MEANING[role]}
            </p>
          ))}
          <p className="m-0 mt-1 text-[12.5px]" data-testid="co-location" style={{ color: 'var(--text-primary)' }}>{CO_LOCATION_RULE}</p>
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{CLUSTER_RULE}</p>
        </div>
      </Section>
    </div>
  );
}
