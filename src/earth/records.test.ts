import { describe, expect, it, vi } from 'vitest';
import { Children, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EarthPage from '@/app/earth/page';
import { EarthTwin, type EarthTwinProps } from '@/components/earth/EarthTwin';
import { currentRelease, deliverableRecords, recordStatusAt } from '@/domain/corpus';
import { globeSpec } from '@/domain/earth';
import { readInstrument } from '@/domain/operatorInstrument';
import { locateAll } from '@/domain/locatedClaims';
import { SPECIMEN_HEADLINES } from '@/fixtures/caravan/headlines';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { LANDSHARK_CORPUS } from '@/fixtures/landshark/release';
import { TRADEWIND_CORPUS } from '@/fixtures/tradewind/release';
import { SpatialKeys } from '@/components/earth/SpatialKeys';
import * as projectionSource from '@/projection/source';
import { ProjectionError } from '@/projection/spec';
import { compileProjection } from '@/projection/compile';
import { describeProjectionSource } from '@/projection/source';
import { earthRecordChoices } from './records';

function cloned() {
  const corpus = structuredClone(CARAVAN_CORPUS);
  const release = currentRelease(corpus);
  const record = corpus.records.find((entry) => entry.recordId === 'REC-0204')!;
  const rights = release.sources.find((entry) => entry.sourceId === record.provenance.sourceId)!;
  return { corpus, release, record, rights };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('Earth record choices before client serialization', () => {
  it.each([LANDSHARK_CORPUS, TRADEWIND_CORPUS])('scopes $domain Earth to the exact selected release without private events or current-only spatial helpers', async (corpus) => {
    const release = corpus.releases[0];
    const page = await EarthPage({ searchParams: Promise.resolve({ release: release.releaseId }) });
    const children = Children.toArray(page.props.children);
    const child = children.find((entry) => isValidElement(entry) && entry.type === EarthTwin);
    if (!isValidElement<EarthTwinProps>(child)) throw new Error('Missing EarthTwin');
    expect(child.props.release.releaseId).toBe(release.releaseId);
    expect(child.props.records).toEqual(earthRecordChoices(corpus, release));
    expect(child.props.located).toEqual([]);
    expect(child.props.eventsAvailable).toBe(false);
    expect(child.key).toContain(child.props.source.snapshotDigest.slice('sha256:'.length));
    expect(children.some((entry) => isValidElement(entry) && entry.type === SpatialKeys)).toBe(false);
    expect(JSON.stringify(child.props)).not.toMatch(/TW-0102|TW-0103|RET-TW-0001|LS-0121|SPEC-T-/);
  });

  it('does not substitute another release for an unknown explicit Earth selection', async () => {
    await expect(EarthPage({ searchParams: Promise.resolve({ release: 'missing' }) })).rejects.toThrow();
  });

  it('renders an unavailable projection rather than an unhandled source-integrity failure', async () => {
    const spy = vi.spyOn(projectionSource, 'describeProjectionSource').mockImplementationOnce(() => { throw new ProjectionError('SOURCE_INTEGRITY_FAILED', 'PRIVATE_DETAIL'); });
    const page = await EarthPage({ searchParams: Promise.resolve({ release: 'REL-LS-2026.08.20' }) });
    const serialized = renderToStaticMarkup(page);
    expect(serialized).toContain('SOURCE_INTEGRITY_FAILED');
    expect(serialized).not.toContain('PRIVATE_DETAIL');
    spy.mockRestore();
  });

  it('passes only gated choices from the server page to EarthTwin with the original source descriptor', async () => {
    const page = await EarthPage();
    const child = Children.toArray((page as React.ReactElement<{ children: React.ReactNode }>).props.children).find((entry) => isValidElement(entry) && entry.type === EarthTwin);
    expect(isValidElement<EarthTwinProps>(child)).toBe(true);
    if (!isValidElement<EarthTwinProps>(child)) throw new Error('EarthTwin child is absent.');
    const release = currentRelease(CARAVAN_CORPUS);
    const descriptor = describeProjectionSource(release.releaseId, [CARAVAN_CORPUS]);
    expect(child.props.records).toEqual(earthRecordChoices(CARAVAN_CORPUS, release));
    expect(child.props.source).toEqual(descriptor.source);
    expect(child.props.release).toEqual({ releaseId: release.releaseId, corpusId: release.corpusId, knownAt: descriptor.knownAt });
    expect(JSON.stringify(child.props.records)).not.toMatch(/REC-0305|REC-0401|REC-0402/);
    // The operator readout travels the same way: derived on the server for the
    // twin's seat, and UNKNOWN for the queue a page cannot read.
    expect(child.props.instrument).toEqual(readInstrument(CARAVAN_CORPUS, release, 'UNKNOWN'));
    expect(child.props.instrument.writes).toBe('NONE');
    expect(child.props.instrument.isEvidence).toBe(false);
    expect(child.props.instrument.layers.find((entry) => entry.id === 'admission-queue')?.reading).toBe('UNKNOWN');
    // The located items travel the same way, checked on the server under the twin's seat.
    expect(child.props.located).toEqual(locateAll(CARAVAN_CORPUS, release, SPECIMEN_HEADLINES));
    expect(child.props.located.filter((entry) => entry.placement.placed)).toHaveLength(5);
  });

  it('uses the existing delivery gate for every committed Caravan release and remains selectable by the exact-version compiler', () => {
    for (const release of CARAVAN_CORPUS.releases) {
      const before = structuredClone(CARAVAN_CORPUS);
      const choices = earthRecordChoices(CARAVAN_CORPUS, release);
      const descriptor = describeProjectionSource(release.releaseId, [CARAVAN_CORPUS]);
      expect(choices.map((entry) => entry.recordId)).toEqual(
        deliverableRecords(CARAVAN_CORPUS, release, 'COUNTERPARTY_SHARED').records.map((entry) => entry.recordId),
      );
      expect(choices.length).toBeGreaterThan(0);
      for (const choice of choices) {
        const projection = compileProjection(globeSpec(descriptor.source, choice.recordId, {
          knownAt: descriptor.knownAt, validAt: choice.validFrom,
        }));
        // Offered means selectable, never refused; geometry is READY only where the record's own subject declares a position, and UNAVAILABLE otherwise.
        expect(projection.records.map((entry) => entry.recordId)).toEqual([choice.recordId]);
        if (projection.status === 'READY') {
          expect(projection.error).toBeNull();
          expect(projection.geometry?.positions.length).toBeGreaterThan(0);
          expect(projection.geometry?.positions.every((position) => position.recordId === choice.recordId && position.subject.subjectId === choice.subjectId)).toBe(true);
        } else {
          expect(projection.status).toBe('UNAVAILABLE');
          expect(projection.error).toBe('GEOMETRY_NOT_AVAILABLE');
          expect(projection.geometry).toEqual({ datum: 'WGS84', positions: [], unplaced: [choice.recordId] });
        }
      }
      expect(CARAVAN_CORPUS).toEqual(before);
    }
  });

  it('does not serialize the actual fixture private IDs or withheld counts and reasons', () => {
    const release = currentRelease(CARAVAN_CORPUS);
    const choices = earthRecordChoices(CARAVAN_CORPUS, release);
    const serialized = JSON.stringify(choices);
    const allowed = new Set(choices.map((entry) => entry.recordId));
    const withheld = CARAVAN_CORPUS.records.filter((entry) => !allowed.has(entry.recordId));
    expect(withheld.map((entry) => entry.recordId)).toEqual(['REC-0305', 'REC-0401', 'REC-0402']);
    for (const record of withheld) expect(serialized).not.toContain(record.recordId);
    expect(serialized).not.toMatch(/withheldByRights|withheldByVisibility|withheldReasons|PRIVATE_PREFLIGHT|harbourline-deals/);
    expect(Array.isArray(choices)).toBe(true);
  });

  it.each(['PRIVATE_PREFLIGHT', 'INTERNAL_ONLY'] as const)('excludes %s metadata even when its source allows customer delivery', (visibility) => {
    const { corpus, release, record } = cloned();
    record.visibility = visibility;
    record.title = 'WITHHELD_UNIQUE_TITLE';
    record.subjectId = 'WITHHELD_UNIQUE_SUBJECT';
    record.predicate = 'withheld.unique.predicate';
    record.validFrom = '2026-08-29T03:04:05Z';
    const serialized = JSON.stringify(earthRecordChoices(corpus, release));
    for (const value of [record.recordId, record.title, record.subjectId, record.predicate, record.validFrom]) {
      expect(serialized).not.toContain(value);
    }
  });

  it.each(['COUNTERPARTY_SHARED', 'PUBLIC_RULING'] as const)('keeps permitted %s choices without adding an independent visibility policy', (visibility) => {
    const { corpus, release, record } = cloned();
    record.visibility = visibility;
    expect(earthRecordChoices(corpus, release).some((entry) => entry.recordId === record.recordId)).toBe(true);
  });

  it.each(['NO_SCHEDULE', 'NO_EXPORT', 'NO_CUSTOMER', 'APPROVAL_REQUIRED', 'EXPIRED'] as const)(
    'withholds metadata when the existing delivery decision is not allowed: %s', (variant) => {
      const { corpus, release, record, rights } = cloned();
      record.visibility = 'PUBLIC_RULING';
      record.title = 'WITHHELD_RIGHTS_TITLE';
      // Public visibility and the derived permittedUses summary cannot grant delivery.
      expect(rights.permittedUses).toContain('customer_delivery');
      if (variant === 'NO_SCHEDULE') release.sources = release.sources.filter((entry) => entry.sourceId !== rights.sourceId);
      if (variant === 'NO_EXPORT') rights.registration.allowedOperations = ['INGEST', 'DERIVE'];
      if (variant === 'NO_CUSTOMER') rights.registration.allowedAudiences = ['INTERNAL'];
      if (variant === 'APPROVAL_REQUIRED') {
        rights.registration.allowedOperations = rights.registration.allowedOperations.filter((operation) => operation !== 'EXPORT');
        rights.registration.approvalRequiredOperations = ['EXPORT'];
      }
      if (variant === 'EXPIRED') rights.registration.effectiveUntil = release.knownAt;
      const serialized = JSON.stringify(earthRecordChoices(corpus, release));
      expect(serialized).not.toContain(record.recordId);
      expect(serialized).not.toContain(record.title);
    },
  );

  it('keeps release membership and the knowledge cutoff, without reading the host clock', () => {
    const { corpus, release, record } = cloned();
    record.knownAt = release.knownAt;
    expect(earthRecordChoices(corpus, release).some((entry) => entry.recordId === record.recordId)).toBe(true);
    record.knownAt = '2026-09-01T12:00:01.000Z';
    expect(earthRecordChoices(corpus, release).some((entry) => entry.recordId === record.recordId)).toBe(false);
    expect(earthRecordChoices(CARAVAN_CORPUS, CARAVAN_CORPUS.releases[0]).map((entry) => entry.recordId))
      .toEqual(['REC-0101', 'REC-0102', 'REC-0111', 'REC-0112']);
  });

  it('preserves selectable historical retractions and corrections, leaving status to the compiler', () => {
    const release = currentRelease(CARAVAN_CORPUS);
    const choices = earthRecordChoices(CARAVAN_CORPUS, release);
    const descriptor = describeProjectionSource(release.releaseId, [CARAVAN_CORPUS]);
    for (const [recordId, status] of [['REC-0111', 'RETRACTED'], ['REC-0203', 'SUPERSEDED']] as const) {
      const choice = choices.find((entry) => entry.recordId === recordId)!;
      const record = CARAVAN_CORPUS.records.find((entry) => entry.recordId === recordId)!;
      expect(choice).toBeDefined();
      expect(recordStatusAt(CARAVAN_CORPUS, record, release.knownAt)).toBe(status);
      const projection = compileProjection(globeSpec(descriptor.source, recordId, {
        knownAt: descriptor.knownAt, validAt: choice.validFrom,
      }));
      expect(projection.records[0].statusAtKnownAt).toBe(status);
      expect(choice).not.toHaveProperty('statusAtKnownAt');
      expect(choice).not.toHaveProperty('retractedByRetractionId');
      expect(choice).not.toHaveProperty('supersededByRecordId');
    }
  });

  it('returns only copied selector fields, preserves declared validity, and does not mutate frozen inventory', () => {
    const { corpus, release, record } = cloned();
    record.validTo = '2026-08-18T00:00:00Z';
    const before = structuredClone(corpus);
    freeze(corpus);
    const choices = earthRecordChoices(corpus, release);
    for (const choice of choices) {
      // The exact serialized surface. `positionDeclared` joins it as a hint for
      // which record the twin opens on — it says the release positions the
      // subject, never that the compiler will place this record.
      expect(Object.keys(choice).sort()).toEqual(
        ['positionDeclared', 'recordId', 'title', 'subjectId', 'predicate', 'validFrom', ...(choice.validTo === undefined ? [] : ['validTo'])].sort(),
      );
      expect(typeof choice.positionDeclared).toBe('boolean');
    }
    const choice = choices.find((entry) => entry.recordId === record.recordId)!;
    expect(choice.validTo).toBe(record.validTo);
    choice.title = 'OUTPUT_ONLY';
    choices.pop();
    expect(corpus).toEqual(before);
    expect(earthRecordChoices(corpus, release).find((entry) => entry.recordId === record.recordId)?.title).toBe(record.title);
  });

  it('returns an empty list rather than a disclosure summary when nothing can be delivered', () => {
    const { corpus, release } = cloned();
    release.sources = [];
    expect(earthRecordChoices(corpus, release)).toEqual([]);
  });
});
