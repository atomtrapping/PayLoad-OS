import type { Metadata } from 'next';
import Link from 'next/link';
import { inspectEarthAssets } from '@/earth/assets.mjs';
import { EARTH_ENGINE } from '@/domain/earth';
import { earthRecordChoices } from '@/earth/records';
import { readInstrument } from '@/domain/operatorInstrument';
import { locateAll } from '@/domain/locatedClaims';
import { SPECIMEN_HEADLINES } from '@/fixtures/caravan/headlines';
import { describeProjectionSource } from '@/projection/source';
import { ProjectionError } from '@/projection/spec';
import { EarthTwin } from '@/components/earth/EarthTwin';
import { SpatialKeys } from '@/components/earth/SpatialKeys';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { getCorpusSource } from '@/adapter/corpusSource';
import { notFound } from 'next/navigation';
import { workspaceParam, type WorkspaceParams } from '@/domain/productWorkspace';

export const metadata: Metadata = { title: 'Earth Twin' };
export const dynamic = 'force-dynamic';

export default async function EarthPage({ searchParams = Promise.resolve({}) }: { searchParams?: Promise<WorkspaceParams> } = {}) {
  const params = await searchParams;
  let releaseId: string | undefined;
  try { releaseId = workspaceParam(params, 'release'); } catch { return notFound(); }
  const source = getCorpusSource();
  const hit = releaseId ? await source.getRelease(releaseId) : undefined;
  const corpus = releaseId ? hit?.corpus : await source.getCorpus('caravan.specialty-cargo');
  if (!corpus) return notFound();
  const release = releaseId ? hit?.release : corpus.releases.find((entry) => entry.status === 'CURRENT');
  if (!release) return notFound();
  let descriptor: ReturnType<typeof describeProjectionSource>;
  try { descriptor = describeProjectionSource(release.releaseId, [corpus]); }
  catch (error) {
    if (!(error instanceof ProjectionError)) throw error;
    return <div className="p-5"><h1>Earth Twin · projection unavailable</h1><div role="alert" className="empty-state"><strong>{error.code}</strong><p>This exact release cannot be verified by the current demonstration projection compiler. No other release was substituted.</p><Link className="btn" href={`/stream?release=${encodeURIComponent(release.releaseId)}`}>Return to the product inquiry</Link></div></div>;
  }
  const records = earthRecordChoices(corpus, release);
  // The operator readout for the twin's fixed seat. UNKNOWN for the admission
  // queue is the honest reading from a page: admission lives at the write
  // boundary, and this page holds no store connection to it.
  const instrument = readInstrument(corpus, release, 'UNKNOWN');
  // The ledger's own events and the drafted specimen headlines, each met by
  // the corpus at its coordinates. Computed here, under the twin's seat, so
  // the client receives readings and never the records the gate withheld.
  // The legacy event/key helpers do not gate all referenced identities and
  // some compute against the current release. Keep them out of exact-release
  // scopes until they support that boundary. Record projection is gated.
  const eventsAvailable = !releaseId && corpus.domain === 'CARAVAN';
  const located = eventsAvailable ? locateAll(corpus, release, SPECIMEN_HEADLINES) : [];
  const assetsReady = inspectEarthAssets().state === 'READY';
  
  return (
    <>
      <FixtureBanner note={`${corpus.domain} · demonstration release ${release.releaseId}. Globe: imagery bundled with ${EARTH_ENGINE.name}, served from this origin; no live imagery source. ${eventsAvailable ? '' : 'Exact-release record view. Event, headline and cross-subject spatial-key layers are not evaluated in this scope.'}`} />
      <EarthTwin key={descriptor.source.snapshotDigest} release={{ releaseId: release.releaseId, corpusId: release.corpusId, knownAt: descriptor.knownAt }} source={descriptor.source} records={records} instrument={instrument} located={located} eventsAvailable={eventsAvailable} assetsReady={assetsReady} />
      {eventsAvailable && <SpatialKeys corpus={corpus} releaseId={release.releaseId} />}
    </>
  );
}
