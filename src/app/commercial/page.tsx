import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import {
  COMMERCIAL_ARROWS, COMMERCIAL_BLOCKED_ON, COMMERCIAL_PIPELINE, ENGAGEMENT_FIELDS,
  ENGAGEMENT_OUTCOMES, MARKET_DISCOVERY, MARKET_DISCOVERY_RULE, MESSAGE_IS_A_SERVING_SURFACE,
  MISSING_COUNTERFACTUAL, OPPORTUNITY_CLASSES, OPPORTUNITY_FIELDS, OPPORTUNITY_RULE,
  OUTCOME_ADMISSION_RULE, OUTCOME_RULE, SALES_AGENT_MAY, SALES_AGENT_MAY_NEVER, SEPARATION_RULE,
  commercialStanding,
} from '@/domain/commercialPlane';

export const metadata: Metadata = { title: 'Commercial plane' };

/**
 * Selling from the corpus rather than beside it.
 *
 * The page exists to make one thing visible: an outbound message is a serving
 * surface, and it is the surface where dropping the class buys a reply. Every
 * other constraint here follows the action layer's shape because the failure
 * mode is the action layer's failure mode.
 */
export default function CommercialPage() {
  const standing = commercialStanding();
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Commercial plane</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          Prospect selection as a mining workload, engagement as a proposal, and the outcome as evidence
          that returns through the same admission boundary as everything else.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>CONTRACT</span>
        <span style={{ color: 'var(--accent)' }} data-testid="opportunity-count">
          {standing.opportunities} opportunities, {standing.sent} sent.
        </span>
        <span>{COMMERCIAL_BLOCKED_ON[0]}</span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="label-sm m-0">The pipeline, and the arrows inside it</p>
        <ChainFigure objects={[...COMMERCIAL_PIPELINE]} label="The commercial pipeline" emphasise="Authorization" />
        <ul className="m-0 mt-1 pl-4 flex flex-col gap-0.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          {COMMERCIAL_ARROWS.map((arrow) => <li key={arrow}>{arrow}</li>)}
        </ul>
        <p className="m-0 mt-1 text-[13px]" data-testid="separation-rule" style={{ color: 'var(--text-primary)' }}>{SEPARATION_RULE}</p>
      </div>

      <Section title="A claim in a message is a served claim" id="serving">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[13px]" data-testid="serving-rule" style={{ color: 'var(--text-primary)' }}>{MESSAGE_IS_A_SERVING_SURFACE}</p>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            Pinned in <span className="id">engagement_claim</span>: what the message presents a claim as is tied to
            the class the artifact carries, and a check requires them equal.
          </p>
        </div>
      </Section>

      <Section title="An opportunity is a fitted claim about an account" id="opportunity">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Field</th><th scope="col">Answers</th><th scope="col">Required</th></tr></thead>
            <tbody>
              {OPPORTUNITY_FIELDS.map((field) => (
                <tr key={field.field}>
                  <td><span className="id">{field.field}</span></td>
                  <td className="cell-wide">{field.answers}</td>
                  <td><span className="pill" style={{ color: field.required ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{field.required ? 'yes' : 'no'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" data-testid="opportunity-rule" style={{ color: 'var(--text-secondary)' }}>{OPPORTUNITY_RULE}</p>
        <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          Permitted classes: {OPPORTUNITY_CLASSES.join(', ')}. A deterministic count is not a hypothesis about an
          organization&rsquo;s intentions and cannot become one.
        </p>
      </Section>

      <Section title="The sales agent may draft and may not send" id="agent">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            May: {SALES_AGENT_MAY.join(', ')}. <span style={{ color: 'var(--accent)' }}>Never: {SALES_AGENT_MAY_NEVER.join(', ')}.</span>
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {ENGAGEMENT_FIELDS.map((field) => (
              <p key={field.field} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="id">{field.field}</span> — {field.answers}
              </p>
            ))}
          </div>
        </div>
      </Section>

      <Section title="What comes back, and how it gets in" id="outcomes">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            {ENGAGEMENT_OUTCOMES.map((outcome) => <span key={outcome} className="pill mr-1.5">{outcome}</span>)}
          </p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{OUTCOME_RULE}</p>
          <p className="m-0 text-[12.5px]" data-testid="admission-rule" style={{ color: 'var(--text-secondary)' }}>{OUTCOME_ADMISSION_RULE}</p>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{MISSING_COUNTERFACTUAL}</p>
        </div>
      </Section>

      <Section title="The corpus discovering a market" id="discovery">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={MARKET_DISCOVERY} label="Market discovery" emphasise="Commercial validation" />
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{MARKET_DISCOVERY_RULE}</p>
        </div>
      </Section>
    </div>
  );
}
