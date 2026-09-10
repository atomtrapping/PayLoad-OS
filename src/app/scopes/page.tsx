import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import {
  BOUNDARY_SURFACES, FOUR_SURFACES_RULE, IDENTITY_RULE, LEARNING_RULE,
  NO_CUSTOMER_CONTRIBUTION_RULE, ONE_DOOR_IS_NOT, ONE_DOOR_RULE, PAPER_TO_LIVE_RULE,
  PERMITTED_FLOWS, SCOPE_BLOCKED_ON, SCOPE_CLASSES, SCOPE_CONTRACTS, SURFACE_MEANING,
  TRAINABLE_SCOPES, TWO_GATES_RULE, scopeStanding,
} from '@/domain/governedScopes';

export const metadata: Metadata = { title: 'Governed scopes' };

/** Where one canonical identity stops being one context. */
export default function ScopesPage() {
  const standing = scopeStanding();
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Governed scopes</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          Scopes share entity identifiers and share nothing else.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>CONTRACT</span>
        <span style={{ color: 'var(--accent)' }} data-testid="scope-standing">
          {standing.scopes} scopes open. {standing.flowsOutOfCustomerScopes} flows out of a customer scope, permanently.
        </span>
        <span>{SCOPE_BLOCKED_ON[0]}</span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="m-0 text-[13px]" data-testid="identity-rule" style={{ color: 'var(--text-primary)' }}>{IDENTITY_RULE}</p>
        <p className="m-0 text-[12.5px]" data-testid="no-contribution" style={{ color: 'var(--accent)' }}>{NO_CUSTOMER_CONTRIBUTION_RULE}</p>
      </div>

      <Section title="Five scopes" id="scopes">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Scope</th><th scope="col">Holds</th><th scope="col">Holder</th><th scope="col">Trainable</th></tr></thead>
            <tbody>
              {SCOPE_CLASSES.map((cls) => (
                <tr key={cls} data-testid={`scope-${cls}`}>
                  <td><span className="id">{cls}</span></td>
                  <td className="cell-wide">{SCOPE_CONTRACTS[cls].holds}</td>
                  <td><span className="pill">{SCOPE_CONTRACTS[cls].holder}</span></td>
                  <td style={{ color: SCOPE_CONTRACTS[cls].mayTrain ? 'var(--text-secondary)' : 'var(--status-conditional)' }}>
                    {SCOPE_CONTRACTS[cls].mayTrain ? 'yes' : 'no'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" data-testid="learning-rule" style={{ color: 'var(--text-secondary)' }}>{LEARNING_RULE}</p>
        <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          Trainable: {TRAINABLE_SCOPES.join(', ')}.
        </p>
      </Section>

      <Section title="Four surfaces, not one" id="surfaces">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={[...BOUNDARY_SURFACES]} label="The boundary surfaces" emphasise="LEARNING" />
          <div className="mt-1 flex flex-col gap-0.5">
            {BOUNDARY_SURFACES.map((surface) => (
              <p key={surface} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="id">{surface}</span> — {SURFACE_MEANING[surface]}
              </p>
            ))}
          </div>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="four-surfaces" style={{ color: 'var(--text-primary)' }}>{FOUR_SURFACES_RULE}</p>
        </div>
      </Section>

      <Section title="Permitted flows" id="flows">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Why</th></tr></thead>
            <tbody>
              {PERMITTED_FLOWS.map((flow) => (
                <tr key={`${flow.from}-${flow.to}`}>
                  <td><span className="id">{flow.from}</span></td>
                  <td><span className="id">{flow.to}</span></td>
                  <td className="cell-wide">{flow.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" data-testid="paper-to-live" style={{ color: 'var(--text-secondary)' }}>{PAPER_TO_LIVE_RULE}</p>
        <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{TWO_GATES_RULE}</p>
      </Section>

      <Section title="What one door means" id="door">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="one-door" style={{ color: 'var(--text-primary)' }}>{ONE_DOOR_RULE}</p>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            It does not mean: {ONE_DOOR_IS_NOT.join(', ')}.
          </p>
        </div>
      </Section>
    </div>
  );
}
