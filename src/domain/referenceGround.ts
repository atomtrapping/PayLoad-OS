/**
 * The legacy layer as ground, not as a dataset.
 *
 * It is immutable, content-addressed, closed to this system's own writes and
 * closed to sale. It is not a source and not a product: it is the material
 * form of the reference channel, the thing the live corpus's beliefs are
 * checked against. The live corpus is richer and unanchored; this is thinner
 * and stable. Belief and terrain.
 *
 * Two clocks were enough while capture was live, because a source published
 * and we obtained it at nearly the same instant. Backfill splits that instant
 * in two and the third clock was hiding inside "source" all along: a 2019
 * record bought in 2026 was knowable by its source in 2019 and by us in 2026.
 *
 * Both are true, and they answer **different questions** — which is the
 * distinction this module exists to keep, because collapsing them is how
 * backfill fabricates. "What did the source know by D" is a question about
 * the source. "What did we hold at K" is a question about us, and it is the
 * one the product sells. A corpus that answers the second using the first
 * has invented a system that knew things it did not know, which is the same
 * fabrication every refusal here already blocks, arriving through the
 * acquisition door wearing a helpful costume.
 */

export const GROUND_METHOD = 'notationsos.reference-ground.v1';

export type Provenance = 'LIVE_CAPTURE' | 'BACKFILLED';

/** The two as-of questions, which are never one blended question. */
export type AsOfQuestion = 'WHAT_THE_SOURCE_KNEW' | 'WHAT_WE_HELD';

export const QUESTION_MEANING: Record<AsOfQuestion, string> = {
  WHAT_THE_SOURCE_KNEW: 'Bounded by source time: what the source had published by the asked-for instant. A question about the source, answerable over backfill, and not a claim that this system held it.',
  WHAT_WE_HELD: 'Bounded by acquisition time: what this system actually possessed at the asked-for instant. A question about us, which backfill answers only from the moment it was acquired.',
};

export interface GroundRecord {
  recordId: string;
  provenance: Provenance;
  validFrom: string;
  validTo: string | null;
  /** When the source published or knew it. */
  sourceTime: string;
  /** When this system obtained it. Live capture: near source time. Backfill: now. */
  acquisitionTime: string;
}

