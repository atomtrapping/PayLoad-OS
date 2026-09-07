/**
 * One implementation of the statutory pipeline, used by the API route and the
 * workspace alike.
 *
 * The route and the page would otherwise each assemble capture → extract →
 * build → admit and drift apart, and a page that reported different counts from
 * the endpoint under it would be the more convincing of the two while being
 * wrong. So the run and its report live here once.
 */
import {
  captureSuppliedDocument,
  extractFiling,
  type CaptureDeclaration,
  type StatutoryExtraction,
} from '@/domain/statutoryHarvest';
import {
  admitStatutoryBuild,
  buildStatutoryCandidates,
  STATUTORY_BUILD_CONTRACT,
  type StatutoryAdmissionReceipt,
  type StatutoryCandidateBuild,
  type StatutoryContext,
} from '@/domain/statutoryAdmission';
import type { Registration } from '@/domain/identityResolution';
import type { AdmittedRow } from '@/domain/admission';
import { serveAdmittedAsOf, serveInForceAsOf } from '@/domain/statutoryServing';
import {
  NAIC_REGISTRY,
  STATUTORY_SPECIMENS,
  STATUTORY_SPECIMEN_BUILD_ID,
  STATUTORY_SPECIMEN_CONTEXT,
  STATUTORY_SPECIMEN_HORIZON,
} from '@/fixtures/insurability/statutoryFilings';

/** The specimen demonstration's authority and ruling instant, fixed so the run is reproducible. */
export const SPECIMEN_AUTHORITY = 'authority:notations-corpus-board';
export const SPECIMEN_RULED_AT = '2026-04-02T00:00:00.000Z';

export interface SuppliedDocument {
  declaration: CaptureDeclaration;
  text: string;
}

export interface HarvestRun {
  extractions: StatutoryExtraction[];
  build: StatutoryCandidateBuild;
  receipt: StatutoryAdmissionReceipt;
  /** Documents that never became captures, kept rather than dropped. */
  captureRefusals: Array<{ captureId: string; because: string }>;
}

export function runHarvest(
  documents: readonly SuppliedDocument[],
  registry: readonly Registration[],
  buildId: string,
  knownThrough: string,
  context: StatutoryContext,
  authority: string,
  ruledAt: string,
): HarvestRun {
  const extractions: StatutoryExtraction[] = [];
  const captureRefusals: HarvestRun['captureRefusals'] = [];
  for (const document of documents) {
    const captured = captureSuppliedDocument(document.declaration, document.text);
    if (captured.capture === null) {
      captureRefusals.push({ captureId: String(document.declaration?.captureId ?? 'unnamed'), because: captured.because });
      continue;
    }
    extractions.push(extractFiling(captured.capture));
  }
  const build = buildStatutoryCandidates(extractions, registry, {
    schema: STATUTORY_BUILD_CONTRACT.id, buildId, knownThrough, context,
  });
  return { extractions, build, receipt: admitStatutoryBuild(build, authority, ruledAt), captureRefusals };
}

/** The drafted-specimen run. Deterministic: same inputs, same receipt digest, every time. */
export function runSpecimenHarvest(knownThrough: string = STATUTORY_SPECIMEN_HORIZON): HarvestRun {
  return runHarvest(
    STATUTORY_SPECIMENS.map((entry) => ({ declaration: entry.declaration, text: entry.text })),
    NAIC_REGISTRY,
    STATUTORY_SPECIMEN_BUILD_ID,
    knownThrough,
    STATUTORY_SPECIMEN_CONTEXT,
    SPECIMEN_AUTHORITY,
    SPECIMEN_RULED_AT,
  );
}

/** What the run produced, shaped once so no two readers of it disagree. */
export function reportHarvest(run: HarvestRun, asOfKnowledgeTime: string, inForceAt: string | null) {
  const served: AdmittedRow[] = inForceAt
    ? serveInForceAsOf(run.receipt.rows, asOfKnowledgeTime, inForceAt)
    : serveAdmittedAsOf(run.receipt.rows, asOfKnowledgeTime);

  return {
    asOfKnowledgeTime,
    inForceAt,
    knownThrough: run.build.knownThrough,
    records: {
      captured: run.extractions.length,
      captureRefused: run.captureRefusals.length,
      excludedByCutoff: run.receipt.counts.excludedByCutoff,
      candidates: run.receipt.counts.candidates,
      admitted: run.receipt.counts.admitted,
      refused: run.receipt.counts.refused,
      served: served.length,
    },
    provenance: {
      /** Declared by whoever supplied the bytes, never worked out here. */
      beganAs: [...new Set(run.extractions.map((entry) => entry.beganAs))].sort(),
      crossedTheGate: run.receipt.counts.admitted > 0,
      detail: 'Two independent facts. `crossedTheGate` says these rows passed all ten admission checks on the merits. `beganAs` says what the supplier declared the bytes to be. A drafted specimen that passes the gate is a correct admission of a drafted document, and neither fact excuses omitting the other.',
    },
    captureRefusals: run.captureRefusals,
    excluded: run.build.excluded,
    filings: run.build.members.map((member) => ({
      captureId: member.captureId,
      jurisdiction: member.jurisdiction,
      artifactDigest: member.artifactDigest,
      knownAt: member.knownAt,
      sourceTime: member.sourceTime,
      identity: { outcome: member.identity.outcome, canonicalId: member.identity.canonicalId, because: member.identity.because },
      worldTime: { outcome: member.worldTime.outcome, validFrom: member.worldTime.validFrom, bracket: member.worldTime.bracket, because: member.worldTime.because },
      candidates: member.candidates.length,
      skipped: member.skipped,
      because: member.because,
    })),
    rulings: run.receipt.rulings.map((ruling) => ({
      recordId: ruling.recordId,
      outcome: ruling.outcome,
      conditions: ruling.conditions,
      failed: ruling.failed,
      because: ruling.because,
    })),
    refusalTally: run.receipt.refusalTally,
    rows: served,
    receipt: {
      receiptId: run.receipt.receiptId,
      receiptDigest: run.receipt.receiptDigest,
      method: run.receipt.method,
      authority: run.receipt.authority,
      ruledAt: run.receipt.ruledAt,
      because: run.receipt.because,
    },
  };
}

export type HarvestReport = ReturnType<typeof reportHarvest>;
