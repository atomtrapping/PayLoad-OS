import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import {
  CAPABILITIES, PRECONDITIONS, PRESSURE, THE_FINDING,
  accommodationStanding, fitOf, type PreconditionId,
} from './accommodation';

const ids = new Set(PRECONDITIONS.map((p) => p.id));

describe('what the additions cost the system', () => {
  it('declares each precondition once, with a reason and either a probe or a witness', () => {
    expect(ids.size).toBe(PRECONDITIONS.length);
    for (const precondition of PRECONDITIONS) {
      expect(precondition.because.length).toBeGreaterThan(40);
      expect(precondition.what.length).toBeGreaterThan(10);
      expect(precondition.probe !== undefined || (precondition.provenBy ?? '').length > 0).toBe(true);
    }
  });

  it('holds every probed declaration to what the corpus actually shows', () => {
    for (const precondition of PRECONDITIONS) {
      if (!precondition.probe) continue;
      expect(
        { id: precondition.id, met: precondition.probe(CARAVAN_CORPUS) },
        `${precondition.id} declares met: ${precondition.met}, and the corpus disagrees`,
      ).toEqual({ id: precondition.id, met: precondition.met });
    }
  });

  it('names only preconditions that exist, and leaves none of them unused', () => {
    const used = new Set<PreconditionId>();
    for (const capability of CAPABILITIES) {
      expect(capability.needs.length).toBeGreaterThan(0);
      for (const need of capability.needs) {
        expect(ids.has(need), `${capability.id} needs an undeclared precondition: ${need}`).toBe(true);
        used.add(need);
      }
    }
    expect([...ids].filter((id) => !used.has(id))).toEqual([]);
  });

  it('points every capability at a module that exists on disk', async () => {
    const { existsSync } = await import('node:fs');
    for (const capability of CAPABILITIES) {
      expect(existsSync(capability.module), `${capability.id} names a module that is not there`).toBe(true);
    }
  });

  it('derives the fit from the corpus rather than declaring it', () => {
    const admission = CAPABILITIES.find((c) => c.id === 'ADMISSION')!;
    const fit = fitOf(admission, CARAVAN_CORPUS);
    expect(fit.fit).toBe('SEVERAL_THINGS_AWAY');
    expect(fit.unmet.map((p) => p.id).sort()).toEqual(['AN_ADMISSION_AUTHORITY', 'LIVE_SOURCE']);
    expect(fit.because).toContain('The gate exists; the act does not');

    const key = CAPABILITIES.find((c) => c.id === 'SPATIAL_KEY')!;
    expect(fitOf(key, CARAVAN_CORPUS).fit).toBe('RUNS_TODAY');
  });

  it('reports a gap that is mostly one kind of thing, and names the widest single block', () => {
    const standing = accommodationStanding(CARAVAN_CORPUS);
    expect(standing.runsToday + standing.oneThingAway + standing.severalThingsAway).toBe(CAPABILITIES.length);
    expect(standing.runsToday).toBeGreaterThan(0);
    expect(standing.widest).not.toBeNull();
    expect(standing.gapShape.CORPUS_CONTENT).toBeGreaterThanOrEqual(standing.gapShape.INFRASTRUCTURE);
    expect(standing.statement).toContain(standing.widest!.id);
  });

  it('reports no admitted record, no live source and no admission authority', () => {
    for (const id of ['ADMITTED_RECORD', 'LIVE_SOURCE', 'AN_ADMISSION_AUTHORITY'] as const) {
      expect(PRECONDITIONS.find((p) => p.id === id)!.met, `${id} must not claim to be met`).toBe(false);
    }
  });

  it('names the pressure the additions put on parts that already existed, and does not pretend all of it is absorbed', () => {
    expect(PRESSURE.length).toBeGreaterThanOrEqual(5);
    expect(PRESSURE.some((p) => !p.absorbed)).toBe(true);
    for (const pressure of PRESSURE) {
      expect(pressure.obligation.length).toBeGreaterThan(40);
      expect(pressure.cost.length).toBeGreaterThan(30);
    }
    const clocks = PRESSURE.find((p) => p.from.includes('third clock'))!;
    expect(clocks.absorbed).toBe(false);
  });

  it('keeps the finding about the one thing building cannot do', () => {
    expect(THE_FINDING.theOneThingBuildingCannotDo).toContain('person');
    expect(THE_FINDING.narrowness.length).toBeGreaterThan(60);
    expect(THE_FINDING.andItCannotBeAdjudicated).toContain('stated its own uncertainty');
  });
});
