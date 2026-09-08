/**
 * Structural doctrine, tested. Three rules that the code layout must keep:
 * browser and application layers take only types from the rails (they can
 * describe a capture, never perform one); the rails depend on nothing above
 * them (they can produce no corpus record); and every projection of the
 * corpus, the feed and the tools included, leaves its source untouched and
 * its referents' identities intact. Node only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isBuiltin } from 'node:module';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { asOfPayload, recordsPayload, releaseManifestPayload, releasePayload, releasesPayload, retractionsPayload, rulingManifestPayload, rulingPayload } from '@/adapter/feed';
import { MCP_TOOLS, runMcpTool } from '@/mcp/tools';
import { FIXTURE_CASES, FIXTURE_CORPORA, FIXTURE_PROFILES } from '@/fixtures/index';
import { CARAVAN_CORPUS, CARAVAN_RELEASES } from '@/fixtures/caravan/release';

const ROOT = resolve(process.cwd());

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(relative(ROOT, path).replace(/\\/g, '/'));
  }
  return out;
}

/** Layers that run in the browser or render pages. Route handlers are server code and are not held to this rule. */
function browserAndPageFiles(): string[] {
  const files = [...walk(join(ROOT, 'src/domain')), ...walk(join(ROOT, 'src/components')), ...walk(join(ROOT, 'src/adapter')), ...walk(join(ROOT, 'src/lib')), ...walk(join(ROOT, 'src/fixtures'))];
  for (const f of walk(join(ROOT, 'src/app'))) if (/\/(page|layout|loading|error|not-found)\.tsx$/.test(f)) files.push(f);
  const nodeOnlyByDesign = new Set(['src/fixtures/production/pipeline.ts']);
  return files.filter((f) => !nodeOnlyByDesign.has(f));
}

// Parse the actual import graph: spelling an import relatively, using double
// quotes, re-exporting, or loading dynamically must not bypass a layer rule.
function moduleEdges(file: string, text = readFileSync(join(ROOT, file), 'utf8')) {
  const edges: Array<{ target: string; typeOnly: boolean }> = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function add(specifier: ts.Expression | undefined, typeOnly: boolean) {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return;
    const name = specifier.text;
    const target = name.startsWith('@/') ? `src/${name.slice(2)}`
      : name.startsWith('.') ? relative(ROOT, resolve(ROOT, dirname(file), name)).replace(/\\/g, '/') : name;
    edges.push({ target: target.replace(/\.(?:[cm]?[jt]sx?)$/, ''), typeOnly });
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      add(node.moduleSpecifier, Boolean(clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((entry) => entry.isTypeOnly))));
    } else if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      add(node.moduleSpecifier, node.isTypeOnly || Boolean(clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((entry) => entry.isTypeOnly)));
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      add(node.arguments[0], false);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, node.isTypeOnly);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, true);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return edges;
}

/**
 * The rail modules a browser or page layer may run: the contracts (types) and
 * the source-use evaluator, a pure decision over a declared registration that
 * the rights matrix computes cell by cell. Capture, parsing, normalization,
 * building and every file operation stay out.
 */
const PURE_RAIL_MODULES = new Set(['src/data-os/contracts', 'src/data-os/source-policy']);

