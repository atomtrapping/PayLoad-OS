import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import {
  APPROVAL_BINDS_TO, APPROVAL_IS_NOT_VERIFICATION, ASSET_CONTRACTS, ASSET_DISTINCTION_RULE,
  AUTHORIZATION_IS_NOT_SUFFICIENT, AUTOMATED_VS_AUTHORIZED, BALANCED_PRESENTATION_RULE,
  BORROWING_RULE, BUCKET_CONTRACTS, CURRENCY_MISMATCH_RULE, DECISION_PACKET, DENIAL_IS_PERSISTENT,
  DENIAL_ROUTES_REFUSED, ELIGIBILITY_GATES, ELIGIBILITY_GATE_RULE, ELIGIBILITY_SCOPE_RULE,
  EXECUTION_TERMS, INDEPENDENCE_RULE, LIQUIDITY_CLASSES, LIQUIDITY_RULE, LIQUIDITY_STEPS,
  MATERIAL_CHANGES, NO_DEFAULT_RULE, PROVIDER_ADAPTERS, RECHECK_RULE, REVERSIBILITY_RULE,
  REVIEW_RESPONSES, ROLLOUT_STAGES, ROUND_TRIP, ROUND_TRIP_RULE, SETTLEMENT_STAGES,
  TREASURY_BLOCKED_ON, UNKNOWN_ELIGIBILITY_RULE, treasuryStanding,
} from '@/domain/treasury';

export const metadata: Metadata = { title: 'Treasury' };

/**
 * The firm's own money, under human authority.
 *
 * The page is arranged around the four terms rather than around the balance,
 * because a treasury screen that leads with a total invites the reader to
 * decide from the total.
 */
