/**
 * Reading and writing the identity-and-place chain.
 *
 * The constraints live in the schema (`siteAtlas.ts`), which is what makes them
 * true of every writer. This is a writer over them, and its job is to refuse
 * the same things by name, early, so a caller gets
 * `ATLAS_ASSERTION_WITHOUT_EVIDENCE` rather than a Postgres constraint string —
 * and so the two agree. `siteAtlas.test.ts` proves both halves: that this
 * refuses, and that the database refuses the same write when this is bypassed.
 *
 * DORMANT, AND THE HEADER USED TO SAY OTHERWISE.
 *
 * It said "the writer the application uses". No application uses it: the only
 * importer anywhere is `siteAtlas.test.ts`, no database is configured, and the
 * atlas holds zero nodes and zero links. That is the expected state for a
 * module written the day before this note — but a header that claims a caller
 * it does not have is the kind of statement this repository exists to refuse,
 * and it was found by an audit reading the header rather than the imports.
 *
 * Wiring it means a reader for the chain: the six positions around a facility
 * with `readChain`'s five states per step, which is the one thing here the DDL
 * cannot express — a CHECK constrains a write, and a reported gap is a
 * property of a read.
 *
 * THE READER'S ONE RULE
 *
 * `readChain` walks the six positions around a facility and reports what it
 * found at each step, including what it did not find. A chain with a missing
 * link comes back with that step marked and everything past it `UNREACHABLE` —
 * never quietly shortened, never bridged. That is the difference between "we
 * do not know who operates this parcel" and "nobody operates this parcel", and
 * between either of those and a graph that looks continuous because the gap
 * was skipped.
 */
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import * as schema from './schema';
import {
  SITE_COVERAGE_LEVELS, SITE_LINK_STEPS, SITE_NODE_KINDS,
  type SiteLinkStanding, type SiteNodeKind,
} from './siteAtlas';

export type AtlasDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

const text = z.string().trim().min(1);
const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'not an instant');

/** One reason to believe a link. The store requires a source; the rest is what that source gave. */
export const evidenceReference = z.object({
  sourceId: text,
  artifactDigest: text.optional(),
  recordId: text.optional(),
  note: text.optional(),
}).strict();
export type EvidenceReference = z.infer<typeof evidenceReference>;