describe('layer boundaries', () => {
  it('recognizes relative, re-exported, dynamic and type-only module edges', () => {
    expect(moduleEdges('src/domain/example.ts', `
      import { capture } from "../data-os/evidence-capture";
      export * from '@/data-os/local-intake';
      const load = () => import('../data-os/local-normalization');
      const legacy = require('../data-os/file-object-store');
      import type { Corpus } from './corpus';
      import { type SourceRegistration } from '@/data-os/contracts';
      export { type UseRequest } from '@/data-os/source-policy';
      type Capture = import('../data-os/evidence-capture').CaptureResult;
      import old = require('../data-os/local-candidate-build');
    `)).toEqual([
      { target: 'src/data-os/evidence-capture', typeOnly: false },
      { target: 'src/data-os/local-intake', typeOnly: false },
      { target: 'src/data-os/local-normalization', typeOnly: false },
      { target: 'src/data-os/file-object-store', typeOnly: false },
      { target: 'src/domain/corpus', typeOnly: true },
      { target: 'src/data-os/contracts', typeOnly: true },
      { target: 'src/data-os/source-policy', typeOnly: true },
      { target: 'src/data-os/evidence-capture', typeOnly: true },
      { target: 'src/data-os/local-candidate-build', typeOnly: false },
    ]);
  });

  it('browser and page layers take only types and the pure policy evaluator from the rails: they can describe a capture, never perform one', () => {
    const offenders: string[] = [];
    for (const file of browserAndPageFiles()) {
      for (const edge of moduleEdges(file)) if (edge.target.startsWith('src/data-os/') && !edge.typeOnly && !PURE_RAIL_MODULES.has(edge.target)) offenders.push(`${file} → ${edge.target}`);
    }
    expect(offenders).toEqual([]);
  });

  it('one door writes canonical records, and the seeder is the only other writer of that table', () => {
    // storage.ts names the risk this closes: the records table is
    // canonical-shaped, so an unadmitted candidate written into it would be
    // indistinguishable from a version. Only src/db/admitRecords.ts may write
    // an admitted row; scripts/seed-db.ts writes DEMONSTRATION rows and says
    // so in the column. Any third writer is a hole.
    const writers: string[] = [];
    for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'scripts'))]) {
      if (file === 'src/db/admitRecords.ts' || file === 'scripts/seed-db.ts') continue;
      const text = readFileSync(join(ROOT, file), 'utf8');
      if (/\binsert\(\s*records\s*\)/.test(text)) writers.push(file);
    }
    expect(writers).toEqual([]);

    // And the sanctioned door cannot supply its own authority: it takes one.
    const door = readFileSync(join(ROOT, 'src/db/admitRecords.ts'), 'utf8');
    expect(door).toMatch(/authority: string/);
    expect(door).not.toMatch(/authority:\s*['"`]/);
    // The seeder stamps DEMONSTRATION and never a provenance the gate emits.
    const seeder = readFileSync(join(ROOT, 'scripts/seed-db.ts'), 'utf8');
    expect(seeder).toMatch(/provenance:\s*'DEMONSTRATION'/);
    expect(seeder).not.toMatch(/'LIVE_CAPTURE'|'BACKFILLED'/);
  });

  it('the README states no count that is an accident of file organisation, and pins the one that is a designed claim', () => {
    // First version of this test pinned the domain-module count. The parallel
    // session added five modules within one merge and it broke — which is
    // churn, not a finding. A file count is not a claim about the system; it
    // is a fact about a directory, and stating it in prose guarantees drift
    // without buying anything.
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    expect(readme, 'the README states a domain-module count again').not.toMatch(/\d+ domain modules/);

    // The negative-state count is different in kind: "this one has seven" is
    // the argument, not an inventory. An eighth rule without updating the
    // sentence that argues seven is the point would be the claim ageing.
    const negativeRules = (readFileSync(join(ROOT, 'src/domain/negativeStates.ts'), 'utf8').match(/^\s{4}id: '/gm) ?? []).length;
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    expect(readme, `negativeStates.ts carries ${negativeRules} rules and the README does not say so`)
      .toContain(`this one has ${words[negativeRules]},`);
  });

  it('the pure policy evaluator and its helpers touch no node builtin, so allowing them in the browser is safe', () => {
    for (const file of ['src/data-os/source-policy.ts', 'src/data-os/validation.ts', 'src/data-os/contracts.ts']) {
      for (const edge of moduleEdges(file)) expect(isBuiltin(edge.target), `${file} imports ${edge.target}`).toBe(false);
    }
  });

  it('the rails depend on nothing above them, so they can produce no corpus record, case or payload', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src/data-os'))) {
      for (const edge of moduleEdges(file)) if (/^src\/(domain|fixtures|adapter|components|app|mcp|coordination)\//.test(edge.target)) offenders.push(`${file} → ${edge.target}`);
    }
    expect(offenders).toEqual([]);
  });

  it('libraries and other CLIs do not import command entrypoints for shared utilities', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      for (const edge of moduleEdges(file)) if (/^src\/.*(?:\/cli|-cli)$/.test(edge.target) && !edge.typeOnly) offenders.push(`${file} → ${edge.target}`);
    }
    expect(offenders).toEqual([]);
  });
});

