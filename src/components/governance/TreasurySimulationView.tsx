import { Section } from '@/components/primitives/Section';
import type { TreasurySimulationReceipt } from '@/governance/treasurySimulation';
import { treasuryActs } from './acts';
import { GovernedActs } from './GovernedActs';
import { RefusalRegister } from './RefusalRegister';

/** The simulated treasury, as its own ledger recorded it. */
export function TreasurySimulationView({ receipt }: { receipt: TreasurySimulationReceipt }) {
  return (
    <>
      <Section title="What the simulation holds" id="simulation">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="treasury-nothing-moved" style={{ color: 'var(--status-conditional)' }}>{receipt.nothingMoved}</p>
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="ledger-table w-full" data-testid="treasury-accounts">
              <thead><tr><th scope="col">Account</th><th scope="col">Provider</th><th scope="col">Bucket</th><th scope="col">Currency</th><th scope="col">Entity</th></tr></thead>
              <tbody>
                {receipt.accounts.map((a) => (
                  <tr key={a.accountId}><td><span className="id">{a.accountId}</span></td><td>{a.provider}</td><td><span className="pill">{a.bucket}</span></td><td>{a.currency}</td><td style={{ color: 'var(--text-muted)' }}>{a.entity}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>Policy <span className="id">{receipt.policy.version}</span>, reserve floor {receipt.policy.reserveFloorMinor} minor, adopted by {receipt.policy.adoptedBy}.</p>
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="ledger-table w-full" data-testid="treasury-eligibility">
              <thead><tr><th scope="col">Asset</th><th scope="col">Eligibility</th><th scope="col">Basis</th></tr></thead>
              <tbody>
                {receipt.eligibility.map((e) => (
                  <tr key={e.eligibilityId} data-eligibility={e.state}><td><span className="id">{e.contract}</span></td><td><span className="pill" style={{ color: e.state === 'CONFIRMED' ? 'var(--ok)' : 'var(--status-conditional)' }}>{e.state}</span></td><td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{e.basis}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="The reserve, as a chain" id="reserve">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full" data-testid="treasury-chain">
            <thead><tr><th scope="col">Movement</th><th scope="col">Follows</th><th scope="col">Delta</th><th scope="col">Balance after</th></tr></thead>
            <tbody>
              {receipt.budget.chain.map((m) => (
                <tr key={m.reservationId} data-movement={m.reservationId}><td><span className="id">{m.reservationId}</span> <span className="pill ml-1">{m.state}</span></td><td>{m.follows ? <span className="id">{m.follows}</span> : <span style={{ color: 'var(--text-muted)' }}>opening at {receipt.budget.limitMinor}</span>}</td><td>{m.deltaMinor}</td><td>{m.balanceAfterMinor}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" data-testid="treasury-remaining" style={{ color: 'var(--text-secondary)' }}>
          Budget <span className="id">{receipt.budget.budgetId}</span>: {receipt.budget.because} = {receipt.budget.limitMinor}; {receipt.budget.remainingMinor} remains. A hold larger than that is refused by the balance never going below zero, not by a check somebody ran.
        </p>
      </Section>

      <Section title={`${receipt.proposals.length} proposals, and where each stopped`} id="proposals">
        <GovernedActs acts={treasuryActs(receipt)} label="Simulated treasury proposals" selectionKey="treasury-act" />
      </Section>

      <Section title={`${receipt.refusals.length} rows the ledger would not take`} id="refusals">
        <RefusalRegister refusals={receipt.refusals} testId="treasury-refusals" />
      </Section>
    </>
  );
}
