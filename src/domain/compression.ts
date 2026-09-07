/**
 * What this system removes, and what it must not.
 *
 * The distrust stack between two counterparties is mostly translation: the same
 * facts re-keyed into each party's system, the same cargo re-examined by each
 * side, the same settlement reconciled across hops, and a dispute file assembled
 * from paper at the end. None of that work adds information. It exists because
 * neither party can read the other's records and believe them, so each rebuilds
 * the facts privately and the rebuilds are then reconciled against each other.
 *
 * That layer compresses, and compressing it is the whole commercial case: one
 * verified artifact and one execution event in place of a stack of private
 * reconstructions, and one canonical contract everyone compiles into in place of
 * pairwise translation between every pair of participants.
 *
 * Underneath it sits a different layer that must not compress, and the
 * difference is not a matter of degree. Translation moves information between
 * representations without deciding anything. Judgment decides, and someone is
 * answerable for the decision. A system that compressed judgment would be
 * removing the person who is liable while keeping the appearance that someone
 * still is, which is not efficiency but laundering.
 *
 * So the pitch is not that the intermediaries were removed. It is that the
 * translation was removed, the judgment was kept, and each retained judgment
 * names who is answerable for it.
 *
 * AND IT IS GRADED
 *
 * A translation step only collapses at the trust grade the trail actually
 * supplies. Two parties stop re-examining the cargo when one receipted
 * observation is good enough for both, and "good enough" is a property of the
 * evidence rather than of the ambition. With no admitted record, nothing
 * compresses at binding grade and the honest count is zero — which
 * compressionAvailable computes rather than this comment asserting it.
 */
import type { Corpus } from './corpus';

export type Layer = 'TRANSLATION' | 'JUDGMENT';

/** What a step needs from the corpus before it can collapse at all. */
export type TrustGrade = 'NOTHING' | 'RECEIPTED_OBSERVATION' | 'ADMITTED_RECORD';

export interface StackStep {
  id: string;
  layer: Layer;
  /** The work as it is done today, between two parties who cannot read each other's records. */
  today: string;
  /** For translation: what it collapses into. For judgment: why it stays. */
  disposition: string;
  /** Translation only: the grade of trail the collapse needs. */
  requires?: TrustGrade;
  /** Translation only: the machinery that performs it, so the claim is checkable. */
  compressedBy?: string;
  /** Judgment only: who remains answerable, which is the reason it cannot collapse. */
  answerable?: string;
  /** Judgment only: what compressing it would actually be doing. */
  ifCompressed?: string;
}

