import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCTRINE, FABRICS, IDENTITY_CHAIN, INFORMATION_STATES, NEGATIVE_STATES, OPERATIONAL_RULE, PROJECTION_ENGINES_IN_REPOSITORY, VERIFICATION_TIERS } from './doctrine';

describe('doctrine as data', () => {
  it('states seven rules, numbered, each with meaning, enforcement here and at least one existing test that proves it', () => {
    expect(DOCTRINE.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const r of DOCTRINE) {
      expect(r.rule.endsWith('.')).toBe(true);
      expect(r.meaning.length).toBeGreaterThan(30);
      expect(r.enforcedHere.length).toBeGreaterThan(30);
      expect(r.tests.length).toBeGreaterThan(0);
      for (const t of r.tests) expect(existsSync(resolve(process.cwd(), t)), `${t} named by rule ${r.n} must exist`).toBe(true);
    }
    expect(OPERATIONAL_RULE).toMatch(/shared information/);
  });

  it('names five fabrics in order, three information states, and eight distinct identities', () => {
    expect(FABRICS.map((f) => f.order)).toEqual([1, 2, 3, 4, 5]);
    expect(FABRICS.map((f) => f.id)).toEqual(['acquisition', 'corpus', 'state', 'compute', 'projection']);
    expect(FABRICS.find((f) => f.id === 'state')?.presence).toBe('PRESENT');
    expect(FABRICS.find((f) => f.id === 'state')?.inThisRepository).toMatch(/Canonical corpus admission remains absent/);
    expect(INFORMATION_STATES.map((s) => s.symbol)).toEqual(['E', 'K', 'I']);
    expect(INFORMATION_STATES.find((s) => s.id === 'INQUIRY')?.invariants).toContain('promotion crosses validation');
    expect(new Set(IDENTITY_CHAIN).size).toBe(8);
  });

  it('reaches provenance and deterministic reproducibility and claims no higher verification tier', () => {
    expect(VERIFICATION_TIERS.map((t) => t.tier)).toEqual(['V0', 'V1', 'V2', 'V3', 'V4', 'V5']);
    expect(VERIFICATION_TIERS.filter((t) => t.reachedHere).map((t) => t.tier)).toEqual(['V0', 'V1']);
  });

  it('distinguishes bounded local compute from absent managed workloads and learned models', () => {
    const compute = FABRICS.find((f) => f.id === 'compute')!;
    expect(compute.presence).toBe('PRESENT');
    expect(compute.inThisRepository).toContain('benchmark demonstration is synthetic');
    expect(compute.inThisRepository).toContain('Managed customer workloads, trained neural models and automatic canonical admission remain absent');
    expect(compute.inThisRepository).not.toContain('No model, simulation or optimizer runs here');
  });

  it('states engine presence as the dependencies have it: CesiumJS installed for the Earth Twin, kepler.gl and Three.js absent, records over fixtures', () => {
    expect(PROJECTION_ENGINES_IN_REPOSITORY.map((e) => [e.engine, e.presence])).toEqual([['kepler.gl', 'ABSENT'], ['CesiumJS', 'PRESENT'], ['Three.js', 'ABSENT'], ['OpenUSD', 'ABSENT'], ['records', 'FIXTURE']]);
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const installed = Object.keys(pkg.dependencies);
    const packageOf = { 'kepler.gl': /kepler/, CesiumJS: /^cesium$/, 'Three.js': /^three$/, OpenUSD: /^(usd-core|tinyusdz|@usd\/)/ } as const;
    for (const [engine, pattern] of Object.entries(packageOf)) {
      const present = PROJECTION_ENGINES_IN_REPOSITORY.find((e) => e.engine === engine)!.presence === 'PRESENT';
      expect(installed.some((dep) => pattern.test(dep)), `${engine} presence ${present ? 'PRESENT' : 'ABSENT'} must match package.json`).toBe(present);
    }
  });
});

describe('what an absence means', () => {
  it('names three distinct negative states where the industry has one, each enforced somewhere', () => {
    expect(NEGATIVE_STATES.map((r) => r.name)).toEqual(['SILENCE IS NOT ZERO', 'WITHDRAWN IS NOT FALSE', 'UNTESTED IS NOT CONSISTENT']);
    for (const rule of NEGATIVE_STATES) {
      expect(rule.rule.length).toBeGreaterThan(30);
      expect(rule.meaning.length).toBeGreaterThan(30);
      expect(rule.refuses.length).toBeGreaterThan(20);
      expect(rule.enforcedHere.length).toBeGreaterThan(60);
      expect(rule.tests.length).toBeGreaterThan(0);
      // A rule that names no test that exists is a claim, not a rule.
      for (const file of rule.tests) expect(existsSync(resolve(process.cwd(), file)), `${rule.name} names ${file}`).toBe(true);
    }
  });

  it('keeps the three apart, because flattening them is what it refuses', () => {
    const [silence, withdrawn, untested] = NEGATIVE_STATES;
    expect(silence.refuses).toMatch(/manufactured from the absence of a measurement/);
    expect(withdrawn.refuses).toMatch(/Reading a retraction as a negation, or as a deletion/);
    expect(untested.refuses).toMatch(/absence of a detected contradiction as agreement/);
    // No two rules refuse the same thing, or one of them is not a rule.
    expect(new Set(NEGATIVE_STATES.map((r) => r.refuses)).size).toBe(NEGATIVE_STATES.length);
  });
});