function ms(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface Coherence { coherent: boolean; because: string }

/**
 * A record obtained before its source published it is incoherent whatever it
 * is labelled. The labels themselves are declared and never inferred: no
 * threshold here decides that a gap between the clocks makes something
 * backfill, because that would be this module guessing at provenance.
 */
export function clocksCohere(record: GroundRecord): Coherence {
  const source = ms(record.sourceTime), acquired = ms(record.acquisitionTime), valid = ms(record.validFrom);
  if (source === null || acquired === null || valid === null) return { coherent: false, because: 'One of the three clocks is not a readable instant, so nothing here can be placed in time.' };
  if (acquired < source) return { coherent: false, because: 'Acquired before the source published it. Whatever the label says, this record did not arrive the way it claims to have arrived.' };
  return { coherent: true, because: 'Valid time, source time and acquisition time are readable and ordered as an acquisition can be.' };
}

export interface AnswerabilityReading {
  answerable: boolean;
  because: string;
}

/**
 * Is this record part of the answer to *this* question at *this* instant?
 * The two questions use different clocks on purpose, and a caller must name
 * which one it is asking.
 */
export function answerable(record: GroundRecord, question: AsOfQuestion, atInstant: string): AnswerabilityReading {
  const coherence = clocksCohere(record);
  if (!coherence.coherent) return { answerable: false, because: coherence.because };
  const at = ms(atInstant);
  if (at === null) return { answerable: false, because: 'The asked-for instant is not readable, so no boundary can be applied.' };

  if (question === 'WHAT_THE_SOURCE_KNEW') {
    const source = ms(record.sourceTime)!;
    return source <= at
      ? { answerable: true, because: `The source had published this by then (source time ${record.sourceTime}). This says nothing about whether this system held it.` }
      : { answerable: false, because: `The source had not published this by then (source time ${record.sourceTime}).` };
  }

  const acquired = ms(record.acquisitionTime)!;
  return acquired <= at
    ? { answerable: true, because: `This system held it by then (acquired ${record.acquisitionTime}).` }
    : { answerable: false, because: `This system did not hold it then: acquired ${record.acquisitionTime}, which is after the asked-for instant. The source may have known it long before; that is the other question.` };
}

/** The set answering one question at one instant, with the excluded named rather than dropped. */
export function asOf(
  records: readonly GroundRecord[],
  question: AsOfQuestion,
  atInstant: string,
): { question: AsOfQuestion; atInstant: string; included: GroundRecord[]; excluded: Array<{ recordId: string; because: string }>; because: string } {
  const included: GroundRecord[] = [];
  const excluded: Array<{ recordId: string; because: string }> = [];
  for (const record of records) {
    const reading = answerable(record, question, atInstant);
    if (reading.answerable) included.push(record);
    else excluded.push({ recordId: record.recordId, because: reading.because });
  }
  const backfilled = included.filter((record) => record.provenance === 'BACKFILLED').length;
  return {
    question,
    atInstant,
    included,
    excluded,
    because: `${included.length} of ${records.length} answer ${question}${backfilled ? `, ${backfilled} of them backfilled` : ''}. ${QUESTION_MEANING[question]}`,
  };
}

/* ── Absence, which has three readings and never a fourth ── */

/**
 * What it means that a range holds nothing. None of these says the thing did
 * not happen: absence is a fact about records, never about the world.
 */
export type AbsenceReading = 'SOURCE_RECORDED_NOTHING' | 'WE_ACQUIRED_NOTHING' | 'INDETERMINATE';

export const ABSENCE_MEANING: Record<AbsenceReading, string> = {
  SOURCE_RECORDED_NOTHING: 'The ground covers this range and the source declared the range complete, so the source recorded nothing here. That is a fact about the source’s records.',
  WE_ACQUIRED_NOTHING: 'The ground does not cover this range. Nothing was acquired for it, so nothing can be said about what the source held.',
  INDETERMINATE: 'The ground covers this range but the source declared no completeness for it, so an empty range and an unrecorded one are indistinguishable here.',
};

export function absenceIn(coverage: { groundCoversRange: boolean; sourceDeclaredComplete: boolean }): { reading: AbsenceReading; because: string } {
  if (!coverage.groundCoversRange) return { reading: 'WE_ACQUIRED_NOTHING', because: ABSENCE_MEANING.WE_ACQUIRED_NOTHING };
  if (!coverage.sourceDeclaredComplete) return { reading: 'INDETERMINATE', because: ABSENCE_MEANING.INDETERMINATE };
  return { reading: 'SOURCE_RECORDED_NOTHING', because: ABSENCE_MEANING.SOURCE_RECORDED_NOTHING };
}

/* ── The boundary the ground never crosses ── */

export type GroundClass = 'GROUND' | 'MEASUREMENT_OF_GROUND';

/** Query, cite and test are over it. Train, distil, fine-tune and embed are into it. */
export type ReasoningUse = 'QUERY' | 'CITE' | 'TEST' | 'TRAIN' | 'DISTIL' | 'FINE_TUNE' | 'EMBED';

const OVER: readonly ReasoningUse[] = ['QUERY', 'CITE', 'TEST'];

export function mayLeaveTheBoundary(classification: GroundClass): { allowed: boolean; because: string } {
  return classification === 'MEASUREMENT_OF_GROUND'
    ? { allowed: true, because: 'A measurement of the ground — a calibration score, a fitted source reliability, an attested residual — carries no ground with it and may be sold. You can sell the certification.' }
    : { allowed: false, because: 'The ground itself never leaves. A reference layer with customers has negotiable neutrality, and a negotiable standard is not a standard. You cannot sell the judge.' };
}

export function reasoningAllowed(use: ReasoningUse): { allowed: boolean; because: string } {
  return OVER.includes(use)
    ? { allowed: true, because: `${use} reasons over the ground: the ground stays external to the reasoner and the reasoner’s claim can be checked against it.` }
    : { allowed: false, because: `${use} reasons into the ground: it absorbs the ground into the reasoner, after which the ground is no longer external and nothing it "confirms" is a check. The separation between the reasoning layer and the grounding layer is the whole point of having both.` };
}

export const GROUND_LOSS = [
  'Two as-of questions, never one. What the source knew by D is a question about the source; what this system held at K is a question about this system, and answering the second with the first invents a corpus that knew things it did not know.',
  'Absence has three readings and none of them is that the thing did not happen. Absence is a fact about records; the world is not obliged to have been quiet because nobody wrote it down.',
  'Provenance is declared, never inferred. No threshold here decides that a gap between source time and acquisition time makes a record backfill, because that would be this module guessing at how a record arrived.',
  'The ground is closed to this system’s writes and to its sales. Measurements of the ground are the product; the ground is not, because a reference layer with customers has negotiable neutrality.',
  'Reasoners work over the ground and never into it. Query, cite and test keep the ground external; train, distil, fine-tune and embed dissolve it into the reasoner, and a reasoner cannot be checked against something it has absorbed.',
  'This layer is the shadow of a live corpus, not a substitute for one. Every record is reconstructable and every correction, adjudication and calibration that operating would have produced is not, so a backfilled release is a different object from a live-captured one and its manifest says which it is.',
] as const;
