/**
 * Statutory filings: from bytes somebody kept to fields a gate can rule on.
 *
 * `/api/v1/insurability/filings` serves records it labels honestly —
 * `synthetic: N, admitted: 0` — because nothing statutory has ever crossed the
 * admission gate. The gate exists, identity resolution exists, world-time
 * establishment exists, and the projection from rail shape to assertion shape
 * exists. What was missing was a source that could reach them. This is that
 * source, and it is the insurance-regulator filing: a consent order, a
 * moratorium bulletin, a commissioner's order.
 *
 * WHERE IT BEGINS, AND WHY NOT EARLIER
 *
 * It begins at bytes the operator supplies. Nothing here fetches, polls, logs
 * in or schedules, and there is no code path from this module to a network.
 * Collection against a live regulator is the operator's act, under the
 * operator's credentials and the operator's reading of the source's terms; a
 * harvester that reached out on its own behalf would be making that decision
 * for them. So the capture stage takes bytes and a declaration about where they
 * came from, computes a digest over exactly those bytes, and asserts nothing
 * about how they were obtained beyond what it was told.
 *
 * That is also why `beganAs` is required and never inferred. This module cannot
 * tell an operator's capture of a real order from a drafted specimen — the
 * bytes look the same — so it refuses to guess and carries the declaration
 * through to the served payload. A reader who wants to know whether a record
 * descends from a real filing reads the declaration, and if the declaration is
 * wrong that is a lie somebody told, which is a different failure from a system
 * that quietly assumed.
 *
 * THE GRAMMAR IS DECLARED, NOT DISCOVERED
 *
 * Each jurisdiction prints its header fields with its own labels, and the
 * labels are declared here per jurisdiction rather than sniffed out of the
 * document. A parser that discovered its own field names would be inventing
 * vocabulary, which is the same mistake `candidateProjection` refuses when it
 * declines to derive a predicate from a field name.
 *
 * FOUR ANSWERS, NOT TWO
 *
 * A field is PRESENT, or it is one of three different kinds of absence, and
 * collapsing them would throw away the part that matters:
 *
 * ABSENT — the label does not appear. The document says nothing about this,
 * which is not the document saying zero, none or unknown.
 *
 * MALFORMED — the label appears and the value does not read as the declared
 * kind. The document said something this grammar cannot understand. That is a
 * fact about the grammar as much as the document, and it is emphatically not
 * absence: a filing that states an effective date this parser cannot read has
 * an effective date.
 *
 * AMBIGUOUS — the label appears more than once with different values. Taking
 * the first would be settling a contradiction on document order, which is the
 * tiebreak `identityResolution` already refuses for the same reason.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not read PDFs, understand prose, or infer a field from a sentence.
 * A document that states its effective date in a paragraph rather than a
 * labelled line yields ABSENT for that field, and the filing is refused
 * downstream on the clocks. That is the correct outcome and not a defect to be
 * patched with a regular expression over English.
 */
import { createHash } from 'node:crypto';
import type { ISODateTime } from './types';

export const HARVEST_METHOD = 'notationsos.statutory-harvest.v1';

/** The three jurisdictions whose header grammar is declared here. */
/**
 * The three regulators, named once.
 *
 * This union was declared twice with two names — `JurisdictionId` here and
 * `StatutoryJurisdiction` in the acquisition layer — with identical members.
 * Two names for one vocabulary is the drift the operating rule forbids: a
 * fourth regulator added to one of them and not the other would compile
 * cleanly and be wrong at the boundary between them, which is exactly where a
 * capture is matched to the grammar that reads it.
 *
 * It lives in the domain because a regulator's identity is a fact about the
 * world rather than about a transport. Acquisition consumes it, which is the
 * right direction: acquisition exists to serve the corpus.
 */
export type JurisdictionId = 'FL_OIR' | 'CA_CDI' | 'TX_TDI';

/** What a header value is supposed to read as. A value that does not is MALFORMED, never absent. */
export type FieldKind = 'TEXT' | 'IDENTIFIER' | 'INTEGER' | 'PERCENT' | 'INSTANT';

export interface FieldRule {
  /** The name this rail uses. The corpus predicate is declared separately and is not this. */
  readonly field: string;
  /** The label the jurisdiction prints, as it prints it. Declared, never discovered. */
  readonly label: string;
  readonly kind: FieldKind;
}

export interface JurisdictionGrammar {
  readonly id: JurisdictionId;
  readonly regulator: string;
  readonly stateCode: string;
  /** The issuing authority named on the document, used in the world-time declaration. */
  readonly declaredBy: string;
  readonly fields: readonly FieldRule[];
}

/**
 * The declared grammars. Each field list is what that regulator's machine-readable
 * header block carries; a field absent from a list is a field this rail does not
 * read from that jurisdiction, which is a statement about this adapter.
 */
