/**
 * Drafted specimens for the statutory harvester.
 *
 * These are written here, not captured. Every one declares
 * `beganAs: 'DRAFTED_SPECIMEN'`, the declaration travels through capture,
 * extraction, the build and the served payload unchanged, and no part of the
 * pipeline can promote it to a capture. The carriers are invented and the NAIC
 * codes sit in a 99xxx range that no company holds, so nothing here can be
 * mistaken for a real filing about a real insurer.
 *
 * They exist to exercise three outcomes the rail must get right, and two of the
 * three are refusals:
 *
 * FL-1 is a complete consent order. Issued NAIC code, declared effective date,
 * every claim field legible. It admits, on the merits, on all ten checks.
 *
 * CA-1 is a market-wide bulletin addressed to a class of insurers. There is no
 * NAIC code because the document is not about one carrier. It is refused on
 * SUBJECT_IDENTIFIED, and that is the correct reading: the corpus has no
 * subject called "every admitted insurer writing in the affected ZIP codes",
 * and manufacturing one would invent a party.
 *
 * TX-1 is a commissioner's order whose effective date is conditioned on the
 * exhaustion of administrative appeals. The grammar reads the line, cannot turn
 * it into an instant, and marks it MALFORMED — which is not absent, because the
 * document does state an effective date. World time is refused and the filing
 * is refused on the clocks rather than dated to a moment nobody stated.
 *
 * FL-2 is knowable after the demonstration build's horizon. It is excluded by
 * the cutoff, so a reader can see that a build states what it knew rather than
 * quietly including whatever exists by the time it runs.
 */
import type { CaptureDeclaration } from '@/domain/statutoryHarvest';
import type { Registration } from '@/domain/identityResolution';
import type { StatutoryContext } from '@/domain/statutoryAdmission';

export interface StatutorySpecimen {
  declaration: CaptureDeclaration;
  text: string;
  /** What this specimen is here to demonstrate, in one line. */
  demonstrates: string;
}

const FL_CONSENT_ORDER = `FLORIDA OFFICE OF INSURANCE REGULATION
IN THE MATTER OF: GULF MERIDIAN PROPERTY & CASUALTY COMPANY

Case No: 302214-26-CO
Respondent: Gulf Meridian Property & Casualty Company
NAIC Company Code: 99014
Order Type: MARKET_WITHDRAWAL
Line of Business: Homeowners Multi-Peril
Peril: Named Windstorm
Policies Affected: 41,880
Capacity Reduction: 100.0%
Effective Date: 2026-04-01T00:00:00Z
Filed: 2026-02-10T00:00:00Z

FINDINGS OF FACT

1. The Respondent is authorized to transact property insurance in this state.
2. The Respondent has petitioned to withdraw from the homeowners multi-peril
   line in the counties enumerated in Exhibit A.
3. The parties have agreed to an orderly non-renewal schedule.

THEREFORE, upon consideration, the withdrawal is APPROVED subject to the
notice requirements of the applicable statute.`;

const CA_BULLETIN = `CALIFORNIA DEPARTMENT OF INSURANCE
BULLETIN TO ALL ADMITTED INSURERS

Bulletin No: 2026-04
Addressee: All Admitted Insurers Transacting Residential Property Insurance
Subject: EMERGENCY_MORATORIUM
Line: Residential Property
Peril: Wildfire
Policies In Force Affected: 512,340
Effective: 2026-03-05T00:00:00Z
Issued: 2026-03-05T00:00:00Z

Pursuant to the Commissioner's authority, a moratorium on cancellation and
non-renewal is declared for the ZIP codes enumerated in Appendix 1 for a
period of one year from the date of the declared emergency.

This Bulletin is directed to all admitted insurers and is not specific to any
single company.`;

const TX_ORDER = `TEXAS DEPARTMENT OF INSURANCE
COMMISSIONER'S ORDER

Order No: 2026-8871
Insurer: Sierra Vista Residential Mutual Insurance Company
NAIC Number: 99027
Order Type: DEDUCTIBLE_SPIKE
Line of Business: Residential Property
Peril: Hail
Policies Affected: 96,105
Capacity Reduction: 35.0%
Effective Date: Upon exhaustion of administrative appeals
Signed: 2026-02-22T00:00:00Z

It is ORDERED that the revised deductible schedule filed under the above
number is approved, to take effect as stated above.`;

const FL_AMENDMENT = `FLORIDA OFFICE OF INSURANCE REGULATION
AMENDED CONSENT ORDER

Case No: 302214-26-CO-A1
Respondent: Gulf Meridian Property & Casualty Company
NAIC Company Code: 99014
Order Type: MARKET_WITHDRAWAL
Line of Business: Homeowners Multi-Peril
Peril: Named Windstorm
Policies Affected: 38,405
Capacity Reduction: 92.0%
Effective Date: 2026-06-01T00:00:00Z
Filed: 2026-04-18T00:00:00Z

The schedule approved by the original order is amended as set out above.`;

