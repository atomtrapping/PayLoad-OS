/**
 * Shared identity is not shared visibility.
 *
 * The substrate's whole value is that one canonical identity for a facility, an
 * organization or a material is used everywhere. The danger arrives with the
 * value: if two customers' records both name the same manufacturer, a system
 * that treats "same entity" as "same context" will show one customer the
 * other's supplier contract, and it will do so through a query that looks
 * entirely reasonable.
 *
 * So identity is shared and nothing else is. A governed scope owns records,
 * permissions and an admission authority; scopes share identifiers across the
 * boundary and share nothing across it.
 *
 * FOUR SURFACES, NOT ONE
 *
 * The boundary applies at retrieval, at computation, at export and at
 * learning. A system that enforces it only at retrieval has a UI-level
 * boundary: the query is refused and the aggregate computed from the same rows
 * is not, the export is blocked and the model fitted on the rows is not. The
 * last surface is the one most often missed and the hardest to undo, because a
 * model that learned from a customer's private constraints carries them
 * wherever it goes and cannot be asked to forget.
 *
 * WHAT "ONE DOOR" MEANS AND DOES NOT
 *
 * One logical admission and commit authority per governed object. Not one
 * server, not one global permission set, not one process writing every record.
 * A firm that read "one door" as "one database" would build the monolith this
 * architecture exists to avoid, and would still not have the property it
 * wanted: the door is about who may admit, not about where the bytes live.
 *
 * THE ASYMMETRY WORTH STATING
 *
 * Scopes are not peers. The reusable corpus can feed anything; nothing feeds
 * the reusable corpus except acquisition. A customer's private scope can
 * consume the corpus and cannot contribute to it, because a customer's
 * confidential constraint becoming reusable inventory is the failure that ends
 * the relationship — and it is a failure that looks, in the moment, like the
 * corpus getting better.
 */
import type { Disclosure } from './responsePipeline';
import type { SourceOperation } from '@/data-os/contracts';

/* ── The scopes ── */

export const SCOPE_CLASSES = [
  'REUSABLE_CORPUS',
  'FIRM_OPERATIONAL',
  'CUSTOMER_PRIVATE',
  'RESEARCH_ACCOUNT',
  'EXECUTION_ACCOUNT',
] as const;
export type ScopeClass = typeof SCOPE_CLASSES[number];

export interface ScopeContract {
  scopeClass: ScopeClass;
  holds: string;
  /** Who the records belong to. The firm, or a named counterparty. */
  holder: 'FIRM' | 'CUSTOMER';
  /** Whether records here may be used to answer another holder's question. */
  reusableAcrossHolders: boolean;
  /** Whether a model may be fitted on records here. */
  mayTrain: boolean;
  /** How much of a permitted row leaves this scope by default. */
  defaultDisclosure: Disclosure;
}

export const SCOPE_CONTRACTS: Readonly<Record<ScopeClass, ScopeContract>> = {
  REUSABLE_CORPUS: {
    scopeClass: 'REUSABLE_CORPUS',
    holds: 'Information the firm is permitted to use across products and customers.',
    holder: 'FIRM',
    reusableAcrossHolders: true,
    mayTrain: true,
    defaultDisclosure: 'FULL',
  },
  FIRM_OPERATIONAL: {
    scopeClass: 'FIRM_OPERATIONAL',
    holds: 'Jobs, quotes, orders, costs, approvals and releases — the firm’s own running.',
    holder: 'FIRM',
    reusableAcrossHolders: false,
    mayTrain: false,
    defaultDisclosure: 'PROVENANCE_ONLY',
  },
  CUSTOMER_PRIVATE: {
    scopeClass: 'CUSTOMER_PRIVATE',
    holds: 'Contracts, inventories, approved counterparties and confidential constraints belonging to one customer.',
    holder: 'CUSTOMER',
    reusableAcrossHolders: false,
    mayTrain: false,
    defaultDisclosure: 'FULL',
  },
  RESEARCH_ACCOUNT: {
    scopeClass: 'RESEARCH_ACCOUNT',
    holds: 'Hypotheses, backtests and paper positions. Nothing here has moved money.',
    holder: 'FIRM',
    reusableAcrossHolders: false,
    mayTrain: true,
    defaultDisclosure: 'PROVENANCE_ONLY',
  },
  EXECUTION_ACCOUNT: {
    scopeClass: 'EXECUTION_ACCOUNT',
    holds: 'Live positions, orders and receipts. Everything here has moved money.',
    holder: 'FIRM',
    reusableAcrossHolders: false,
    mayTrain: false,
    defaultDisclosure: 'PROVENANCE_ONLY',
  },
};

