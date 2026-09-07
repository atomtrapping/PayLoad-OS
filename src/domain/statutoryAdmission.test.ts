import { describe, expect, it } from 'vitest';
import { ADMISSION_METHOD, type AdmittedRow } from './admission';
import { captureSuppliedDocument, extractFiling, JURISDICTION_GRAMMAR, type StatutoryExtraction } from './statutoryHarvest';
import {
  admitStatutoryBuild,
  buildStatutoryCandidates,
  NON_ASSERTION_FIELDS,
  serveAdmittedAsOf,
  serveInForceAsOf,
  STATUTORY_BUILD_CONTRACT,
  STATUTORY_PREDICATE,
  type StatutoryAdmissionReceipt,
  type StatutoryCandidateBuild,
} from './statutoryAdmission';
import {
  NAIC_REGISTRY,
  STATUTORY_SPECIMENS,
  STATUTORY_SPECIMEN_BUILD_ID,
  STATUTORY_SPECIMEN_CONTEXT,
  STATUTORY_SPECIMEN_HORIZON,
} from '@/fixtures/insurability/statutoryFilings';

const AUTHORITY = 'authority:notations-corpus-board';
const RULED_AT = '2026-04-02T00:00:00.000Z';

function extractAll(): StatutoryExtraction[] {
  return STATUTORY_SPECIMENS.map((entry) => {
    const result = captureSuppliedDocument(entry.declaration, entry.text);
    if (result.capture === null) throw new Error(`${entry.declaration.captureId}: ${result.because}`);
    return extractFiling(result.capture);
  });
}

function buildAt(knownThrough: string = STATUTORY_SPECIMEN_HORIZON): StatutoryCandidateBuild {
  return buildStatutoryCandidates(extractAll(), NAIC_REGISTRY, {
    schema: STATUTORY_BUILD_CONTRACT.id,
    buildId: STATUTORY_SPECIMEN_BUILD_ID,
    knownThrough,
    context: STATUTORY_SPECIMEN_CONTEXT,
  });
}

const receiptAt = (knownThrough?: string, authority = AUTHORITY): StatutoryAdmissionReceipt =>
  admitStatutoryBuild(buildAt(knownThrough), authority, RULED_AT);

const forCapture = (receipt: StatutoryAdmissionReceipt, captureId: string) =>
  receipt.rulings.filter((ruling) => ruling.recordId.includes(captureId));

describe('the statutory rail reaches ADMITTED, and not by relaxing a check', () => {
  const receipt = receiptAt();

  /**
   * The point of the whole module. `candidateProjection` documents two absent
   * stages that refuse the census rail: no issued identifier binds a company
   * name to a subject, and a snapshot establishes no world time. A regulator's
   * order supplies both as testimony — an NAIC code the NAIC issued, and an
   * effective date the regulator declares for its own rule.
   */
  it('admits the complete consent order on every one of the gate’s checks', () => {
    const rulings = forCapture(receipt, 'fl-oir-302214-26-co#');
    expect(rulings).toHaveLength(5);
    for (const ruling of rulings) {
      expect(ruling.failed, `${ruling.recordId} should pass every check`).toEqual([]);
      expect(ruling.passed).toHaveLength(10);
      expect(ruling.outcome).toBe('ADMITTED_WITH_CONDITIONS');
      expect(ruling.authority).toBe(AUTHORITY);
    }
  });

  it('produces a row for every admitted candidate and none for a refused one', () => {
    expect(receipt.counts.rows).toBe(receipt.counts.admitted);
    expect(receipt.counts.admitted).toBe(5);
    expect(receipt.counts.refused).toBe(9);
  });

  it('carries the declared conditions onto the row rather than dropping them at the boundary', () => {
    expect(STATUTORY_SPECIMEN_CONTEXT.conditions).toHaveLength(1);
    for (const row of receipt.rows) {
      expect(row.outcome).toBe('ADMITTED_WITH_CONDITIONS');
      expect(row.conditions).toEqual([...STATUTORY_SPECIMEN_CONTEXT.conditions]);
    }
  });

  it('lets a reader of any single row name the document it came from', () => {
    for (const row of receipt.rows) expect(row.basis).toBe('302214-26-CO');
  });

  it('keeps the source name and the canonical identity in different columns', () => {
    for (const row of receipt.rows) {
      expect(row.subjectCanonicalId).toBe('carrier:gulf-meridian-pc');
      expect(row.subjectId).toBe('302214-26-CO');
      expect(row.subjectId).not.toBe(row.subjectCanonicalId);
    }
  });
});