export const JURISDICTION_GRAMMAR: Readonly<Record<JurisdictionId, JurisdictionGrammar>> = Object.freeze({
  FL_OIR: {
    id: 'FL_OIR',
    regulator: 'Florida Office of Insurance Regulation',
    stateCode: 'FL',
    declaredBy: 'Florida Office of Insurance Regulation',
    fields: [
      { field: 'orderReference', label: 'Case No', kind: 'IDENTIFIER' },
      { field: 'carrierNaic', label: 'NAIC Company Code', kind: 'IDENTIFIER' },
      { field: 'carrierName', label: 'Respondent', kind: 'TEXT' },
      { field: 'filingType', label: 'Order Type', kind: 'TEXT' },
      { field: 'lineOfBusiness', label: 'Line of Business', kind: 'TEXT' },
      { field: 'primaryPeril', label: 'Peril', kind: 'TEXT' },
      { field: 'effectiveDate', label: 'Effective Date', kind: 'INSTANT' },
      { field: 'issuedDate', label: 'Filed', kind: 'INSTANT' },
      { field: 'policiesImpacted', label: 'Policies Affected', kind: 'INTEGER' },
      { field: 'capacityReductionPct', label: 'Capacity Reduction', kind: 'PERCENT' },
    ],
  },
  CA_CDI: {
    id: 'CA_CDI',
    regulator: 'California Department of Insurance',
    stateCode: 'CA',
    declaredBy: 'California Department of Insurance',
    fields: [
      { field: 'orderReference', label: 'Bulletin No', kind: 'IDENTIFIER' },
      { field: 'carrierNaic', label: 'NAIC Company Code', kind: 'IDENTIFIER' },
      { field: 'carrierName', label: 'Addressee', kind: 'TEXT' },
      { field: 'filingType', label: 'Subject', kind: 'TEXT' },
      { field: 'lineOfBusiness', label: 'Line', kind: 'TEXT' },
      { field: 'primaryPeril', label: 'Peril', kind: 'TEXT' },
      { field: 'effectiveDate', label: 'Effective', kind: 'INSTANT' },
      { field: 'issuedDate', label: 'Issued', kind: 'INSTANT' },
      { field: 'policiesImpacted', label: 'Policies In Force Affected', kind: 'INTEGER' },
      { field: 'capacityReductionPct', label: 'Capacity Reduction', kind: 'PERCENT' },
    ],
  },
  TX_TDI: {
    id: 'TX_TDI',
    regulator: 'Texas Department of Insurance',
    stateCode: 'TX',
    declaredBy: 'Texas Department of Insurance',
    fields: [
      { field: 'orderReference', label: 'Order No', kind: 'IDENTIFIER' },
      { field: 'carrierNaic', label: 'NAIC Number', kind: 'IDENTIFIER' },
      { field: 'carrierName', label: 'Insurer', kind: 'TEXT' },
      { field: 'filingType', label: 'Order Type', kind: 'TEXT' },
      { field: 'lineOfBusiness', label: 'Line of Business', kind: 'TEXT' },
      { field: 'primaryPeril', label: 'Peril', kind: 'TEXT' },
      { field: 'effectiveDate', label: 'Effective Date', kind: 'INSTANT' },
      { field: 'issuedDate', label: 'Signed', kind: 'INSTANT' },
      { field: 'policiesImpacted', label: 'Policies Affected', kind: 'INTEGER' },
      { field: 'capacityReductionPct', label: 'Capacity Reduction', kind: 'PERCENT' },
    ],
  },
});

export const JURISDICTION_IDS: readonly JurisdictionId[] = Object.keys(JURISDICTION_GRAMMAR) as JurisdictionId[];

/**
 * How the bytes came to exist, as the supplier declares it. Never inferred:
 * this module cannot tell a captured order from a drafted one, and a guess here
 * would be the system deciding whether its own corpus is real.
 */
export type CaptureOrigin = 'OPERATOR_CAPTURE' | 'DRAFTED_SPECIMEN';

export interface CaptureDeclaration {
  captureId: string;
  jurisdiction: JurisdictionId;
  /** Where the operator says the bytes came from. Recorded, not visited. */
  sourceUrl: string;
  mediaType: string;
  /** When the operator obtained the bytes. Their clock, carried through. */
  capturedAt: ISODateTime;
  /** When this system took them, which cannot precede the capture it descends from. */
  knownAt: ISODateTime;
  beganAs: CaptureOrigin;
}

export interface StatutoryCapture extends CaptureDeclaration {
  method: typeof HARVEST_METHOD;
  /** sha256 over exactly the bytes supplied, computed here rather than accepted. */
  artifactDigest: string;
  byteLength: number;
  text: string;
  /** Deliberately false, always. Retaining bytes is not believing them. */
  sourceTruthClaimed: false;
}

