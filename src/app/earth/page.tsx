import type { Metadata } from 'next';
import { inspectEarthAssets } from '@/earth/assets.mjs';
import { EARTH_ENGINE } from '@/domain/earth';
import { earthRecordChoices } from '@/earth/records';
import { readInstrument } from '@/domain/operatorInstrument';
import { locateAll } from '@/domain/locatedClaims';
import { SPECIMEN_HEADLINES } from '@/fixtures/caravan/headlines';
import { describeProjectionSource } from '@/projection/source';
import { EarthTwin } from '@/components/earth/EarthTwin';
import { SpatialKeys } from '@/components/earth/SpatialKeys';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { getCorpusSource } from '@/adapter/corpusSource';
import { DOMAINS } from '@/domain/domains';
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'Earth Twin' };
export const dynamic = 'force-dynamic';

/**
 * The twin shows one line at a time, and the product control in the top bar is
 * what chooses it. A globe carrying three lines at once would put a lot, a
 * freight instrument and a parcel in one cell with no way to tell which line
 * each came from; the cross-line question is asked on the operating model
 * page, where the pairs are enumerated and the answer is stated.
 *
 * Caravan is the default because it is the only line with cases, rulings and
 * captured bytes behind its positions. It is a default, not a claim about the
 * other two.
 */
export default async function EarthPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const { domain } = await searchParams;
  const source = getCorpusSource();
  const corpora = await source.listCorpora();
  const scope = DOMAINS.find((d) => d.id === domain)?.id;
  const corpus = (scope ? corpora.find((c) => c.domain === scope) : undefined)
    ?? await source.getCorpus('caravan.specialty-cargo');
  if (!corpus) return notFound();

  const release = [...corpus.releases].sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1))[0];
  const descriptor = describeProjectionSource(release.releaseId, corpora);
  const records = earthRecordChoices(corpus, release);
  // The operator readout for the twin's fixed seat. UNKNOWN for the admission
  // queue is the honest reading from a page: admission lives at the write
  // boundary, and this page holds no store connection to it.
  const instrument = readInstrument(corpus, release, 'UNKNOWN');
  // The ledger's own events and the drafted specimen headlines, each met by
  // the corpus at its coordinates. Computed here, under the twin's seat, so
  // the client receives readings and never the records the gate withheld.
  // The drafted headlines are written against Caravan's subjects, so they are
  // only put to Caravan. Meeting a Tradewind headline against a Landshark
  // corpus would produce NOT_IN_COVERAGE for every one of them, which is a
  // true answer to a question nobody asked.
  const located = locateAll(corpus, release, corpus.domain === 'CARAVAN' ? SPECIMEN_HEADLINES : []);
  const assetsReady = inspectEarthAssets().state === 'READY';
  
  return (
    <>
      <FixtureBanner note={`Corpus: ${corpus.corpusId}, release ${release.releaseId}${scope ? '' : ' (no line scope applied; Caravan is the default)'}. Globe: imagery bundled with ${EARTH_ENGINE.name}, served from this origin; no key, no live source.`} />
      <EarthTwin release={{ releaseId: release.releaseId, corpusId: release.corpusId, knownAt: descriptor.knownAt }} source={descriptor.source} records={records} instrument={instrument} located={located} assetsReady={assetsReady} />
      <SpatialKeys corpus={corpus} releaseId={release.releaseId} />
    </>
  );
}
