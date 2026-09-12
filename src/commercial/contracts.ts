import { z } from 'zod';
import { DOMAIN_IDS } from '../domain/types';

const text = z.string().trim().min(1).max(500);
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/);
const strings = z.array(text).max(64).refine((v) => new Set(v).size === v.length, 'Duplicate values');
const instant = z.iso.datetime({ offset: true });
const money = z.number().int().min(0).max(100_000_000_000);
const domain = z.enum(DOMAIN_IDS);
const segment = z.enum(['BROKER', 'ASSET_MANAGER', 'INSURANCE_FINANCE']);

export const offerSchema = z.strictObject({
  id, version: id, domain, name: text,
  status: z.enum(['INTERNAL_ONLY', 'UNVERIFIED', 'OPERATOR_REVIEWED']),
  synthetic: z.boolean(), fields: strings, geographies: strings, permittedUses: strings,
  deliveryFormats: strings, terms: strings,
  evidence: z.array(z.strictObject({ claim: text, reference: text, validUntil: instant })).max(64),
  availableAt: instant.nullable(), capacity: z.number().int().min(0).max(10000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  listPriceCents: money.nullable(), floorPriceCents: money.nullable(), costCents: money.nullable(),
  sourceUseReviewRef: text.nullable(), releaseRef: text.nullable(),
});

export const intentSchema = z.strictObject({
  id, buyer: text, segment, domain, sourceRef: text, observedAt: instant, expiresAt: instant,
  synthetic: z.boolean(), jurisdiction: text,
  fields: strings.min(1), geographies: strings.min(1), intendedUse: text,
  deliveryFormat: text, requiredEvidence: strings, requiredTerms: strings,
  deadline: instant, currency: z.string().regex(/^[A-Z]{3}$/), budgetCents: money.nullable(),
  contact: z.enum(['PERMISSION_RECORDED', 'UNKNOWN', 'DO_NOT_CONTACT']),
  contactPermissionRef: text.nullable(),
  conversionProbability: z.number().min(0).max(1).nullable(),
  probabilityBasis: text.nullable(),
});

export const requestSchema = z.strictObject({
  schema: z.literal('notation.commercial-request.v1'), requestId: id,
  policy: z.strictObject({
    version: id, allowedJurisdictions: strings.min(1),
    minimumMarginBps: z.number().int().min(0).max(9999),
    maximumDiscountBps: z.number().int().min(0).max(10000),
    humanReviewAboveCents: money,
    maximumIntentAgeDays: z.number().int().min(1).max(365),
    allowedTerms: strings, suppressedBuyers: strings,
  }),
  offers: z.array(offerSchema).min(1).max(30),
  intents: z.array(intentSchema).min(1).max(100),
}).superRefine((request, ctx) => {
  for (const key of ['offers', 'intents'] as const) {
    if (new Set(request[key].map((v) => v.id)).size !== request[key].length)
      ctx.addIssue({ code: 'custom', path: [key], message: 'IDs must be unique' });
  }
  for (const [index, offer] of request.offers.entries()) {
    if (offer.floorPriceCents !== null && offer.listPriceCents !== null && offer.floorPriceCents > offer.listPriceCents)
      ctx.addIssue({ code: 'custom', path: ['offers', index], message: 'Floor exceeds list price' });
  }
});

export type CommercialRequest = z.infer<typeof requestSchema>;
export type CommercialOffer = z.infer<typeof offerSchema>;
export type BuyerIntent = z.infer<typeof intentSchema>;