const nodeInput = z.object({
  nodeId: text,
  kind: z.enum(SITE_NODE_KINDS),
  label: text,
  jurisdiction: text.nullish(),
  coverageLevel: z.enum(SITE_COVERAGE_LEVELS as [string, ...string[]]),
  knownAt: instant,
  data: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type SiteNodeInput = z.infer<typeof nodeInput>;

const linkBase = {
  linkId: text,
  from: z.object({ nodeId: text, kind: z.enum(SITE_NODE_KINDS) }).strict(),
  to: z.object({ nodeId: text, kind: z.enum(SITE_NODE_KINDS) }).strict(),
  validFrom: instant,
  validTo: instant.nullish(),
  knownAt: instant,
};

const proposal = z.object({ ...linkBase, evidence: z.array(evidenceReference).optional() }).strict();
const assertion = z.object({ ...linkBase, evidence: z.array(evidenceReference).min(1) }).strict();
export type LinkProposal = z.infer<typeof proposal>;
export type LinkAssertion = z.infer<typeof assertion>;

const STEP_SET = new Set(SITE_LINK_STEPS.map(([from, to]) => `${from}>${to}`));

/** The refusals this store makes by name, so a caller can act on which one it was. */
export const ATLAS_REFUSALS = [
  'ATLAS_INVALID_INPUT',
  'ATLAS_LINK_IS_NOT_ONE_STEP',
  'ATLAS_LINK_TO_ITSELF',
  'ATLAS_ASSERTION_WITHOUT_EVIDENCE',
  'ATLAS_REFUSAL_WITHOUT_REASON',
  'ATLAS_INTERVAL_ENDS_BEFORE_IT_STARTS',
] as const;

function parse<T>(shape: z.ZodType<T>, value: unknown): T {
  const result = shape.safeParse(value);
  if (!result.success) throw new Error('ATLAS_INVALID_INPUT');
  return result.data;
}

function checkStep(from: SiteNodeKind, to: SiteNodeKind, fromId: string, toId: string): void {
  if (fromId === toId) throw new Error('ATLAS_LINK_TO_ITSELF');
  if (!STEP_SET.has(`${from}>${to}`)) throw new Error('ATLAS_LINK_IS_NOT_ONE_STEP');
}

function checkInterval(validFrom: string, validTo: string | null | undefined): void {
  if (validTo != null && Date.parse(validTo) <= Date.parse(validFrom)) {
    throw new Error('ATLAS_INTERVAL_ENDS_BEFORE_IT_STARTS');
  }
}

export async function putNode(db: AtlasDatabase, input: SiteNodeInput): Promise<void> {
  const node = parse(nodeInput, input);
  await db.insert(schema.siteNodes).values({
    nodeId: node.nodeId, kind: node.kind, label: node.label,
    jurisdiction: node.jurisdiction ?? null,
    coverageLevel: node.coverageLevel, knownAt: node.knownAt, data: node.data ?? {},
  }).onConflictDoUpdate({
    target: schema.siteNodes.nodeId,
    // The kind is not updatable here: a node that changed kind is a different
    // object, and quietly rewriting it would move every link that points at it.
    set: { label: node.label, jurisdiction: node.jurisdiction ?? null, coverageLevel: node.coverageLevel, knownAt: node.knownAt, data: node.data ?? {} },
  });
}

/**
 * Record a link that has been proposed and not decided.
 *
 * This is the row an identity-resolution pass writes when a name matches and
 * nothing yet establishes that the match is the same object. It is retained,
 * counted by `unresolvedMatches`, and never promoted by anything but an
 * assertion carrying evidence.
 */
export async function proposeLink(db: AtlasDatabase, input: LinkProposal): Promise<void> {
  const link = parse(proposal, input);
  checkStep(link.from.kind, link.to.kind, link.from.nodeId, link.to.nodeId);
  checkInterval(link.validFrom, link.validTo);
  await writeLink(db, link, 'CANDIDATE', link.evidence ?? [], null);
}

/** Record a link as established. Refused without at least one evidence reference. */
export async function assertLink(db: AtlasDatabase, input: LinkAssertion): Promise<void> {
  const result = assertion.safeParse(input);
  if (!result.success) {
    // The distinction matters to a caller: a missing basis is a different
    // problem from a malformed request, and only one of them is fixable by
    // finding a document.
    const evidenceFailed = result.error.issues.some((issue) => issue.path[0] === 'evidence');
    throw new Error(evidenceFailed ? 'ATLAS_ASSERTION_WITHOUT_EVIDENCE' : 'ATLAS_INVALID_INPUT');
  }
  const link = result.data;
  checkStep(link.from.kind, link.to.kind, link.from.nodeId, link.to.nodeId);
  checkInterval(link.validFrom, link.validTo);
  await writeLink(db, link, 'ASSERTED', link.evidence, null);
}

/** Record that a proposed link was considered and rejected. Refused without a reason. */
export async function refuseLink(
  db: AtlasDatabase,
  input: LinkProposal & { reason: string },
): Promise<void> {
  // The reason is checked before the rest is parsed. `proposal` is strict and
  // would otherwise reject the extra key, reporting a malformed request when
  // the actual problem is a refusal nobody gave a reason for.
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length === 0) throw new Error('ATLAS_REFUSAL_WITHOUT_REASON');
  const { reason: _reason, ...rest } = input;
  void _reason;
  const link = parse(proposal, rest);
  checkStep(link.from.kind, link.to.kind, link.from.nodeId, link.to.nodeId);
  checkInterval(link.validFrom, link.validTo);
  await writeLink(db, link, 'REFUSED', link.evidence ?? [], reason);
}

async function writeLink(
  db: AtlasDatabase, link: LinkProposal, standing: SiteLinkStanding,
  evidence: readonly EvidenceReference[], refusalReason: string | null,
): Promise<void> {
  await db.insert(schema.siteLinks).values({
    linkId: link.linkId,
    fromNode: link.from.nodeId, fromKind: link.from.kind,
    toNode: link.to.nodeId, toKind: link.to.kind,
    standing, evidence: [...evidence], refusalReason,
    validFrom: link.validFrom, validTo: link.validTo ?? null,
    knownAt: link.knownAt, decidedAt: standing === 'CANDIDATE' ? null : link.knownAt,
  }).onConflictDoUpdate({
    target: schema.siteLinks.linkId,
    set: { standing, evidence: [...evidence], refusalReason, decidedAt: standing === 'CANDIDATE' ? null : link.knownAt },
  });
}

export type ChainStepState = 'ASSERTED' | 'ONLY_CANDIDATES' | 'ONLY_REFUSED' | 'NO_LINK' | 'UNREACHABLE';

export interface ChainStep {
  from: SiteNodeKind;
  to: SiteNodeKind;
  state: ChainStepState;
  linkId: string | null;
  /** The node reached at this step, or null when the step did not resolve. */
  nodeId: string | null;
  label: string | null;
  evidenceCount: number;
}

export interface ChainReading {
  start: { nodeId: string; kind: SiteNodeKind } | null;
  /** One entry per position, in chain order; null where nothing was reached. */
  positions: Array<{ kind: SiteNodeKind; nodeId: string | null; label: string | null }>;
  /** The five steps, upward and downward, each with what was found. */
  steps: ChainStep[];
  /** True only when every step resolved to an asserted link. */
  complete: boolean;
  /** The knowledge time the reading was taken at. Nothing later than this was considered. */
  knownBy: string;
}

/**
 * Walk the chain around one node, as of a knowledge time.
 *
 * Upward from the start to the legal entity, downward to the network
 * connection. Each step reports its own state, and a step that does not
 * resolve makes every step past it `UNREACHABLE` rather than being skipped:
 * the reading is a description of what is known, and a shorter chain that
 * looked continuous would be a description of something else.
 */
export async function readChain(
  db: AtlasDatabase,
  start: { nodeId: string; kind: SiteNodeKind },
  knownBy: string,
): Promise<ChainReading> {
  const startIndex = SITE_NODE_KINDS.indexOf(start.kind);
  const positions: ChainReading['positions'] = SITE_NODE_KINDS.map((kind) => ({ kind, nodeId: null, label: null }));
  const steps: ChainStep[] = [];

  const startNode = await db.select().from(schema.siteNodes)
    .where(and(eq(schema.siteNodes.nodeId, start.nodeId), eq(schema.siteNodes.kind, start.kind))).limit(1);
  if (startNode.length === 0) {
    return { start: null, positions, steps: [], complete: false, knownBy };
  }
  positions[startIndex] = { kind: start.kind, nodeId: start.nodeId, label: startNode[0].label };

  // Upward: for each step above the start, the node we hold is the link's `to`.
  let current: string | null = start.nodeId;
  for (let index = startIndex; index > 0; index -= 1) {
    const step = await resolveStep(db, SITE_NODE_KINDS[index - 1], SITE_NODE_KINDS[index], current, 'to', knownBy);
    steps.unshift(step);
    current = step.nodeId;
    if (step.nodeId) positions[index - 1] = { kind: SITE_NODE_KINDS[index - 1], nodeId: step.nodeId, label: step.label };
  }

  // Downward: the node we hold is the link's `from`.
  current = start.nodeId;
  for (let index = startIndex; index < SITE_NODE_KINDS.length - 1; index += 1) {
    const step = await resolveStep(db, SITE_NODE_KINDS[index], SITE_NODE_KINDS[index + 1], current, 'from', knownBy);
    steps.push(step);
    current = step.nodeId;
    if (step.nodeId) positions[index + 1] = { kind: SITE_NODE_KINDS[index + 1], nodeId: step.nodeId, label: step.label };
  }

  return {
    start,
    positions,
    steps,
    complete: steps.length === SITE_LINK_STEPS.length && steps.every((step) => step.state === 'ASSERTED'),
    knownBy,
  };
}

async function resolveStep(
  db: AtlasDatabase, from: SiteNodeKind, to: SiteNodeKind,
  anchor: string | null, anchorSide: 'from' | 'to', knownBy: string,
): Promise<ChainStep> {
  const empty = { from, to, linkId: null, nodeId: null, label: null, evidenceCount: 0 };
  // A step whose anchor was never reached cannot be looked up, and saying so is
  // the whole point: the absence is upstream, not here.
  if (anchor === null) return { ...empty, state: 'UNREACHABLE' };

  const anchorColumn = anchorSide === 'to' ? schema.siteLinks.toNode : schema.siteLinks.fromNode;
  const rows = await db.select().from(schema.siteLinks)
    .where(and(
      eq(anchorColumn, anchor),
      eq(schema.siteLinks.fromKind, from),
      eq(schema.siteLinks.toKind, to),
      lte(schema.siteLinks.knownAt, knownBy),
    ))
    .orderBy(desc(schema.siteLinks.knownAt));

  if (rows.length === 0) return { ...empty, state: 'NO_LINK' };
  const asserted = rows.find((row) => row.standing === 'ASSERTED');
  if (!asserted) {
    return { ...empty, state: rows.some((row) => row.standing === 'CANDIDATE') ? 'ONLY_CANDIDATES' : 'ONLY_REFUSED' };
  }

  const reached = anchorSide === 'to' ? asserted.fromNode : asserted.toNode;
  const node = await db.select().from(schema.siteNodes).where(eq(schema.siteNodes.nodeId, reached)).limit(1);
  return {
    from, to, state: 'ASSERTED', linkId: asserted.linkId, nodeId: reached,
    label: node[0]?.label ?? null,
    evidenceCount: Array.isArray(asserted.evidence) ? asserted.evidence.length : 0,
  };
}

/**
 * The unresolved matches, which is one of the measures the programme is judged
 * by. They are rows, so this is a count of things retained rather than an
 * estimate of things missing.
 */
export async function unresolvedMatches(db: AtlasDatabase) {
  return db.select({
    linkId: schema.siteLinks.linkId,
    fromNode: schema.siteLinks.fromNode, fromKind: schema.siteLinks.fromKind,
    toNode: schema.siteLinks.toNode, toKind: schema.siteLinks.toKind,
    knownAt: schema.siteLinks.knownAt,
  }).from(schema.siteLinks)
    .where(eq(schema.siteLinks.standing, 'CANDIDATE'))
    .orderBy(schema.siteLinks.knownAt);
}

/**
 * What the atlas actually holds, derived from the rows.
 *
 * Nothing here is a stored total. `assertedLinks` cannot exceed the links that
 * carry evidence, because the database will not store one that does not.
 */
export async function atlasCoverage(db: AtlasDatabase) {
  const nodes = await db.select({
    kind: schema.siteNodes.kind,
    coverageLevel: schema.siteNodes.coverageLevel,
    count: sql<number>`count(*)::int`,
  }).from(schema.siteNodes).groupBy(schema.siteNodes.kind, schema.siteNodes.coverageLevel);

  const links = await db.select({
    standing: schema.siteLinks.standing,
    count: sql<number>`count(*)::int`,
  }).from(schema.siteLinks).groupBy(schema.siteLinks.standing);

  const byStanding = (standing: SiteLinkStanding) => links.find((row) => row.standing === standing)?.count ?? 0;
  const byLevel = (level: string) => nodes.filter((row) => row.coverageLevel === level).reduce((total, row) => total + row.count, 0);

  return {
    nodes: nodes.reduce((total, row) => total + row.count, 0),
    byKind: Object.fromEntries(SITE_NODE_KINDS.map((kind) => [kind, nodes.filter((row) => row.kind === kind).reduce((total, row) => total + row.count, 0)])),
    byCoverageLevel: Object.fromEntries(SITE_COVERAGE_LEVELS.map((level) => [level, byLevel(level)])),
    assertedLinks: byStanding('ASSERTED'),
    unresolvedMatches: byStanding('CANDIDATE'),
    refusedLinks: byStanding('REFUSED'),
  };
}

/** Every node of a kind, for the surfaces that list before they walk. */
export async function nodesOfKind(db: AtlasDatabase, kinds: readonly SiteNodeKind[]) {
  if (kinds.length === 0) return [];
  return db.select().from(schema.siteNodes).where(inArray(schema.siteNodes.kind, [...kinds])).orderBy(schema.siteNodes.label);
}
