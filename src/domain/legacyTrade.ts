/**
 * Why trade records are the strongest thing the past can offer this corpus.
 *
 * Backfill is usually a compromise: take what survived, grade it low, and hope
 * volume compensates. Trade records are the exception, and the reason is not
 * that there are many of them. It is that they were adversarially audited at
 * the moment they were made.
 *
 * A bill of lading, a customs entry, a commercial invoice: none was written for
 * history. Each was written because money and liability moved on it. Duty was
 * assessed against it, payment released against it, claims litigated over it.
 * Every party holding the document had an incentive to shade it and a
 * counterparty with an incentive to catch the shading. That is a provenance
 * grade no passively collected record reaches — and it is a grade about
 * circumstance, not about truth, which is the distinction this module keeps.
 *
 * Three more properties follow, and each maps onto machinery that already
 * exists here: trade conserves, so the constraint stack can adjudicate history
 * rather than merely storing it; custody was adversarial and institutional, so
 * artifacts arrive with chains and often with their own printed vintage; and
 * the ontology is the live one — vessel, route, cargo, counterparty, origin,
 * destination, quantity, unit, date — so this is the same corpus extended
 * backwards rather than a second archive beside it.
 *
 * And the caveats are structural rather than polite. The archive covers what
 * the archiving power saw, so silence is a coverage bound and never a zero. The
 * documents testify to what parties declared, so adversarial audit raised the
 * cost of lying without eliminating it. And the extraction is genuinely hard,
 * which is the one caveat that improves with time rather than worsening.
 *
 * Nothing here acquires an archive, names a holder, or claims a right. No
 * artifact is held and no record is extracted.
 */
import type { Corpus } from './corpus';

/* ── Why it is credible ── */

export interface CredibilityLeg {
  id: 'ADVERSARIAL_AUDIT' | 'CONSERVES' | 'CUSTODY' | 'SAME_ONTOLOGY' | 'ARCHIVE_GATED';
  claim: string;
  /** What makes the claim true of trade and false of the usual historical sources. */
  contrast: string;
  /** The machinery here that the property lands on. */
  landsOn: string;
}

export const CREDIBILITY_LEGS: readonly CredibilityLeg[] = [
  {
    id: 'ADVERSARIAL_AUDIT',
    claim: 'The record was checked by someone paid to catch it. Duty was assessed on it, payment released against it, claims litigated over it, and the counterparty kept its own copy.',
    contrast: 'A census is collected from people with every incentive to misreport and no auditor. A newspaper is single-source narrative. Neither survived a contested commercial process.',
    landsOn: 'The evidence class: measured under adversarial circumstance, which is the highest grade a record can carry without being this system’s own observation.',
  },
  {
    id: 'CONSERVES',
    claim: 'Cargo out equals cargo in, less documented loss. Weights reconcile across the lading, the entry and the port record. A vessel arrives at a draft consistent with what it loaded.',
    contrast: 'Parish registers, chronicles and early statistics do not conserve. Nothing in them can be checked against an identity, so an error in them is undetectable in principle.',
    landsOn: 'The constraint stack, at stiff-soft: history becomes adjudicable rather than merely stored, error rates become estimable, and sources become gradeable — which is the calibration estate, applied backwards.',
  },
  {
    id: 'CUSTODY',
    claim: 'Records were kept in multiples by parties in adversarial-custodial relationships, precisely so that no one side could rewrite them, and they sit in named institutions with their own provenance.',
    contrast: 'Most surviving historical material has a custody gap somewhere, and the gap is where a forgery or a silent edit lives.',
    landsOn: 'The acquisition boundary: artifacts with documentable chains, and a source time often printed on the document itself, so the vintage discipline arrives pre-installed.',
  },
  {
    id: 'SAME_ONTOLOGY',
    claim: 'Vessel, route, cargo class, counterparty, origin, destination, quantity, unit, price, date. A ledger entry and a modern port call are the same shape.',
    contrast: 'Every other historical source needs a bespoke schema and a bespoke join. This one is the live corpus extended backwards, not a second archive beside it.',
    landsOn: 'The port set, flow conservation and counterparty identity, all of which apply to a seventeenth-century voyage exactly as they apply to a modern one.',
  },
  {
    id: 'ARCHIVE_GATED',
    claim: 'Nobody can re-capture a year that has passed. The ledgers are finite, physical and custody-bounded.',
    contrast: 'Most data advantages decay as a source becomes available to everyone. This one does not, because the source is a shelf.',
    landsOn: 'The same archive-gating the set histories have, on a clock measured in centuries rather than in days.',
  },
];

