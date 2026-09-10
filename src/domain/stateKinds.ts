/**
 * "State" means three different things, and collapsing them is the failure.
 *
 * The word appears in every layer of this system — `firmControlPlane.ts` lists
 * it among PayloadOS's materials — and until now nothing defined it. That is
 * survivable while the system only describes things and becomes expensive the
 * moment it acts, because the three meanings have different truth conditions
 * and only one of them is about the world.
 *
 * PHYSICAL STATE: what the world is doing
 *
 *   x_t = (L_t, K_t, F_t, M_t)
 *
 * Land conditions, productive capacity and inventories, physical flows, market
 * conditions. It evolves whether or not anybody observes it, and no row in any
 * database is it. A parcel is rezoned at the moment the council votes, not at
 * the moment the filing is published.
 *
 * ESTIMATED STATE: what the evidence supports
 *
 *   x̂_{t|τ} = E_θ(E_{≤τ})
 *
 * Two clocks, and they are not the same clock. `t` is the period being
 * described; `τ` is the time by which the evidence was available. A filing
 * obtained today may describe a transaction last month — and a correction
 * arriving next week changes what the system knows about that transaction. It
 * does not move the transaction into the present.
 *
 * That is why a superseding estimate must carry a strictly later evidence time
 * and the SAME described period. An estimate that "corrects" a figure by
 * quietly restating which month it is about has not corrected anything; it has
 * answered a different question and kept the old question's audience.
 *
 * An estimate also carries what it was fitted with and where it stops applying.
 * The second is the one nothing in this repository had: a horizon bounds the
 * forward reach of a prediction and says nothing about regime, region,
 * population or extrapolation. An estimate with no stated limit is one that
 * will be used outside its fit by somebody who had no way to know.
 *
 * OPERATIONAL STATE: what the system has recorded and committed
 *
 *   S^(j)_{v+1} = δ_ρj(S^(j)_v, e_k)
 *
 * A governed scope j, at version v, advanced by an admitted event under
 * transition rules ρ. Quote accepted. Acquisition approved. Dossier released.
 * Order partially filled. Outcome awaiting reconciliation.
 *
 * Canonical here means authoritative for the application's record — not
 * infallibly true about the world. The distinction matters because it makes a
 * recorded contradiction a legitimate state rather than a bug: when two sources
 * disagree, the honest operational state is that they disagree, and a system
 * that cannot represent that will pick one and forget it did.
 *
 * WHY THE KINDS ARE A COLUMN AND NOT THREE TABLES
 *
 * They are separated by table anyway, and a denormalised kind column tied to a
 * parent that can only hold one value would carry exactly zero bits — it would
 * look like this repository's composite-key technique while performing none of
 * it. So there is one `state_subject` table whose kind column really does hold
 * three values, and the children tie to it. The key then discriminates, and
 * removing a check actually changes which rows go in.
 */

/* ── The three ── */

export const STATE_KINDS = ['PHYSICAL', 'ESTIMATED', 'OPERATIONAL'] as const;
export type StateKind = typeof STATE_KINDS[number];

export interface StateKindContract {
  kind: StateKind;
  is: string;
  /** Whether it exists independently of being recorded. */
  independentOfTheRecord: boolean;
  /** What it would take to be wrong about it. */
  wrongWhen: string;
  /** What collapsing it into another would produce. */
  collapsing: string;
}

export const STATE_KIND_CONTRACTS: readonly StateKindContract[] = [
  {
    kind: 'PHYSICAL',
    is: 'What the world is doing: land conditions, capacity and inventories, flows, market conditions.',
    independentOfTheRecord: true,
    wrongWhen: 'Never. It is not a claim, so it cannot be mistaken — only unobserved.',
    collapsing: 'Collapsed into the estimate, the map becomes the territory: the system stops being able to say it was wrong, because being wrong would require a world the estimate is about.',
  },
  {
    kind: 'ESTIMATED',
    is: 'What the evidence supports about the physical state, at a described period, from evidence available by a knowledge time.',
    independentOfTheRecord: false,
    wrongWhen: 'The world was otherwise, or the evidence was misread, or the model does not apply here.',
    collapsing: 'Collapsed into the operational state, an estimate becomes a commitment: the system acts on a fitted number as though somebody had decided it.',
  },
  {
    kind: 'OPERATIONAL',
    is: 'What the system has recorded and committed for a governed scope, at a version, under transition rules.',
    independentOfTheRecord: false,
    wrongWhen: 'A transition was recorded that the rules did not permit, or a commitment was made that nobody authorized.',
    collapsing: 'Collapsed into the physical state, a row saying a shipment departed becomes the shipment departing. It is on the water or it is not, and the database has no vote.',
  },
];

