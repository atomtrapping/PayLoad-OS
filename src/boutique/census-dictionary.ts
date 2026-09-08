import { CENSUS_FIELDS } from '../acquisition/fmcsa';
import { CENSUS_OBSERVATION_PRODUCT } from './census-product';

const meanings: Record<typeof CENSUS_FIELDS[number], [string, string, string | null]> = {
  dot_number: ['Source-scoped USDOT identifier; leading/source text preserved', 'string', null],
  legal_name: ['Organization name exactly as the source reported it', 'string', null],
  business_org_desc: ['Reported organization description; not independently verified', 'string', null],
  status_code: ['Source status code; no operating-authority determination', 'string', null],
  carrier_operation: ['Source operation code retained without interpretation', 'string', null],
  phy_country: ['Reported country code, not a coordinate', 'string', null],
  phy_state: ['Reported state code, not a facility position', 'string', null],
  power_units: ['Reported nonnegative power-unit count', 'integer', 'POWER_UNIT'],
  total_drivers: ['Reported nonnegative driver count; zero is present', 'integer', 'DRIVER'],
  mcs150_date: ['Source filing date, YYYY-MM-DD, without timezone or inferred validity interval', 'date-only string', null],
  mcs150_mileage: ['Reported mileage magnitude; dataset unit unresolved, no conversion', 'integer', null],
  mcs150_mileage_year: ['Reported calendar year; source zero is retained raw and has null typed interpretation', 'integer or null', null],
  docket1prefix: ['Source docket prefix without inferred status', 'string', null],
  docket1: ['Source docket identifier, retained as text', 'string', null],
  docket1_status_code: ['Source docket status code, not verified authorization', 'string', null],
};

export const CENSUS_COLUMN_DICTIONARY = {
  schema: 'notations.census-column-dictionary.v1',
  product: CENSUS_OBSERVATION_PRODUCT,
  authoritativeRecordFormat: 'records.jsonl: exact normalized candidate including fields, validTime, temporal, identity and provenance',
  sourceFields: CENSUS_FIELDS.map((name) => ({ name, meaning: meanings[name][0], valueType: meanings[name][1], knownUnit: meanings[name][2] })),
  csvColumns: [
    { name: 'source_record_id', type: 'string', meaning: 'Source-scoped USDOT; not canonical resolved identity' },
    { name: 'captured_at', type: 'UTC instant', meaning: 'When the source response was captured' },
    { name: 'known_at', type: 'UTC instant', meaning: 'When this normalized observation was produced' },
    { name: 'valid_time_state', type: 'UNOBSERVED', meaning: 'No physical-world effective interval established' },
    ...CENSUS_FIELDS.flatMap((name) => [
      { name: `${name}.raw`, type: 'source string or empty CSV cell', meaning: `Original text for ${name}; see presence to distinguish absence from an empty cell` },
      { name: `${name}.presence`, type: 'PRESENT | EXPLICIT_NULL | OMITTED', meaning: 'Whether the source returned a value, explicit null, or no field' },
      { name: `${name}.value`, type: meanings[name][1], meaning: meanings[name][0] },
      { name: `${name}.unit`, type: 'string or empty CSV cell', meaning: meanings[name][2] ? `When present: ${meanings[name][2]}; see JSONL for null on absent fields` : 'No unit established; empty is not an assumed unit' },
      { name: `${name}.interpretation`, type: 'string', meaning: 'Versioned adapter interpretation or explicit unresolved meaning for this value' },
    ]),
  ],
  nulls: 'JSONL preserves null exactly. CSV uses an empty cell for null; presence and interpretation disambiguate it. Present numeric zero remains zero.',
  spreadsheetSafety: 'Formula/control-prefixed source text is apostrophe-prefixed in CSV only. JSONL is the lossless representation.',
  lineage: 'Each JSONL record contains exact capture, acquisition, source-policy, derivation, adapter and evidence references. Release metadata binds the candidate build and file digests.',
} as const;
