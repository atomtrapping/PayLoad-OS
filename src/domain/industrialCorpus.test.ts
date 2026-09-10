import { describe, expect, it } from 'vitest';
import {
  ACQUISITION_CANDIDATES, ACQUISITION_PATH, ACQUISITION_PATTERNS, BUILD_PHASES, CENTRAL_QUESTION,
  CLOCKS, CORPORA, DECISION_COVERAGE_MEASURES, FIRST_RELEASE_SCOPE, GATES, SEPARATE_RIGHTS,
  SOURCE_REGISTRY_FIELDS, acquisitionStanding, candidatesFor, corpusById,
  type AcquisitionCandidate, type GateId,
} from './industrialCorpus';

describe('the eight corpora are one programme, not eight platforms', () => {
  it('numbers them once each, from one to eight', () => {
    expect(CORPORA).toHaveLength(8);
    expect(CORPORA.map((corpus) => corpus.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(CORPORA.map((corpus) => corpus.id)).size).toBe(8);
  });

  it('gives every corpus a part of the central question, something to assemble and a product it would enable', () => {
    for (const corpus of CORPORA) {
      expect(corpus.answers, corpus.id).not.toHaveLength(0);
      expect(corpus.assemble, corpus.id).not.toHaveLength(0);
      expect(corpus.product, corpus.id).not.toHaveLength(0);
    }
    expect(CENTRAL_QUESTION).toContain('what evidence supports that account at a particular time');
  });

  it('resolves a corpus by id and refuses one it does not hold', () => {
    expect(corpusById('facilities')?.order).toBe(1);
    expect(corpusById('capability')?.order).toBe(8);
    // @ts-expect-error a name the programme does not carry
    expect(corpusById('mining')).toBeNull();
  });
});

describe('the chains are what keep the objects distinct', () => {
  it('gives every corpus at least one chain, and every chain distinct objects with something it forbids', () => {
    for (const corpus of CORPORA) {
      expect(corpus.chains.length, corpus.id).toBeGreaterThan(0);
      for (const chain of corpus.chains) {
        expect(chain.objects.length, `${corpus.id}/${chain.of}`).toBeGreaterThan(1);
        expect(new Set(chain.objects).size, `${corpus.id}/${chain.of} repeats an object`).toBe(chain.objects.length);
        expect(chain.forbids.length, `${corpus.id}/${chain.of} forbids nothing`).toBeGreaterThan(0);
      }
    }
  });

  /*
   * The specific confusions, named. These are the ones that turn a corpus into
   * a fabrication, and a test that only counted chains would let any of them be
   * quietly reworded into something weaker.
   */
  it('states the confusions that would fabricate an account', () => {
    const forbidden = CORPORA.flatMap((corpus) => corpus.chains.flatMap((chain) => chain.forbids)).join(' ');
    expect(forbidden).toContain('A registered office is not necessarily a factory');
    expect(forbidden).toContain('A port location is not the same object as an individual terminal or berth');
    expect(forbidden).toContain('is not “the supplier expanded production capacity”');
    expect(forbidden).toContain('Aggregate trade data is not a supplier graph');
    expect(forbidden).toContain('A statistical unit value is not a supplier quotation');
    expect(forbidden).toContain('A notification is not an enacted requirement');
    expect(forbidden).toContain('An announcement does not enter the supply model as available production capacity');
    expect(forbidden).toContain('Infrastructure near a site is not service connected to it');
  });

  it('keeps every corpus saying what it does not establish', () => {
    for (const corpus of CORPORA) expect(corpus.loss.length, corpus.id).toBeGreaterThan(0);
  });
});

describe('the sources are a shortlist and the file says so', () => {
  it('attaches every candidate to a corpus that exists, and gives every corpus a candidate', () => {
    const ids = new Set(CORPORA.map((corpus) => corpus.id));
    for (const entry of ACQUISITION_CANDIDATES) expect(ids.has(entry.corpus), entry.id).toBe(true);
    for (const corpus of CORPORA) expect(candidatesFor(corpus.id).length, corpus.id).toBeGreaterThan(0);
    expect(new Set(ACQUISITION_CANDIDATES.map((entry) => entry.id)).size).toBe(ACQUISITION_CANDIDATES.length);
  });

  /*
   * The honesty test. Every gate on every candidate is NOT_TESTED because none
   * has been tested, and a shortlist that reads as an inventory is the exact
   * failure the evidence substrate exists to prevent.
   */
  it('leaves all four gates untested on every candidate', () => {
    expect(GATES).toEqual(['ACCESS', 'COVERAGE', 'COST', 'REDISTRIBUTION_RIGHTS']);
    for (const entry of ACQUISITION_CANDIDATES) {
      expect(Object.keys(entry.gates).sort(), entry.id).toEqual([...GATES].sort());
      for (const gate of GATES) expect(entry.gates[gate], `${entry.id}/${gate}`).toBe('NOT_TESTED');
    }
  });

  it('reports nothing integrated, and every gate open', () => {
    const standing = acquisitionStanding();
    expect(standing.corpora).toBe(8);
    expect(standing.candidates).toBe(ACQUISITION_CANDIDATES.length);
    expect(standing.integrated).toBe(0);
    expect(standing.openGates).toBe(ACQUISITION_CANDIDATES.length * GATES.length);
    expect(standing.connectionEstablished).toBe(false);
    expect(standing.liveCollectionEnabled).toBe(false);
    expect(standing.currentRightsGrant).toBe(false);
    expect(standing.coverage).toBe('DECLARED_ACQUISITION_SHORTLIST_ONLY');
  });

  /*
   * And the zero is derived, not written down.
   *
   * A hardcoded `integrated: 0` would be true today and would go on being
   * printed after the first source was connected. This passes a candidate whose
   * four gates have all passed and requires the count to move — so the honest
   * number stays honest in the other direction too.
   */
  it('counts an integration when all four gates pass, so the zero means something', () => {
    const passed: AcquisitionCandidate = {
      ...ACQUISITION_CANDIDATES[0],
      gates: Object.fromEntries(GATES.map((gate) => [gate, 'PASSED'])) as Record<GateId, 'PASSED'>,
    };
    const partial: AcquisitionCandidate = {
      ...ACQUISITION_CANDIDATES[1],
      gates: { ACCESS: 'PASSED', COVERAGE: 'PASSED', COST: 'PASSED', REDISTRIBUTION_RIGHTS: 'NOT_TESTED' },
    };
    const standing = acquisitionStanding([passed, partial, ACQUISITION_CANDIDATES[2]]);
    expect(standing.candidates).toBe(3);
    expect(standing.integrated, 'three of four gates is not an integration').toBe(1);
    expect(standing.openGates).toBe(0 + 1 + 4);
  });

  it('marks the sources that would cost money without acquiring any of them', () => {
    const commercial = ACQUISITION_CANDIDATES.filter((entry) => entry.commercial).map((entry) => entry.id);
    expect(commercial).toContain('commercial-imagery');
    expect(commercial).toContain('vessel-tracking');
    expect(commercial).toContain('shipment-level-customs');
    expect(acquisitionStanding().commercial).toBe(commercial.length);
  });

  /* The obligations that exist before any test is run, and that one flag cannot carry. */
  it('records the licence obligations that a public/not-public flag would erase', () => {
    const limits = (id: string) => ACQUISITION_CANDIDATES.find((entry) => entry.id === id)!.knownLimits.join(' ');
    expect(limits('overture-maps')).toContain('vary by theme');
    expect(limits('openstreetmap')).toContain('ODbL');
    expect(limits('gleif')).toContain('complete register');
    expect(limits('google-open-buildings')).toContain('no building use, operator or address');
    expect(limits('canada-sanctions')).toContain('does not itself have force of law');
    expect(limits('dcsa-integrations')).toContain('not an unrestricted global shipment database');
    expect(limits('gs1-epcis')).toContain('not access to anyone’s operational data');
    expect(limits('freightos-fbx')).toContain('bookable, all-in quote');
  });
});

describe('rights are separate entries on the substrate that already enforces them', () => {
  it('maps five rights onto five distinct source operations', () => {
    expect(SEPARATE_RIGHTS).toHaveLength(5);
    expect(new Set(SEPARATE_RIGHTS.map((right) => right.operation)).size).toBe(5);
    expect(SEPARATE_RIGHTS.map((right) => right.operation).sort())
      .toEqual(['DERIVE', 'EXPORT', 'INGEST', 'MODEL_TRAINING', 'PUBLISH']);
    for (const right of SEPARATE_RIGHTS) expect(right.question, right.right).toContain('?');
  });

  it('keeps the registry fields a source has to answer whether or not it is integrated', () => {
    expect(SOURCE_REGISTRY_FIELDS).toContain('attribution');
    expect(SOURCE_REGISTRY_FIELDS).toContain('permitted outputs');
    expect(SOURCE_REGISTRY_FIELDS).toContain('schema and parser version');
    expect(SOURCE_REGISTRY_FIELDS).toContain('retention rules');
  });
});

describe('the clocks, the patterns and the path', () => {
  it('gives every kind of record more than one time', () => {
    expect(CLOCKS.length).toBeGreaterThan(0);
    for (const clock of CLOCKS) {
      expect(clock.times.length, clock.kind).toBeGreaterThan(1);
      expect(new Set(clock.times).size, clock.kind).toBe(clock.times.length);
      expect(clock.collapsing, clock.kind).not.toHaveLength(0);
    }
    const shipment = CLOCKS.find((clock) => clock.kind === 'Shipment event')!;
    expect(shipment.times).toEqual(['planned', 'estimated', 'reported actual', 'received', 'corrected']);
  });

  it('names six reusable acquisition patterns rather than eight collectors', () => {
    expect(ACQUISITION_PATTERNS).toHaveLength(6);
    expect(new Set(ACQUISITION_PATTERNS.map((pattern) => pattern.id)).size).toBe(6);
    for (const pattern of ACQUISITION_PATTERNS) expect(pattern.handles.length, pattern.id).toBeGreaterThan(1);
  });

  it('runs every corpus through one path that starts at a question and ends at something deliverable', () => {
    expect(ACQUISITION_PATH[0]).toBe('customer question or watchlist');
    expect(ACQUISITION_PATH[ACQUISITION_PATH.length - 1]).toBe('corpus release, API, packet or alert');
    expect(ACQUISITION_PATH).toContain('source selection and rights check');
    expect(new Set(ACQUISITION_PATH).size).toBe(ACQUISITION_PATH.length);
  });
});

describe('what to build first, and how it would be measured', () => {
  it('phases the first release, each with a deliverable and something to test it against', () => {
    expect(BUILD_PHASES.map((phase) => phase.order)).toEqual([1, 2, 3, 4]);
    for (const phase of BUILD_PHASES) {
      expect(phase.deliverable, phase.title).not.toHaveLength(0);
      expect(phase.validation, phase.title).not.toHaveLength(0);
    }
  });

  it('states the first scope as a proposed limit rather than a coverage promise', () => {
    expect(FIRST_RELEASE_SCOPE.standing).toBe('PROPOSED_SCOPE_LIMIT_NOT_A_COVERAGE_PROMISE');
    expect(FIRST_RELEASE_SCOPE.supplierFacilities).toBe(25);
  });

  it('measures the corpus by decision coverage, not by volume', () => {
    expect(DECISION_COVERAGE_MEASURES.length).toBeGreaterThan(4);
    const measures = DECISION_COVERAGE_MEASURES.map((entry) => entry.measure).join(' ');
    expect(measures).toContain('customer assets correctly resolved');
    expect(measures).toContain('Unresolved identity matches');
    expect(measures).toContain('Source-update failures');
    expect(measures).toContain('Cost per refreshed facility');
    for (const measure of DECISION_COVERAGE_MEASURES) expect(measure.why, measure.id).not.toHaveLength(0);
  });
});
