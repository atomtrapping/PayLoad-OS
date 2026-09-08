/**
 * Usage as telemetry: what a lap is, and what makes it billable by construction.
 *
 * The performance of the production system generates usage; usage generates
 * telemetry; telemetry is a product. Every query against a corpus, every compute
 * run over it and every agent invocation through it is a lap. The claim that
 * follows is that billing is traceable by construction, because every response
 * is receipted — so a bill line points at an exact response over an exact
 * release, and a customer can audit it without trusting the invoice.
 *
 * That claim is checkable, so this module checks it. `meteringReadiness()`
 * compares what a response envelope actually carries against what a traceable
 * bill line needs, and reports the gap rather than asserting the conclusion.
 * Today the content half is present — release, parameter set, verification rung,
 * data class — and the event half is absent: no response identifier, no digest
 * of what was returned, no requester. A bill could name what the corpus was; it
 * could not yet name which response it is charging for.
 *
 * The metering entry and the recall entry are the same object. A retraction has
 * to know who holds an affected record; a bill has to know who consumed what.
 * `DELIVERY_LEDGER` in ./correction specifies it once, for both.
 *
 * Nothing here prices anything, invoices anything, or invents a customer. There
 * is no rate, no currency and no subscriber, because none exists.
 */
import { DELIVERY_LEDGER } from './correction';
import { SYSTEM_DATA_CLASS, SYSTEM_PARAMETER_SET_VERSION, SYSTEM_VERIFICATION_RUNG } from '@/app/api/v1/_lib';

/* ── The lap ── */

/** A unit of metered usage. Closed. */
export type UsageUnit = 'QUERY' | 'COMPUTE_RUN' | 'AGENT_INVOCATION' | 'CLEAN_ROOM_HOUR';

export interface UsageUnitSpec {
  id: UsageUnit;
  title: string;
  /** What one of them is, precisely enough to count. */
  what: string;
  /** Where such a thing already happens in this repository, or that it does not. */
  here: string;
  /** Whether anything counts it today. */
  counted: boolean;
}

export const USAGE_UNITS: readonly UsageUnitSpec[] = [
  {
    id: 'QUERY',
    title: 'Query',
    what: 'One answered request against a corpus: a record list, an as-of answer, a release or manifest read, a retraction poll. A refusal is a query too — it consumed the corpus to decide the refusal, and it is the answer the customer received.',
    here: 'The feed under /api/v1 and the MCP tools answer these. Nothing counts them.',
    counted: false,
  },
  {
    id: 'COMPUTE_RUN',
    title: 'Compute run',
    what: 'One retained execution of an instrument over declared inputs: a replay, a benchmark, a registration fit, a clearance evaluation, a GAT audit.',
    here: 'Each instrument retains a run with its dependencies and digests under an operator-selected root. The runs exist; nothing meters them.',
    counted: false,
  },
  {
    id: 'AGENT_INVOCATION',
    title: 'Agent invocation',
    what: 'One tool call an external agent makes through the MCP surface, which is a query with an agent as the caller rather than a person.',
    here: 'The MCP server exposes the tools over stdio. The caller is not identified and the call is not recorded.',
    counted: false,
  },
  {
    id: 'CLEAN_ROOM_HOUR',
    title: 'Clean-room hour',
    what: 'Elapsed time of customer computation running against a corpus inside a bounded environment, where the tariff is on access and compute rather than on someone else’s infrastructure.',
    here: 'No hosted execution exists. Every instrument here runs on the operator’s own machine, under the operator’s own flags.',
    counted: false,
  },
];

/* ── What a bill line has to point at ── */

export type FieldState = 'CARRIED' | 'ABSENT';

export interface ReceiptField {
  field: string;
  /** Why a bill line needs it. */
  why: string;
  state: FieldState;
  /** Where it is carried, or what would have to carry it. */
  where: string;
  /** Which half of the receipt it belongs to. */
  half: 'CONTENT' | 'EVENT';
}

/**
 * The response receipt, field by field. CONTENT fields say what the corpus was;
 * EVENT fields say which response this is and who received it. A bill needs
 * both: the first makes the charge auditable, the second makes it attributable.
 */