describe('the two refusals, which are the correct reading of the documents', () => {
  const receipt = receiptAt();

  /** The corpus has no subject called "every admitted insurer". Inventing one would manufacture a party. */
  it('refuses a bulletin addressed to a class of insurers, on identity alone', () => {
    const rulings = forCapture(receipt, 'ca-cdi-2026-04#');
    expect(rulings.length).toBeGreaterThan(0);
    for (const ruling of rulings) {
      expect(ruling.outcome).toBe('REFUSED');
      expect(ruling.failed.map((entry) => entry.check)).toEqual(['SUBJECT_IDENTIFIED']);
    }
    const member = buildAt().members.find((entry) => entry.captureId === 'ca-cdi-2026-04')!;
    expect(member.identity.outcome).toBe('NO_USABLE_IDENTIFIER');
    expect(member.identity.setAside.map((entry) => entry.offered.family)).toContain('NOT_AN_IDENTIFIER');
  });

  /** An effective date conditioned on an event is a condition. It is not dated to a moment nobody stated. */
  it('refuses an order whose effective date is conditioned on the exhaustion of appeals, on the clocks', () => {
    const rulings = forCapture(receipt, 'tx-tdi-2026-8871#');
    expect(rulings).toHaveLength(5);
    for (const ruling of rulings) {
      expect(ruling.outcome).toBe('REFUSED');
      expect(ruling.failed.map((entry) => entry.check)).toEqual(['BOTH_CLOCKS']);
    }
    const member = buildAt().members.find((entry) => entry.captureId === 'tx-tdi-2026-8871')!;
    expect(member.worldTime.outcome).toBe('REFUSED');
    expect(member.worldTime.validFrom).toBeNull();
    // Identity resolved fine. Only the clock refused, and the refusals do not smear.
    expect(member.identity.outcome).toBe('RESOLVED');
  });

  it('tallies the failures so the common refusal is visible without reading every ruling', () => {
    expect(receipt.refusalTally).toEqual([
      { check: 'BOTH_CLOCKS', count: 5 },
      { check: 'SUBJECT_IDENTIFIED', count: 4 },
    ]);
    expect(receipt.because).toContain('most often on BOTH_CLOCKS');
  });

  it('keeps a refused candidate on the rail with its reasons rather than deleting it', () => {
    const refused = receipt.rulings.filter((ruling) => ruling.outcome === 'REFUSED');
    expect(refused).toHaveLength(9);
    for (const ruling of refused) expect(ruling.failed[0].because.length).toBeGreaterThan(0);
  });
});

describe('the knowledge horizon', () => {
  it('excludes what became knowable after the build closed, and names it', () => {
    const build = buildAt();
    expect(build.members).toHaveLength(3);
    expect(build.excluded).toHaveLength(1);
    expect(build.excluded[0].extractionId).toContain('fl-oir-302214-26-co-a1');
    expect(build.excluded[0].because).toContain('hindsight it did not have');
  });

  it('admits the amendment at a later horizon, alongside the order it amends', () => {
    const later = receiptAt('2026-05-01T00:00:00.000Z');
    expect(later.counts.excludedByCutoff).toBe(0);
    const amendment = later.rulings.filter((ruling) => ruling.recordId.includes('fl-oir-302214-26-co-a1#'));
    expect(amendment).toHaveLength(5);
    for (const ruling of amendment) expect(ruling.failed).toEqual([]);
    // Both stand. Neither is retracted, and the corpus holds two assertions
    // about one subject at two valid times.
    const capacity = later.rows.filter((row) => row.predicate === STATUTORY_PREDICATE.capacityReductionPct);
    expect(capacity.map((row) => row.value).sort()).toEqual([100, 92]);
  });

  it('does not let a build rule on its own output', () => {
    expect(buildAt().state).toBe('UNADMITTED');
    expect(buildAt().because).toContain('nothing here rules on its own output');
  });
});

