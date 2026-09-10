import type { Hash, ISODateTime } from './types';
import type { JurisdictionId } from './statutoryHarvest';
import type { ParameterSet } from './parameterRegistry';
import { getActiveParameterSet, getParameter } from './parameterRegistry';
import type { ComputationReceipt } from './productionPipeline';
import { generateComputationReceipt, queryFilingsAsOf } from './productionPipeline';
import { FIXTURE_BITEMPORAL_OBSERVATIONS } from '@/fixtures/frontier/productionCorpus';

/**
 * Insurability Dynamics & State DOI Ingestion Engine
 *
 * Grounded in Frontier Passage 2:
 * "Insurance availability is now a leading indicator of physical-asset value:
 *  carriers withdrawing from a geography reprice collateral before markets move.
 *  Wedge: an insurability-change feed built from state insurance filings + event archive + Landshark.
 *  Buyers: lenders, brokers, municipalities, carriers.
 *  State filings are public, messy, and historical — an archive-gated estate."
 *
 * PRODUCTION DOCTRINE:
 * 1. Read model constants strictly from ParameterRegistry (no embedded magic numbers).
 * 2. Zero Customer-Data Contamination: Customer loan portfolios are processed ephemerally in-memory;
 *    only the notarized ComputationReceipt (hashed inputsDigest, codeVersion, parameterSetVersion, outputDigest)
 *    is emitted/persisted.
 * 3. Bitemporal knowledge-time filtering to avoid lookahead bias in historical evaluations.
 */

/**
 * The regulators, from the one module that names them.
 *
 * This was declared here as `StateDoiJurisdiction` with five members: the
 * three `JurisdictionId` already carries, plus LA_LDI and CO_DORA, which
 * appeared nowhere else in the repository — not in a grammar, not in a
 * fixture, not in a doc. So this module could describe a filing from a
 * regulator the harvester has no grammar to read and the compiler would agree.
 *
 * The duplication is the one `JurisdictionId`'s own comment was written to
 * close, and it got past the guard for that because a superset is not an equal
 * set. The guard reads supersets now.
 */
export type StateDoiJurisdiction = JurisdictionId;

export type LineOfBusiness =
  | 'COMMERCIAL_PROPERTY_MULTI_PERIL'
  | 'RESIDENTIAL_HOMEOWNERS'
  | 'EXCESS_AND_SURPLUS_LINES'
  | 'COMMERCIAL_CASUALTY_GENERAL';

export type FilingActionType =
  | 'FULL_MARKET_WITHDRAWAL'
  | 'COUNTY_MORATORIUM_DECLARED'
  | 'NON_RENEWAL_CAP_EXPANSION'
  | 'MANDATORY_DEDUCTIBLE_SPIKE'
  | 'PERIL_EXCLUSION_ENDORSEMENT';

export type CatastrophePeril =
  | 'WILDFIRE'
  | 'COASTAL_HURRICANE_SURGE'
  | 'SEVERE_CONVECTIVE_STORM_HAIL'
  | 'INLAND_RIVERINE_FLOOD'
  | 'EARTHQUAKE_FAULT';

export interface StateDoiFilingRecord {
  filingId: string;
  serffTrackingNumber: string;
  jurisdiction: StateDoiJurisdiction;
  stateCode: string;
  carrierNaic: string;
  carrierGroup: string;
  lineOfBusiness: LineOfBusiness;
  actionType: FilingActionType;
  primaryPeril: CatastrophePeril;
  filingDate: ISODateTime;
  effectiveDate: ISODateTime;
  knowledgeTime: ISODateTime; // When admitted into the corpus
  targetGeographies: readonly {
    fipsCode: string;
    countyName: string;
    zipCodePrefixes: readonly string[];
  }[];
  filingTerms: {
    withdrawalPctOfBook?: number;
    deductibleChange?: {
      priorDeductiblePct: number;
      newMandatoryDeductiblePct: number;
    };
    exclusionDescription?: string;
    projectedPoliciesImpacted: number;
  };
  provenance: {
    sourceUrl: string;
    archiveArtifactDigest: Hash;
    capturedAt: ISODateTime;
  };
}