const RELEASE = 'REL-CAR-2026.09.01';
const ASOF = { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-09-01T12:00:00Z', question: 'WHAT_WE_HELD' } as const;

async function projectEverything() {
  const feed = await Promise.all([
    releasesPayload(), releasePayload(RELEASE), releaseManifestPayload(RELEASE),
    recordsPayload(RELEASE, 'COUNTERPARTY_SHARED'), recordsPayload(RELEASE, 'PUBLIC_RULING'),
    retractionsPayload(undefined, 'COUNTERPARTY_SHARED'), asOfPayload(RELEASE, ASOF),
    rulingPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED'), rulingManifestPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED'),
  ]);
  const args: Record<string, unknown> = {
    list_releases: {}, get_release: { releaseId: RELEASE }, get_release_manifest: { releaseId: RELEASE }, list_records: { releaseId: RELEASE },
    query_as_of: { releaseId: RELEASE, subject: ASOF.subjectId, predicate: ASOF.predicate, validAt: ASOF.validAt, knownAt: ASOF.knownAt, question: 'WHAT_WE_HELD' },
    list_retractions: {}, get_ruling: { rulingId: 'RUL-7C104-r2' }, get_ruling_manifest: { rulingId: 'RUL-7C104-r2' },
    get_factoring_receipt: { receiptId: 'RCP-FACT-2026-0901' }, verify_factoring_receipt: { receiptId: 'RCP-FACT-2026-0901' },
    get_dispatch_event: { decisionId: 'DISP-EVT-2026-0803' }, replay_dispatch_liability: { decisionId: 'DISP-EVT-2026-0803' },
  };
  const tools: Record<string, unknown> = {};
  for (const t of MCP_TOOLS) tools[t.name] = await runMcpTool(t.name, args[t.name]);
  return { feed, tools };
}

describe('projection never mutates its source', () => {
  it('the corpus, releases, cases and profiles are identical before and after every feed payload and every MCP tool', async () => {
    const before = JSON.stringify({ CARAVAN_CORPUS, CARAVAN_RELEASES, FIXTURE_CORPORA, FIXTURE_CASES, FIXTURE_PROFILES });
    const first = await projectEverything();
    const after = JSON.stringify({ CARAVAN_CORPUS, CARAVAN_RELEASES, FIXTURE_CORPORA, FIXTURE_CASES, FIXTURE_PROFILES });
    expect(after).toBe(before);
    const second = await projectEverything();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('identity survives representation changes', () => {
  it('a record keeps the same notation:// identity in the records feed, the as-of answer and the MCP results', async () => {
    const feed = (await recordsPayload(RELEASE, 'COUNTERPARTY_SHARED'))!;
    const tool = (await runMcpTool('list_records', { releaseId: RELEASE })) as typeof feed;
    expect(feed.records.length).toBeGreaterThan(5);
    const byId = new Map(feed.records.map((r) => [r.recordId, r.canonicalId]));
    for (const r of tool.records) expect(r.canonicalId, r.recordId).toBe(byId.get(r.recordId));
    for (const r of feed.records) {
      expect(r.canonicalId).toMatch(/^notation:\/\//);
      expect(r.subject.canonicalId).toMatch(/^notation:\/\//);
    }
    const asOf = (await asOfPayload(RELEASE, ASOF))!;
    expect(asOf.answer).not.toBeNull();
    expect(asOf.answer!.canonicalId).toBe(byId.get(asOf.answer!.recordId));
    const viaTool = (await runMcpTool('query_as_of', { releaseId: RELEASE, subject: ASOF.subjectId, predicate: ASOF.predicate, validAt: ASOF.validAt, knownAt: ASOF.knownAt, question: 'WHAT_WE_HELD' })) as typeof asOf;
    expect(viaTool.answer!.canonicalId).toBe(asOf.answer!.canonicalId);
  });
});