/* ── The caveats, which are structural ── */

export interface HistoricalCaveat {
  id: 'COVERAGE' | 'TESTIFIES_TO_CLAIMS' | 'EXTRACTION_COST';
  caveat: string;
  rule: string;
}

export const HISTORICAL_CAVEATS: readonly HistoricalCaveat[] = [
  {
    id: 'COVERAGE',
    caveat: 'The archive holds what the archiving power saw. Smuggling, informal trade and the whole unrecorded margin are structurally absent, and a chartered system’s records are superb on what passed through it and silent on what went round it.',
    rule: 'Silence is a declared coverage bound and never a zero. Absence from the archive is absence from the record, not absence from the world, and the manifest carries the bound rather than the reader inferring it.',
  },
  {
    id: 'TESTIFIES_TO_CLAIMS',
    caveat: 'A lading states what the parties declared. Adversarial audit raised the cost of lying; it did not remove it, and some systems documented their own chronic under-reporting.',
    rule: 'The records enter as high-grade claims with counterparty provenance, not as ground truth — above a passive record, below an instrumented observation, and gradeable by the conservation residuals the constraint stack computes.',
  },
  {
    id: 'EXTRACTION_COST',
    caveat: 'Manuscript ledgers, hands that must be learned, non-standard quantities, and centuries of drift in language, units and place names.',
    rule: 'This is the one cost that falls with time: the artifacts never change, so every improvement in extraction re-mines the same retained bytes at higher quality. Retain the bytes first and extract repeatedly, rather than extracting once and discarding the source.',
  },
];

/* ── What it would take, and what it would be for ── */

export const CONTINUITY_PROBLEMS = [
  { problem: 'Units', detail: 'Hundredweight against tonne, and a hundred local measures between them, each valid in its place and time.', resolvedBy: 'The unit-conversion identity, which is the one constraint family safe to make hard because it is arithmetic rather than a claim about the world.' },
  { problem: 'Counterparties', detail: 'A company name across three centuries of succession, merger, charter and dissolution.', resolvedBy: 'The identity estate, deepened historically: a resolution decision with evidence and both clocks, which does not exist yet in either direction.' },
  { problem: 'Places', detail: 'A port name that moved, changed sovereign, or referred to a different anchorage in different decades.', resolvedBy: 'The spatial cell key and a boundary with its own two clocks, which is versioned geometry arriving through the historical door rather than the modern one.' },
] as const;

export const RESEARCH_LAYER = {
  what: 'A physical-economy belief space that begins centuries before the instruments do, which makes questions askable that have nowhere else to be asked: route regimes under a changing climate, supply-chain topology at century scale, network response to war, epidemic and monetary collapse.',
  who: 'Institutions, actuaries, central banks and historians, which is a different customer to the commercial line and a different cadence.',
  butHonestly: 'It is a layer on top, not a justification for the layer below. The receipt pays for the system; the centuries do not have to earn their keep, and pretending they do would distort the acquisition order.',
} as const;

/* ── What exists ── */

export interface LegacyTradeStanding {
  archivesHeld: number;
  artifactsRetained: number;
  recordsExtracted: number;
  earliestRecordYear: number | null;
  statement: string;
}

/** Pure: the corpus's own historical depth, which is measured in weeks. */
export function legacyTradeStanding(corpus: Corpus): LegacyTradeStanding {
  const years = corpus.records.map((r) => Number(r.validFrom.slice(0, 4))).filter((y) => Number.isFinite(y));
  const earliest = years.length ? Math.min(...years) : null;
  return {
    archivesHeld: 0,
    artifactsRetained: 0,
    recordsExtracted: 0,
    earliestRecordYear: earliest,
    statement: `No archive is held, no artifact is retained and no historical record is extracted. The corpus’s earliest record is from ${earliest ?? 'no year at all'}, so its historical depth is measured in weeks, and every claim here is about what a backfill would be worth rather than about one that happened.`,
  };
}
