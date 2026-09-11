import type { Refusal } from '@/governance/ledger';

/** What the ledger would not take, and what refused it. Every row was observed. */
export function RefusalRegister({ refusals, testId = 'refusals' }: { refusals: ReadonlyArray<Refusal & { lifecycle?: string }>; testId?: string }) {
  return (
    <div className="surface p-0 overflow-x-auto" tabIndex={0}>
      <table className="ledger-table w-full" data-testid={testId}>
        <thead><tr><th scope="col">Attempted</th><th scope="col">Refused by</th></tr></thead>
        <tbody>
          {refusals.map((refusal) => (
            <tr key={`${refusal.lifecycle ?? ''}${refusal.label}`} data-refused-by={refusal.refusedBy.split(':')[0]}>
              <td className="cell-wide">{refusal.lifecycle && <span className="pill mr-1.5">{refusal.lifecycle}</span>}{refusal.label}</td>
              <td><span className="mono text-[11.5px]" style={{ color: 'var(--status-conditional)' }}>{refusal.refusedBy}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
