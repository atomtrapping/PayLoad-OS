'use client';

import { useState } from 'react';
import { CLASS_CONTRACTS, type ClaimClass } from '@/domain/discoveryLayer';

/**
 * The seven classes as a register, on the pattern every other register here
 * uses: the row's own identity selects it, and the inspector says what the row
 * cannot fit.
 *
 * The origin column is the load-bearing one. A class is not a label a producer
 * chooses; it is a consequence of where the claim came from, and the two
 * columns side by side are the whole argument in one glance.
 */
export function ClassRegister() {
  const [selected, setSelected] = useState<ClaimClass>('COMPUTED_RESULT');
  const contract = CLASS_CONTRACTS.find((entry) => entry.class === selected)!;

  return (
    <div className="workspace-register grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="register surface p-0 overflow-x-auto" tabIndex={0}>
        <table className="ledger-table w-full" data-testid="class-register">
          <caption className="sr-only">Claim classes and the origin each one comes from</caption>
          <thead>
            <tr>
              <th scope="col">Class</th><th scope="col">Origin</th>
              <th scope="col">Confidence</th><th scope="col">Reaches forward</th>
            </tr>
          </thead>
          <tbody>
            {CLASS_CONTRACTS.map((entry) => (
              <tr
                key={entry.class}
                aria-selected={entry.class === selected}
                data-testid={`class-${entry.class}`}
                onClick={() => setSelected(entry.class)}
              >
                <td>
                  <button
                    type="button"
                    className="link-plain text-left"
                    onClick={(event) => { event.stopPropagation(); setSelected(entry.class); }}
                  >
                    <span className="id">{entry.class}</span>
                  </button>
                </td>
                <td><span className="pill">{entry.origin}</span></td>
                <td style={{ color: 'var(--text-muted)' }}>{entry.carriesConfidence ? 'required' : 'meaningless'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{entry.aboutTheFuture ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <aside className="surface p-3 flex flex-col gap-2 inspector-body" aria-label={`${contract.class} detail`}>
        <p className="label-sm m-0">{contract.class}</p>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{contract.is}</p>
        <div>
          <p className="label-sm m-0 mb-0.5">Produced by</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{contract.producedBy}</p>
        </div>
        <div>
          <p className="label-sm m-0 mb-0.5">What collapsing it would produce</p>
          <p className="m-0 text-[12px]" data-testid="class-forbids" style={{ color: 'var(--text-secondary)' }}>{contract.forbids}</p>
        </div>
      </aside>
    </div>
  );
}