export function scopeContract(scopeClass: ScopeClass): ScopeContract {
  const found = SCOPE_CONTRACTS[scopeClass];
  if (!found) throw new Error(`SCOPE_UNKNOWN_CLASS:${scopeClass}`);
  return found;
}

/** The classes whose holder is a named counterparty rather than the firm. */
export const HOLDER_PARTITIONED: readonly ScopeClass[] =
  SCOPE_CLASSES.filter((cls) => SCOPE_CONTRACTS[cls].holder === 'CUSTOMER');

/** The classes a model may be fitted on. */
export const TRAINABLE_SCOPES: readonly ScopeClass[] =
  SCOPE_CLASSES.filter((cls) => SCOPE_CONTRACTS[cls].mayTrain);

export const IDENTITY_RULE =
  'Scopes share entity identifiers and share nothing else. Two scopes naming the same manufacturer are not two views of one record set, and a query that treats them as one is the failure this module exists to refuse.';

/* ── Where the boundary applies ── */

export const BOUNDARY_SURFACES = ['RETRIEVAL', 'COMPUTATION', 'EXPORT', 'LEARNING'] as const;
export type BoundarySurface = typeof BOUNDARY_SURFACES[number];

export const SURFACE_MEANING: Readonly<Record<BoundarySurface, string>> = {
  RETRIEVAL: 'Reading a record. The obvious one, and the only one a UI-level boundary covers.',
  COMPUTATION: 'Deriving anything from a record. An aggregate over rows a caller may not read is a leak with arithmetic in front of it.',
  EXPORT: 'Anything leaving. A file, a feed, a dossier, a message.',
  LEARNING: 'Fitting a model on a record. The hardest to undo, because a model that learned a customer’s constraint carries it wherever it goes.',
};

export const FOUR_SURFACES_RULE =
  'The boundary applies at retrieval, computation, export and learning. Enforced only at retrieval it is a user-interface boundary: the query is refused and the aggregate over the same rows is not.';

/* ── The door ── */

export const ONE_DOOR_RULE =
  'One logical admission and commit authority per governed object. Not one server, not one global permission set, and not one process writing every record — the door is about who may admit, not about where the bytes live.';

export const ONE_DOOR_IS_NOT: readonly string[] = [
  'one server', 'one global permission set', 'one process writing every record', 'one database',
];

/* ── Permitted flows ── */

export interface ScopeFlow {
  from: ScopeClass;
  to: ScopeClass;
  why: string;
}

/**
 * Which scope's records may become inputs to which scope's outputs.
 *
 * Deliberately sparse, and deliberately asymmetric. The reusable corpus feeds
 * everything and is fed by nothing here, because acquisition is the only way
 * into it; a customer's private scope consumes and does not contribute.
 *
 * Note what is absent: there is no flow from RESEARCH_ACCOUNT to anything a
 * customer sees, and none from CUSTOMER_PRIVATE anywhere at all.
 */
export const PERMITTED_FLOWS: readonly ScopeFlow[] = [
  { from: 'REUSABLE_CORPUS', to: 'FIRM_OPERATIONAL', why: 'The firm runs on the corpus it maintains.' },
  { from: 'REUSABLE_CORPUS', to: 'CUSTOMER_PRIVATE', why: 'A customer’s dossier is compiled from reusable evidence.' },
  { from: 'REUSABLE_CORPUS', to: 'RESEARCH_ACCOUNT', why: 'Research reads the corpus like any other consumer.' },
  { from: 'FIRM_OPERATIONAL', to: 'REUSABLE_CORPUS', why: 'The firm’s own observations are admitted like anyone’s, through the door.' },
  { from: 'RESEARCH_ACCOUNT', to: 'EXECUTION_ACCOUNT', why: 'A researched strategy may be authorized into a live account. This is the only flow that crosses from paper into money.' },
];

