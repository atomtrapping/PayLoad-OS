import type { Metadata } from 'next';
import Link from 'next/link';
import { getCorpusSource } from '@/adapter/corpusSource';
import { releaseRecords, releaseRetractions } from '@/domain/corpus';
import { DOMAINS } from '@/domain/domains';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { ReleaseRegister, type CorpusGroup } from '@/components/corpus/ReleaseRegister';

export const metadata: Metadata = { title: 'Releases' };

/**
 * The product: corpora and their release history.
 *
 * `?domain=` scopes the page to one line, and the product control in the top
 * bar is what sets it. The scope narrows what is shown and nothing else: a
 * line that is out of scope is filtered from the view, never described as
 * absent, and the count of what was filtered is stated so the reader knows the
 * page is showing them less than the corpus holds.
 */
export default async function ReleasesPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const { domain } = await searchParams;
  const source = getCorpusSource();
  const all = await source.listCorpora();
  const scope = DOMAINS.find((d) => d.id === domain)?.id;
  const corpora = scope ? all.filter((c) => c.domain === scope) : all;
  const hidden = all.length - corpora.length;
  // Counted here, where the corpus is: the register carries numbers rather than
  // a corpus to count, so nothing on the client re-derives what a release holds.
  const groups: CorpusGroup[] = corpora.map((corpus) => ({
    corpusId: corpus.corpusId,
    domain: corpus.domain,
    title: corpus.title,
    description: corpus.description,
    records: corpus.records.length,
    retractions: corpus.retractions.length,
    releaseCount: corpus.releases.length,
    releases: [...corpus.releases]
      .sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1))
      .map((release) => ({
        releaseId: release.releaseId,
        corpusId: corpus.corpusId,
        status: release.status,
        knownAt: release.knownAt,
        coverage: release.coverage,
        note: release.note,
        buildId: release.build.buildId,
        methodologyId: release.build.methodology.methodologyId,
        methodologyVersion: release.build.methodology.version,
        methodologyStatus: release.build.methodology.status,
        releaseDigest: release.releaseDigest,
        supersedesReleaseId: release.supersedesReleaseId,
        supersededByReleaseId: release.supersededByReleaseId,
        certificationStatus: release.certification.status,
        verification: release.certification.verification,
        records: releaseRecords(corpus, release).length,
        retractions: releaseRetractions(corpus, release).length,
      })),
  }));

  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={`${source.origin.label}. Fixture clock: 2026-09-01 12:00 UTC.`} />}
      <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
        <nav className="flex items-center gap-2 flex-wrap text-[12.5px]" aria-label="Scope by line" data-testid="line-scope">
          <span className="label-sm">Lines</span>
          <Link href="/releases" aria-current={scope ? undefined : 'true'} data-scope="ALL" className="pill px-2 py-0.5" style={{ color: scope ? 'var(--text-muted)' : 'var(--accent-strong)', borderColor: scope ? 'var(--border-subtle)' : 'var(--border-accent)' }}>All three</Link>
          {DOMAINS.map((d) => (
            <Link key={d.id} href={`/releases?domain=${d.id}`} aria-current={scope === d.id ? 'true' : undefined} data-scope={d.id} className="pill px-2 py-0.5" style={{ color: scope === d.id ? 'var(--accent-strong)' : 'var(--text-muted)', borderColor: scope === d.id ? 'var(--border-accent)' : 'var(--border-subtle)' }}>{d.label}</Link>
          ))}
          {hidden > 0 && <span style={{ color: 'var(--text-muted)' }} data-testid="line-scope-hidden">Showing {corpora.length} of {all.length} corpora. {hidden} {hidden === 1 ? 'line is' : 'lines are'} filtered out of this view, not absent from the corpus.</span>}
        </nav>
        <ReleaseRegister groups={groups}>
          <section aria-label="What a release is" className="surface-inset p-3 text-[12.5px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
            <p className="m-0">A release is governed, time-bounded information inventory: every record knowable by its cutoff, with value, unit, basis, uncertainty bounds, validity bounds, both clocks, provenance, evidence class, rights and a stable identity. A later release never edits an earlier one; corrections and withdrawals arrive as retractions, and the earlier release still shows what it said.</p>
            <p className="m-0" style={{ color: 'var(--text-muted)' }}>A customer applies their own inference to the feed. The ruling workbench under Inquiry is one optional application over the same releases. The operating model is stated at <Link href="/product" style={{ color: 'var(--info)' }}>Notation Systems &middot; product model</Link>.</p>
          </section>
        </ReleaseRegister>
      </div>
    </>
  );
}
