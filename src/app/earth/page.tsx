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
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'Earth Twin' };
export const dynamic = 'force-dynamic';

export default async function EarthPage() {
  // 'COR-CAR-2026.09.01' is a release-shaped identifier; the corpus is named
  // 'caravan.specialty-cargo', so this asked for a corpus that never existed.
  const corpus = await getCorpusSource().getCorpus('caravan.specialty-cargo');
  if (!corpus) return notFound();
  
  const release = [...corpus.releases].sort((a, b) => (a.knownAt < b.knownAt ? 1 : -1))[0];
  const corpora = await getCorpusSource().listCorpora();
  const descriptor = describeProjectionSource(release.releaseId, corpora);
  const records = earthRecordChoices(corpus, release);
  // The operator readout for the twin's fixed seat. UNKNOWN for the admission
  // queue is the honest reading from a page: admission lives at the write
  // boundary, and this page holds no store connection to it.
  const instrument = readInstrument(corpus, release, 'UNKNOWN');
  // The ledger's own events and the drafted specimen headlines, each met by
  // the corpus at its coordinates. Computed here, under the twin's seat, so
  // the client receives readings and never the records the gate withheld.
  const located = locateAll(corpus, release, SPECIMEN_HEADLINES);
  const assetsReady = inspectEarthAssets().state === 'READY';
  
  return (
    <>
      <FixtureBanner note={`Corpus: live database release ${release.releaseId}. Globe: imagery bundled with ${EARTH_ENGINE.name}, served from this origin; no key, no live source.`} />
      <EarthTwin release={{ releaseId: release.releaseId, corpusId: release.corpusId, knownAt: descriptor.knownAt }} source={descriptor.source} records={records} instrument={instrument} located={located} assetsReady={assetsReady} />
      <SpatialKeys corpus={corpus} releaseId={release.releaseId} />
    </>
  );
}
