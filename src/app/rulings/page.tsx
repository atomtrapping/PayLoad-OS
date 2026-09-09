import type { Metadata } from 'next';
import { getCaseSource } from '@/adapter/caseSource';
import { allRulings, ASSURANCE_SEMANTICS, VISIBILITY_SEMANTICS } from '@/domain/selectors';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { RulingRegister, type RulingRow } from '@/components/ruling/RulingRegister';
import type { CheckStatus } from '@/domain/types';

export const metadata: Metadata = { title: 'Rulings' };

/**
 * Every ruling ever issued, newest first.
 *
 * The counting is done here, where the bundles are, so the register carries
 * numbers rather than a case bundle to count. Nothing on the client re-derives
 * what a ruling ruled on.
 */
export default async function RulingsPage() {
  const source = getCaseSource();
  const cases = await source.listCases();
  const rulings: RulingRow[] = cases
    .flatMap((bundle) => allRulings(bundle).map((ruling) => ({ bundle, ruling })))
    .sort((a, b) => ((b.ruling.temporalBasis.ruledAt ?? '') > (a.ruling.temporalBasis.ruledAt ?? '') ? 1 : -1))
    .map(({ bundle, ruling }) => {
      const checks: Record<CheckStatus, number> = { PASSED: 0, FAILED: 0, NOT_APPLICABLE: 0, NOT_EVALUATED: 0 };
      for (const result of ruling.invariantResults) checks[result.status] += 1;
      return {
        rulingId: ruling.rulingId,
        caseId: bundle.caseId,
        caseTitle: bundle.title,
        revision: ruling.revision,
        status: ruling.status,
        purpose: ruling.useScope.purpose,
        scopeStatement: ruling.scopeStatement,
        ruledAt: ruling.temporalBasis.ruledAt,
        knownAt: ruling.temporalBasis.knownAt,
        validAt: ruling.temporalBasis.validAt,
        assuranceClass: ruling.assurance.class,
        assuranceLabel: ASSURANCE_SEMANTICS[ruling.assurance.class].label,
        assuranceMeaning: ASSURANCE_SEMANTICS[ruling.assurance.class].meaning,
        visibility: ruling.visibility,
        visibilityMeaning: VISIBILITY_SEMANTICS[ruling.visibility].meaning,
        profileId: ruling.profileId,
        profileVersion: ruling.profileVersion,
        registerDigest: ruling.registerDigest,
        manifestCommitment: ruling.release?.manifestCommitment,
        supersedesRulingId: ruling.supersedesRulingId,
        supersededByRulingId: ruling.supersededByRulingId,
        transitionReason: ruling.transitionReason,
        ruledClaims: ruling.ruledClaimIds.length,
        consideredEvidence: ruling.consideredEvidenceIds.length,
        checks,
      };
    });

  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Rulings</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Every ruling ever issued, including superseded and revoked ones. Nothing is replaced in place.</p>
        <RulingRegister rulings={rulings} />
      </div>
    </>
  );
}