describe('the three clocks stay three clocks', () => {
  const receipt = receiptAt();
  const row = receipt.rows[0];

  it('writes a distinct valid, knowledge and source time on every row', () => {
    for (const entry of receipt.rows) {
      expect(entry.validFrom).toBe('2026-04-01T00:00:00.000Z');
      expect(entry.knownAt).toBe('2026-02-12T14:07:00.000Z');
      expect(entry.sourceTime).toBe('2026-02-10T00:00:00.000Z');
      expect(entry.acquisitionTime).toBe('2026-02-12T14:05:00.000Z');
    }
  });

  /** An order filed in February taking effect in April is knowable long before it is in force. */
  it('allows a world time later than the knowledge time', () => {
    expect(Date.parse(row.validFrom)).toBeGreaterThan(Date.parse(row.knownAt));
  });

  it('holds the regulator’s publication instant at or before the moment this system obtained it', () => {
    expect(Date.parse(row.sourceTime)).toBeLessThanOrEqual(Date.parse(row.acquisitionTime));
  });

  /**
   * A filing is issued once; it is not a register that is re-read. So this rail
   * produces no brackets, and the absence is asserted rather than left for a
   * reader to go looking for.
   */
  it('produces no bracketed world time, because a filing is not a re-read register', () => {
    for (const member of buildAt('2026-05-01T00:00:00.000Z').members) {
      expect(['ESTABLISHED', 'REFUSED']).toContain(member.worldTime.outcome);
    }
  });
});

describe('what is a claim and what is a coordinate', () => {
  it('declares exactly five predicates, and every other extracted field as a non-assertion', () => {
    const predicates = Object.keys(STATUTORY_PREDICATE);
    const nonAssertions = Object.keys(NON_ASSERTION_FIELDS);
    expect(predicates).toHaveLength(5);
    expect(predicates.filter((field) => nonAssertions.includes(field))).toEqual([]);
    for (const grammar of Object.values(JURISDICTION_GRAMMAR)) {
      for (const rule of grammar.fields) {
        expect(
          predicates.includes(rule.field) || nonAssertions.includes(rule.field),
          `${grammar.id}.${rule.field} is neither a declared predicate nor a declared non-assertion`,
        ).toBe(true);
      }
    }
  });

  it('never admits a clock or an identifier as an assertion about the subject', () => {
    const admitted = receiptAt('2026-05-01T00:00:00.000Z').rows.map((row) => row.predicate);
    for (const forbidden of ['effectiveDate', 'issuedDate', 'carrierNaic', 'carrierName', 'orderReference']) {
      expect(admitted.some((predicate) => predicate.includes(forbidden))).toBe(false);
    }
    expect(new Set(admitted)).toEqual(new Set(Object.values(STATUTORY_PREDICATE)));
  });

  it('skips a field the document did not state, rather than asserting an empty value', () => {
    const member = buildAt().members.find((entry) => entry.captureId === 'ca-cdi-2026-04')!;
    expect(member.candidates).toHaveLength(4);
    expect(member.skipped.map((entry) => entry.field)).toEqual(['capacityReductionPct']);
    expect(member.skipped[0].because).toContain('lack of a claim');
  });

  it('carries the unit on the one claim that has one', () => {
    const rows = receiptAt().rows;
    const percent = rows.find((row) => row.predicate === STATUTORY_PREDICATE.capacityReductionPct)!;
    expect(percent.unit).toBe('percent');
    expect(rows.find((row) => row.predicate === STATUTORY_PREDICATE.lineOfBusiness)!.unit).toBeNull();
  });
});

