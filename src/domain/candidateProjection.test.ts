import { describe, expect, it } from 'vitest';
import { admit } from './admission';
import { resolveSubject, type Registration } from './identityResolution';
import { establishWorldTime } from './worldTime';
import { PROJECTION_LOSS, carrierClaims, censusClaims, projectToCandidates, type DeclaredContext, type RailCandidate } from './candidateProjection';

const CONTEXT: DeclaredContext = {
  origin: 'MEASURED',
  evidenceClass: { claimStrength: 'reported', productionClass: 'measured', interest: 'unknown' },
  provenanceClass: 'LIVE_CAPTURE',
  sourceTime: '2026-09-07T05:30:00Z',
  rightsDecision: 'PERMITTED',
  conditions: [],
  predicateFor: { legalName: 'identity.legal_name', operatingSite: 'location.operating_site', registrationNumber: 'identity.registration_number' },
};

const rail = (over: Partial<RailCandidate> = {}): RailCandidate => ({
  candidateId: 'cand-carrier-1',
  buildId: 'build-9',
  identity: { sourceRecordId: 'SRC-4402', canonicalId: null },
  knownAt: '2026-09-07T09:00:00Z',
  capturedAt: '2026-09-07T06:00:00Z',
  artifactDigest: 'a'.repeat(64),
  validTime: { state: 'UNOBSERVED', from: null },
  claims: carrierClaims({ legalName: 'Blue Anchor Logistics', registrationNumber: 'MC-118422', operatingSite: 'Rotterdam' }),
  ...over,
});