export interface CaptureRefusal {
  capture: null;
  because: string;
}

const readable = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function instantOf(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Take supplied bytes as a capture. Nothing is fetched; the digest is computed
 * over what was handed in, so a supplier cannot declare a digest that does not
 * match the document it sent.
 */
export function captureSuppliedDocument(
  declaration: CaptureDeclaration,
  bytes: string,
): { capture: StatutoryCapture; because: string } | CaptureRefusal {
  if (!readable(declaration.captureId)) return { capture: null, because: 'The capture declares no identifier, so nothing downstream could name what it descends from.' };
  if (!JURISDICTION_IDS.includes(declaration.jurisdiction)) {
    return { capture: null, because: `No grammar is declared for jurisdiction ${String(declaration.jurisdiction)}. This rail reads ${JURISDICTION_IDS.join(', ')} and refuses to parse a document whose header conventions nobody has stated.` };
  }
  if (!readable(declaration.sourceUrl)) return { capture: null, because: 'The capture names no source location. Bytes with no stated origin are bytes, and the rail declines to pretend otherwise.' };
  if (declaration.beganAs !== 'OPERATOR_CAPTURE' && declaration.beganAs !== 'DRAFTED_SPECIMEN') {
    return { capture: null, because: 'The capture does not declare whether these bytes are an operator capture or a drafted specimen. This module cannot tell them apart and will not guess which its own corpus descends from.' };
  }
  const captured = readable(declaration.capturedAt) ? instantOf(declaration.capturedAt) : null;
  const known = readable(declaration.knownAt) ? instantOf(declaration.knownAt) : null;
  if (captured === null || known === null) return { capture: null, because: 'A capture time and a knowledge time are both required and at least one is missing or unreadable.' };
  if (known < captured) return { capture: null, because: `The knowledge time ${declaration.knownAt} precedes the capture time ${declaration.capturedAt}. This system cannot have held the document before the operator obtained it.` };
  if (typeof bytes !== 'string' || bytes.length === 0) return { capture: null, because: 'No bytes were supplied. There is nothing to digest and nothing to extract.' };

  const buffer = Buffer.from(bytes, 'utf-8');
  return {
    capture: {
      ...declaration,
      method: HARVEST_METHOD,
      artifactDigest: `sha256:${createHash('sha256').update(buffer).digest('hex')}`,
      byteLength: buffer.byteLength,
      text: bytes,
      sourceTruthClaimed: false,
    },
    because: `${buffer.byteLength} bytes retained under a digest computed here, declared as ${declaration.beganAs} from ${declaration.sourceUrl}. Nothing was fetched: this rail has no path to a network, because collecting against a regulator is the operator's act under the operator's terms.`,
  };
}

/** PRESENT, or one of three absences that mean different things. */
export type FieldPresence = 'PRESENT' | 'ABSENT' | 'MALFORMED' | 'AMBIGUOUS';

export interface ExtractedField {
  field: string;
  label: string;
  kind: FieldKind;
  presence: FieldPresence;
  /** Set only when PRESENT. Every absence carries null rather than a stand-in. */
  value: string | number | null;
  /** What the document actually printed, kept even when it could not be read. */
  raw: string | null;
  because: string;
}

export interface StatutoryExtraction {
  extractionId: string;
  captureId: string;
  method: typeof HARVEST_METHOD;
  jurisdiction: JurisdictionId;
  stateCode: string;
  regulator: string;
  artifactDigest: string;
  capturedAt: ISODateTime;
  knownAt: ISODateTime;
  beganAs: CaptureOrigin;
  fields: ExtractedField[];
  because: string;
}

/** `Label: value`, on one line, with the label matched case-insensitively and the colon required. */
function linesFor(text: string, label: string): string[] {
  const wanted = label.trim().toLowerCase();
  const found: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    if (line.slice(0, colon).trim().toLowerCase() !== wanted) continue;
    found.push(line.slice(colon + 1).trim());
  }
  return found;
}

function readValue(raw: string, kind: FieldKind): { value: string | number } | { because: string } {
  switch (kind) {
    case 'TEXT':
      return raw.length > 0 ? { value: raw } : { because: 'The label is printed with nothing after it.' };
    case 'IDENTIFIER':
      return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(raw)
        ? { value: raw }
        : { because: `${JSON.stringify(raw)} is not a single identifier token. An identifier with spaces or punctuation is a phrase, and this rail will not shorten a phrase into a key.` };
    case 'INTEGER': {
      const stripped = raw.replace(/,/g, '');
      return /^\d{1,15}$/.test(stripped)
        ? { value: Number(stripped) }
        : { because: `${JSON.stringify(raw)} does not read as a whole number.` };
    }
    case 'PERCENT': {
      const match = /^(\d{1,3}(?:\.\d{1,4})?)\s*%$/.exec(raw);
      if (!match) return { because: `${JSON.stringify(raw)} does not read as a percentage. A bare number is not one: this rail will not decide whether 40 means 40% or 0.40.` };
      const parsed = Number(match[1]);
      return parsed <= 100 ? { value: parsed } : { because: `${match[1]}% exceeds 100%.` };
    }
    case 'INSTANT': {
      const ms = Date.parse(raw);
      if (!Number.isFinite(ms)) return { because: `${JSON.stringify(raw)} does not read as an instant. A phrase such as an effective date conditioned on an event is a condition, not a time, and this rail will not convert one into the other.` };
      return { value: new Date(ms).toISOString() };
    }
  }
}