export function stateKindContract(kind: StateKind): StateKindContract {
  const found = STATE_KIND_CONTRACTS.find((entry) => entry.kind === kind);
  if (!found) throw new Error(`STATE_UNKNOWN_KIND:${kind}`);
  return found;
}

/** The only kind that exists whether or not anybody wrote it down. */
export const INDEPENDENT_KINDS: readonly StateKind[] =
  STATE_KIND_CONTRACTS.filter((entry) => entry.independentOfTheRecord).map((entry) => entry.kind);

export const THREE_MEANINGS_RULE =
  'Physical state is what the world is doing, estimated state is what the evidence supports about it, and operational state is what the system has recorded and committed. Only the first exists independently of the record, and only the third is something the firm can be held to.';

/* ── The physical state vector ── */

export const PHYSICAL_BLOCKS = ['LAND', 'CAPACITY', 'FLOW', 'MARKET'] as const;
export type PhysicalBlock = typeof PHYSICAL_BLOCKS[number];

export const PHYSICAL_BLOCK_MEANING: Readonly<Record<PhysicalBlock, string>> = {
  LAND: 'Parcels, entitlements, development conditions and physical constraints.',
  CAPACITY: 'Productive capacity, utilization and inventories — the connector between land and movement.',
  FLOW: 'Movements: what actually went where.',
  MARKET: 'Prices, exposure and the conditions a decision is taken against.',
};

export const CAPACITY_IS_THE_CONNECTOR =
  'A parcel does not produce freight. An operating facility, using particular processes and materials at some utilization, does. Capacity is the block that connects land to movement, and its absence is why land evidence and transport evidence otherwise sit beside each other without meeting.';

/* ── The two clocks on an estimate ── */

export const ESTIMATE_CLOCKS = ['DESCRIBES_AT', 'EVIDENCE_KNOWN_BY'] as const;
export type EstimateClock = typeof ESTIMATE_CLOCKS[number];

export const ESTIMATE_CLOCK_MEANING: Readonly<Record<EstimateClock, string>> = {
  DESCRIBES_AT: 'The period the estimate is about. A statement concerning last month is about last month however recently it arrived.',
  EVIDENCE_KNOWN_BY: 'The time by which the evidence it was computed from was available. This is what a correction moves.',
};

export const CORRECTION_MOVES_KNOWLEDGE_NOT_THE_EVENT =
  'A correction changes what the system knows about a period. It does not move the period. A superseding estimate carries a strictly later evidence time and the same described period — one that quietly restates which month it is about has answered a different question and kept the old question’s audience.';

/* ── What an estimate must carry ── */

export interface EstimateField {
  field: string;
  answers: string;
  /** Whether a repository this size already had a home for it. */
  previouslyHomeless: boolean;
}

export const ESTIMATE_CONTRACT: readonly EstimateField[] = [
  { field: 'describesAt', answers: 'Which period this is about.', previouslyHomeless: false },
  { field: 'evidenceKnownBy', answers: 'By when the evidence was available.', previouslyHomeless: false },
  { field: 'evidenceSnapshot', answers: 'Exactly which evidence, as a content digest rather than a description.', previouslyHomeless: false },
  { field: 'modelVersion', answers: 'Which fitted artefact produced it, and on what it was fitted.', previouslyHomeless: true },
  { field: 'uncertainty', answers: 'How uncertain, in units somebody can act on.', previouslyHomeless: false },
  { field: 'applicabilityLimit', answers: 'Where this does NOT apply: which regime, region, population or range it was not fitted for.', previouslyHomeless: true },
];