export default function TreasuryPage() {
  const standing = treasuryStanding();
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Treasury</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          The system researches, calculates, monitors and prepares. A person approves, refuses, or sends it back.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>CONTRACT</span>
        <span style={{ color: 'var(--accent)' }} data-testid="treasury-standing">
          {standing.proposals} proposals, {standing.providersApproved} providers approved, round trip unproven.
        </span>
        <span>{TREASURY_BLOCKED_ON[0]}</span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="label-sm m-0">The control rule</p>
        <ChainFigure objects={[...EXECUTION_TERMS]} label="The four terms" emphasise="HUMAN_AUTHORIZATION" />
        <p className="m-0 mt-1 text-[13px]" data-testid="not-sufficient" style={{ color: 'var(--text-primary)' }}>{AUTHORIZATION_IS_NOT_SUFFICIENT}</p>
        <p className="m-0 text-[12.5px]" data-testid="unknown-eligibility" style={{ color: 'var(--accent)' }}>{UNKNOWN_ELIGIBILITY_RULE}</p>
      </div>

      <Section title="What a reviewer is given" id="packet">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Section</th><th scope="col">Must present</th></tr></thead>
            <tbody>
              {DECISION_PACKET.map((section) => (
                <tr key={section.section} data-testid={`packet-${section.section.replace(/\s+/g, '-')}`}>
                  <td><span className="id">{section.section}</span></td>
                  <td className="cell-wide">{section.mustPresent.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12.5px]" data-testid="balanced" style={{ color: 'var(--text-primary)' }}>{BALANCED_PRESENTATION_RULE}</p>
      </Section>

      <Section title="Four responses, and no default" id="responses">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            {REVIEW_RESPONSES.map((response) => <span key={response} className="pill mr-1.5">{response}</span>)}
          </p>
          <p className="m-0 text-[12.5px]" data-testid="no-default" style={{ color: 'var(--text-primary)' }}>{NO_DEFAULT_RULE}</p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{DENIAL_IS_PERSISTENT}</p>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            Refused routes: {DENIAL_ROUTES_REFUSED.join('; ')}.
          </p>
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            An approval binds to {APPROVAL_BINDS_TO.join(', ')}. A material change — {MATERIAL_CHANGES.join(', ')} — invalidates it.
          </p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{RECHECK_RULE}</p>
          <p className="m-0 text-[12px]" data-testid="not-verification" style={{ color: 'var(--text-secondary)' }}>{APPROVAL_IS_NOT_VERIFICATION}</p>
        </div>
      </Section>

      <Section title="Four buckets, none replenished behind you" id="buckets">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Bucket</th><th scope="col">Holds</th><th scope="col">Rule</th></tr></thead>
            <tbody>
              {BUCKET_CONTRACTS.map((bucket) => (
                <tr key={bucket.bucket}>
                  <td><span className="id">{bucket.bucket}</span></td>
                  <td className="cell-wide">{bucket.holds}</td>
                  <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{bucket.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12.5px]" data-testid="independence" style={{ color: 'var(--text-primary)' }}>{INDEPENDENCE_RULE}</p>
      </Section>

      <Section title="Three objects, not three views of one" id="assets">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            {Object.values(ASSET_CONTRACTS).map((asset) => (
              <span key={asset.role} className="mr-3">
                <span className="id">{asset.role}</span>
                {asset.paysHolder ? ' pays' : ' pays nothing'}, {asset.depositInsured ? 'insured' : 'not insured'}
                {asset.requiresNetworkAndContract ? ', network and contract identified' : ''}
              </span>
            ))}
          </p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{ASSET_DISTINCTION_RULE}</p>
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            {LIQUIDITY_CLASSES.map((cls) => (
              <span key={cls} className="mr-3"><span className="id">{cls}</span> {LIQUIDITY_STEPS[cls].length} steps to a payment</span>
            ))}
          </p>
          <p className="m-0 text-[12px]" data-testid="liquidity" style={{ color: 'var(--text-secondary)' }}>{LIQUIDITY_RULE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{CURRENCY_MISMATCH_RULE}</p>
        </div>
      </Section>

      <Section title="Two asymmetries the automation cannot smooth" id="asymmetries">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{REVERSIBILITY_RULE}</p>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            Kept distinguishable: {SETTLEMENT_STAGES.join(' · ')}.
          </p>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="borrowing" style={{ color: 'var(--text-secondary)' }}>{BORROWING_RULE}</p>
        </div>
      </Section>

      <Section title="Providers are adapters" id="providers">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Adapter</th><th scope="col">Provides</th><th scope="col">State</th><th scope="col">Outstanding</th></tr></thead>
            <tbody>
              {PROVIDER_ADAPTERS.map((adapter) => (
                <tr key={adapter.adapter} data-testid={`adapter-${adapter.state}`}>
                  <td><span className="id">{adapter.adapter}</span></td>
                  <td className="cell-wide">{adapter.provides}</td>
                  <td><span className="pill" style={{ color: adapter.state === 'BLOCKED' ? 'var(--status-conditional)' : 'var(--text-muted)' }}>{adapter.state}</span></td>
                  <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{adapter.outstanding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{ELIGIBILITY_SCOPE_RULE}</p>
        <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          Gates, all of them independent: {ELIGIBILITY_GATES.join(' · ')}. {ELIGIBILITY_GATE_RULE}
        </p>
      </Section>

      <Section title="Prove the route before relying on it" id="rollout">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={[...ROUND_TRIP]} label="The round trip" />
          <p className="m-0 mt-1 text-[12.5px]" data-testid="round-trip" style={{ color: 'var(--text-primary)' }}>{ROUND_TRIP_RULE}</p>
          <div className="mt-1 flex flex-col gap-0.5">
            {ROLLOUT_STAGES.map((stage) => (
              <p key={stage.stage} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="id">{stage.order}. {stage.stage}</span> — {stage.does}
              </p>
            ))}
          </div>
          <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            Automated: {AUTOMATED_VS_AUTHORIZED.automated.join(', ')}.
            {' '}Requires a person: {AUTOMATED_VS_AUTHORIZED.requiresHuman.join(', ')}.
          </p>
        </div>
      </Section>
    </div>
  );
}
