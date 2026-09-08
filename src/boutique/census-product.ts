import { CENSUS_FIELDS } from '../acquisition/fmcsa';
import { localRecordDigest } from '../data-os/local-record';

/** An observation inventory specification, not an assertion of current carrier state. */
export const CENSUS_OBSERVATION_PRODUCT = {
  schema: 'notations.information-product.v1',
  productId: 'caravan.company-census-observations', version: '1.0.0',
  title: 'Reported carrier organization observations',
  customerCategories: ['brokers', 'asset_managers', 'insurance_financing'],
  question: 'What did the selected Company Census response report about these corporate USDOT identifiers, when was it captured, and which reported fields changed between captures?',
  scope: {
    geography: 'Selected US corporate records; reported country/state codes only',
    cohort: 'Exact members of a pinned FMCSA v2 candidate build; not the carrier population',
    recordType: 'FMCSACompanyCensusObservation', maximumRecords: 64,
    fields: [...CENSUS_FIELDS],
  },
  freshness: { cadence: 'Operator-driven qualification; no recurring delivery promised', maximumCaptureAgeDays: 7 },
  temporalMeaning: 'Capture and knowledge times are recorded separately. World-valid time is UNOBSERVED, not inferred from filing dates or capture time.',
  identity: 'Source-scoped USDOT strings; no canonical organization resolution claimed',
  acceptance: {
    profileId: 'caravan.census-observation-qualification.v1',
    required: ['EXACT_DEPENDENCY_READBACK', 'CURRENT_INTERNAL_DERIVE', 'US_DOT_PRESENT', 'CAPTURE_WITHIN_SEVEN_DAYS'],
    missingness: 'Other fields may be OMITTED or EXPLICIT_NULL; present zero and unresolved source values remain distinct',
    authority: 'DETERMINISTIC_INTERNAL_PRODUCT_PROFILE', canonicalAdmission: false,
  },
  analytics: 'Field-level observation comparison and descriptive completeness counts only; no risk score or operational-status inference',
  formats: ['records.jsonl', 'records.csv', 'dictionary.json', 'quality.json', 'changes.json', 'terms.txt'],
  permittedUse: { audience: 'INTERNAL', purpose: 'source-qualification', customerDistribution: 'NOT_AUTHORIZED' },
  correction: 'Later observations form a new release. A difference alone is an OBSERVATION_UPDATE, not a correction or supersession of physical-world state.',
  limitations: [
    'The product is specified for engineering qualification; customer demand and commercial distribution permission are unresolved.',
    'No operating-authority, insurance-coverage, shipment-activity, precise-location or independent field-accuracy claim.',
    'Local digests establish content identity and reproducibility, not independent certification.',
  ],
} as const;

export const CENSUS_PRODUCT_DIGEST = localRecordDigest(CENSUS_OBSERVATION_PRODUCT);
