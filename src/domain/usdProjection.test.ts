import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { PROJECTION_ROUTING, routeFor, routeProjection } from './projection';
import {
  AS_OF_COMPOSITION, COMPOSITION_IS_ADJUDICATION, INTEROP_VOCABULARY, LAYER_CONVENTION,
  MAPPING_STATE_LABEL, UNCERTAINTY_ENCODING, USD_BOUNDARY, USD_MAPPING, USD_ROLE,
  VOCABULARY_HOME, usdReadiness,
} from './usdProjection';

describe('OpenUSD is a target and not a store', () => {
  it('states the asymmetry that decides it', () => {
    expect(USD_ROLE.asTarget).toBe('ACCEPTED');
    expect(USD_ROLE.asStore).toBe('REJECTED');
    // The reason is composition, not preference: USD resolves opinions to one value.
    expect(USD_ROLE.whyNotStore).toMatch(/strongest opinion wins/);
    expect(USD_ROLE.whyNotStore).toMatch(/disagreement/);
    expect(USD_ROLE.theRhyme).toMatch(/forward to one present truth/);
    expect(USD_ROLE.theRhyme).toMatch(/backward to dated beliefs/);
  });

  it('enters as exactly one row in the routing table, routed by the one router', () => {
    const view = { mode: 'SCENE', coordinateSemantics: 'INTRINSIC_PHYSICAL', representation: 'SCENE_GRAPH' } as const;
    expect(routeProjection(view)).toBe('OpenUSD');
    const route = routeFor(view)!;
    expect(route.engine).toBe('OpenUSD');
    // No writer and no fixture geometry, so the compiler cannot answer READY.
    expect(route.currentResult).toBe('UNAVAILABLE');
    expect(PROJECTION_ROUTING.filter((r) => r.engine === 'OpenUSD')).toHaveLength(1);
    expect(USD_BOUNDARY.oneRow).toMatch(/not as a new architecture/);
    expect(USD_BOUNDARY.notAVocabulary).toMatch(/no new names for corpus concepts/);
  });

  it('keeps the globe and the stage as two projections of one spec, not one thing', () => {
    expect(USD_BOUNDARY.separateFromTheGlobe).toMatch(/two projections of one spec/);
    expect(USD_BOUNDARY.notARenderer).toMatch(/rendererExecuted: false/);
  });
});

describe('the mapping, row by row, with its hazards', () => {
  it('labels every state and gives every row a hazard worth reading', () => {
    for (const row of USD_MAPPING) {
      expect(MAPPING_STATE_LABEL[row.state]).toBeTruthy();
      expect(row.here.trim().length).toBeGreaterThan(60);
      expect(row.hazard.trim().length).toBeGreaterThan(60);
    }
    expect(new Set(USD_MAPPING.map((r) => r.corpus)).size).toBe(USD_MAPPING.length);
  });

  it('blocks the two rows the corpus genuinely cannot serve', () => {
    const by = (corpus: string) => USD_MAPPING.find((r) => r.corpus.startsWith(corpus))!;
    // Only admitted opinions may compose, and nothing is admitted.
    expect(by('Admitted state only').state).toBe('BLOCKED');
    expect(by('Admitted state only').here).toMatch(/would be empty/);
    // USD has no native concept for uncertainty, provenance, rights or visibility.
    expect(by('Uncertainty, provenance').state).toBe('BLOCKED');
    expect(by('Uncertainty, provenance').hazard).toMatch(/Metadata is droppable/);
  });

  it('keeps the separations a scene is most likely to erase', () => {
    const by = (corpus: string) => USD_MAPPING.find((r) => r.corpus.startsWith(corpus))!;
    // A time sample that interpolates invents readings the corpus never asserted.
    expect(by('Measured quantity').hazard).toMatch(/invents readings/);
    // A prim path is a promise, and resolution is what may mint it.
    expect(by('Entity').hazard).toMatch(/must come from the resolution decision/);
    // Layer strength is release order and nothing else.
    expect(by('Corpus release').hazard).toMatch(/Layer strength is not release authority/);
    // An edge needs evidence even when the format makes one cheap.
    expect(by('Declared relationship').hazard).toMatch(/invented edge/);
  });
});