export interface LoanCollateralAsset {
  loanId: string;
  borrowerName: string;
  propertyType: 'COMMERCIAL_OFFICE' | 'MULTIFAMILY' | 'INDUSTRIAL_LOGISTICS' | 'DATA_CENTER' | 'RETAIL';
  address: string;
  countyFips: string;
  countyName: string;
  stateCode: string;
  originalAppraisedValueCents: number;
  outstandingLoanBalanceCents: number;
  currentAnnualNoiCents: number;
  annualDebtServiceCents: number;
  currentInsurancePremiumCents: number;
  currentInsuringCarrierNaic: string;
}

export interface CollateralRepricingStressResult {
  portfolioSummary: {
    totalLoansEvaluated: number;
    totalCollateralBalanceCents: number;
    loansDirectlyImpacted: number;
    collateralBalanceExposedCents: number;
    pctPortfolioExposed: number;
  };
  loanImpacts: readonly {
    loanId: string;
    countyName: string;
    matchingFiling: {
      filingId: string;
      carrierGroup: string;
      actionType: FilingActionType;
      effectiveDate: ISODateTime;
    };
    status: 'CARRIER_WITHDRAWING' | 'CORRIDOR_CAPACITY_SHRINK' | 'DEDUCTIBLE_DEFICIT';
    financialShock: {
      estimatedForcedPlacePremiumCents: number;
      premiumIncreaseRatio: number;
      stressedNoiCents: number;
      baselineDscr: number;
      stressedDscr: number;
      dscrBreach: boolean;
      /** null when the loan's cap rate is not positive, so direct capitalisation has no answer. */
      projectedCollateralDevaluationPct: number | null;
      /** null for the same reason: there is no revalued collateral to divide by. */
      stressedLoanToValuePct: number | null;
      /** Present only when the two above are null, naming why. */
      revaluationUnavailableBecause?: string;
    };
    estimatedLeadTimeToRepricingDays: number;
  }[];
  computationReceipt: ComputationReceipt;
  disclaimer: string;
}

/**
 * Evaluates a lender's commercial loan book against the immutable state DOI filings archive.
 * Reads multipliers and covenant thresholds from the Parameter Registry.
 * Emits an immutable ComputationReceipt verifying execution without storing customer positions.
 */
