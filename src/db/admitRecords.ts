/**
 * The sanctioned write path, and the only one.
 *
 * `storage.ts` names the risk this closes: the records store arrived before
 * the gate, so its tables are canonical-shaped and nothing stopped an
 * unadmitted candidate being written into a `records` row as though it were a
 * version. `src/domain/admission.ts` is the gate; this is the door it is
 * installed in.
 *
 * Three properties, and each is a refusal rather than a convention.
 *
 * Nothing is written unless it was admitted, and admission needs an authority
 * that is not this process — so this function takes one and passes it through
 * rather than supplying its own. A caller that has no authority to name
 * cannot write.
 *
 * A refusal is written too. Rulings are recorded whatever their outcome,
 * because what fails the gate is not deleted or hidden: it stays with the
 * checks it failed. The admitted rows, their rulings and their ancestry go in
 * one transaction, so a row can never exist without the ruling that produced
 * it.
 *
 * And ancestry goes to its own table, outside the release, because doctrine
 * rule 2 keeps candidate, build and run identifiers out of every release
 * while a correction still has to reach the build.
 */
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/fixtures/digest';
import { admit, admittedRow, type AdmissionCandidate, type AdmissionRuling } from '@/domain/admission';
import { db } from './index';
import { admissionRulings, recordAncestry, records } from './schema';

export interface AdmissionWriteResult {
  admitted: string[];
  refused: Array<{ recordId: string; because: string }>;
  because: string;
}

function rulingId(ruling: AdmissionRuling): string {
  return `rul-${createHash('sha256').update(canonicalJson({ candidateId: ruling.candidateId, ruledAt: ruling.ruledAt, authority: ruling.authority })).digest('hex').slice(0, 24)}`;
}

/**
 * Rule on each candidate and write what passed, in one transaction.
 *
 * `authority` is the person or role making the act. The gate refuses a
 * ruling whose authority is the admission method itself, so nothing here can
 * admit on its own behalf however it is called.
 */
export async function admitRecords(
  input: { corpusId: string; releaseId: string; authority: string; ruledAt: string; candidates: readonly AdmissionCandidate[] },
): Promise<AdmissionWriteResult> {
  const rulings = input.candidates.map((candidate) => ({ candidate, ruling: admit(candidate, input.authority, input.ruledAt) }));
  const rows = rulings
    .map(({ candidate, ruling }) => ({ candidate, ruling, ...admittedRow(candidate, ruling) }))
    .filter((entry) => entry.row !== null);

  await db.transaction(async (tx) => {
    // Every ruling, admitted or refused. The refusals are the record of what
    // the gate would not take, and they are written first so a partial
    // failure can never leave a row without its ruling.
    for (const { ruling } of rulings) {
      await tx.insert(admissionRulings).values({
        rulingId: rulingId(ruling),
        candidateId: ruling.candidateId,
        recordId: ruling.recordId,
        outcome: ruling.outcome,
        authority: ruling.authority,
        ruledAt: ruling.ruledAt,
        data: ruling as unknown as Record<string, unknown>,
      }).onConflictDoNothing();
    }

    for (const { candidate, row } of rows) {
      // Every column comes off the admitted row. Nothing is defaulted and
      // nothing is cast: a value the gate did not rule on has no business in a
      // row the gate is supposed to have produced, and the predicate in
      // particular used to be invented here when the candidate carried none.
      await tx.insert(records).values({
        recordId: row!.recordId,
        corpusId: input.corpusId,
        subjectId: row!.subjectId,
        subjectCanonicalId: row!.subjectCanonicalId,
        predicate: row!.predicate,
        validFrom: row!.validFrom,
        validTo: row!.validTo,
        knownAt: row!.knownAt,
        sourceTime: row!.sourceTime,
        acquisitionTime: row!.acquisitionTime,
        provenance: row!.provenance,
        conditions: row!.conditions,
        data: {
          value: row!.value,
          unit: row!.unit,
          basis: row!.basis,
          admittedBy: row!.admittedBy,
          ruledAt: row!.ruledAt,
          outcome: row!.outcome,
        } as Record<string, unknown>,
      }).onConflictDoNothing();

      // Outside the release, by rule 2, and only for what was admitted.
      await tx.insert(recordAncestry).values({
        recordId: row!.recordId,
        releaseId: input.releaseId,
        candidateId: candidate.candidateId,
        buildId: candidate.buildId,
        ruledAt: input.ruledAt,
        authority: input.authority,
      }).onConflictDoNothing();
    }
  });

  const refused = rulings
    .filter(({ ruling }) => ruling.outcome !== 'ADMITTED')
    .map(({ ruling }) => ({ recordId: ruling.recordId, because: ruling.because }));
  return {
    admitted: rows.map((entry) => entry.row!.recordId),
    refused,
    because: `${rows.length} of ${input.candidates.length} admitted by ${input.authority}; ${refused.length} refused, and every ruling was written whatever its outcome. Admission says these may be versions, not that their claims are true.`,
  };
}