/**
 * The field nothing in this repository had.
 *
 * A prediction's horizon bounds its forward reach in time and says nothing
 * about regime, region, population or extrapolation. An estimate with no stated
 * limit will be used outside its fit by somebody who had no way to know it was
 * outside.
 */
export const APPLICABILITY_RULE =
  'An estimate states where it does not apply. A horizon bounds time and nothing else; regime, region, population and range are separate limits, and an estimate carrying none of them invites use outside its fit by a reader with no way to detect it.';

/* ── Evidential standing ── */

/**
 * Three things that must not acquire identical status, named because they
 * arrive through the same pipe and look the same by the time they are rows.
 */
export const OBSERVATION_BASES = ['DOCUMENT_ASSERTION', 'DIRECT_OBSERVATION', 'MODELLED_ESTIMATE'] as const;
export type ObservationBasis = typeof OBSERVATION_BASES[number];

export const BASIS_MEANING: Readonly<Record<ObservationBasis, string>> = {
  DOCUMENT_ASSERTION: 'Somebody wrote it down. Evidence that a statement was made, which is not evidence that it is true.',
  DIRECT_OBSERVATION: 'Something was measured or seen. Evidence about the world, bounded by the instrument.',
  MODELLED_ESTIMATE: 'Something was computed. Evidence about the model, and about the world only as far as the model holds.',
};

export const EVIDENTIAL_STANDING_RULE =
  'A document assertion, a direct observation and a modelled estimate must not acquire identical evidential status. They arrive through the same pipe and look alike by the time they are rows, which is why the basis travels with the reading rather than being inferred from it later.';

/* ── Operational transitions ── */

export const CONTRADICTION_IS_A_STATE =
  'Canonical means authoritative for the application’s record, not infallibly true about the world. When two sources disagree, the honest operational state is that they disagree — a system that cannot represent a contradiction will pick one and forget that it did.';

export const REVISION_RULE =
  'Operational state advances by version within a governed scope. A revision succeeds exactly one earlier revision, or it opens the line; nothing rewrites a revision that has been accepted, because a commitment made against version 41 was made against what version 41 said.';

/**
 * The execution ledger already consumes a state revision and binds an
 * authorization to it. Until now nothing produced one.
 */
export const REVISION_IS_WHAT_AUTHORIZATIONS_BIND_TO =
  'An execution authorization binds to the state revision it was granted against. That revision is produced here, so the binding points at something real rather than at a number an application layer maintained by convention.';

/* ── Standing ── */

export interface StateSubject {
  subjectId: string;
  kind: StateKind;
}

/** None. Nothing is estimated because nothing is admitted. */
export const STATE_SUBJECTS: readonly StateSubject[] = [];

export const STATE_BLOCKED_ON: readonly string[] = [
  'No physical subject is declared, because no corpus record has been admitted about one.',
  'No estimate exists, so no model version and no applicability limit are recorded.',
  'No governed scope has advanced a revision, so no authorization has a revision to bind to.',
];

export function stateStanding(subjects: readonly StateSubject[] = STATE_SUBJECTS) {
  const byKind = Object.fromEntries(
    STATE_KINDS.map((kind) => [kind, subjects.filter((subject) => subject.kind === kind).length]),
  ) as Record<StateKind, number>;
  return {
    subjects: subjects.length,
    byKind,
    kinds: STATE_KINDS.length,
    physicalBlocks: PHYSICAL_BLOCKS.length,
    estimateFields: ESTIMATE_CONTRACT.length,
    /* The two the repository had no home for before this module. */
    fieldsNewlyHoused: ESTIMATE_CONTRACT.filter((field) => field.previouslyHomeless).length,
    blockedOn: subjects.length > 0 ? [] : [...STATE_BLOCKED_ON],
    coverage: subjects.length === 0 ? 'CONTRACT_ONLY_NO_SUBJECT_DECLARED' : 'SUBJECTS_PRESENT',
  } as const;
}