export const STACK: readonly StackStep[] = [
  {
    id: 'RE_KEYING',
    layer: 'TRANSLATION',
    today: 'Each party keys the same shipment, lot or facility into its own system, with its own identifiers, and the two are reconciled later by people reading spreadsheets side by side.',
    disposition: 'Collapses into one record with one stable identity that survives every projection, so there is nothing to reconcile because there was never a second copy.',
    requires: 'RECEIPTED_OBSERVATION',
    compressedBy: 'src/domain/corpus.ts',
  },
  {
    id: 'PAIRWISE_FORMATS',
    layer: 'TRANSLATION',
    today: 'Every pair of participants builds an adapter to each other’s formats, so the integration cost grows with the square of the participants and each new counterparty is a project.',
    disposition: 'Collapses into one canonical contract each party compiles into once. Their own wording is carried verbatim beside the compiled form, so nobody has to restate their terms in someone else’s grammar to participate.',
    requires: 'NOTHING',
    compressedBy: 'src/domain/conditionGrammar.ts',
  },
  {
    id: 'RE_EXAMINATION',
    layer: 'TRANSLATION',
    today: 'Each side inspects, surveys or weighs the same thing, because neither will rely on a number the other produced.',
    disposition: 'Collapses into one receipted observation both can read, with its evidence class, its uncertainty and both clocks — so the second inspection is redundant rather than merely expensive.',
    requires: 'ADMITTED_RECORD',
    compressedBy: 'src/domain/admission.ts',
  },
  {
    id: 'MULTI_HOP_SETTLEMENT',
    layer: 'TRANSLATION',
    today: 'Money moves through correspondent hops, each reconciling its own record of the same payment, and the trail is assembled afterwards from statements.',
    disposition: 'Collapses into one execution event whose finality is a property of the medium rather than an agreement to be reconstructed.',
    requires: 'ADMITTED_RECORD',
    compressedBy: 'contracts/ConditionalCustodyEscrow.sol',
  },
  {
    id: 'PAPER_DISPUTE',
    layer: 'TRANSLATION',
    today: 'A dispute is argued from documents: two narratives assembled from bills, emails and photographs, each side’s file built by its own counsel.',
    disposition: 'Collapses into one replayable adjudication, which any appointed expert can re-run — and which exists whether or not the route ever closes.',
    requires: 'RECEIPTED_OBSERVATION',
    compressedBy: 'src/domain/routeClosure.ts',
  },
  {
    id: 'ADMISSION',
    layer: 'JUDGMENT',
    today: 'Someone decides whether a candidate becomes corpus state, on a named profile, and signs it.',
    disposition: 'Stays. The gate refuses by default and never admits on its own behalf, because a process promoting its own output is a write wearing a ruling’s clothes.',
    answerable: 'A named admission authority that is not the method being admitted. No module produces one.',
    ifCompressed: 'The system would be manufacturing corpus state and attributing it to a ruling nobody made. Every downstream guarantee would then rest on an authority that does not exist.',
  },
  {
    id: 'UNDERWRITING',
    layer: 'JUDGMENT',
    today: 'Someone prices the risk and bears the loss if the price was wrong.',
    disposition: 'Stays, and stays with the counterparty. This system measures and refuses to price what it cannot: the restatement window is measured and explicitly not turned into a rate.',
    answerable: 'Whoever carries the exposure. Never the witness, because a stakeholder that also has a stake is not a stakeholder.',
    ifCompressed: 'The witness would be taking a position on the outcomes it adjudicates, and the neutrality that makes both counterparties willing to use it would be gone in the same motion.',
  },
  {
    id: 'CLOSING',
    layer: 'JUDGMENT',
    today: 'Both parties agree that the adjudicated facts settle their arrangement, and act on it.',
    disposition: 'Stays bilateral. The proof can be produced by either side; the closing executes an arrangement both wired, and the machinery never supplies the missing consent.',
    answerable: 'Both counterparties, jointly. A route that does not close says something about the parties and nothing about the cargo.',
    ifCompressed: 'Whoever held the receipt could compel settlement, and a witness that can be used to compel has stopped being neutral between the two parties who both have to trust it.',
  },
];

export const WHAT_IS_BEING_CLAIMED = {
  is: 'The translation was removed and the judgment was kept.',
  isNot: 'The intermediaries were removed. Most of them are doing judgment, and the ones doing translation were doing it because nothing else could be believed.',
  theTest: 'For every step that collapses, name the artifact that replaces it. For every step that stays, name who is answerable. A step that collapses with no artifact named is a step somebody is still doing, uncounted.',
} as const;

export interface CompressionStanding {
  translationSteps: number;
  judgmentSteps: number;
  /** Translation steps whose required grade the corpus currently supplies. */
  availableNow: number;
  blocked: Array<{ id: string; needs: TrustGrade }>;
  statement: string;
}

/**
 * Pure: how much of the translation stack actually collapses on what the corpus
 * holds today, rather than on what it is designed to hold.
 */
export function compressionAvailable(corpus: Corpus, admittedRecords = 0): CompressionStanding {
  const supplies: Record<TrustGrade, boolean> = {
    NOTHING: true,
    // A receipted observation needs records carrying provenance and both clocks.
    RECEIPTED_OBSERVATION: corpus.records.length > 0,
    ADMITTED_RECORD: admittedRecords > 0,
  };
  const translation = STACK.filter((s) => s.layer === 'TRANSLATION');
  const judgment = STACK.filter((s) => s.layer === 'JUDGMENT');
  const blocked = translation
    .filter((s) => !supplies[s.requires ?? 'NOTHING'])
    .map((s) => ({ id: s.id, needs: s.requires ?? 'NOTHING' }));
  const availableNow = translation.length - blocked.length;
  return {
    translationSteps: translation.length,
    judgmentSteps: judgment.length,
    availableNow,
    blocked,
    statement: blocked.length === 0
      ? `All ${translation.length} translation steps collapse on what the corpus holds, and the ${judgment.length} judgment steps remain by design.`
      : `${availableNow} of ${translation.length} translation steps collapse on what the corpus holds; ${blocked.length} wait on evidence it does not have (${blocked.map((b) => `${b.id} needs ${b.needs}`).join(', ')}). The compression is a property of the trail rather than of the design, so it becomes available when the corpus does and not before. The ${judgment.length} judgment steps do not compress at any grade.`,
  };
}