export const RECEIPT_FIELDS: readonly ReceiptField[] = [
  { field: 'corpus_release', half: 'CONTENT', why: 'The exact release the answer came from, so the charge is reproducible against it.', state: 'CARRIED', where: 'Response envelope and the X-Payload-Corpus-Release header.' },
  { field: 'parameter_set_version', half: 'CONTENT', why: 'The parameters in force, so a recomputation reaches the same answer.', state: 'CARRIED', where: 'Response envelope and the X-Payload-Parameter-Set header.' },
  { field: 'verification_rung', half: 'CONTENT', why: 'What was verified about the answer, so the customer knows what the charge bought.', state: 'CARRIED', where: 'Response envelope and the X-Payload-Verification-Rung header.' },
  { field: 'data_class', half: 'CONTENT', why: 'Whether the answer is real or synthetic. A demonstration must never be billable.', state: 'CARRIED', where: 'Response envelope and the X-Payload-Data-Class header.' },
  { field: 'response_id', half: 'EVENT', why: 'One identifier the customer and the bill both name, so a line item resolves to a response.', state: 'ABSENT', where: 'Nowhere. No response carries an identifier of its own.' },
  { field: 'response_digest', half: 'EVENT', why: 'A digest of what was returned, so a disputed charge is settled by recomputation rather than by assertion.', state: 'ABSENT', where: 'Nowhere. Records carry content hashes; the response as a whole does not.' },
  { field: 'recipient_id', half: 'EVENT', why: 'Who received it. Without this a bill cannot be attributed and a retraction cannot reach the holder.', state: 'ABSENT', where: 'Nowhere. The feed is unauthenticated and stateless.' },
  { field: 'unit', half: 'EVENT', why: 'Which lap this was, so the count is of comparable things.', state: 'ABSENT', where: 'Nowhere. Nothing classifies a response as a unit of usage.' },
  { field: 'served_at', half: 'EVENT', why: 'When, on the server’s clock, so a billing period has an edge.', state: 'ABSENT', where: 'Nowhere. Responses carry no serving instant; the corpus clocks are the record’s, not the response’s.' },
];

export interface MeteringReadiness {
  /** Fields a response already carries. */
  carried: readonly string[];
  /** Fields a traceable bill line needs and no response carries. */
  missing: readonly string[];
  /** True only when every field is carried. */
  billableByConstruction: boolean;
  /** What a bill could honestly claim today. */
  statement: string;
}

/** Pure: reads the receipt contract and reports the gap without narrowing it. */
export function meteringReadiness(): MeteringReadiness {
  const carried = RECEIPT_FIELDS.filter((f) => f.state === 'CARRIED').map((f) => f.field);
  const missing = RECEIPT_FIELDS.filter((f) => f.state === 'ABSENT').map((f) => f.field);
  return {
    carried,
    missing,
    billableByConstruction: missing.length === 0,
    statement: missing.length === 0
      ? 'Every response carries what a bill line needs; metering is traceable by construction.'
      : `A response says what the corpus was — ${carried.join(', ')} — and not which response it is or who received it. ${missing.length} field${missing.length === 1 ? '' : 's'} would have to be carried before a bill line could resolve to an exact response: ${missing.join(', ')}.`,
  };
}

/** What the envelope pins today, read from the contract rather than restated. */
export const ENVELOPE_TODAY = {
  dataClass: SYSTEM_DATA_CLASS,
  parameterSetVersion: SYSTEM_PARAMETER_SET_VERSION,
  verificationRung: SYSTEM_VERIFICATION_RUNG,
  note: 'The demonstration corpus is declared synthetic on every response, which is also what makes it unbillable: a lap over a demonstration is not a lap.',
} as const;

/* ── The boundary ── */

/**
 * Meter the usage; do not become the rails. Metering needs receipts, not
 * liability. Each of these is a thing the firm does not become, with the reason
 * it would cost more than it earns.
 */
