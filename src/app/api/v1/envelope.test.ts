/**
 * THE ENVELOPE, HELD FOR EVERY ROUTE RATHER THAN FOR ONE.
 *
 * `_lib.json` injects data_class, corpus_release, parameter_set_version and
 * verification_rung into the body, and X-Payload-Fixture-Only into the headers.
 * Its own docblock says why: "so clients cannot mistake synthetic fixtures for
 * live/admitted data".
 *
 * Twenty-one routes went through it and eight did not, returning bare
 * NextResponse.json — and those eight were exactly the set where that mistake
 * was available. One of them, the tasking observe route, both skipped the
 * attestation and answered a past-tense success status for a write it never
 * performed.
 *
 * A route added tomorrow would have joined them silently, so the rule is
 * structural now: a v1 handler does not construct its own response.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { POST as observe } from './measurement-economy/tasking/observe/route';
import { GET as instruments } from './measurement-economy/instruments/route';
import { GET as backtest } from './insurability/backtest/route';
import { GET as parameters } from './parameters/route';
import { GET as assurance } from './frontier/assurance/route';
import { GET as capex } from './frontier/capex-progress/route';
import { GET as insurability } from './frontier/insurability/route';

const V1 = resolve(process.cwd(), 'src/app/api/v1');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

describe('no v1 route builds its own response', () => {
  const files = routeFiles(V1);

  it('finds the whole feed, so this sweep is not passing on an empty list', () => {
    expect(files.length).toBeGreaterThanOrEqual(29);
  });

  for (const file of files) {
    const name = relative(V1, file);
    it(`${name} answers through _lib`, () => {
      const source = readFileSync(file, 'utf8');
      const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // Both constructors, because the first version of this rule watched
      // NextResponse.json alone and a route using the plain Response.json
      // walked straight past it. What is forbidden is constructing a response
      // body that skips the attestation, whichever class does it.
      expect(body, `${name} constructs a response outside the envelope`).not.toMatch(/(?:Next)?Response\s*\.\s*json\s*\(/);
      expect(body).toMatch(/from '(\.\.\/)*_lib'/);
    });
  }
});

describe('the seven routes that used to skip it now carry it', () => {
  async function attested(response: Response) {
    expect(response.headers.get('X-Payload-Fixture-Only')).toBe('true');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.data_class).toBe('synthetic');
    expect(body.corpus_release).toBeTruthy();
    expect(body.verification_rung).toBeTypeOf('number');
    return body;
  }

  it('attests the parameter registry, the three anchor feeds, the instruments and the backtest', async () => {
    await attested(await parameters());
    await attested(await assurance());
    await attested(await capex());
    await attested(await insurability());
    await attested(await instruments());
    await attested(await backtest());
  });

  it('reports the backtest as arithmetic over declared dates, per report', async () => {
    const body = await (await backtest()).json();
    expect(body.doctrine.method).toBe('ARITHMETIC_OVER_DECLARED_DATES');
    for (const report of body.reports) {
      expect(report.derivation.method).toBe('ARITHMETIC_OVER_DECLARED_DATES');
      // The one field that moves if the corpus moves, named as such.
      expect(report.derivation.fromCorpus).toEqual(['admittedFilingsCount']);
      expect(report.derivation.declaredInSource).toContain('observableRepricingDate');
      // The verdict follows from the threshold rather than being typed beside it.
      expect(report.verdict).toBe(report.feedSignaledTimely ? 'SUBSTANTIATED_LEAD_TIME' : 'FALSIFIED_OR_LATENT');
    }
  });

  it('states what the instrument calibration stands on instead of calling it continuous', async () => {
    const body = await (await instruments()).json();
    expect(body.doctrine.calibrationMoat).toBeUndefined();
    expect(body.doctrine.calibrationBasis).toBeTruthy();
    expect(JSON.stringify(body.doctrine)).not.toMatch(/continuous/i);
    for (const instrument of body.instruments) {
      // Every served rate carries the counts it was computed over.
      expect(instrument.calibrationEvidence.completedObservationsCount).toBeTypeOf('number');
      expect(instrument.calibrationSource).not.toBe('CALIBRATED_EMPIRICAL');
    }
  });
});

describe('the observe route says it previewed, because that is what it did', () => {
  const post = (body: unknown) =>
    new NextRequest('http://127.0.0.1:3111/api/v1/measurement-economy/tasking/observe', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  const outcome = { orderId: 'N11-TASK-T1', instrumentId: 'SENTINEL_SAR_OPTICAL', defectActuallyExisted: true, instrumentDetectedDefect: true };

  it('answers a preview status and declares that it writes nothing', async () => {
    const body = await (await observe(post(outcome))).json();
    expect(body.status).toBe('CALIBRATION_PREVIEWED_NOT_PERSISTED');
    expect(body.writes).toBe('NONE');
    // Past tense for a thing that did not happen, in either place it appeared.
    expect(JSON.stringify(body)).not.toContain('OBSERVATION_RECORDED_AND_CALIBRATED');
    expect(body.supposedOrder.status).not.toBe('CALIBRATED');
    expect(body.supposedOrder.calibrationRunAt).toBeUndefined();
  });

  it('names an unnamed project as unnamed rather than as live', async () => {
    const body = await (await observe(post(outcome))).json();
    expect(body.supposedOrder.projectId).toBe('PROJECT_NOT_NAMED_BY_CALLER');
    expect(body.supposedOrder.projectId).not.toMatch(/LIVE/);
  });

  it('shows both readings, so the caller can see what the supplied outcome would change', async () => {
    // The committed history holds one completed order for this instrument.
    const body = await (await observe(post({ ...outcome, instrumentId: 'TERRESTRIAL_LIDAR_SCAN' }))).json();
    expect(body.calibrationOnCommittedHistory.completedObservationsCount).toBe(1);
    expect(body.calibrationIfSupplied.completedObservationsCount).toBe(2);
  });

  it('reads a never-tasked instrument as NOT_ESTIMATED rather than as a default', async () => {
    const body = await (await observe(post(outcome))).json();
    expect(body.calibrationOnCommittedHistory.calibrationConfidence).toBe('NOT_ESTIMATED');
    expect(body.calibrationOnCommittedHistory.empiricalSensitivity).toBeNull();
  });

  it('says the loop is not closed, where it used to state the storage rule as if it ran it', async () => {
    const body = await (await observe(post(outcome))).json();
    expect(body.doctrine.state).toMatch(/not closed/);
    expect(body.doctrine.blocker).toBeTruthy();
  });

  it('leaves the committed history unchanged for the next reader', async () => {
    await observe(post({ ...outcome, instrumentId: 'TERRESTRIAL_LIDAR_SCAN' }));
    const served = await (await instruments()).json();
    const lidar = served.instruments.find((i: { id: string }) => i.id === 'TERRESTRIAL_LIDAR_SCAN');
    // Still one. The preview did not become a record, which is the whole point
    // of the status word this route now uses.
    expect(lidar.calibrationEvidence.completedObservationsCount).toBe(1);
  });
});
