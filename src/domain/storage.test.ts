import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FABRICS } from './doctrine';
import { STORAGE_CLASSES, STORAGE_PRESENT_STATE, STORAGE_SEQUENCE, STORE_KIND_LABEL, STORAGE_STATE_LABEL, type StorageClass, type StoreKind } from './storage';

const ids = STORAGE_CLASSES.map((c) => c.id);

describe('polyglot persistence, as data', () => {
  it('names one class per store kind, with unique ids', () => {
    expect(ids).toEqual(['artifacts','records','analytics','text','entities','embeddings','geospatial']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(STORAGE_CLASSES.map((c) => c.kind)).size).toBe(STORAGE_CLASSES.length);
  });

  it('binds every class to a fabric that exists', () => {
    const fabrics = new Set(FABRICS.map((f) => f.id));
    for (const c of STORAGE_CLASSES) expect(fabrics.has(c.fabric)).toBe(true);
  });

  it('labels every kind and every state it uses', () => {
    expect(Object.keys(STORE_KIND_LABEL).sort()).toEqual(['GEOSPATIAL','GRAPH','LAKEHOUSE','OBJECT_STORE','RELATIONAL','SEARCH_INDEX','VECTOR']);
    expect(Object.keys(STORAGE_STATE_LABEL).sort()).toEqual(['ABSENT','ADAPTER_READY','FIXTURE','LOCAL_FILES','LOCAL_PILOT']);
    for (const c of STORAGE_CLASSES) {
      expect(STORE_KIND_LABEL[c.kind]).toBeTruthy();
      expect(STORAGE_STATE_LABEL[c.here.state]).toBeTruthy();
    }
  });

  it('offers candidates and distinguishes configured adapters from the local pilot', () => {
    for (const c of STORAGE_CLASSES) expect(c.candidates.length).toBeGreaterThan(0);
    const wired = STORAGE_CLASSES.filter((c) => c.here.state === 'ADAPTER_READY').map((c) => c.kind);
    expect(wired).toEqual(['OBJECT_STORE','RELATIONAL']);
    expect(wired).toEqual([...STORAGE_PRESENT_STATE.wired]);
    expect(STORAGE_CLASSES.filter(c => c.here.state === 'LOCAL_PILOT').map(c => c.id)).toEqual(['analytics']);
    expect(STORAGE_STATE_LABEL.ADAPTER_READY).toContain('deployment unverified');
  });

  /**
   * The honest-state guard, in both directions. A store dependency that appears
   * without a stated adapter fails here, and so does an adapter with no backing
   * application dependency. Python lake dependencies are checked separately;
   * installed packages never establish a running or deployed service.
   */
  it('keeps the declared dependencies and the stated state in step', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    const byKind: Record<StoreKind, RegExp> = {
      RELATIONAL: /^(pg|postgres|drizzle-orm|prisma|typeorm)$/i,
      LAKEHOUSE: /^(duckdb|@duckdb|apache-arrow|trino|delta)/i,
      OBJECT_STORE: /^(@?aws-sdk|minio)/i,
      SEARCH_INDEX: /^(@elastic|@opensearch)/i,
      GRAPH: /^(neo4j|arangojs|memgraph)/i,
      VECTOR: /^(qdrant|@qdrant|milvus|@zilliz|pgvector)/i,
      GEOSPATIAL: /^(postgis)/i,
    };
    for (const c of STORAGE_CLASSES) {
      const backing = declared.filter(d => byKind[c.kind].test(d)).sort();
      const expected = c.kind === 'RELATIONAL' ? ['drizzle-orm','pg'] : c.kind === 'OBJECT_STORE' ? ['@aws-sdk/client-s3'] : [];
      expect(backing, `${c.kind} application dependencies must match the explicitly stated adapter`).toEqual(expected);
      expect(c.here.state === 'ADAPTER_READY').toBe(expected.length > 0);
    }
    expect(STORAGE_PRESENT_STATE.dependencies).toContain('pg and drizzle-orm');
    expect(STORAGE_PRESENT_STATE.dependencies).toContain('@aws-sdk/client-s3');
  });

  it('backs the separate local lake pilot with its pinned Python dependencies, not PostgreSQL npm packages', () => {
    const requirements = readFileSync(new URL('../../tools/terminal_lake/requirements.txt', import.meta.url), 'utf8');
    const lock = readFileSync(new URL('../../tools/terminal_lake/requirements.lock.txt', import.meta.url), 'utf8');
    const pins = (text: string) => Object.fromEntries(text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
      .map(line => { expect(line).toMatch(/^[A-Za-z0-9_\[\],.-]+==[^\s]+$/); const [name, version] = line.split('=='); return [name.toLowerCase().replace(/\[.*\]/, ''), version]; }));
    const direct = pins(requirements), locked = pins(lock);
    expect(direct).toEqual({ pyiceberg: '0.11.1', pyarrow: '21.0.0', sqlalchemy: '2.0.43' });
    for (const [name, version] of Object.entries(direct)) expect(locked[name], `${name} must match the optional Python lock`).toBe(version);
    expect(by(STORAGE_CLASSES, 'analytics').kind).toBe('LAKEHOUSE');
    expect(by(STORAGE_CLASSES, 'analytics').here.state).toBe('LOCAL_PILOT');
    expect(STORAGE_PRESENT_STATE.dependencies).toContain('tools/terminal_lake/requirements.lock.txt');
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
    expect(by('analytics').invariant).toMatch(/Iceberg commit time is neither clock/);
    // An index is derived and rebuildable, never where a fact lives.
    expect(by('text').invariant).toMatch(/never become the place a fact lives/);
  });

  it('sequences adoption behind explicit authority, projection completeness and recovery qualification', () => {
    expect(STORAGE_SEQUENCE.length).toBeGreaterThan(0);
    expect(STORAGE_SEQUENCE.join(' ')).toMatch(/admission/i);
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/admission authority/i);
    // The gate requires declared serving projections; it must not invent
    // metadata or make a timeless claim about which histories were admitted.
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/one door/);
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/never supplies its own authority/);
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/Complete declared serving projections/);
    expect(by(STORAGE_CLASSES, 'records').before).toMatch(/validated readback/);
    expect(by(STORAGE_CLASSES, 'records').before).not.toMatch(/nothing has been admitted|no candidate has yet passed/);
    expect(STORAGE_SEQUENCE.join(' ')).toMatch(/Demonstration and refused histories are not promoted/);
    expect(by(STORAGE_CLASSES, 'entities').before).toMatch(/identity authority/i);
  });

  it('states the connected object path without claiming legacy migration or SOS provider qualification', () => {
    const artifacts = by(STORAGE_CLASSES, 'artifacts');
    expect(artifacts.here.state).toBe('ADAPTER_READY');
    expect(artifacts.here.what).toContain('Opt-in terminal artifact publication');
    expect(artifacts.here.what).toContain('durable PostgreSQL outbox');
    expect(artifacts.here.what).toContain('verified exact-version readback');
    expect(artifacts.here.what).toContain('SOS remains unqualified against the provider');
    expect(artifacts.here.what).toContain('legacy synchronous evidence rail');
    expect(artifacts.here.what).toContain('does not redirect or migrate');
    const service = readFileSync(new URL('../terminal/service.ts', import.meta.url), 'utf8');
    expect(service).toMatch(/if \(claim\.request\.retentionDestination\) await enqueuePublication\(sql/);
    const publication = readFileSync(new URL('../terminal/publication.ts', import.meta.url), 'utf8');
    expect(publication).toContain('this.store.ensure('); expect(publication).toContain('this.store.readReceipt(');
  });

  it('keeps the connected lake bridge fixture-only and distinct from canonical records and retrieval pilots', () => {
    expect(by(STORAGE_CLASSES, 'records').kind).toBe('RELATIONAL');
    const analytics = by(STORAGE_CLASSES, 'analytics');
    expect(analytics.fabric).toBe('projection');
    expect(analytics.here.what).toContain('tools/terminal_lake');
    expect(analytics.here.what).toContain('fixture-only published results');
    expect(analytics.here.what).toContain('fresh-process snapshot readback');
    expect(analytics.here.what).toContain('PostgreSQL derived projection acknowledgement');
    expect(analytics.here.what).toContain('not real-data admission');
    const bridge = readFileSync(new URL('../terminal/lake.ts', import.meta.url), 'utf8');
    expect(bridge).toContain('publishTerminalLake'); expect(bridge).toContain('LAKE_FIXTURE_ONLY');
    expect(bridge).toContain('store.readReceipt('); expect(bridge).toContain("run('read'");
    expect(bridge).toContain('INSERT INTO payload_terminal_lake_receipt');
    expect(by(STORAGE_CLASSES, 'entities').here.state).toBe('FIXTURE');
    expect(by(STORAGE_CLASSES, 'embeddings').here.state).toBe('ABSENT');
    expect(JSON.stringify(STORAGE_CLASSES)).not.toMatch(/GraphRAG|tools\/retrieval|unactivated|not a connected Iceberg publisher/);
    expect(STORAGE_PRESENT_STATE.summary).toContain('Installed dependencies do not prove running services');
  });
});

function by(classes: readonly StorageClass[], id: StorageClass['id']) {
  const found = classes.find((c) => c.id === id);
  if (!found) throw new Error(`no storage class ${id}`);
  return found;
}