describe('the rail reaches the gate', () => {
  it('turns one entity with N fields into N candidates, each ruled on separately', () => {
    const { candidates, skipped } = projectToCandidates(rail(), CONTEXT);
    expect(candidates).toHaveLength(3);
    expect(skipped).toEqual([]);
    // Distinct identities, so two claims from one record cannot be ruled on as a lump.
    expect(new Set(candidates.map((c) => c.candidateId)).size).toBe(3);
    expect(candidates.map((c) => c.assertion!.predicate)).toEqual([
      'identity.legal_name', 'identity.registration_number', 'location.operating_site',
    ]);
    expect(candidates[0].assertion!.value).toBe('Blue Anchor Logistics');
    expect(candidates[0].assertion!.subjectId).toBe('SRC-4402');
  });

  it('skips a field with no value rather than asserting nothing about it', () => {
    const { candidates, skipped } = projectToCandidates(
      rail({ claims: carrierClaims({ legalName: 'Blue Anchor Logistics', operatingSite: '' }, ['operatingSite']) }),
      CONTEXT,
    );
    expect(candidates).toHaveLength(1);
    expect(skipped.map((s) => s.field)).toEqual(['operatingSite']);
    expect(skipped[0].because).toContain('lack of a claim rather than a claim of nothing');
  });

  it('skips a field with no declared predicate rather than deriving one from its name', () => {
    const { candidates, skipped } = projectToCandidates(
      rail({ claims: carrierClaims({ legalName: 'Blue Anchor Logistics', dotNumber: '2277' }) }),
      CONTEXT,
    );
    expect(candidates.map((c) => c.assertion!.predicate)).toEqual(['identity.legal_name']);
    expect(skipped[0].field).toBe('dotNumber');
    expect(skipped[0].because).toContain('inventing vocabulary');
  });

  it('carries the census presence and unit through, and treats an explicit null as an absence', () => {
    const claims = censusClaims({
      legalName: { value: 'Blue Anchor Logistics', unit: null, presence: 'PRESENT', interpretation: 'As filed' },
      operatingSite: { value: null, unit: null, presence: 'EXPLICIT_NULL' },
      registrationNumber: { value: 'MC-118422', unit: null, presence: 'OMITTED' },
    });
    const { candidates, skipped } = projectToCandidates(rail({ claims }), CONTEXT);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].assertion!.basis).toBe('As filed');
    // An omitted field is an absence even when a value happens to sit beside it.
    expect(skipped.map((s) => s.field).sort()).toEqual(['operatingSite', 'registrationNumber']);
  });

  it('carries both absent stages through, so the gate refuses for exactly the right reasons', () => {
    const { candidates, because } = projectToCandidates(rail(), CONTEXT);
    expect(candidates.every((c) => c.subjectCanonicalId === null)).toBe(true);
    expect(candidates.every((c) => c.validFrom === null)).toBe(true);
    expect(because).toContain('SUBJECT_IDENTIFIED');
    expect(because).toContain('BOTH_CLOCKS');
    expect(because).toContain('one hop upstream');

    // End to end: the projection runs, the gate rules, and every candidate is
    // refused on the two absent stages and on nothing this hop invented.
    const rulings = candidates.map((c) => admit(c, 'role:corpus-steward', '2026-09-07T12:00:00Z'));
    expect(rulings.every((r) => r.outcome === 'REFUSED')).toBe(true);
    for (const ruling of rulings) {
      expect(ruling.failed.map((f) => f.check).sort()).toEqual(['BOTH_CLOCKS', 'SUBJECT_IDENTIFIED']);
    }
  });

  it('refuses on world time alone when identity resolves but the snapshot established none', () => {
    const resolved = rail({ identity: { sourceRecordId: 'SRC-4402', canonicalId: 'notation://subject/carrier-4402' } });
    const { candidates } = projectToCandidates(resolved, CONTEXT);
    const rulings = candidates.map((c) => admit(c, 'role:corpus-steward', '2026-09-07T12:00:00Z'));
    expect(rulings.every((r) => r.outcome === 'REFUSED')).toBe(true);
    expect(rulings[0].failed.map((f) => f.check)).toEqual(['BOTH_CLOCKS']);
  });

  it('admits once both absent stages have run, and admits the assertion the rail parsed', () => {
    const complete = rail({
      identity: { sourceRecordId: 'SRC-4402', canonicalId: 'notation://subject/carrier-4402' },
      validTime: { state: 'OBSERVED', from: '2026-09-07T06:00:00Z' },
    });
    const { candidates } = projectToCandidates(complete, CONTEXT);
    const rulings = candidates.map((c) => admit(c, 'role:corpus-steward', '2026-09-07T12:00:00Z'));
    expect(rulings.every((r) => r.outcome === 'ADMITTED')).toBe(true);
    expect(candidates[0].assertion!.value).toBe('Blue Anchor Logistics');
    expect(candidates[0].validFrom).toBe('2026-09-07T06:00:00Z');
  });

  it('says what it does not do', () => {
    expect(PROJECTION_LOSS.some((l) => l.includes('does not resolve identity'))).toBe(true);
    expect(PROJECTION_LOSS.some((l) => l.includes('belongs to whoever owns the vocabulary'))).toBe(true);
  });

  it('walks the whole path once the two stages run: rail, resolve, establish, project, admit', () => {
    const registry: Registration[] = [{
      family: 'USDOT', value: '118422', canonicalId: 'notation://subject/carrier-4402',
      knownAt: '2026-08-01T00:00:00Z', evidenceRecordId: 'REC-REG-1',
    }];

    // Stage one: resolve on an issued identifier, not on the legal name.
    const resolution = resolveSubject(
      [{ family: 'NOT_AN_IDENTIFIER', value: 'Blue Anchor Logistics' }, { family: 'USDOT', value: '118422' }],
      registry, '2026-09-07T09:00:00Z',
    );
    expect(resolution.outcome).toBe('RESOLVED');
    expect(resolution.setAside[0].offered.family).toBe('NOT_AN_IDENTIFIER');

    // Stage two: the source declares an effective date, so world time is established.
    const world = establishWorldTime({ kind: 'SOURCE_DECLARED_EFFECTIVE', at: '2026-09-07T06:00:00Z', declaredBy: 'FMCSA filing' });
    expect(world.outcome).toBe('ESTABLISHED');

    // The projection now has both, and the gate admits.
    const { candidates } = projectToCandidates(rail({
      identity: { sourceRecordId: 'SRC-4402', canonicalId: resolution.canonicalId },
      validTime: { state: 'OBSERVED', from: world.validFrom! },
    }), CONTEXT);
    const rulings = candidates.map((c) => admit(c, 'role:corpus-steward', '2026-09-07T12:00:00Z'));
    expect(rulings.every((r) => r.outcome === 'ADMITTED')).toBe(true);
    expect(candidates[0].subjectCanonicalId).toBe('notation://subject/carrier-4402');
    expect(candidates[0].validFrom).toBe('2026-09-07T06:00:00Z');
  });

  it('stays refused when world time is only bracketed, because a bracket is not a valid-from', () => {
    const world = establishWorldTime({
      kind: 'BRACKETED_BY_READS', unchangedAt: '2026-08-03T00:00:00Z', changedBy: '2026-08-07T00:00:00Z', register: 'FMCSA company census',
    });
    expect(world.outcome).toBe('BRACKETED');
    // There is nothing to hand the projection: flattening the bracket is the
    // one move that would get this admitted, and it is the one that is wrong.
    expect(world.validFrom).toBeNull();
    const { candidates } = projectToCandidates(rail({
      identity: { sourceRecordId: 'SRC-4402', canonicalId: 'notation://subject/carrier-4402' },
    }), CONTEXT);
    const rulings = candidates.map((c) => admit(c, 'role:corpus-steward', '2026-09-07T12:00:00Z'));
    expect(rulings.every((r) => r.failed.map((f) => f.check).includes('BOTH_CLOCKS'))).toBe(true);
  });
});
