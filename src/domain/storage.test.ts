import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FABRICS } from './doctrine';
import { STORAGE_CLASSES, STORAGE_PRESENT_STATE, STORAGE_SEQUENCE, STORE_KIND_LABEL, STORAGE_STATE_LABEL, type StorageClass } from './storage';

const ids = STORAGE_CLASSES.map((c) => c.id);

describe('polyglot persistence, as data', () => {
  it('names one class per store kind, with unique ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(STORAGE_CLASSES.map((c) => c.kind)).size).toBe(STORAGE_CLASSES.length);
  });

  it('binds every class to a fabric that exists', () => {
    const fabrics = new Set(FABRICS.map((f) => f.id));
    for (const c of STORAGE_CLASSES) expect(fabrics.has(c.fabric)).toBe(true);
  });

  it('labels every kind and every state it uses', () => {
    for (const c of STORAGE_CLASSES) {
      expect(STORE_KIND_LABEL[c.kind]).toBeTruthy();
      expect(STORAGE_STATE_LABEL[c.here.state]).toBeTruthy();
    }
  });

  it('offers candidates, and marks a class SERVICE only where a dependency backs it', () => {
    for (const c of STORAGE_CLASSES) expect(c.candidates.length).toBeGreaterThan(0);
    const served = STORAGE_CLASSES.filter((c) => c.here.state === 'SERVICE').map((c) => c.kind);
    // A selection is recorded as a dependency, not as prose: the two must agree.
    expect(served).toEqual([...STORAGE_PRESENT_STATE.wired]);
  });

  /**
   * The honest-state guard, in both directions. A store dependency that appears
   * without a SERVICE class fails here, and so does a SERVICE class with no
   * dependency behind it. This is the test that caught the corpus moving onto
   * PostgreSQL while the data still said nothing was installed.
   */
  it('keeps the declared dependencies and the stated state in step', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    const byKind: Partial<Record<string, RegExp>> = {
      LAKEHOUSE: /^(pg|postgres|drizzle-orm|prisma|typeorm|duckdb|@duckdb|apache-arrow|trino|delta)/i,
      OBJECT_STORE: /^(@?aws-sdk|minio)/i,
      SEARCH_INDEX: /^(@elastic|@opensearch)/i,
      GRAPH: /^(neo4j|arangojs|memgraph)/i,
      VECTOR: /^(qdrant|@qdrant|milvus|@zilliz|pgvector)/i,
      GEOSPATIAL: /^(postgis)/i,
    };
    for (const c of STORAGE_CLASSES) {
      const pattern = byKind[c.kind];
      const backing = pattern ? declared.filter((d) => pattern.test(d)) : [];
      if (c.here.state === 'SERVICE') {
        expect(backing, `${c.kind} is stated as a running service, so a dependency must back it`).not.toEqual([]);
      } else {
        expect(backing, `${c.kind} has a dependency (${backing.join(', ')}) but is not stated as a service`).toEqual([]);
      }
    }
    expect(STORAGE_PRESENT_STATE.dependencies).toContain('pg and drizzle-orm');
  });

  it('carries a doctrine invariant and a precondition on every class', () => {
    const long = (value: string) => value.trim().length > 40;
    for (const c of STORAGE_CLASSES) {
      expect(long(c.why)).toBe(true);
      expect(long(c.invariant)).toBe(true);
      expect(long(c.before)).toBe(true);
      expect(long(c.here.what)).toBe(true);
    }
  });

  it('keeps the separations the invariants exist to protect', () => {
    const by = (id: StorageClass['id']) => STORAGE_CLASSES.find((c) => c.id === id)!;
    // Embedding similarity is never a canonical relation.
    expect(by('embeddings').invariant).toMatch(/not a canonical relation/);
    // A graph edge still needs evidence; adjacency is not an edge.
    expect(by('entities').invariant).toMatch(/adjacency is not a semantic edge/);
    // Table time travel is not the record's two clocks.
    expect(by('records').invariant).toMatch(/valid time is not knowledge time/);
    // An index is derived and rebuildable, never where a fact lives.
    expect(by('text').invariant).toMatch(/never become the place a fact lives/);
  });

  it('sequences adoption behind the authorities that do not exist yet', () => {
    expect(STORAGE_SEQUENCE.length).toBeGreaterThan(0);
    expect(STORAGE_SEQUENCE.join(' ')).toMatch(/admission/);
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/admission authority/i);
    // The gate is written and installed at the write boundary; what remains is that nothing has passed it.
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/the precondition is largely met/);
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/no candidate has yet passed/);
    expect(by(STORAGE_CLASSES, 'entities').before).toMatch(/identity authority/i);
  });
});

function by(classes: readonly StorageClass[], id: StorageClass['id']) {
  const found = classes.find((c) => c.id === id);
  if (!found) throw new Error(`no storage class ${id}`);
  return found;
}
