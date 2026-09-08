import { describe, it, expect } from 'vitest';
import {
  getParameter,
  getActiveParameterSet,
  PARAMETER_SET_v2026_09,
} from './parameterRegistry';
import {
  evaluatePortfolioCollateralShock,
  runHistoricalCorpusBacktest,
  type LoanCollateralAsset,
} from './insurabilityDynamics';
import {
  optimizeInspectionTasking,
  getCalibratedInstruments,
  BASELINE_MEASUREMENT_INSTRUMENTS,
} from './n11MeasurementEconomy';
import {
  queryFilingsAsOf,
  buildInsurabilityPressureMart,
  calibrateInstrumentFromHistory,
  MIN_OBSERVATIONS_FOR_EMPIRICAL_CALIBRATION,
  type TaskingOrderRecord,
} from './productionPipeline';
import {
  FIXTURE_BITEMPORAL_OBSERVATIONS,
  FIXTURE_TASKING_ORDERS,
} from '@/fixtures/frontier/productionCorpus';
import {
  FIXTURE_STATE_DOI_FILINGS,
  FIXTURE_LOAN_PORTFOLIO,
  FIXTURE_PROJECT_DRAWS,
} from '@/fixtures/frontier/insurabilityAndN11';

describe('Production Substrate: Non-Negotiables & Acceptance Checks', () => {
  describe('1. Parameter Registry & Model Priors', () => {
    it('reads multipliers, covenants, and noise thresholds from versioned cited rows without hardcoded magic numbers', () => {
      const activeParams = getActiveParameterSet();
      expect(activeParams.version).toBe('param_set_2026_09_v1');
      expect(activeParams.parameterSetDigest).toMatch(/^sha256:[a-f0-9]{64}$/);

      const fullWithdrawalMultiplier = getParameter<number>(
        'insurability.forced_place.full_withdrawal_multiplier',
        activeParams
      );
      expect(fullWithdrawalMultiplier).toBe(3.8);

      const dscrCovenant = getParameter<number>(
        'credit.covenant.dscr_warning_threshold',
        activeParams
      );
      expect(dscrCovenant).toBe(1.15);

      const disputeCostRatio = getParameter<number>(
        'voi.dispute_delay.cost_ratio_of_draw',
        activeParams
      );
      expect(disputeCostRatio).toBe(0.015);

      // Verify full citation presence
      const row = activeParams.parameters['insurability.forced_place.full_withdrawal_multiplier'];
      expect(row.citation.sourceAuthority).toContain('WSIA');
      expect(row.citation.documentRef).toBeDefined();
    });

    it('propagates custom parameter set overrides deterministically without code changes', () => {
      // Create a stressed scenario with 5.0x multiplier
      const modifiedParams = {
        ...PARAMETER_SET_v2026_09,
        version: 'param_set_custom_stress_v2',
        parameters: {
          ...PARAMETER_SET_v2026_09.parameters,
          'insurability.forced_place.full_withdrawal_multiplier': {
            ...PARAMETER_SET_v2026_09.parameters['insurability.forced_place.full_withdrawal_multiplier'],
            value: 5.5,
          },
        },
      };

      const baseResult = evaluatePortfolioCollateralShock(
        FIXTURE_LOAN_PORTFOLIO,
        FIXTURE_STATE_DOI_FILINGS,
        { paramSet: PARAMETER_SET_v2026_09 }
      );

      const stressedResult = evaluatePortfolioCollateralShock(
        FIXTURE_LOAN_PORTFOLIO,
        FIXTURE_STATE_DOI_FILINGS,
        { paramSet: modifiedParams }
      );

      // A higher multiplier must yield higher forced-place premiums and deeper DSCR drops
      const baseLoan = baseResult.loanImpacts[0];
      const stressedLoan = stressedResult.loanImpacts[0];

      expect(stressedLoan.financialShock.estimatedForcedPlacePremiumCents).toBeGreaterThan(
        baseLoan.financialShock.estimatedForcedPlacePremiumCents
      );
      expect(stressedLoan.financialShock.stressedDscr).toBeLessThanOrEqual(
        baseLoan.financialShock.stressedDscr
      );
    });
  });

  describe('2. Customer Confidentiality & Zero Data Contamination', () => {
    it('never persists raw loan portfolios into canonical state, emitting only hashed receipts', () => {
      const confidentialLoans: LoanCollateralAsset[] = [
        {
          loanId: 'CONFIDENTIAL-BORROWER-SECRET-001',
          borrowerName: 'Private Sovereign Real Estate Fund VII',
          propertyType: 'COMMERCIAL_OFFICE',
          address: '400 Capitol Mall, Sacramento, CA',
          countyFips: '06061', // Placer County
          countyName: 'Placer County',
          stateCode: 'CA',
          originalAppraisedValueCents: 15000000000,
          outstandingLoanBalanceCents: 9500000000,
          currentAnnualNoiCents: 1200000000,
          annualDebtServiceCents: 750000000,
          currentInsurancePremiumCents: 25000000,
          currentInsuringCarrierNaic: '24740', // Pacific Horizon
        },
      ];

      const result = evaluatePortfolioCollateralShock(
        confidentialLoans,
        FIXTURE_STATE_DOI_FILINGS
      );

      // The computation receipt contains the hash of the inputs, never the plaintext
      const receipt = result.computationReceipt;
      expect(receipt.inputsDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(receipt.confidentialityGuarantee).toBe('EPHEMERAL_IN_MEMORY_ZERO_PERSISTENCE');
      expect(receipt.parameterSetVersion).toBe(getActiveParameterSet().version);

      // The receipt digest changes if input changes
      const alteredLoans = [{ ...confidentialLoans[0], outstandingLoanBalanceCents: 9600000000 }];
      const alteredResult = evaluatePortfolioCollateralShock(alteredLoans, FIXTURE_STATE_DOI_FILINGS);
      expect(alteredResult.computationReceipt.inputsDigest).not.toBe(receipt.inputsDigest);
    });
  });

  describe('3. Bitemporality & Point-in-Time Query Discipline', () => {
    it('prevents lookahead bias by filtering on knowledge_time <= asOfDate', () => {
      // In early 2023, the 2026 filings were impossible to know
      const early2023Observations = queryFilingsAsOf(
        FIXTURE_BITEMPORAL_OBSERVATIONS,
        '2023-01-01T00:00:00Z'
      );

      // Should only contain the 2022 Florida St. Johns filing
      expect(early2023Observations.length).toBe(1);
      expect(early2023Observations[0].observationId).toBe('OBS-FL-2022-STJOHNS');

      // In mid-2023, State Farm announcement becomes known
      const mid2023Observations = queryFilingsAsOf(
        FIXTURE_BITEMPORAL_OBSERVATIONS,
        '2023-06-01T00:00:00Z'
      );
      expect(mid2023Observations.length).toBe(2);
      expect(mid2023Observations.some((o) => o.observationId === 'OBS-CA-2023-STATEFARM')).toBe(true);

      // In August 2026, all 4 filings are known
      const late2026Observations = queryFilingsAsOf(
        FIXTURE_BITEMPORAL_OBSERVATIONS,
        '2026-08-05T00:00:00Z'
      );
      expect(late2026Observations.length).toBe(4);
    });

    it('reconstructs county-level FIPS insurability pressure marts correctly as of point in time', () => {
      const mart2022 = buildInsurabilityPressureMart(
        FIXTURE_BITEMPORAL_OBSERVATIONS,
        '2022-03-01T00:00:00Z'
      );

      // In March 2022, only Florida counties had withdrawal pressure
      expect(mart2022.length).toBe(3);
      expect(mart2022.every((m) => m.stateCode === 'FL')).toBe(true);

      const mart2026 = buildInsurabilityPressureMart(
        FIXTURE_BITEMPORAL_OBSERVATIONS,
        '2026-08-10T00:00:00Z'
      );

      // In August 2026, California (Placer, El Dorado, Nevada) and Florida are all represented
      expect(mart2026.length).toBeGreaterThan(4);
      const placer = mart2026.find((m) => m.fipsCode === '06061');
      expect(placer).toBeDefined();
      expect(placer?.activeWithdrawnCarriersCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Historical Natural Experiment Acceptance Check', () => {
    it('validates lead time against observable repricing events with unresolved/excluded cases retained', () => {
      const reports = runHistoricalCorpusBacktest();
      expect(reports.length).toBe(2);

      const fl = reports[0];
      expect(fl.backtestName).toContain('Florida 2022');
      expect(fl.feedSignaledTimely).toBe(true);
      expect(fl.leadTimeDaysAheadOfRepricing).toBeGreaterThanOrEqual(25);
      expect(fl.unresolvedOrExcludedCases.length).toBeGreaterThan(0);
      expect(fl.verdict).toBe('SUBSTANTIATED_LEAD_TIME');

      const ca = reports[1];
      expect(ca.backtestName).toContain('California 2023');
      expect(ca.feedSignaledTimely).toBe(true);
      expect(ca.leadTimeDaysAheadOfRepricing).toBeGreaterThanOrEqual(40);
      expect(ca.unresolvedOrExcludedCases.length).toBeGreaterThan(0);
      expect(ca.verdict).toBe('SUBSTANTIATED_LEAD_TIME');
    });
  });

  describe('5. Closed-Loop N11 Tasking Calibration', () => {
    /** One completed order per instrument is what the committed corpus holds. */
    const extraOrder = (over: Partial<TaskingOrderRecord> = {}): TaskingOrderRecord => ({
      orderId: 'N11-TASK-CALIB-TEST',
      projectId: 'PRJ-TEST',
      targetMilestone: 'Test Milestone',
      instrumentId: 'SENTINEL_SAR_OPTICAL',
      status: 'CALIBRATED',
      dispatchedAt: '2026-08-01T00:00:00Z',
      priors: { assumedSensitivity: 0.72, assumedFalseAlarmRate: 0.18, authorizedCostCents: 0 },
      observationOutcome: { defectActuallyExisted: true, instrumentDetectedDefect: true, turnaroundHoursElapsed: 44, measuredNoiseVarianceMm: 9500 },
      ...over,
    });

    it('estimates a rate from the class that has cases and answers null for the class that does not', () => {
      // One defect site, detected. Sensitivity is 1.000 over a denominator of
      // one — which the counts say out loud — and there is no sound site, so
      // the false-alarm rate is not estimated rather than being defaulted.
      const calib = calibrateInstrumentFromHistory('SENTINEL_SAR_OPTICAL', [...FIXTURE_TASKING_ORDERS, extraOrder()]);
      expect(calib.completedObservationsCount).toBe(1);
      expect(calib.empiricalSensitivity).toBe(1.0);
      expect(calib.defectSiteCount).toBe(1);
      expect(calib.empiricalFalseAlarmRate).toBeNull();
      expect(calib.soundSiteCount).toBe(0);
    });

    it('answers NOT_ESTIMATED with no numbers at all for an instrument with no completed order', () => {
      const calib = calibrateInstrumentFromHistory('SENTINEL_SAR_OPTICAL', []);
      expect(calib.calibrationConfidence).toBe('NOT_ESTIMATED');
      // Not 0.85 and 0.05. Those were hardcoded numbers returned under field
      // names beginning with `empirical`, which is the shape of claim this
      // repository exists to refuse.
      expect(calib.empiricalSensitivity).toBeNull();
      expect(calib.empiricalFalseAlarmRate).toBeNull();
    });

    it('calls an estimate empirical only at the threshold it publishes, not at one observation', () => {
      const belowThreshold = calibrateInstrumentFromHistory('SENTINEL_SAR_OPTICAL', [...FIXTURE_TASKING_ORDERS, extraOrder()]);
      expect(belowThreshold.completedObservationsCount).toBeLessThan(MIN_OBSERVATIONS_FOR_EMPIRICAL_CALIBRATION);
      expect(belowThreshold.calibrationConfidence).toBe('PROVISIONAL');

      const atThreshold = calibrateInstrumentFromHistory('SENTINEL_SAR_OPTICAL', Array.from(
        { length: MIN_OBSERVATIONS_FOR_EMPIRICAL_CALIBRATION },
        (_, index) => extraOrder({ orderId: `N11-TASK-CALIB-${index}` }),
      ));
      expect(atThreshold.calibrationConfidence).toBe('CALIBRATED_EMPIRICAL');
    });

    it('labels every instrument in the served table by what its history supports', () => {
      // Before this, one completed order per instrument was enough to stamp
      // CALIBRATED_EMPIRICAL on the whole table.
      const profiles = getCalibratedInstruments(FIXTURE_TASKING_ORDERS);
      const lidar = profiles.find((p) => p.id === 'TERRESTRIAL_LIDAR_SCAN')!;
      expect(lidar.calibrationSource).toBe('PROVISIONAL_FROM_HISTORY');
      expect(lidar.calibrationEvidence?.completedObservationsCount).toBe(1);

      const untouched = profiles.find((p) => p.calibrationEvidence?.calibrationConfidence === 'NOT_ESTIMATED');
      expect(untouched?.calibrationSource).toBe('VENDOR_SPEC_PRIOR');
    });

    it('keeps a declared prior when the history cannot speak to that class, instead of substituting a default', () => {
      const declared = BASELINE_MEASUREMENT_INSTRUMENTS.find((i) => i.id === 'RTK_DRONE_PHOTOGRAMMETRY')!;
      const served = getCalibratedInstruments(FIXTURE_TASKING_ORDERS).find((p) => p.id === 'RTK_DRONE_PHOTOGRAMMETRY')!;
      // The fixture holds no defect site for this instrument, so its declared
      // sensitivity stands. It used to be replaced by a hardcoded 0.90 and then
      // reported as calibrated.
      expect(served.calibrationEvidence?.defectSiteCount).toBe(0);
      expect(served.defectDetectionSensitivity).toBe(declared.defectDetectionSensitivity);
      expect(served.defectDetectionSensitivity).not.toBe(0.90);
    });

    it('emits computation receipts with parameter set echo in Bayesian VOI optimization', () => {
      const schedule = optimizeInspectionTasking(FIXTURE_PROJECT_DRAWS[0]);
      expect(schedule.recommendedInstrument).toBeDefined();
      expect(schedule.computationReceipt).toBeDefined();
      expect(schedule.computationReceipt.parameterSetVersion).toBe(getActiveParameterSet().version);
      expect(schedule.computationReceipt.inputsDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });
});