describe('the authority is the caller’s and the gate checks it', () => {
  it('refuses everything when the admission method is offered as its own authority', () => {
    const receipt = receiptAt(STATUTORY_SPECIMEN_HORIZON, ADMISSION_METHOD);
    expect(receipt.counts.admitted).toBe(0);
    expect(receipt.rows).toEqual([]);
    expect(receipt.refusalTally.some((entry) => entry.check === 'AUTHORITY_IS_NOT_THE_PROCESS')).toBe(true);
  });

  it('refuses everything when no authority is named', () => {
    expect(receiptAt(STATUTORY_SPECIMEN_HORIZON, '   ').counts.admitted).toBe(0);
  });
});

describe('the receipt', () => {
  it('digests its own body, so a changed build cannot reuse a receipt', () => {
    const first = receiptAt();
    const second = receiptAt('2026-05-01T00:00:00.000Z');
    expect(first.receiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.receiptDigest).not.toBe(second.receiptDigest);
    expect(first.receiptId).not.toBe(second.receiptId);
  });

  it('reproduces exactly when the same build is ruled on again', () => {
    expect(receiptAt().receiptDigest).toBe(receiptAt().receiptDigest);
  });

  it('says plainly that an empty build is not a clean one', () => {
    const empty = admitStatutoryBuild(
      buildStatutoryCandidates([], NAIC_REGISTRY, {
        schema: STATUTORY_BUILD_CONTRACT.id, buildId: 'empty', knownThrough: STATUTORY_SPECIMEN_HORIZON, context: STATUTORY_SPECIMEN_CONTEXT,
      }),
      AUTHORITY, RULED_AT,
    );
    expect(empty.counts.candidates).toBe(0);
    expect(empty.because).toContain('An empty build is not a clean one');
  });
});

describe('serving: two questions, two functions, on purpose', () => {
  const rows: readonly AdmittedRow[] = receiptAt('2026-05-01T00:00:00.000Z').rows;

  it('shows nothing before the corpus could have known it', () => {
    expect(serveAdmittedAsOf(rows, '2026-01-01T00:00:00.000Z')).toEqual([]);
    expect(serveAdmittedAsOf(rows, '2026-03-01T00:00:00.000Z')).toHaveLength(5);
    expect(serveAdmittedAsOf(rows, '2026-05-01T00:00:00.000Z')).toHaveLength(10);
  });

  it('includes a row on the exact instant it became knowable', () => {
    expect(serveAdmittedAsOf(rows, '2026-02-12T14:07:00.000Z')).toHaveLength(5);
    expect(serveAdmittedAsOf(rows, '2026-02-12T14:06:59.999Z')).toEqual([]);
  });

  /**
   * The bitemporal mistake this corpus exists to avoid: an order knowable in
   * February and in force in April is in the knowledge-time answer for March
   * and out of the valid-time answer for March. Conflating the two would report
   * a withdrawal as effective two months before it was.
   */
  it('separates what was knowable by a date from what was in force on it', () => {
    const knowable = serveAdmittedAsOf(rows, '2026-03-01T00:00:00.000Z');
    const inForce = serveInForceAsOf(rows, '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
    expect(knowable).toHaveLength(5);
    expect(inForce).toEqual([]);
    expect(serveInForceAsOf(rows, '2026-05-01T00:00:00.000Z', '2026-04-15T00:00:00.000Z')).toHaveLength(5);
    expect(serveInForceAsOf(rows, '2026-05-01T00:00:00.000Z', '2026-06-15T00:00:00.000Z')).toHaveLength(10);
  });

  it('never returns more than was knowable, whatever the valid time asked for', () => {
    expect(serveInForceAsOf(rows, '2026-03-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')).toHaveLength(5);
  });
});
