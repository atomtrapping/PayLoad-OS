import { json } from '../../_lib';
import { runHistoricalCorpusBacktest } from '@/domain/insurabilityDynamics';

export async function GET() {
  const reports = runHistoricalCorpusBacktest();

  return json({
    schema: 'payload.frontier.insurability.backtest.v1',
    evaluatedAt: new Date().toISOString(),
    doctrine: {
      rule: 'Backtest Track 3 against known events with bitemporal discipline; retain unresolved and excluded cases.',
      invariant: 'Only knowledge knowable at T is queried to measure genuine lead time ahead of debt repricing.',
      // What each report is actually made of, so the invariant above is read as
      // the discipline it describes rather than as a claim about these numbers.
      method: 'ARITHMETIC_OVER_DECLARED_DATES',
      whatMovesWithTheCorpus: 'admittedFilingsCount, via queryFilingsAsOf at each corridor’s stated knowledge time. Every other field of every report is declared in source, including both endpoints of each lead-time subtraction. Each report carries a derivation block saying so.',
    },
    reports,
  });
}