export function evaluatePortfolioCollateralShock(
  loans: readonly LoanCollateralAsset[],
  filings: readonly StateDoiFilingRecord[],
  options?: {
    asOfKnowledgeTime?: ISODateTime;
    paramSet?: ParameterSet;
    corpusReleaseDigest?: Hash;
  }
): CollateralRepricingStressResult {
  const paramSet = options?.paramSet || getActiveParameterSet();
  const asOfKnowledgeTime = options?.asOfKnowledgeTime || new Date().toISOString();
  // A caller who names no corpus release gets that fact in the receipt. The
  // default here used to be a hand-typed 64-hex literal, which put a digest
  // shaped exactly like a real one into a document whose whole purpose is to
  // say which bytes a computation ran over.
  const corpusReleaseDigest = options?.corpusReleaseDigest ?? CORPUS_RELEASE_NOT_DECLARED;

  // Read versioned, cited parameters from Registry (NO MAGIC NUMBERS)
  const fullWithdrawalMult = getParameter<number>('insurability.forced_place.full_withdrawal_multiplier', paramSet);
  const moratoriumMult = getParameter<number>('insurability.forced_place.moratorium_multiplier', paramSet);
  const deductibleSpikeMult = getParameter<number>('insurability.forced_place.deductible_spike_multiplier', paramSet);
  const dscrCovenantThreshold = getParameter<number>('credit.covenant.dscr_warning_threshold', paramSet);

  // Filter filings by bitemporal knowledge-time boundary
  const asOfTs = new Date(asOfKnowledgeTime).getTime();
  const eligibleFilings = filings.filter((f) => {
    const kt = f.knowledgeTime || f.provenance?.capturedAt || f.filingDate;
    return new Date(kt).getTime() <= asOfTs;
  });

  const impacts: Array<CollateralRepricingStressResult['loanImpacts'][number]> = [];
  let exposedCollateralCents = 0;

  for (const loan of loans) {
    const matchingFiling = eligibleFilings.find((f) => {
      const countyMatch = f.targetGeographies.some((g) => g.fipsCode === loan.countyFips);
      const carrierMatch = f.carrierNaic === loan.currentInsuringCarrierNaic;
      return countyMatch && (carrierMatch || f.actionType === 'COUNTY_MORATORIUM_DECLARED');
    });

    if (matchingFiling) {
      exposedCollateralCents += loan.outstandingLoanBalanceCents;

      const premiumShockMultiplier = matchingFiling.actionType === 'FULL_MARKET_WITHDRAWAL'
        ? fullWithdrawalMult
        : matchingFiling.actionType === 'COUNTY_MORATORIUM_DECLARED'
        ? moratoriumMult
        : deductibleSpikeMult;

      const newPremiumCents = Math.round(loan.currentInsurancePremiumCents * premiumShockMultiplier);
      const premiumDeltaCents = newPremiumCents - loan.currentInsurancePremiumCents;

      const stressedNoiCents = Math.max(0, loan.currentAnnualNoiCents - premiumDeltaCents);
      const baselineDscr = Number((loan.currentAnnualNoiCents / loan.annualDebtServiceCents).toFixed(2));
      const stressedDscr = Number((stressedNoiCents / loan.annualDebtServiceCents).toFixed(2));
      const dscrBreach = stressedDscr < dscrCovenantThreshold;

      // Direct capitalisation needs a positive cap rate. A loan whose current NOI
      // is zero or negative has none, and the revaluation is then not derivable
      // rather than derivable to 85% of appraised value — which is what the
      // previous fallback asserted, in a module whose stated doctrine is that
      // model constants come from the registry and never from the code.
      const capRate = loan.currentAnnualNoiCents / loan.originalAppraisedValueCents;
      const revaluedCollateralCents = capRate > 0 ? stressedNoiCents / capRate : null;
      const devaluationPct = revaluedCollateralCents === null ? null : Number(
        (((loan.originalAppraisedValueCents - revaluedCollateralCents) / loan.originalAppraisedValueCents) * 100).toFixed(1)
      );
      const stressedLtvPct = revaluedCollateralCents === null ? null : Number(((loan.outstandingLoanBalanceCents / revaluedCollateralCents) * 100).toFixed(1));

      // Bitemporal Lead Time: from when NotationsOS admitted the knowledge to the filing effective date
      const effectiveTime = new Date(matchingFiling.effectiveDate).getTime();
      const rawKt = matchingFiling.knowledgeTime || matchingFiling.provenance?.capturedAt || matchingFiling.filingDate;
      const knowledgeTime = new Date(rawKt).getTime();
      const leadTimeDays = Math.max(1, Math.round((effectiveTime - knowledgeTime) / (1000 * 60 * 60 * 24)));

      impacts.push({
        loanId: loan.loanId,
        countyName: loan.countyName,
        matchingFiling: {
          filingId: matchingFiling.filingId,
          carrierGroup: matchingFiling.carrierGroup,
          actionType: matchingFiling.actionType,
          effectiveDate: matchingFiling.effectiveDate,
        },
        status: matchingFiling.actionType === 'FULL_MARKET_WITHDRAWAL'
          ? 'CARRIER_WITHDRAWING'
          : matchingFiling.actionType === 'COUNTY_MORATORIUM_DECLARED'
          ? 'CORRIDOR_CAPACITY_SHRINK'
          : 'DEDUCTIBLE_DEFICIT',
        financialShock: {
          estimatedForcedPlacePremiumCents: newPremiumCents,
          premiumIncreaseRatio: premiumShockMultiplier,
          stressedNoiCents,
          baselineDscr,
          stressedDscr,
          dscrBreach,
          projectedCollateralDevaluationPct: devaluationPct,
          stressedLoanToValuePct: stressedLtvPct,
          ...(revaluedCollateralCents === null
            ? { revaluationUnavailableBecause: 'The loan\'s current NOI is not positive, so it has no cap rate and direct capitalisation cannot revalue the collateral.' }
            : {}),
        },
        estimatedLeadTimeToRepricingDays: leadTimeDays,
      });
    }
  }

  const totalCollateralCents = loans.reduce((acc, l) => acc + l.outstandingLoanBalanceCents, 0);
  const pctExposed = totalCollateralCents > 0
    ? Number(((exposedCollateralCents / totalCollateralCents) * 100).toFixed(1))
    : 0;

  const summary = {
    totalLoansEvaluated: loans.length,
    totalCollateralBalanceCents: totalCollateralCents,
    loansDirectlyImpacted: impacts.length,
    collateralBalanceExposedCents: exposedCollateralCents,
    pctPortfolioExposed: pctExposed,
  };

  // Generate cryptographic computation receipt without retaining loan books
  const computationReceipt = generateComputationReceipt(
    'InsurabilityDynamicsEngine',
    'v1.4.2-production-bitemporal',
    loans, // Hashed in-memory only; not persisted
    { summary, impactsCount: impacts.length },
    corpusReleaseDigest,
    asOfKnowledgeTime,
    paramSet
  );

  return {
    portfolioSummary: summary,
    loanImpacts: impacts,
    computationReceipt,
    disclaimer: 'Insurability change feed & collateral stress analysis only. Not an insurance underwriting quote, carrier pricing model, or loan covenant default notice.',
  };
}

