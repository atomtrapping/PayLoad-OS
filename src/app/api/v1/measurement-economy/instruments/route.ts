import { json } from '../../_lib';
import { getCalibratedInstruments } from '@/domain/n11MeasurementEconomy';
import { MIN_OBSERVATIONS_FOR_EMPIRICAL_CALIBRATION } from '@/domain/productionPipeline';
import { FIXTURE_TASKING_ORDERS } from '@/fixtures/frontier/productionCorpus';

export async function GET() {
  const instruments = getCalibratedInstruments(FIXTURE_TASKING_ORDERS);

  return json({
    schema: 'payload.frontier.measurement-economy.instruments.v1',
    count: instruments.length,
    doctrine: {
      role: 'MEASUREMENT_ECONOMY_SCHEDULER',
      boundary: 'Value-of-information optimization subscription; does not own sensor hardware or operate inspection service fleets.',
      // Not "calibrated continuously". The committed history holds one
      // completed order per instrument, and each profile carries the sample
      // sizes its rates were computed from, plus a confidence that says
      // PROVISIONAL below five observations. An adjective is not a moat; the
      // denominators are the claim.
      calibrationBasis: 'Sensitivity and false-alarm rate are re-estimated from completed tasking orders where the history supports it. Each instrument reports calibrationSource, the completed-observation count and the defect-site and sound-site counts each rate was computed over. A rate the history cannot support is not substituted: the declared vendor prior stands and calibrationSource stays VENDOR_SPEC_PRIOR.',
      calibrationThreshold: `An estimate is labelled CALIBRATED_EMPIRICAL only at ${MIN_OBSERVATIONS_FOR_EMPIRICAL_CALIBRATION} or more completed observations. Below that it is PROVISIONAL_FROM_HISTORY.`,
    },
    instruments,
    historicalTaskingOrdersCount: FIXTURE_TASKING_ORDERS.length,
  });
}
