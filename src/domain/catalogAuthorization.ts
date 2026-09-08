import { z } from 'zod';
import type { SourceRegistration, SourceUseDecision } from '@/data-os/contracts';
import { evaluateSourceUse, validateSourceRegistration } from '@/data-os/source-policy';
import { catalogDigest, exactCatalogFields } from './catalogCommitment';
export { catalogDigest } from './catalogCommitment';

const text = z.string().min(1).max(512).refine((s) => !!s.trim() && !/[\u0000-\u001f\u007f]/.test(s));
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const instant = z.string().refine((s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s);
const contextSchema = z.object({ recipientId: text, purpose: text, operation: z.literal('EXPORT'), audience: z.literal('CUSTOMER') }).strict();
export type CatalogExportContext = z.infer<typeof contextSchema>;

export interface CatalogRecordReference {
  recordId: string;
  recordDigest: string;
  sourceId: string;
}
export interface CatalogSourceReference {
  sourceId: string;
  policyDigest: string;
  registration: SourceRegistration;
}
export interface CatalogVerificationRequest {
  schema: 'notationsos.catalog-verification-request.v1';
  sliceId: string;
  corpusId: string;
  releaseId: string;
  releaseCommitment: string;
  recordsCommitment: string;
  records: readonly CatalogRecordReference[];
  sources: readonly CatalogSourceReference[];
  context: CatalogExportContext;
  /** Obtained from the trusted service clock, never the export context. */
  requestedAt: string;
}

/**
 * A trusted server-side service, not a JSON approval supplied by a customer.
 * A production implementation must reopen exact admitted rows and rulings,
 * resolve current source grants/revocations and the recipient's agreement,
 * and answer for these exact commitments at its own current clock. None is
 * wired in this repository. Tests inject an isolated service explicitly.
 */
export interface CatalogVerifier {
  now(): string;
  verify(request: Readonly<CatalogVerificationRequest>): unknown;
}

const verificationSchema = z.object({
  schema: z.literal('notationsos.catalog-verification.v1'),
  requestDigest: hash,
  verifiedAt: instant,
  authorityId: text,
  records: z.array(z.object({
    recordId: text, recordDigest: hash,
    state: z.enum(['VERIFIED_ADMITTED', 'REFUSED', 'UNVERIFIED']),
    provenance: z.enum(['LIVE_CAPTURE', 'BACKFILLED', 'DEMONSTRATION', 'UNKNOWN']),
    rulingDigest: hash.nullable(),
  }).strict()).max(50_000),
  sources: z.array(z.object({
    sourceId: text, policyDigest: hash, grantDigest: hash.nullable(),
    state: z.enum(['CURRENT', 'REVOKED', 'UNVERIFIED']),
  }).strict()).max(128),
  recipientGrant: z.object({
    grantId: text, grantDigest: hash, recipientId: text, purpose: text,
    operation: z.literal('EXPORT'), audience: z.literal('CUSTOMER'),
    notBefore: instant, notAfter: instant,
    releaseCommitment: hash, recordsCommitment: hash,
    conditions: z.array(text).max(64),
  }).strict(),
}).strict();
export type CatalogVerification = z.infer<typeof verificationSchema>;

export interface CatalogAuthorization {
  state: 'VERIFIED' | 'REFUSED';
  reasons: string[];
  requestedAt: string | null;
  requestDigest: string | null;
  verificationDigest: string | null;
  authorityId: string | null;
  context: CatalogExportContext | null;
  conditions: string[];
  sourceDecisions: SourceUseDecision[];
}

export const refusedCatalogAuthorization = (reason: string): CatalogAuthorization => ({
  state: 'REFUSED', reasons: [reason], requestedAt: null, requestDigest: null,
  verificationDigest: null, authorityId: null, context: null, conditions: [], sourceDecisions: [],
});

const selectionSchema = z.object({
  sliceId: text, corpusId: text, releaseId: text, releaseCommitment: hash, recordsCommitment: hash,
  records: z.array(z.object({ recordId: text, recordDigest: hash, sourceId: text }).strict()).min(1).max(50_000),
  sources: z.array(z.object({ sourceId: text, policyDigest: hash, registration: z.unknown() }).strict()).min(1).max(128),
}).strict();

/** Check every exact member, every contributing source, and one recipient/use. */
export function authorizeCatalogExport(
  selection: Omit<CatalogVerificationRequest, 'schema' | 'context' | 'requestedAt'>,
  contextValue: unknown,
  verifier?: CatalogVerifier,
): CatalogAuthorization {
  try {
    selectionSchema.parse(selection);
    catalogDigest(selection);
    for (const source of selection.sources) {
      exactCatalogFields(source.registration,
        ['registrationId', 'sourceId', 'displayName', 'sourceClass', 'licenseId', 'policyVersion', 'effectiveFrom', 'permittedPurposes', 'allowedOperations', 'allowedAudiences', 'retention'],
        ['effectiveUntil', 'prohibitedPurposes', 'approvalRequiredOperations']);
      exactCatalogFields(source.registration.retention, ['mode'], ['until']);
      validateSourceRegistration(source.registration);
    }
  } catch { return refusedCatalogAuthorization('INVALID_EXPORT_SELECTION'); }
  let context: CatalogExportContext;
  try { context = contextSchema.parse(contextValue); }
  catch { return refusedCatalogAuthorization('INVALID_EXPORT_CONTEXT'); }
  if (!verifier || typeof verifier.now !== 'function' || typeof verifier.verify !== 'function') {
    return { ...refusedCatalogAuthorization('VERIFIER_UNAVAILABLE'), context };
  }
  let request: CatalogVerificationRequest;
  let verification: CatalogVerification;
  try {
    const requestedAt = instant.parse(verifier.now());
    request = { ...selection, schema: 'notationsos.catalog-verification-request.v1', context, requestedAt };
    // The service cannot mutate the selection being packaged by changing its argument.
    verification = verificationSchema.parse(verifier.verify(structuredClone(request)));
  } catch { return { ...refusedCatalogAuthorization('VERIFICATION_UNAVAILABLE_OR_INVALID'), context }; }

  const requestDigest = catalogDigest(request);
  const reasons: string[] = [];
  if (verification.requestDigest !== requestDigest || verification.verifiedAt !== request.requestedAt) reasons.push('STALE_OR_MISMATCHED_VERIFICATION');
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(selection.records.map((r) => r.recordId)) || !unique(verification.records.map((r) => r.recordId)) ||
      verification.records.length !== selection.records.length) reasons.push('RECORD_COVERAGE_MISMATCH');
  const admitted = new Map(verification.records.map((r) => [r.recordId, r]));
  for (const record of selection.records) {
    const match = admitted.get(record.recordId);
    if (!match || match.recordDigest !== record.recordDigest) reasons.push('RECORD_REFERENCE_MISMATCH');
    else if (match.state !== 'VERIFIED_ADMITTED' || !match.rulingDigest ||
      !['LIVE_CAPTURE', 'BACKFILLED'].includes(match.provenance)) reasons.push('RECORD_NOT_VERIFIED_ADMITTED');
  }
  if (!unique(selection.sources.map((s) => s.sourceId)) || !unique(verification.sources.map((s) => s.sourceId)) ||
      verification.sources.length !== selection.sources.length) reasons.push('SOURCE_COVERAGE_MISMATCH');
  const policies = new Map(verification.sources.map((s) => [s.sourceId, s]));
  const sourceDecisions: SourceUseDecision[] = [];
  for (const source of selection.sources) {
    const match = policies.get(source.sourceId);
    if (!match || match.policyDigest !== source.policyDigest || catalogDigest(source.registration) !== source.policyDigest) {
      reasons.push('SOURCE_REFERENCE_MISMATCH');
      continue;
    }
    if (match.state !== 'CURRENT' || !match.grantDigest) reasons.push('CURRENT_SOURCE_GRANT_UNVERIFIED');
    try {
      const policy = source.registration;
      const decision = evaluateSourceUse(policy, {
        requestId: `catalog-export:${requestDigest.slice(7)}:${sourceDecisions.length}`,
        registrationId: policy.registrationId, operation: context.operation,
        audience: context.audience, purpose: context.purpose, requestedAt: request.requestedAt,
      });
      sourceDecisions.push(decision);
      if (decision.state !== 'ALLOWED') reasons.push('SOURCE_EXPORT_NOT_ALLOWED');
      if (policy.retention.mode === 'UNTIL' && Date.parse(request.requestedAt) >= Date.parse(policy.retention.until!)) reasons.push('SOURCE_RETENTION_EXPIRED');
      if (policy.retention.mode === 'UNTIL_SOURCE_EXPIRY' && !policy.effectiveUntil) reasons.push('SOURCE_RETENTION_UNRESOLVED');
    } catch { reasons.push('SOURCE_POLICY_INVALID'); }
  }
  if (selection.records.some((r) => !selection.sources.some((s) => s.sourceId === r.sourceId))) reasons.push('RECORD_SOURCE_UNVERIFIED');

  const grant = verification.recipientGrant;
  if (grant.recipientId !== context.recipientId || grant.purpose !== context.purpose ||
      grant.operation !== context.operation || grant.audience !== context.audience ||
      grant.releaseCommitment !== selection.releaseCommitment || grant.recordsCommitment !== selection.recordsCommitment) reasons.push('RECIPIENT_GRANT_MISMATCH');
  if (Date.parse(grant.notBefore) >= Date.parse(grant.notAfter) || Date.parse(request.requestedAt) < Date.parse(grant.notBefore) ||
      Date.parse(request.requestedAt) >= Date.parse(grant.notAfter)) reasons.push('RECIPIENT_GRANT_OUTSIDE_WINDOW');

  const uniqueReasons = [...new Set(reasons)].sort();
  return {
    state: uniqueReasons.length ? 'REFUSED' : 'VERIFIED', reasons: uniqueReasons,
    requestedAt: request.requestedAt, requestDigest, verificationDigest: catalogDigest(verification),
    authorityId: verification.authorityId, context, conditions: [...grant.conditions], sourceDecisions,
  };
}
