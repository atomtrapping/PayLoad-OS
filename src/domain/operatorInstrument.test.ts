/**
 * The instrument's two rules, held structurally.
 *
 * The first rule is checked by reading this module's own source: it may import
 * nothing that can write. The second is checked over every layer the reading
 * emits, so a layer that starts interpolating without saying so fails here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { LOCATION_POSITION_PREDICATE, currentRelease, deliverableRecords, type Corpus } from './corpus';
import {
  CONVENIENCE_MEANING,
  INSTRUMENT_LOSS,
  INSTRUMENT_METHOD,
  INSTRUMENT_RULES,
  conveniencesTaken,
  readInstrument,
  type Convenience,
} from './operatorInstrument';

const SOURCE = resolve(process.cwd(), 'src/domain/operatorInstrument.ts');

/** The code, without the prose about the code: the doc names the write door it must not import. */
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function fixture() {
  const corpus = structuredClone(CARAVAN_CORPUS);
  return { corpus, release: currentRelease(corpus) };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const layerById = (corpus: Corpus, id: string) => {
  const release = currentRelease(corpus);
  const found = readInstrument(corpus, release, 'UNKNOWN').layers.find((entry) => entry.id === id);
  if (!found) throw new Error(`No layer ${id}.`);
  return found;
};

describe('rule one: the instrument never writes', () => {
  it('imports nothing that can write, so navigating cannot become admitting', () => {
    const source = withoutComments(readFileSync(SOURCE, 'utf8'));
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    // The store, the write door, the rails that capture, and the ORM underneath them.
    const forbidden = imports.filter((path) => /(^|\/)db($|\/)|admitRecords|drizzle|postgres|@\/data-os\/(?!contracts$)/.test(path));
    expect(forbidden).toEqual([]);
    // And it reaches for no write verb of its own.
    expect(source).not.toMatch(/\binsert\(|\bupdate\(|\bdelete\(|admitRecords|writeFileSync/);
  });

  it('says so in the payload, as a literal a caller cannot mistake for a mode', () => {
    const { corpus, release } = fixture();
    const reading = readInstrument(corpus, release, 'UNKNOWN');
    expect(reading.writes).toBe('NONE');
    expect(reading.isEvidence).toBe(false);
    expect(reading.method).toBe(INSTRUMENT_METHOD);
    expect(reading.rules).toHaveLength(2);
    expect(reading.rules).toBe(INSTRUMENT_RULES);
    expect(Object.isFrozen(INSTRUMENT_RULES)).toBe(true);
  });

  it('leaves the corpus it read exactly as it found it', () => {
    const corpus = deepFreeze(structuredClone(CARAVAN_CORPUS));
    const before = JSON.stringify(corpus);
    expect(() => readInstrument(corpus, currentRelease(corpus), 12)).not.toThrow();
    expect(JSON.stringify(corpus)).toBe(before);
  });
});

describe('rule two: the instrument labels its own conveniences', () => {
  it('requires a convenience on every layer, and every convenience carries a meaning', () => {
    const { corpus, release } = fixture();
    const reading = readInstrument(corpus, release, 'UNKNOWN');
    expect(reading.layers.length).toBeGreaterThan(0);
    for (const entry of reading.layers) {
      expect(Object.keys(CONVENIENCE_MEANING)).toContain(entry.convenience);
      expect(CONVENIENCE_MEANING[entry.convenience].length).toBeGreaterThan(0);
    }
  });

  it('names the conveniences taken, and takes none today: every layer is counted from the release as it stands', () => {
    const { corpus, release } = fixture();
    const reading = readInstrument(corpus, release, 'UNKNOWN');
    expect(conveniencesTaken(reading)).toEqual([]);
    expect(reading.layers.every((entry) => entry.convenience === 'NONE')).toBe(true);
  });

  it('surfaces a layer that touched its numbers, so the label is a filter and not decoration', () => {
    const { corpus, release } = fixture();
    const reading = readInstrument(corpus, release, 'UNKNOWN');
    const smoothed: Convenience = 'DEAD_RECKONED';
    const withGhost = { ...reading, layers: [...reading.layers, { id: 'ghost', label: 'Dead-reckoned track', shows: 'A carried-forward position.', reading: 3, convenience: smoothed, because: 'Carried forward from the last fix.' }] };
    expect(conveniencesTaken(withGhost).map((entry) => entry.id)).toEqual(['ghost']);
  });
});

describe('the reading over the Caravan release', () => {
  it('counts the positioned subjects the seat can stand on, and lists the rest as voids', () => {
    const { corpus, release } = fixture();
    const reading = readInstrument(corpus, release, 'UNKNOWN');
    const held = deliverableRecords(corpus, release, 'COUNTERPARTY_SHARED').records;
    const positioned = new Set(held.filter((r) => r.predicate === LOCATION_POSITION_PREDICATE).map((r) => r.subjectCanonicalId));
    const subjects = new Set(held.map((r) => r.subjectCanonicalId));

    expect(layerById(corpus, 'positioned').reading).toBe(positioned.size);
    expect(reading.voids).toHaveLength(subjects.size - positioned.size);
    expect(layerById(corpus, 'void').reading).toBe(reading.voids.length);
    for (const hole of reading.voids) {
      expect(positioned.has(hole.canonicalId)).toBe(false);
      expect(hole.recordsHeld).toBeGreaterThan(0);
    }
    // The point of the layer: holes outnumber the places you can fly to.
    expect(reading.voids.length).toBeGreaterThan(0);
  });

  it('reads the admission queue as UNKNOWN from a page, and as a number when a caller can read the store', () => {
    const { corpus, release } = fixture();
    expect(readInstrument(corpus, release, 'UNKNOWN').layers.find((e) => e.id === 'admission-queue')?.reading).toBe('UNKNOWN');
    const known = readInstrument(corpus, release, 0).layers.find((e) => e.id === 'admission-queue');
    expect(known?.reading).toBe(0);
    expect(known?.because).toMatch(/0 admitted records/);
  });

  it('reads through the rights gate rather than around it: a narrower seat sees no more', () => {
    const { corpus, release } = fixture();
    const shared = readInstrument(corpus, release, 'UNKNOWN', 'COUNTERPARTY_SHARED');
    const publicSeat = readInstrument(corpus, release, 'UNKNOWN', 'PUBLIC_RULING');
    expect(publicSeat.seat).toBe('PUBLIC_RULING');
    const readingOf = (r: typeof shared, id: string) => r.layers.find((e) => e.id === id)?.reading;
    expect(Number(readingOf(publicSeat, 'positioned'))).toBeLessThanOrEqual(Number(readingOf(shared, 'positioned')));
    const publicSubjects = new Set(deliverableRecords(corpus, release, 'PUBLIC_RULING').records.map((r) => r.subjectId));
    for (const hole of publicSeat.voids) expect(publicSubjects.has(hole.subjectId)).toBe(true);
  });

  it('does not resolve which kind of hole a void is, because saying would disclose a withholding', () => {
    const { corpus, release } = fixture();
    for (const hole of readInstrument(corpus, release, 'UNKNOWN').voids) {
      expect(hole.because).toMatch(/never positioned it, or it positioned it and does not deliver that here/);
    }
  });

  it('counts a subject with two standing declarations as contested and merges nothing', () => {
    const { corpus, release } = fixture();
    expect(layerById(corpus, 'contested').reading).toBe(0);

    const twin = structuredClone(corpus);
    const position = twin.records.find((r) => r.predicate === LOCATION_POSITION_PREDICATE);
    if (!position) throw new Error('The fixture declares no position.');
    twin.records.push({ ...position, recordId: `${position.recordId}-RIVAL`, value: '0.0000 N, 0.0000 E' });
    expect(layerById(twin, 'contested').reading).toBe(1);
    // And the subject is still flyable: contested is a comparison, not a disqualification.
    expect(readInstrument(twin, currentRelease(twin), 'UNKNOWN').voids.map((v) => v.canonicalId)).not.toContain(position.subjectCanonicalId);
    expect(release.releaseId).toBe(currentRelease(twin).releaseId);
  });

  it('drops a retracted position back into the void, because a withdrawal removes standing', () => {
    const { corpus } = fixture();
    const before = readInstrument(corpus, currentRelease(corpus), 'UNKNOWN');
    const positionedBefore = Number(before.layers.find((e) => e.id === 'positioned')?.reading);

    const twin = structuredClone(corpus);
    const position = twin.records.find((r) => r.predicate === LOCATION_POSITION_PREDICATE)!;
    const retraction = twin.retractions[0];
    if (!retraction) throw new Error('The fixture issues no retraction.');
    position.retractedByRetractionId = retraction.retractionId;

    const after = readInstrument(twin, currentRelease(twin), 'UNKNOWN');
    expect(Number(after.layers.find((e) => e.id === 'positioned')?.reading)).toBe(positionedBefore - 1);
    expect(after.voids.map((v) => v.canonicalId)).toContain(position.subjectCanonicalId);
    expect(Number(after.layers.find((e) => e.id === 'restated')?.reading)).toBeGreaterThan(Number(before.layers.find((e) => e.id === 'restated')?.reading));
  });
});

describe('what the instrument gives up', () => {
  it('states its losses, beginning with not being evidence', () => {
    expect(INSTRUMENT_LOSS.length).toBeGreaterThanOrEqual(5);
    expect(INSTRUMENT_LOSS[0]).toMatch(/not.*evidence|nothing here is evidence/i);
    expect(INSTRUMENT_LOSS.join(' ')).toMatch(/never writes/);
    expect(INSTRUMENT_LOSS.join(' ')).toMatch(/rights gate/);
  });
});
