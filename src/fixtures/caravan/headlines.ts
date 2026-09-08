/**
 * Drafted specimen headlines for the Caravan demonstration.
 *
 * Every one is `DRAFTED_SPECIMEN` from a source named as a specimen and not a
 * publication. None was captured from anywhere; the coordinates were declared
 * by the drafter and say so in their method. They exist so the twin has claims
 * to meet the corpus with before a wire adapter exists, and they are chosen to
 * land on each state the reading can produce against records the corpus
 * actually holds — the instants and values below are the corpus's own.
 */
import type { LocatedClaim } from '@/domain/locatedClaims';
import { WIRE_EVIDENCE_CLASS } from '@/domain/locatedClaims';

const SOURCE = { sourceId: 'specimen-wire', displayName: 'Drafted specimen — not a publication' } as const;
const DECLARED = 'notationsos.geocode.declared-specimen.v1';
const geocode = (latitude: number, longitude: number, horizontalUncertaintyM?: number): LocatedClaim['geocode'] => ({
  geometry: { kind: 'POINT', datum: 'WGS84', latitude, longitude, ...(horizontalUncertaintyM === undefined ? {} : { horizontalUncertaintyM }) },
  method: DECLARED,
  because: horizontalUncertaintyM === undefined
    ? 'Coordinates declared by the drafter of this specimen with no uncertainty stated; no geocoder ran.'
    : `Coordinates declared by the drafter of this specimen with a ±${horizontalUncertaintyM} m uncertainty; no geocoder ran.`,
});

export const SPECIMEN_HEADLINES: readonly LocatedClaim[] = Object.freeze([
  {
    // Inside REC-0204's weighbridge bounds [40.08, 40.16]: CORROBORATED, at capture and now.
    kind: 'CLAIM', claimId: 'SPEC-H-001',
    headline: 'Terminal weighbridge ticket puts lot 5B-221 at 40.10 t gross',
    source: SOURCE, evidenceClass: WIRE_EVIDENCE_CLASS,
    publishedAt: '2026-08-26T08:00:00Z', capturedAt: '2026-08-26T09:00:00Z', beganAs: 'DRAFTED_SPECIMEN',
    geocode: geocode(51.9497, 4.0250, 300),
    asserts: { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', value: 40.10, validAt: '2026-08-17T15:20:00Z' },
  },
  {
    // Outside REC-0302's bounds [19.94, 19.98]: CONFLICTING. A fuzzy geocode, drawn as a region.
    kind: 'CLAIM', claimId: 'SPEC-H-002',
    headline: 'Port sources say lot 7C-104 weighed in at 21.5 t',
    source: SOURCE, evidenceClass: WIRE_EVIDENCE_CLASS,
    publishedAt: '2026-08-27T06:00:00Z', capturedAt: '2026-08-27T06:30:00Z', beganAs: 'DRAFTED_SPECIMEN',
    geocode: geocode(-23.9535, -46.3130, 5000),
    asserts: { subjectId: 'LOT-7C-104', predicate: 'quantity.gross', value: 21.5, validAt: '2026-08-25T16:35:00Z' },
  },
  {
    // Names no predicate the corpus holds: NOT_IN_COVERAGE, and the corpus is asked nothing.
    kind: 'CLAIM', claimId: 'SPEC-H-003',
    headline: 'Congestion reported at the Maasvlakte loading terminal',
    source: SOURCE, evidenceClass: WIRE_EVIDENCE_CLASS,
    publishedAt: '2026-08-28T05:30:00Z', capturedAt: '2026-08-28T06:00:00Z', beganAs: 'DRAFTED_SPECIMEN',
    geocode: geocode(51.9497, 4.0250, 2000),
    asserts: null,
  },
  {
    // The corpus refuses for want of an identity link: NOT_IN_COVERAGE with the corpus's own reason.
    // No uncertainty stated, so it is listed and not drawn.
    kind: 'CLAIM', claimId: 'SPEC-H-004',
    headline: 'Lot 7C-104 moisture said to be within specification at the origination yard',
    source: SOURCE, evidenceClass: WIRE_EVIDENCE_CLASS,
    publishedAt: '2026-08-29T07:00:00Z', capturedAt: '2026-08-29T07:15:00Z', beganAs: 'DRAFTED_SPECIMEN',
    geocode: geocode(-23.9535, -46.3130),
    asserts: { subjectId: 'LOT-7C-104', predicate: 'condition.moisture', value: 7.9, validAt: '2026-08-28T14:00:00Z' },
  },
  {
    // Captured while the draft survey (40.0, no bounds) was current: CORROBORATED at capture.
    // The weighbridge ticket became knowable on the 25th: CONFLICTING now.
    kind: 'CLAIM', claimId: 'SPEC-H-005',
    headline: 'Carrier draft survey puts lot 5B-221 at 40.0 t gross',
    source: SOURCE, evidenceClass: WIRE_EVIDENCE_CLASS,
    publishedAt: '2026-08-19T08:00:00Z', capturedAt: '2026-08-19T09:00:00Z', beganAs: 'DRAFTED_SPECIMEN',
    geocode: geocode(51.9497, 4.0250, 300),
    asserts: { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', value: 40.0, validAt: '2026-08-17T16:00:00Z' },
  },
]);