export const STATUTORY_SPECIMENS: readonly StatutorySpecimen[] = Object.freeze([
  {
    declaration: {
      captureId: 'fl-oir-302214-26-co',
      jurisdiction: 'FL_OIR',
      sourceUrl: 'https://specimen.invalid/fl-oir/302214-26-co',
      mediaType: 'text/plain',
      capturedAt: '2026-02-12T14:05:00.000Z',
      knownAt: '2026-02-12T14:07:00.000Z',
      beganAs: 'DRAFTED_SPECIMEN',
    },
    text: FL_CONSENT_ORDER,
    demonstrates: 'A complete consent order: issued NAIC code and a declared effective date, so both stages the census rail was missing are present and the gate admits on the merits.',
  },
  {
    declaration: {
      captureId: 'ca-cdi-2026-04',
      jurisdiction: 'CA_CDI',
      sourceUrl: 'https://specimen.invalid/ca-cdi/bulletin-2026-04',
      mediaType: 'text/plain',
      capturedAt: '2026-03-06T09:30:00.000Z',
      knownAt: '2026-03-06T09:31:00.000Z',
      beganAs: 'DRAFTED_SPECIMEN',
    },
    text: CA_BULLETIN,
    demonstrates: 'A bulletin addressed to a class of insurers. No NAIC code, because the document is not about one carrier; refused on SUBJECT_IDENTIFIED rather than given an invented subject.',
  },
  {
    declaration: {
      captureId: 'tx-tdi-2026-8871',
      jurisdiction: 'TX_TDI',
      sourceUrl: 'https://specimen.invalid/tx-tdi/order-2026-8871',
      mediaType: 'text/plain',
      capturedAt: '2026-02-24T11:00:00.000Z',
      knownAt: '2026-02-24T11:02:00.000Z',
      beganAs: 'DRAFTED_SPECIMEN',
    },
    text: TX_ORDER,
    demonstrates: 'An effective date conditioned on the exhaustion of appeals. Stated but unreadable as an instant, so MALFORMED rather than absent, and refused on the clocks rather than dated to a moment nobody stated.',
  },
  {
    declaration: {
      captureId: 'fl-oir-302214-26-co-a1',
      jurisdiction: 'FL_OIR',
      sourceUrl: 'https://specimen.invalid/fl-oir/302214-26-co-a1',
      mediaType: 'text/plain',
      capturedAt: '2026-04-20T08:15:00.000Z',
      knownAt: '2026-04-20T08:16:00.000Z',
      beganAs: 'DRAFTED_SPECIMEN',
    },
    text: FL_AMENDMENT,
    demonstrates: 'Knowable after the demonstration build closes its horizon, so the cutoff excludes it and a reader can see the build state what it knew rather than what exists now.',
  },
]);

/**
 * NAIC registrations for the specimen carriers.
 *
 * Each binds one issued code to a canonical subject on a named evidence record,
 * knowable from a stated instant. There is deliberately no registration for a
 * class of insurers: CA-1 stays unresolved because nothing binds a class to a
 * subject, which is a fact about the registry and about the document rather
 * than an omission to be filled.
 */
export const NAIC_REGISTRY: readonly Registration[] = Object.freeze([
  {
    family: 'NAIC',
    value: '99014',
    canonicalId: 'carrier:gulf-meridian-pc',
    knownAt: '2025-06-01T00:00:00.000Z',
    evidenceRecordId: 'record:naic-registration:99014',
  },
  {
    family: 'NAIC',
    value: '99027',
    canonicalId: 'carrier:sierra-vista-residential-mutual',
    knownAt: '2025-06-01T00:00:00.000Z',
    evidenceRecordId: 'record:naic-registration:99027',
  },
]);

/**
 * The declared context for the specimen build.
 *
 * Every value here is a decision by whoever owns the source registration, not
 * something the parse worked out. The condition is carried because these are
 * public records republished under an attribution requirement, and a conditional
 * admission whose condition did not reach the row would read downstream as an
 * unconditional one.
 */
export const STATUTORY_SPECIMEN_CONTEXT: StatutoryContext = Object.freeze({
  origin: 'PUBLISHED_REGULATORY_ORDER',
  evidenceClass: {
    claimStrength: 'official-record',
    productionClass: 'regulator-published',
    interest: 'issuing-authority',
  },
  provenanceClass: 'BACKFILLED',
  rightsDecision: 'PERMITTED',
  conditions: [
    'Republication must attribute the issuing department and retain the order reference.',
  ],
});

export const STATUTORY_SPECIMEN_HORIZON = '2026-04-01T00:00:00.000Z';
export const STATUTORY_SPECIMEN_BUILD_ID = 'statutory-specimen-2026-04';