/**
 * The digest a receipt carries when the caller named no corpus release. It is
 * not 64 hex characters, so nothing downstream can mistake it for one.
 */
export const CORPUS_RELEASE_NOT_DECLARED = 'NOT_DECLARED_BY_CALLER';

/**
 * The lead time each corridor must show for its feed to count as timely. These
 * are declared thresholds, not fitted ones: 21 days is the Florida policy
 * cancellation notice period and 30 days is one CMBS issuance cycle. They are
 * named here rather than typed into the comparison so that a reader can see
 * what the verdict below is a verdict about.
 */
export const FL_TIMELY_LEAD_DAYS = 21;
export const CA_TIMELY_LEAD_DAYS = 30;

/**
 * TWO CORRIDORS, RECONSTRUCTED FROM DECLARED DATES.
 *
 * What this function computes is the number of days between two timestamps that
 * are written into its own body, for each of the Florida 2022 insolvency wave
 * and the California 2023 constriction. It does not evaluate week-by-week
 * knowledge, and it does not query a feed for the interval: both endpoints are
 * constants, so the lead time is arithmetic over declared dates.
 *
 * One number in each report is read from the corpus — `admittedFilingsCount`,
 * via `queryFilingsAsOf` at the stated knowledge time, which is the part that
 * would change if the corpus changed. Every report carries `derivation` saying
 * which of its fields are which, because a document titled "backtest" whose
 * verdict does not move when the data moves is the exact shape of claim this
 * system exists to refuse.
 *
 * Unresolved and excluded cases are retained, as doctrine requires.
 */
export interface BacktestEvaluationReport {
  backtestName: string;
  experimentCorridor: string;
  asOfKnowledgeTime: ISODateTime;
  observableRepricingDate: ISODateTime;
  leadTimeDaysAheadOfRepricing: number;
  admittedFilingsCount: number;
  unresolvedOrExcludedCases: readonly {
    caseId: string;
    description: string;
    reasonForExclusion: string;
  }[];
  feedSignaledTimely: boolean;
  verdict: 'SUBSTANTIATED_LEAD_TIME' | 'FALSIFIED_OR_LATENT';
  /** Which fields of this report moved with the corpus and which did not. */
  derivation: {
    method: 'ARITHMETIC_OVER_DECLARED_DATES';
    fromCorpus: readonly string[];
    declaredInSource: readonly string[];
    timelyThresholdDays: number;
  };
}

