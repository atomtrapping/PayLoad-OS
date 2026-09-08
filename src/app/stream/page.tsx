import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCorpusSource } from '@/adapter/corpusSource';
import { PRODUCT_DESKS, workspaceParam, type WorkspaceParams } from '@/domain/productWorkspace';
import { STREAM_LINK_PARAMS } from '@/domain/streamLink';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { StreamExplorer } from '@/components/corpus/StreamExplorer';

export const metadata: Metadata = { title: 'Stream' };

export default async function StreamPage({ searchParams }: { searchParams: Promise<WorkspaceParams> }) {
  const params = await searchParams;
  const sp: Record<string, string | undefined> = {};
  try {
    for (const key of [...STREAM_LINK_PARAMS, 'corpus', 'domain']) sp[key] = workspaceParam(params, key);
  } catch { notFound(); }
  const source = getCorpusSource();
  // An explicit release owns its corpus. Never substitute the first corpus in
  // the store when a Landshark or Tradewind reading arrives through Stream.
  const corpus = sp.release ? (await source.getRelease(sp.release))?.corpus
    : await source.getCorpus(sp.corpus ?? 'caravan.specialty-cargo');
  if (!corpus || (sp.corpus && corpus.corpusId !== sp.corpus) || (sp.domain && corpus.domain !== sp.domain)) notFound();
  if (corpus.domain === 'LANDSHARK' || corpus.domain === 'TRADEWIND') {
    const query = new URLSearchParams();
    for (const key of STREAM_LINK_PARAMS) if (sp[key]) query.set(key, sp[key]!);
    query.set('corpus', corpus.corpusId);
    // Dedicated desks evaluate and gate on the server; the legacy Caravan
    // explorer is not a boundary for passing another domain's raw corpus.
    redirect(`${PRODUCT_DESKS[corpus.domain].href}?${query}`);
  }
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-4 max-w-[1100px] mx-auto w-full flex flex-col gap-3">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Stream · as-of answers</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>What did the corpus assert about a subject at a world time, given what was knowable at a knowledge time? Every answer carries its bounds, both clocks, provenance, evidence class and rights. An absent answer is a typed refusal with a remedy. Records: <Link href={`/releases/${encodeURIComponent(corpus.releases.find((r) => r.status === 'CURRENT')?.releaseId ?? '')}`} style={{ color: 'var(--info)' }}>current release</Link>.</p>
        </header>
        <StreamExplorer corpus={corpus} initial={{ release: sp.release, subject: sp.subject, predicate: sp.predicate, validAt: sp.validAt, knownAt: sp.knownAt, record: sp.record, question: sp.question }} />
      </div>
    </>
  );
}
