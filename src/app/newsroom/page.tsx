import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import {
  ARCHIVE_RULE, AUDIENCE_RULE, AUTOMATED_REPLY_RULE, CIRCULATION_IS_NOT_CORROBORATION,
  CONFLICT_RULE, CORRECTION_REACHES, CORRECTION_RULE, EDITORIAL_BLOCKED_ON, EDITORIAL_STAGES,
  FOUR_CLASSES_RULE, NEWSROOM_CLASSES, OFFERING_DIFFERENCES, ONE_ACCOUNT_RULE,
  PUBLICATION_CONTRACTS, PUBLISHING_MUST_NOT, REVIEW_BINDS_RULE, REVIEW_DIMENSIONS,
  REVIEW_DIMENSION_ASKS, REVIEW_PACKET, SAME_EVIDENCE_STANDARD_RULE, SELF_CITATION_RULE,
  STILL_UNKNOWN_RULE, editorialStanding,
} from '@/domain/editorialPlane';

export const metadata: Metadata = { title: 'Newsroom' };

/** A newsroom over the same evidence, and the loop it refuses. */
export default function NewsroomPage() {
  const standing = editorialStanding();
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Newsroom</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          The system identified a development, we checked it, we investigated its significance, and we published
          the supported finding.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>CONTRACT</span>
        <span style={{ color: 'var(--accent)' }} data-testid="editorial-standing">
          {standing.releases} releases, {standing.published} published.
        </span>
        <span>{EDITORIAL_BLOCKED_ON[0]}</span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="label-sm m-0">The loop this refuses</p>
        <p className="m-0 text-[13px]" data-testid="self-citation" style={{ color: 'var(--text-primary)' }}>{SELF_CITATION_RULE}</p>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--accent)' }}>{CIRCULATION_IS_NOT_CORROBORATION}</p>
        <p className="m-0 text-[12px]" data-testid="audience-rule" style={{ color: 'var(--text-secondary)' }}>{AUDIENCE_RULE}</p>
      </div>

      <Section title="Four things that must not collapse" id="classes">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Class</th><th scope="col">Is</th><th scope="col">Newsroom</th><th scope="col">Collapsing it</th></tr></thead>
            <tbody>
              {PUBLICATION_CONTRACTS.map((contract) => (
                <tr key={contract.publicationClass} data-testid={`class-${contract.publicationClass}`}>
                  <td><span className="id">{contract.publicationClass}</span></td>
                  <td className="cell-wide">{contract.is}</td>
                  <td><span className="pill" style={{ color: contract.newsroomMayProduce ? 'var(--ok)' : 'var(--text-muted)' }}>{contract.newsroomMayProduce ? 'produces' : 'never'}</span></td>
                  <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{contract.collapsing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{FOUR_CLASSES_RULE}</p>
        <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>The newsroom produces {NEWSROOM_CLASSES.join(', ')}.</p>
      </Section>

      <Section title="From a finding to a correction watch" id="workflow">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={[...EDITORIAL_STAGES]} label="The editorial stages" emphasise="REVIEW" />
          <div className="mt-1 flex flex-col gap-0.5">
            {REVIEW_DIMENSIONS.map((dimension) => (
              <p key={dimension} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="id">{dimension}</span> — {REVIEW_DIMENSION_ASKS[dimension]}
              </p>
            ))}
          </div>
          <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            The packet carries: {REVIEW_PACKET.join(' · ')}.
          </p>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="review-binds" style={{ color: 'var(--text-primary)' }}>{REVIEW_BINDS_RULE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{STILL_UNKNOWN_RULE}</p>
        </div>
      </Section>

      <Section title="A platform is a channel" id="channels">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="archive-rule" style={{ color: 'var(--text-primary)' }}>{ARCHIVE_RULE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{AUTOMATED_REPLY_RULE}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{ONE_ACCOUNT_RULE}</p>
        </div>
      </Section>

      <Section title="Public and paid" id="offerings">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            Differs in: {OFFERING_DIFFERENCES.join(', ')}.
          </p>
          <p className="m-0 text-[12.5px]" data-testid="same-standard" style={{ color: 'var(--text-primary)' }}>{SAME_EVIDENCE_STANDARD_RULE}</p>
        </div>
      </Section>

      <Section title="Corrections, and the separation" id="corrections">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{CORRECTION_RULE}</p>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Reaches: {CORRECTION_REACHES.join(' · ')}.</p>
          <p className="m-0 mt-1 text-[12.5px]" data-testid="conflict-rule" style={{ color: 'var(--text-primary)' }}>{CONFLICT_RULE}</p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--accent)' }}>{PUBLISHING_MUST_NOT}</p>
        </div>
      </Section>
    </div>
  );
}
