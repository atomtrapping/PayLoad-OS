import type { CommercialOffer, CommercialRequest } from './contracts';

/** Capability descriptions, not an assertion of customer-ready inventory or pricing. */
export const FIRM_COMMERCIAL_CATALOG: CommercialOffer[] = [
  {
    id: 'caravan.company-census-observations', version: '1.0.0', domain: 'CARAVAN',
    name: 'Company Census observation package', status: 'INTERNAL_ONLY', synthetic: false,
    fields: ['USDOT identifier', 'reported registration fields', 'capture provenance', 'vintage comparison'],
    geographies: ['US'], permittedUses: ['source-qualification'], deliveryFormats: ['JSONL', 'CSV'],
    terms: ['internal-source-qualification-only'], evidence: [], availableAt: null, capacity: 0,
    currency: 'CAD', listPriceCents: null, floorPriceCents: null, costCents: null,
    sourceUseReviewRef: 'docs/BOUTIQUE_PRODUCT_MILESTONE.md', releaseRef: null,
  },
  ...(['TRADEWIND', 'LANDSHARK'] as const).map((domain): CommercialOffer => ({
    id: `${domain.toLowerCase()}.capability-profile`, version: '0.1.0', domain,
    name: domain === 'TRADEWIND' ? 'Markets and risk data capability' : 'Parcels and development data capability',
    status: 'UNVERIFIED', synthetic: true, fields: [], geographies: [], permittedUses: [],
    deliveryFormats: [], terms: [], evidence: [], availableAt: null, capacity: 0,
    currency: 'CAD', listPriceCents: null, floorPriceCents: null, costCents: null,
    sourceUseReviewRef: null, releaseRef: null,
  })),
];

export function commercialExample(): CommercialRequest {
  return {
    schema: 'notation.commercial-request.v1', requestId: 'synthetic-commercial-example',
    policy: { version: 'example-not-approved', allowedJurisdictions: ['CA', 'US'],
      minimumMarginBps: 4000, maximumDiscountBps: 1500, humanReviewAboveCents: 500000,
      maximumIntentAgeDays: 30, allowedTerms: ['internal-analysis-only'], suppressedBuyers: [] },
    offers: structuredClone(FIRM_COMMERCIAL_CATALOG),
    intents: [{ id: 'synthetic-broker-intent', buyer: 'Example broker (synthetic)', segment: 'BROKER',
      domain: 'CARAVAN', sourceRef: 'synthetic-example:no-live-demand', observedAt: '2026-09-08T00:00:00Z',
      expiresAt: '2026-10-01T00:00:00Z', synthetic: true, jurisdiction: 'CA',
      fields: ['USDOT identifier', 'capture provenance'], geographies: ['US'], intendedUse: 'commercial-risk-analysis',
      deliveryFormat: 'CSV', requiredEvidence: ['source rights', 'field dictionary', 'quality report'],
      requiredTerms: ['internal-analysis-only'], deadline: '2026-10-01T00:00:00Z', currency: 'CAD',
      budgetCents: null, contact: 'UNKNOWN', contactPermissionRef: null,
      conversionProbability: null, probabilityBasis: null }],
  };
}
