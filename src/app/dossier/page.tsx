import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import {
  AGENT_MAY_NOT_INVENT, AGENT_MAY_TAILOR, AMENDMENT_RULE, APPROVAL_IS_NOT_A_SUPPLIER_PROPERTY,
  COMPILE_INPUTS, COMPILE_INPUT_MEANING, CONCLUSION_CLASS_RULE, CORRECTION_RULE,
  COVERAGE_HOLE_RULE, DECOMPOSITION_RULE, DELIVERABLE_CHAIN, DELIVERABLE_IMPRINT,
  DOSSIER_STAGES, FACET_CONTRACTS, PRICING_POLICY_RULE, REASSESSMENT_RULE, REFRESH_IS_A_RELEASE,
  STANDING_CONTRACTS, TWO_SNAPSHOTS_RULE, dossierStanding,
} from '@/domain/dossierService';
import { CUSTOMER_ENTRY, CUSTOMER_NEED_NOT_KNOW, identityContract } from '@/domain/firmIdentity';
import { DossierLifecycleView } from '@/components/governance/DossierLifecycleView';
import { GOVERNANCE_DEMONSTRATION } from '@/fixtures/governance/committed';

export const metadata: Metadata = { title: 'Dossier Services' };

/**
 * What a customer actually buys.
 *
 * The page is deliberately the only one here written from the buyer's side. It
 * mentions none of the production vocabulary, because the delivery layer
 * leaking is a defect rather than a wording choice.
 */
export default function DossierPage() {
  const demo = GOVERNANCE_DEMONSTRATION.dossier;
  const standing = dossierStanding([{ dossierId: demo.dossierId, recipientId: demo.recipient, facets: demo.coverage.map((c) => c.facet), stage: demo.stages[demo.stages.length - 1].stage }]);
  const delivery = identityContract('Dossier Services');
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Dossier Services</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          Ask what you actually want to know, in your own words, and receive an evidence-backed answer.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>DEMONSTRATION</span>
        <span style={{ color: 'var(--accent)' }} data-testid="dossier-count">
          {standing.specs} dossier asked for by a simulated buyer, {demo.releases.length} releases, version {demo.correction.successorVersion} corrects version {demo.correction.predecessorVersion}, {demo.refusals.length} rows refused.
        </span>
        <span>{standing.blockedOn[0] ?? GOVERNANCE_DEMONSTRATION.notClaimed[0]}</span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="label-sm m-0">How this reads</p>
        <ChainFigure objects={delivery.spine} label="The delivery spine" emphasise="evidence" />
        <p className="m-0 mt-1 text-[13px]" data-testid="customer-entry" style={{ color: 'var(--text-primary)' }}>{CUSTOMER_ENTRY}</p>
        <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          Nothing on this page asks you to understand {CUSTOMER_NEED_NOT_KNOW.slice(0, 3).join(', ')} or anything else
          from the machinery. If it did, the delivery layer would have leaked.
        </p>
      </div>

      <DossierLifecycleView receipt={demo} />

      <Section title="One question becomes nine" id="facets">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Facet</th><th scope="col">Asks</th><th scope="col">If thin</th></tr></thead>
            <tbody>
              {FACET_CONTRACTS.map((facet) => (
                <tr key={facet.facet} data-testid={`facet-${facet.facet}`}>
                  <td><span className="id">{facet.facet}</span></td>
                  <td className="cell-wide">{facet.asks}</td>
                  <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{facet.ifThin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{DECOMPOSITION_RULE}</p>
      </Section>

      <Section title="Three statuses that never collapse" id="standing">
        <div className="surface p-3 flex flex-col gap-3">
          {STANDING_CONTRACTS.map((entry) => (
            <div key={entry.standing} className="flex flex-col gap-0.5">
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>
                <span className="id">{entry.standing}</span>
                <span className="pill ml-1.5">{entry.heldBy === 'CUSTOMER' ? 'yours' : 'ours'}</span>
                {' '}{entry.means}
              </p>
              <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{entry.collapsing}</p>
            </div>
          ))}
          <p className="m-0 mt-1 text-[12.5px]" data-testid="approval-rule" style={{ color: 'var(--accent)' }}>
            {APPROVAL_IS_NOT_A_SUPPLIER_PROPERTY}
          </p>
        </div>
      </Section>

      <Section title="From asking to monitoring" id="stages">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={[...DOSSIER_STAGES]} label="The dossier stages" emphasise="RELEASE" />
          <div className="mt-1 flex flex-col gap-1">
            {COMPILE_INPUTS.map((input) => (
              <p key={input} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="id">{input}</span> — {COMPILE_INPUT_MEANING[input]}
              </p>
            ))}
          </div>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="two-snapshots" style={{ color: 'var(--text-primary)' }}>{TWO_SNAPSHOTS_RULE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{AMENDMENT_RULE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{REFRESH_IS_A_RELEASE}</p>
          <p className="m-0 text-[12px]" data-testid="reassessment-rule" style={{ color: 'var(--text-secondary)' }}>{REASSESSMENT_RULE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{CORRECTION_RULE}</p>
        </div>
      </Section>

      <Section title="What is quoted, and by whom" id="pricing">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            Tailored: {AGENT_MAY_TAILOR.join(', ')}.
          </p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--accent)' }}>
            Never invented: {AGENT_MAY_NOT_INVENT.join(', ')}.
          </p>
          <p className="m-0 text-[12px]" data-testid="pricing-rule" style={{ color: 'var(--text-secondary)' }}>{PRICING_POLICY_RULE}</p>
        </div>
      </Section>

      <Section title="What every conclusion carries" id="conclusions">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{CONCLUSION_CLASS_RULE}</p>
          <p className="m-0 text-[12.5px]" data-testid="coverage-hole" style={{ color: 'var(--text-secondary)' }}>{COVERAGE_HOLE_RULE}</p>
          <div className="mt-1">
            <p className="label-sm m-0 mb-1.5">Beneath the polished result</p>
            <ChainFigure objects={[...DELIVERABLE_CHAIN]} label="The provenance chain" />
          </div>
          <p className="m-0 mt-2 text-[11.5px]" data-testid="imprint" style={{ color: 'var(--text-muted)' }}>
            {DELIVERABLE_IMPRINT.join(' · ')}
          </p>
        </div>
      </Section>
    </div>
  );
}