/**
 * The one that matters commercially, stated because it is the flow whose
 * absence a well-meaning engineer will eventually try to add.
 */
export const NO_CUSTOMER_CONTRIBUTION_RULE =
  'Nothing flows out of a customer-private scope. A customer’s confidential constraint becoming reusable inventory is the failure that ends the relationship, and in the moment it looks like the corpus getting better.';

/**
 * And the one that separates paper from money. It is permitted, and it is the
 * only permitted crossing, which is why it is the flow worth testing.
 */
export const PAPER_TO_LIVE_RULE =
  'Research may reach a live account and nothing else may. That crossing is a permitted flow rather than an absent one, so it is the only place the flow rule is the sole thing standing between two scopes — and therefore the only place a test of it proves anything.';

export function flowPermitted(from: ScopeClass, to: ScopeClass): boolean {
  return PERMITTED_FLOWS.some((flow) => flow.from === from && flow.to === to);
}

/* ── Rights inheritance across a scope ── */

/**
 * A derived artifact carries the narrowest permission of everything it read —
 * which `src/domain/discoveryLayer.ts` already computes for source rights. This
 * adds the orthogonal question: not what the sources permit, but whose records
 * they were.
 *
 * Both apply. A record may be rights-clear and still belong to a scope that
 * cannot reach the caller.
 */
export const TWO_GATES_RULE =
  'Source rights and scope membership are two independent gates and both apply. A record whose licence permits redistribution still does not leave a scope the caller has no standing in, and a record in a scope the caller holds still does not leave if its licence forbids it.';

/** Learning is the surface with its own rule, because it cannot be undone. */
export function mayTrainOn(scopeClass: ScopeClass): boolean {
  return SCOPE_CONTRACTS[scopeClass].mayTrain;
}

export const LEARNING_RULE =
  'A model is fitted only on scopes that permit training. A customer’s private records are not training data, and a live execution account’s records are not either — the second because a model fitted on the firm’s own fills learns the firm’s own market impact and calls it signal.';

/** The operation a scope-crossing read is, in the vocabulary the policy already evaluates. */
export const CROSSING_OPERATION: SourceOperation = 'DERIVE';

/* ── Standing ── */

export interface GovernedScope {
  scopeId: string;
  scopeClass: ScopeClass;
  holderId: string;
}

/** None. No customer is onboarded and no account is opened. */
export const GOVERNED_SCOPES: readonly GovernedScope[] = [];

export const SCOPE_BLOCKED_ON: readonly string[] = [
  'No customer-private scope exists, because no customer is onboarded.',
  'No research or execution account is opened.',
  'The reusable corpus holds zero admitted records.',
];

export function scopeStanding(scopes: readonly GovernedScope[] = GOVERNED_SCOPES) {
  const byClass = Object.fromEntries(
    SCOPE_CLASSES.map((cls) => [cls, scopes.filter((scope) => scope.scopeClass === cls).length]),
  ) as Record<ScopeClass, number>;
  return {
    scopes: scopes.length,
    byClass,
    holders: new Set(scopes.map((scope) => scope.holderId)).size,
    customerScopes: scopes.filter((scope) => SCOPE_CONTRACTS[scope.scopeClass].holder === 'CUSTOMER').length,
    surfaces: BOUNDARY_SURFACES.length,
    permittedFlows: PERMITTED_FLOWS.length,
    /* The count that should stay at zero forever. */
    flowsOutOfCustomerScopes: PERMITTED_FLOWS.filter((flow) => flow.from === 'CUSTOMER_PRIVATE').length,
    blockedOn: scopes.length > 0 ? [] : [...SCOPE_BLOCKED_ON],
    coverage: scopes.length === 0 ? 'CONTRACT_ONLY_NO_SCOPE_OPENED' : 'SCOPES_PRESENT',
  } as const;
}