export const METERING_BOUNDARY = {
  posture: 'Bill like a telemetry vendor, not like a payments network.',
  notThis: [
    { role: 'Settlement participant', why: 'Taking a share of transfers between other parties absorbs liability and payment-company obligations, and none of it is supported by the asset. The asset is the corpus, not the money movement.' },
    { role: 'Infrastructure toll', why: 'Charging a platform for running on a substrate reverses the direction that actually holds: data gravity kept workloads local, it did not pay data providers rent. A toll invites the tax question without the moat.' },
    { role: 'The tax', why: 'A firm that taxes every use of a format eventually has the tax taken from it. Meter what the firm produced; do not meter what others do with their own machines.' },
  ],
  instead: 'The tariff is on access to the corpus and on compute over it: per query, per compute run, per clean-room hour. Each is a thing the firm performed and can produce a receipt for.',
} as const;

/* ── The same asset, three ways ── */

export const TELEMETRY_PILLARS = [
  { pillar: 'Data products', sells: 'The telemetry itself, as the three APIs.', here: 'All three lines have a demonstration corpus behind one fixture feed; none is a live customer API and none is metered, because nothing has been delivered.' },
  { pillar: 'Hosting and compute', sells: 'Runs of it, over authorized releases.', here: 'The instruments run locally on the operator’s machine. No hosted execution exists.' },
  { pillar: 'Proprietary capital', sells: 'Nothing: it trades on the same exhaust, under a separate governance boundary.', here: 'Absent, and separated by declaration: no source in the corpus permits proprietary strategy or trading, and the rights matrix says so on every release.' },
] as const;

/* ── The federation risk ── */

/**
 * If customers federate — a consortium, a shared utility — they reproduce the
 * aggregate position, because facts are resellable. What they cannot reproduce
 * is the estate that made the facts usable.
 */
export const FEDERATION_RISK = {
  risk: 'Customers who pool their holdings replicate the aggregate corpus. Anyone can resell a fact; a consortium can resell all of them.',
  defence: 'The identity and decision estates do not pool. A shared format is not a shared resolution: two members can exchange records and still not agree on which two identifiers name the same carrier, at what time, on what evidence — and neither holds the other’s corrections.',
  whatCannotBePooled: [
    'The resolution decisions: which identifiers were carried to one subject, on what evidence, by which method and version, and both clocks.',
    'The calibration: what each source was worth, corroborated against which others, and how that changed.',
    'The corrected history: what was withdrawn, what replaced it, and who was told — which is the delivery ledger again.',
  ],
  /** Kept honest: none of these exists yet. */
  here: 'None of the three is implemented. Resolution is absent, corroboration scoring is absent, and the delivery ledger is specified and empty. The defence is a statement of what to build, not a claim about what protects the firm today.',
} as const;

/* ── Where the firm plugs in ── */

export type IntegrationPosture = 'DEPENDENCY' | 'PROVIDER';

export const INTEGRATION = {
  chosen: 'DEPENDENCY' as IntegrationPosture,
  dependency: {
    what: 'The API is the evidence-bounded data source that customer compute calls. Their function imports the client, and every invocation carries provenance context; receipt digests appear in their own structured logs, so a run over these records emits audit-grade telemetry in the customer’s observability stack.',
    role: 'A dependency: invisible, everywhere, metered.',
    state: 'ABSENT' as const,
    needs: 'A published client, a response receipt for it to log, and an identified caller. The first is work; the second and third are the missing half of the receipt above.',
  },
  provider: {
    what: 'The inverse: other platforms run on the firm’s substrate and pay for it.',
    state: 'REJECTED' as const,
    why: 'It makes the firm a settlement participant, which absorbs liability the corpus does not support. See METERING_BOUNDARY.',
  },
} as const;

/** The metering entry and the recall entry are one object, specified once. */
export const METERING_LEDGER_IS_THE_DELIVERY_LEDGER = {
  claim: 'One delivery entry serves both recall and billing.',
  because: 'A retraction must reach everyone holding an affected record; a bill must name what each recipient consumed. Both need recipient, release, what was returned and when.',
  specifiedAt: 'src/domain/correction.ts DELIVERY_LEDGER',
  state: DELIVERY_LEDGER.state,
} as const;