export function runHistoricalCorpusBacktest(): BacktestEvaluationReport[] {
  // 1. Florida 2022 St. Johns Insolvency Wave
  // St. Johns liquidation consent order entered Feb 25, 2022.
  // Secondary debt repricing / forced-place notices triggered on policy cancellation day 30 (March 27, 2022).
  const flAdmitted = queryFilingsAsOf(FIXTURE_BITEMPORAL_OBSERVATIONS, '2022-02-25T14:10:00Z');
  const flLeadDays = Math.round(
    (new Date('2022-03-27T00:00:00Z').getTime() - new Date('2022-02-25T14:10:00Z').getTime()) / (1000 * 60 * 60 * 24)
  );

  const flTimely = flLeadDays >= FL_TIMELY_LEAD_DAYS;

  const flReport: BacktestEvaluationReport = {
    backtestName: 'Florida 2022 Insolvency Wave (St. Johns Liquidation)',
    experimentCorridor: 'FL_OIR Orange, Pinellas, Hillsborough Counties',
    asOfKnowledgeTime: '2022-02-25T14:10:00Z',
    observableRepricingDate: '2022-03-27T00:00:00Z',
    leadTimeDaysAheadOfRepricing: flLeadDays, // ~30 days
    admittedFilingsCount: flAdmitted.length,
    unresolvedOrExcludedCases: [
      {
        caseId: 'CASE-FL-UNRESOLVED-01',
        description: 'Avatar Property & Casualty receivership informal notice in late Feb 2022',
        reasonForExclusion: 'Preliminary administrative rumor excluded until official Leon County Circuit Court liquidation order entered March 2022.',
      },
    ],
    feedSignaledTimely: flTimely,
    verdict: flTimely ? 'SUBSTANTIATED_LEAD_TIME' : 'FALSIFIED_OR_LATENT',
    derivation: {
      method: 'ARITHMETIC_OVER_DECLARED_DATES',
      fromCorpus: ['admittedFilingsCount'],
      declaredInSource: ['asOfKnowledgeTime', 'observableRepricingDate', 'experimentCorridor', 'unresolvedOrExcludedCases'],
      timelyThresholdDays: FL_TIMELY_LEAD_DAYS,
    },
  };

  // 2. California 2023 Wildfire Pause (State Farm)
  // Harvested into archive May 27, 2023.
  // Secondary CRE mortgage debt spread widening observable in July 2023 CMBS issuance (~45 days lead time).
  const caAdmitted = queryFilingsAsOf(FIXTURE_BITEMPORAL_OBSERVATIONS, '2023-05-27T08:30:00Z');
  const caLeadDays = Math.round(
    (new Date('2023-07-15T00:00:00Z').getTime() - new Date('2023-05-27T08:30:00Z').getTime()) / (1000 * 60 * 60 * 24)
  );

  const caTimely = caLeadDays >= CA_TIMELY_LEAD_DAYS;

  const caReport: BacktestEvaluationReport = {
    backtestName: 'California 2023 Property Market Constriction (State Farm Pause)',
    experimentCorridor: 'CA_CDI Placer, El Dorado, Nevada Counties',
    asOfKnowledgeTime: '2023-05-27T08:30:00Z',
    observableRepricingDate: '2023-07-15T00:00:00Z',
    leadTimeDaysAheadOfRepricing: caLeadDays, // ~49 days
    admittedFilingsCount: caAdmitted.length,
    unresolvedOrExcludedCases: [
      {
        caseId: 'CASE-CA-EXCLUDED-01',
        description: 'Allstate personal lines temporary moratorium late 2022',
        reasonForExclusion: 'Personal lines homeowner filings segregated from commercial underwriting debt books.',
      },
    ],
    feedSignaledTimely: caTimely,
    verdict: caTimely ? 'SUBSTANTIATED_LEAD_TIME' : 'FALSIFIED_OR_LATENT',
    derivation: {
      method: 'ARITHMETIC_OVER_DECLARED_DATES',
      fromCorpus: ['admittedFilingsCount'],
      declaredInSource: ['asOfKnowledgeTime', 'observableRepricingDate', 'experimentCorridor', 'unresolvedOrExcludedCases'],
      timelyThresholdDays: CA_TIMELY_LEAD_DAYS,
    },
  };

  return [flReport, caReport];
}
