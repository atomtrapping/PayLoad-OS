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
import { admit, admittedRow, isAdmitting, type AdmissionCandidate, type AdmissionRuling } from '@/domain/admission';
import type { CorpusRecord } from '@/domain/corpus';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { admissionRulings, recordAncestry, records, releases, corpora } from './schema';
import { ADMISSION_STORAGE_SCHEMA, bindReleaseRecord, storageJson, timestamp, type AdmissionStorageDocument } from './recordStorage';

export interface AdmissionWriteResult {
  admitted: string[];
  inserted: string[];
  existing: string[];
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
  input: { corpusId: string; releaseId: string; authority: string; ruledAt: string; candidates: readonly AdmissionCandidate[]; releaseRecords?: readonly CorpusRecord[] },
): Promise<AdmissionWriteResult> {
  // Snapshot before awaiting storage: callers cannot change the admitted input
  // while this transaction runs. JSON comparison rejects non-finite values.
  input = JSON.parse(storageJson(input)) as typeof input;
  const ruledAt = timestamp(input.ruledAt);
  if (!input.corpusId.trim() || !input.releaseId.trim() || input.candidates.length === 0 || input.candidates.length > 256) throw new Error('ADMISSION_WRITE_INVALID_SCOPE');
  const candidateIds = new Set(input.candidates.map((candidate) => candidate.candidateId));
  const recordIds = new Set(input.candidates.map((candidate) => candidate.recordId));
  if (candidateIds.size !== input.candidates.length || recordIds.size !== input.candidates.length || [...candidateIds, ...recordIds].some((id) => !id.trim())) throw new Error('ADMISSION_WRITE_DUPLICATE_OR_EMPTY_ID');
  const projections = new Map<string, CorpusRecord>();
  for (const projection of input.releaseRecords ?? []) {
    if (!recordIds.has(projection.recordId) || projections.has(projection.recordId)) throw new Error('ADMISSION_RELEASE_RECORD_MEMBERSHIP');
    projections.set(projection.recordId, projection);
  }
  const rulings = [...input.candidates].sort((a, b) => a.recordId < b.recordId ? -1 : 1)
    .map((candidate) => ({ candidate, ruling: admit(candidate, input.authority, input.ruledAt) }));
  for (const { candidate } of rulings) {
    for (const known of [candidate.knownAt, candidate.provenance?.capturedAt, candidate.sourceTime]) {
      // An unreadable candidate clock is part of its refusal. A readable
      // clock cannot be put after the act that purportedly inspected it.
      if (known && Number.isFinite(Date.parse(known)) && ruledAt < timestamp(known)) throw new Error('ADMISSION_RULING_PRECEDES_EVIDENCE');
    }
  }
  const rows = rulings
    .map(({ candidate, ruling }) => ({ candidate, ruling, ...admittedRow(candidate, ruling) }))
    .filter((entry) => entry.row !== null);
  const documents = new Map<string, AdmissionStorageDocument>();
  for (const { candidate, ruling, row } of rows) {
    for (const instant of [row!.validFrom, row!.knownAt, row!.sourceTime, row!.acquisitionTime]) timestamp(instant);
    const projection = projections.get(row!.recordId);
    documents.set(row!.recordId, {
      schema: ADMISSION_STORAGE_SCHEMA, corpusId: input.corpusId, releaseId: input.releaseId, candidate, ruling, row: row!,
      releaseRecord: projection ? bindReleaseRecord(projection, candidate, row!, input.releaseId) : null,
    });
  }
  const inserted: string[] = [];
  const existing: string[] = [];

  const compare = (actual: Record<string, unknown> | undefined, expected: Record<string, unknown>, clocks: readonly string[]) => {
    if (!actual) throw new Error('ADMISSION_WRITE_READBACK_MISSING');
    const normalized = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, clocks.includes(key) && item !== null ? timestamp(item as string) : item]));
    if (storageJson(normalized(actual)) !== storageJson(normalized(expected))) throw new Error('ADMISSION_WRITE_CONFLICT');
  };

  await db.transaction(async (tx: any) => {
    // Serialize a corpus's admission and seal checks. Locking the corpus also
    // orders new release inserts through their existing foreign key; locking
    // existing releases prevents their state changing during this admission.
    const [owner] = await tx.select().from(corpora).where(eq(corpora.corpusId, input.corpusId)).for('update');
    if (!owner) throw new Error('ADMISSION_RELEASE_TARGET_MISMATCH');
    const corpusReleases = await tx.select().from(releases).where(eq(releases.corpusId, input.corpusId)).orderBy(releases.releaseId).for('update');
    const target = corpusReleases.find((release: any) => release.releaseId === input.releaseId);
    if (!target) throw new Error('ADMISSION_RELEASE_TARGET_MISMATCH');
    const open = (release: typeof target): boolean => {
      const data = release.data as { certification?: { status?: unknown } } | null;
      return release.status === 'CURRENT' && data?.certification?.status === 'CANDIDATE';
    };
    if (rows.length && ruledAt > timestamp(target.knownAt)) throw new Error('ADMISSION_RULING_AFTER_RELEASE_CUTOFF');
    for (const { row, ruling } of rows) {
      if (timestamp(row!.knownAt) > timestamp(target.knownAt)) throw new Error('ADMISSION_RELEASE_CUTOFF');
      // An incomplete retained set is an integrity failure, not permission to
      // fill in whatever is missing under an old record identity.
      const [record] = await tx.select().from(records).where(eq(records.recordId, row!.recordId));
      const [priorRuling] = await tx.select().from(admissionRulings).where(eq(admissionRulings.rulingId, rulingId(ruling)));
      const [ancestry] = await tx.select().from(recordAncestry).where(eq(recordAncestry.recordId, row!.recordId));
      const retained = Number(Boolean(record)) + Number(Boolean(priorRuling)) + Number(Boolean(ancestry));
      if (retained !== 0 && retained !== 3) throw new Error('ADMISSION_WRITE_INCOMPLETE_HISTORY');
      if (!record) {
        if (!open(target)) throw new Error('ADMISSION_RELEASE_SEALED');
        // The legacy release reader uses knowledge cutoffs rather than exact
        // membership sets. A backdated insert would otherwise change every
        // earlier sealed release whose cutoff includes it.
        if (corpusReleases.some((release: any) => !open(release) && timestamp(row!.knownAt) <= timestamp(release.knownAt))) {
          throw new Error('ADMISSION_WOULD_CHANGE_SEALED_RELEASE');
        }
      }
    }
    // Every ruling, admitted or refused. The refusals are the record of what
    // the gate would not take, and they are written first so a partial
    // failure can never leave a row without its ruling.
    for (const { candidate, ruling } of rulings) {
      const expected = {
        rulingId: rulingId(ruling),
        candidateId: ruling.candidateId,
        recordId: ruling.recordId,
        outcome: ruling.outcome,
        authority: ruling.authority,
        ruledAt: ruling.ruledAt,
        data: { schema: 'notations.admission-ruling-storage.v1', corpusId: input.corpusId, releaseId: input.releaseId, candidate, ruling },
      };
      await tx.insert(admissionRulings).values(expected).onConflictDoNothing();
      const [retained] = await tx.select().from(admissionRulings).where(eq(admissionRulings.rulingId, expected.rulingId));
      compare(retained, expected, ['ruledAt']);
    }

    for (const { candidate, row } of rows) {
      // Every column comes off the admitted row. Nothing is defaulted and
      // nothing is cast: a value the gate did not rule on has no business in a
      // row the gate is supposed to have produced, and the predicate in
      // particular used to be invented here when the candidate carried none.
      const expected = {
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
        data: documents.get(row!.recordId)! as unknown as Record<string, unknown>,
      };
      const created = await tx.insert(records).values(expected).onConflictDoNothing().returning({ recordId: records.recordId });
      const [retained] = await tx.select().from(records).where(eq(records.recordId, expected.recordId));
      compare(retained, expected, ['validFrom', 'validTo', 'knownAt', 'sourceTime', 'acquisitionTime']);
      (created.length ? inserted : existing).push(row!.recordId);

      // Outside the release, by rule 2, and only for what was admitted.
      const ancestry = {
        recordId: row!.recordId,
        releaseId: input.releaseId,
        candidateId: candidate.candidateId,
        buildId: candidate.buildId,
        ruledAt: input.ruledAt,
        authority: input.authority,
      };
      await tx.insert(recordAncestry).values(ancestry).onConflictDoNothing();
      const [retainedAncestry] = await tx.select().from(recordAncestry).where(eq(recordAncestry.recordId, ancestry.recordId));
      compare(retainedAncestry, ancestry, ['ruledAt']);
    }
  });

  const refused = rulings
    .filter(({ ruling }) => !isAdmitting(ruling.outcome))
    .map(({ ruling }) => ({ recordId: ruling.recordId, because: ruling.because }));
  return {
    admitted: rows.map((entry) => entry.row!.recordId),
    inserted,
    existing,
    refused,
    because: `${inserted.length} rows inserted, ${existing.length} identical rows verified, ${refused.length} candidates refused. Every retained row, ruling and ancestry was compared with this request inside one transaction. Admission does not activate a release or establish source truth.`,
  };
}
