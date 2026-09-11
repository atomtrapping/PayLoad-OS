import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import type { EditorialLifecycleReceipt, EditorialReleaseRecord } from '@/governance/editorialLifecycle';
import { editorialActs } from './acts';
import { GovernedActs } from './GovernedActs';
import { RefusalRegister } from './RefusalRegister';

function MessageCard({ release, testId }: { release: EditorialReleaseRecord; testId: string }) {
  const m = release.message;
  return (
    <div className="surface p-3 flex flex-col gap-1.5" data-testid={testId} data-channel={release.channel} data-published={release.publication ? 'true' : 'false'}>
      <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
        <span className="pill mr-1.5">{release.channel}</span><span className="id mr-1.5">{release.releaseId}</span>digest <span className="mono">{release.messageDigest.slice(0, 23)}…</span> · {release.review.authorizationId} · {release.characters} characters
      </p>
      <p className="m-0 text-[14px] font-semibold" data-testid={`${testId}-headline`} style={{ color: 'var(--text-heading)' }}>{m.headline}</p>
      <ul className="m-0 pl-4 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>
        {m.claims.map((c) => <li key={c.artifactId}>{c.claim} <span className="pill ml-1">{c.claimClass}</span> <span className="id">{c.artifactId}</span></li>)}
      </ul>
      <p className="m-0 text-[12px]" data-testid={`${testId}-chart`} style={{ color: 'var(--text-secondary)' }}>Chart: {JSON.stringify(m.chart)}</p>
      <ul className="m-0 pl-4 text-[12px]" data-testid={`${testId}-qualifiers`} style={{ color: 'var(--status-conditional)' }}>
        {m.qualifiers.map((q) => <li key={q}>{q}</li>)}
      </ul>
      <p className="m-0 text-[12.5px]" data-testid={`${testId}-text`} style={{ color: 'var(--text-primary)' }}>{m.channelText}</p>
      <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Still unknown: {release.stillUnknown}</p>
      {release.publication
        ? <p className="m-0 text-[12px]" data-testid={`${testId}-publication`} style={{ color: 'var(--ok)' }}>Published to the {release.publication.channel} as <span className="id">{release.publication.publicationId}</span> at {release.publication.at}.</p>
        : <p className="m-0 text-[12px]" data-testid={`${testId}-withheld`} style={{ color: 'var(--status-conditional)' }}>WITHHELD — {release.withheldBecause}</p>}
    </div>
  );
}

/** One briefing and one post preview, as the ledgers recorded them. */
export function EditorialLifecycleView({ receipt }: { receipt: EditorialLifecycleReceipt }) {
  return (
    <>
      <Section title="One finding, reviewed four ways" id="lifecycle">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={receipt.stages.map((s) => s.stage)} label="The stages this finding passed through" emphasise="DECISION" />
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="ledger-table w-full" data-testid="editorial-reviews">
              <thead><tr><th scope="col">Question</th><th scope="col">Reviewer</th><th scope="col">Answer</th><th scope="col">Holdings reviewed</th></tr></thead>
              <tbody>
                {receipt.dimensionReviews.map((r) => (
                  <tr key={r.dimension} data-dimension={r.dimension} data-passed={String(r.passed)}>
                    <td><span className="id">{r.dimension}</span></td>
                    <td>{r.reviewer}</td>
                    <td><span className="pill" style={{ color: r.passed ? 'var(--ok)' : 'var(--status-conditional)' }}>{r.passed ? 'yes' : 'no'}</span></td>
                    <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{r.holdingsReviewed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Rests on <span className="id">{receipt.artifactId}</span> in {receipt.boundToRelease}; beat {receipt.beat}. Private references in either message: {receipt.privateReferences.length}.</p>
        </div>
      </Section>

      <Section title="The article, as reviewed and archived" id="article">
        <MessageCard release={receipt.article} testId="editorial-article" />
      </Section>

      <Section title="The post preview, as reviewed and withheld" id="post">
        <MessageCard release={receipt.post} testId="editorial-post" />
      </Section>

      <Section title="A repetition, offered as corroboration" id="repetition">
        <div className="surface p-3">
          <p className="m-0 text-[12.5px]" data-testid="editorial-repetition" style={{ color: 'var(--text-primary)' }}>
            <span className="id mr-1.5">{receipt.repetition.observationId}</span>from {receipt.repetition.sourceAccount} descends from <span className="id">{receipt.repetition.descendsViaReleaseId}</span>; offered in support of <span className="id">{receipt.repetition.offeredAsCorroborationOf}</span>; refused by <span className="mono" style={{ color: 'var(--status-conditional)' }}>{receipt.repetition.refusedBy}</span>.
          </p>
        </div>
      </Section>

      <Section title="The governed acts" id="acts">
        <GovernedActs acts={editorialActs(receipt)} label="Governed acts of the editorial lifecycle" selectionKey="editorial-act" />
      </Section>

      <Section title={`${receipt.refusals.length} rows the ledger would not take`} id="refusals">
        <RefusalRegister refusals={receipt.refusals} testId="editorial-refusals" />
      </Section>
    </>
  );
}