/**
 * Pure: apply the jurisdiction's declared grammar to retained bytes.
 *
 * Reads labelled header lines and nothing else. No prose is interpreted and no
 * field is defaulted; the four presence states are kept apart because a
 * document that said something unreadable and a document that said nothing are
 * different documents.
 */
export function extractFiling(capture: StatutoryCapture): StatutoryExtraction {
  const grammar = JURISDICTION_GRAMMAR[capture.jurisdiction];
  const fields: ExtractedField[] = grammar.fields.map((rule) => {
    const found = linesFor(capture.text, rule.label);
    const base = { field: rule.field, label: rule.label, kind: rule.kind };
    if (found.length === 0) {
      return { ...base, presence: 'ABSENT' as const, value: null, raw: null, because: `No line labelled "${rule.label}" appears. The document says nothing about ${rule.field}, which is the absence of a claim rather than a claim of none.` };
    }
    const distinct = [...new Set(found)];
    if (distinct.length > 1) {
      return { ...base, presence: 'AMBIGUOUS' as const, value: null, raw: distinct.join(' | '), because: `"${rule.label}" appears ${found.length} times with ${distinct.length} different values (${distinct.join(', ')}). Taking the first would settle a contradiction on document order, which is a tiebreak nobody agreed to.` };
    }
    const read = readValue(distinct[0], rule.kind);
    if ('because' in read) {
      return { ...base, presence: 'MALFORMED' as const, value: null, raw: distinct[0], because: `The document states ${rule.field} and this grammar cannot read it: ${read.because} The printed text is kept, because a field stated unreadably is not a field the document omitted.` };
    }
    return { ...base, presence: 'PRESENT' as const, value: read.value, raw: distinct[0], because: `Read from the line labelled "${rule.label}".` };
  });

  const counted = (presence: FieldPresence) => fields.filter((entry) => entry.presence === presence).length;
  return {
    extractionId: `extraction:${capture.captureId}`,
    captureId: capture.captureId,
    method: HARVEST_METHOD,
    jurisdiction: capture.jurisdiction,
    stateCode: grammar.stateCode,
    regulator: grammar.regulator,
    artifactDigest: capture.artifactDigest,
    capturedAt: capture.capturedAt,
    knownAt: capture.knownAt,
    beganAs: capture.beganAs,
    fields,
    because: `${counted('PRESENT')} of ${fields.length} declared fields were read from the ${grammar.regulator} header grammar; ${counted('ABSENT')} absent, ${counted('MALFORMED')} stated but unreadable, ${counted('AMBIGUOUS')} stated more than once with different values. Only labelled header lines are read: a field this document states in prose is ABSENT here, and the filing is refused downstream rather than recovered by a pattern over English.`,
  };
}

/** Find one field's extraction, or undefined. Callers must handle undefined; nothing is defaulted. */
export function fieldOf(extraction: StatutoryExtraction, field: string): ExtractedField | undefined {
  return extraction.fields.find((entry) => entry.field === field);
}

export const HARVEST_LOSS = [
  'It never collects. The capture stage takes bytes the operator supplies and has no path to a network, because collecting against a regulator is the operator’s act under the operator’s reading of the source’s terms.',
  'It cannot tell a captured order from a drafted specimen, so the supplier declares which and the declaration travels to the served payload unchanged. A wrong declaration is a lie somebody told, which is a different failure from a system that assumed.',
  'The grammar is declared per jurisdiction, not discovered. A parser that named its own fields would be inventing vocabulary one hop upstream of the projection that refuses to derive a predicate from a field name.',
  'Only labelled header lines are read. A filing that states its effective date in a paragraph yields ABSENT, is refused on the clocks, and is not rescued by a regular expression over prose.',
  'The four presence states are kept apart on purpose. Absent, unreadable and stated-twice-differently are three different facts, and a rail that flattened them into empty would report the document as silent when it was not.',
  'Retaining bytes is not believing them. `sourceTruthClaimed` is false on every capture, and extraction says what the document printed rather than what is so.',
] as const;
