/**
 * The registry against the code it describes.
 *
 * A registry is a list of claims about a system, and a list of claims nothing
 * checks is a document that rots. These are the checks that make it a map
 * rather than a description: every capability names a module that exists,
 * every entry is shaped for the kind it declares, and the vocabularies it
 * shares with the control plane are the same vocabularies.
 *
 * What is deliberately not checked is whether the described behaviour is
 * accurate — no test can read English against SQL. What a stale entry gets
 * instead is a failing path: move or delete the module and this fails, which
 * is when somebody reads the entry.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES, CAPABILITY_KINDS, CAPABILITY_KIND_MEANING, CAPABILITY_RULE, CAPABILITY_SUBSYSTEMS,
  CORPUS_CAPABILITIES, SUBSTRATE_CAPABILITIES, TOOL_CAPABILITY, capabilitiesOf, capabilityById, capabilityOfTool,
} from './capabilityRegistry';
import { SERVED_KINDS } from './terminalPlane';

const ROOT = join(__dirname, '..', '..');

describe('every capability names code that exists', () => {
  /* The one check that turns the registry from a description into a map. */
  it('opens the module of every entry', () => {
    const missing = CAPABILITIES
      .filter((capability) => !existsSync(join(ROOT, capability.module)))
      .map((capability) => `${capability.id} → ${capability.module}`);
    expect(missing).toEqual([]);
  });

  it('names a module under the repository, not an absolute or escaping path', () => {
    for (const capability of CAPABILITIES) {
      expect(capability.module, capability.id).toMatch(/^(src|scripts|tests|contracts)\//);
      expect(capability.module, capability.id).not.toContain('..');
    }
  });
});

describe('every capability is shaped for the kind it declares', () => {
  it('gives each entry one identity', () => {
    const ids = CAPABILITIES.map((capability) => capability.id);
    expect(new Set(ids).size, `duplicate id among ${ids.length}`).toBe(ids.length);
    for (const capability of CAPABILITIES) {
      expect(capability.id, capability.id).toMatch(/^[a-z][a-zA-Z]*\.[a-z0-9-]+$/);
      expect(capabilityById(capability.id)).toBe(capability);
    }
  });

  it('declares a kind the plane knows, with a stated meaning', () => {
    for (const capability of CAPABILITIES) expect(CAPABILITY_KINDS, capability.id).toContain(capability.kind);
    for (const kind of CAPABILITY_KINDS) expect(CAPABILITY_KIND_MEANING[kind].length).toBeGreaterThan(40);
  });

  /*
   * A read says what it hands back, because a purpose admits kinds. An operate
   * says what it would change, because a reviewer is shown that before
   * anything changes. Neither is optional for its kind.
   */
  it('gives a read a served kind and an operate its side effects', () => {
    for (const capability of CAPABILITIES) {
      if (capability.kind === 'READ') {
        expect(SERVED_KINDS, `${capability.id} serves`).toContain(capability.serves);
        expect(capability.sideEffects, `${capability.id} is a read and changes nothing`).toBeUndefined();
      } else {
        expect(capability.sideEffects?.length, `${capability.id} declares what it would change`).toBeGreaterThan(0);
        for (const effect of capability.sideEffects ?? []) expect(effect.length, capability.id).toBeGreaterThan(10);
        expect(capability.serves, `${capability.id} is not a read`).toBeUndefined();
      }
    }
  });

  it('says what gates it, what authority it needs and how it is reached', () => {
    for (const capability of CAPABILITIES) {
      expect(capability.gatedBy.length, `${capability.id} gatedBy`).toBeGreaterThan(3);
      expect(capability.authorityNeeded.length, `${capability.id} authorityNeeded`).toBeGreaterThan(3);
      expect(capability.reachableToday.length, `${capability.id} reachableToday`).toBeGreaterThan(3);
      expect(capability.entryPoint.length, `${capability.id} entryPoint`).toBeGreaterThan(2);
    }
  });

  /* The estates leave the wall on no transport, so nothing declares itself as serving them. */
  it('has no capability that serves an estate', () => {
    for (const capability of CAPABILITIES) expect(capability.serves, capability.id).not.toBe('ESTATE');
  });
});

describe('the surface reaches only what the registry describes', () => {
  it('maps every tool onto a described read, and nothing onto an operate', () => {
    for (const [tool, id] of Object.entries(TOOL_CAPABILITY)) {
      const reached = capabilityOfTool(tool);
      expect(reached, `${tool} → ${id}`).toBeDefined();
      expect(reached!.kind, `${tool} reaches a read`).toBe('READ');
    }
  });

  /*
   * The honest headline of the survey this registry came from: the substrate
   * does far more than a terminal can ask it to. Nothing but the twelve corpus
   * reads is wired, and every unwired entry says so in its own words rather
   * than by being absent.
   */
  it('wires only the corpus reads, and says so on everything else', () => {
    const wired = new Set(Object.values(TOOL_CAPABILITY));
    expect([...wired].sort()).toEqual(CORPUS_CAPABILITIES.map((capability) => capability.id).sort());
    for (const capability of SUBSTRATE_CAPABILITIES) {
      expect(wired.has(capability.id), `${capability.id} is wired but not a corpus read`).toBe(false);
    }
  });

  it('groups every capability under a named area', () => {
    expect(CAPABILITY_SUBSYSTEMS.length).toBeGreaterThan(5);
    const grouped = CAPABILITY_SUBSYSTEMS.flatMap((subsystem) => capabilitiesOf(subsystem));
    expect(grouped).toHaveLength(CAPABILITIES.length);
    for (const subsystem of CAPABILITY_SUBSYSTEMS) expect(capabilitiesOf(subsystem).length).toBeGreaterThan(0);
  });

  it('states its rule', () => {
    expect(CAPABILITY_RULE).toContain('never executed on a terminal’s say-so');
    expect(CAPABILITY_RULE).toContain('the firm’s own act');
  });
});
