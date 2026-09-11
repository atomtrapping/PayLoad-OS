import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import type { DossierLifecycleReceipt } from '@/governance/dossierLifecycle';
import { dossierActs } from './acts';
import { GovernedActs } from './GovernedActs';
import { RefusalRegister } from './RefusalRegister';

/** One dossier, end to end, as the ledgers recorded it. */
export function DossierLifecycleView({ receipt }: { receipt: DossierLifecycleReceipt }) {
  const [v1, v2] = receipt.releases;
  return (
    <>
      <Section title="One dossier, end to end" id="lifecycle">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="dossier-question" style={{ color: 'var(--text-primary)' }}>
            <span className="pill mr-1.5">SIMULATED BUYER</span>{receipt.question}
          </p>
          <ChainFigure objects={receipt.stages.map((s) => s.stage)} label="The stages this dossier passed through" emphasise="MONITORING" />
          <ul className="m-0 pl-0 list-none flex flex-col gap-0.5 text-[11.5px]" data-testid="dossier-stages" style={{ color: 'var(--text-muted)' }}>
            {receipt.stages.map((s) => <li key={s.stage} data-stage={s.stage}><span className="id mr-1.5">{s.stage}</span><span className="ts mr-1.5">{s.at}</span>{s.wrote}</li>)}
          </ul>
        </div>
      </Section>

      <Section title="Coverage, the estimate and the quotation" id="coverage">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full" data-testid="dossier-coverage">
            <thead><tr><th scope="col">Facet</th><th scope="col">Level</th><th scope="col">Artifacts</th><th scope="col">Units</th><th scope="col">Basis</th></tr></thead>
            <tbody>
              {receipt.coverage.map((c) => (
                <tr key={c.facet} data-facet={c.facet} data-level={c.level}>
                  <td><span className="id">{c.facet}</span></td>
                  <td><span className="pill" style={{ color: c.level === 'NONE' ? 'var(--status-conditional)' : 'var(--text-muted)' }}>{c.level}</span></td>
                  <td className="text-[12px]">{c.artifactIds.length ? c.artifactIds.map((id) => <span key={id} className="id block">{id}</span>) : <span style={{ color: 'var(--text-muted)' }}>none</span>}</td>
                  <td>{c.units}</td>
                  <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{c.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12.5px]" data-testid="dossier-quotation" style={{ color: 'var(--text-primary)' }}>
          Estimate <span className="id">{receipt.estimate.estimateId}</span>: {receipt.estimate.units} units by {receipt.estimate.method}.
          Quotation <span className="id">{receipt.quotation.quotationId}</span>: {receipt.quotation.units} × {receipt.quotation.unitPriceMinor} = {receipt.quotation.amountMinor} {receipt.quotation.currency} minor under {receipt.quotation.policyId} (a demonstration rate), accepted by {receipt.scope.reviewer} as <span className="mono text-[11px]">{receipt.quotation.digest.slice(0, 23)}…</span>.
        </p>
      </Section>

      <Section title="Two releases, and the correction between them" id="releases">
        <div className="flex flex-col gap-2">
          {receipt.releases.map((release) => (
            <div key={release.releaseId} className="surface p-3 flex flex-col gap-1.5" data-testid={`dossier-release-${release.version}`}>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-heading)' }}>
                <span className="id mr-1.5">{release.releaseId}</span>version {release.version} · digest <span className="mono text-[11px]">{release.releaseDigest.slice(0, 23)}…</span> · reviewed by {release.review.reviewer} · {release.review.authorizationId}
              </p>
              {release.conclusions.map((c) => (
                <div key={c.facet} className="text-[12px]" data-conclusion={c.facet}>
                  <span className="id mr-1.5">{c.facet}</span><span className="pill mr-1.5">{c.presentedAs}</span><span style={{ color: 'var(--text-primary)' }}>{c.statement}</span>
                  <span className="block mt-0.5" style={{ color: 'var(--text-muted)' }}>Not covered: {c.notCovered} <span className="id">({c.artifactId})</span></span>
                </div>
              ))}
              {release.holes.map((h) => (
                <p key={h.facet} className="m-0 text-[12px]" data-hole={h.facet} style={{ color: 'var(--status-conditional)' }}><span className="id mr-1.5">{h.facet}</span>{h.level}: {h.basis}</p>
              ))}
              <p className="m-0 text-[11.5px]" data-testid={`dossier-delivery-${release.version}`} style={{ color: 'var(--text-muted)' }}>
                Delivered by <span className="id">{release.delivery.attemptId}</span> <span className="pill">{release.delivery.outcome}</span> · reconciled <span className="pill">{release.delivery.reconciliation.found}</span> · {release.delivery.receiptBasis}
              </p>
            </div>
          ))}
          <p className="m-0 text-[12.5px]" data-testid="dossier-correction" style={{ color: 'var(--text-primary)' }}>
            <span className="id mr-1.5">{v2.releaseId}</span>corrects <span className="id">{receipt.correction.correctsOperationId}</span> ({v1.releaseId}’s delivery): {receipt.correction.because}
          </p>
        </div>
      </Section>

      <Section title="The governed acts" id="acts">
        <GovernedActs acts={dossierActs(receipt)} label="Governed acts of the dossier lifecycle" selectionKey="dossier-act" />
      </Section>

      <Section title={`${receipt.refusals.length} rows the ledger would not take`} id="refusals">
        <RefusalRegister refusals={receipt.refusals} testId="dossier-refusals" />
      </Section>
    </>
  );
}
