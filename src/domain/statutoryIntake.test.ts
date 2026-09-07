import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JURISDICTION_IDS } from './statutoryHarvest';
import {
  intakeStatus,
  REGISTERED_SOURCES,
  SUPPLIED_BYTES_SOURCE,
  UNREGISTERED_JURISDICTIONS,
  type StatutoryCaptureSource,
} from './statutoryIntake';

describe('how much of the intake actually collects', () => {
  /**
   * The question the doctrine exists to ask, answered by a number rather than
   * by a claim: did anything enter this chain that a caller did not supply?
   */
  it('answers zero, and says so rather than leaving it to be discovered', () => {
    const status = intakeStatus();
    expect(status.registered).toBe(1);
    expect(status.collecting).toBe(0);
    expect(status.because).toContain('none collects');
    expect(status.because).toContain('Every document this rail has processed was supplied by a caller');
  });

  it('every registered source declares whether it collects, and the only one does not', () => {
    for (const source of REGISTERED_SOURCES) {
      expect(typeof source.performsCollection, `${source.id} must declare performsCollection`).toBe('boolean');
    }
    expect(SUPPLIED_BYTES_SOURCE.performsCollection).toBe(false);
    expect(REGISTERED_SOURCES.filter((source) => source.performsCollection)).toEqual([]);
  });

  /** The count is derived, not written down: register a collecting source and it changes. */
  it('would report a collecting source honestly if one were registered', () => {
    const collector: StatutoryCaptureSource = {
      id: 'fl-oir-scheduled', jurisdiction: 'FL_OIR', publicationUrl: 'https://example.invalid/',
      performsCollection: true, operatorPreconditions: [], offer: async () => [],
    };
    const status = intakeStatus([SUPPLIED_BYTES_SOURCE, collector]);
    expect(status.collecting).toBe(1);
    expect(status.because).toContain('fl-oir-scheduled');
    expect(status.because).toContain('must declare beganAs OPERATOR_CAPTURE');
  });

  it('offers nothing on its own, because the caller is the source', async () => {
    expect(await SUPPLIED_BYTES_SOURCE.offer('2020-01-01T00:00:00.000Z')).toEqual([]);
  });
});

describe('the remaining distance, declared as data', () => {
  it('names an unregistered connector for every jurisdiction the grammar reads', () => {
    expect(UNREGISTERED_JURISDICTIONS.map((entry) => entry.jurisdiction).sort()).toEqual([...JURISDICTION_IDS].sort());
    for (const entry of UNREGISTERED_JURISDICTIONS) {
      expect(entry.operatorPreconditions.length, `${entry.jurisdiction} must state what the operator settles`).toBeGreaterThan(0);
      expect(entry.publicationUrl).toMatch(/^https:\/\//);
    }
  });

  it('states the four decisions that are the operator’s and not this repository’s', () => {
    const florida = UNREGISTERED_JURISDICTIONS.find((entry) => entry.jurisdiction === 'FL_OIR')!;
    const joined = florida.operatorPreconditions.join(' ');
    expect(joined).toContain('terms of use');
    expect(joined).toContain('cadence');
    expect(joined).toContain('retention');
    expect(joined).toContain('admission authority');
  });

  /**
   * Two jurisdictions carry a further open decision, and both are visible only
   * because the rail already refuses correctly rather than guessing.
   */
  it('names the two open questions the specimens already surfaced as refusals', () => {
    const california = UNREGISTERED_JURISDICTIONS.find((entry) => entry.jurisdiction === 'CA_CDI')!;
    expect(california.operatorPreconditions.join(' ')).toContain('SUBJECT_IDENTIFIED');
    const texas = UNREGISTERED_JURISDICTIONS.find((entry) => entry.jurisdiction === 'TX_TDI')!;
    expect(texas.operatorPreconditions.join(' ')).toContain('BOTH_CLOCKS');
  });
});

describe('the seam itself collects nothing', () => {
  it('has no path to a network', () => {
    const source = readFileSync('src/domain/statutoryIntake.ts', 'utf-8');
    for (const forbidden of ['fetch(', 'node:http', 'node:https', 'XMLHttpRequest', 'undici', 'axios']) {
      expect(source, `statutoryIntake must not reach a network: found ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('records a publication endpoint without visiting it', () => {
    for (const entry of UNREGISTERED_JURISDICTIONS) expect(entry.publicationUrl).toBeTruthy();
    const source = readFileSync('src/domain/statutoryIntake.ts', 'utf-8');
    expect(source).toContain('never visited by this repository');
  });
});