describe('the layer stack is the release ABI, and the two clocks stay two', () => {
  it('binds layer order to release order and nothing else', () => {
    expect(LAYER_CONVENTION.order).toMatch(/only thing that may set layer strength/);
    expect(LAYER_CONVENTION.oneLayerPerRelease).toMatch(/never edited/);
    expect(LAYER_CONVENTION.correction).toMatch(/new release and therefore a new layer/);
  });

  it('answers knowledge time by truncation and valid time by samples, never the other way', () => {
    expect(AS_OF_COMPOSITION.knowledgeTime).toMatch(/Truncate the sublayer stack/);
    expect(AS_OF_COMPOSITION.validTime).toMatch(/never expressed by layer order/);
    expect(AS_OF_COMPOSITION.receipt).toMatch(/digest/);
    // Outside every interval the corpus says nothing, so the scene says nothing.
    expect(AS_OF_COMPOSITION.refusal).toMatch(/not the nearest sample/);
    expect(USD_MAPPING.find((r) => r.corpus.startsWith('As-of'))!.hazard).toMatch(/knowledge time only/);
  });
});

describe('uncertainty has to reach the eye, because the eye is what a scene is for', () => {
  it('refuses a prim rather than emitting a confident one', () => {
    expect(UNCERTAINTY_ENCODING.rule).toMatch(/refuses the prim/);
    expect(UNCERTAINTY_ENCODING.notThis).toMatch(/metadata does not reach the eye/i);
    expect(UNCERTAINTY_ENCODING.candidates.length).toBeGreaterThan(2);
    // Nothing is decided yet, and the flag says so rather than the prose implying it.
    expect(UNCERTAINTY_ENCODING.decided).toBe(false);
  });
});

describe('what a writer would find in the corpus today', () => {
  it('counts what exists and refuses to write anyway', () => {
    const readiness = usdReadiness(CARAVAN_CORPUS);
    expect(readiness.prims).toBeGreaterThan(0);
    expect(readiness.layers).toBe(CARAVAN_CORPUS.releases.length);
    expect(readiness.relationships).toBeGreaterThan(0);
    expect(readiness.positions.total).toBeGreaterThan(0);
    expect(readiness.positions.withStatedUncertainty).toBe(readiness.positions.total);
    expect(readiness.blockers.length).toBeGreaterThan(3);
    expect(readiness.blockers.join(' ')).toMatch(/No admission authority/);
    expect(readiness.statement).toMatch(/only admitted opinions may compose/);
  });
});

describe('composition is adjudication, which promotes the role and not the authority', () => {
  it('names the same mechanism under a different default', () => {
    expect(COMPOSITION_IS_ADJUDICATION.recognition).toMatch(/many claims, one addressable state/);
    expect(COMPOSITION_IS_ADJUDICATION.differenceIsPolicy).toMatch(/same mechanism under a different default/);
    // The refusals are this system's policy in their grammar, not constraints bolted on.
    expect(COMPOSITION_IS_ADJUDICATION.soTheRefusals).toMatch(/not restrictions bolted onto it/);
  });

  it('promotes the role to an external interface and leaves the store where it was', () => {
    expect(COMPOSITION_IS_ADJUDICATION.role).toBe('EXTERNAL_ABI');
    expect(COMPOSITION_IS_ADJUDICATION.notThis).toMatch(/storage format/);
    // The store decision is unchanged by the promotion.
    expect(USD_ROLE.asStore).toBe('REJECTED');
    expect(USD_BOUNDARY.oneRow).toMatch(/one row in the routing table/);
  });

  it('keeps the mapping in one place, so a shared grammar does not grow private ones', () => {
    expect(INTEROP_VOCABULARY.length).toBeGreaterThan(7);
    for (const pair of INTEROP_VOCABULARY) expect(pair.why.trim().length).toBeGreaterThan(40);
    expect(new Set(INTEROP_VOCABULARY.map((p) => p.ours)).size).toBe(INTEROP_VOCABULARY.length);
    const composition = INTEROP_VOCABULARY.find((p) => p.theirs === 'Composition')!;
    expect(composition.ours).toBe('Adjudication policy');
    expect(VOCABULARY_HOME.why).toMatch(/Two palettes for one concept/);
    // Standards participation is the operator's call, and this does not make it.
    expect(VOCABULARY_HOME.standardsParticipation).toMatch(/none is made or implied here/);
  });
});
