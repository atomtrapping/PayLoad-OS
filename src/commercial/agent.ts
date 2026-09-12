import { createHash } from 'node:crypto';
import { canonicalJson } from '../fixtures/digest';
import { requestSchema, type BuyerIntent, type CommercialOffer, type CommercialRequest } from './contracts';

/** Local decision support only. Operator declarations never become delivery authority. */
function assess(offer: CommercialOffer, intent: BuyerIntent, policy: CommercialRequest['policy'], now: number) {
  const blockers: string[] = [];
  const add = (condition: boolean, reason: string) => { if (condition) blockers.push(reason); };
  add(offer.domain !== intent.domain, 'PRODUCT_LINE_MISMATCH');
  add(offer.synthetic || intent.synthetic, 'SYNTHETIC_INPUT');
  add(offer.status !== 'OPERATOR_REVIEWED', `OFFER_${offer.status}`);
  add(!offer.sourceUseReviewRef, 'SOURCE_USE_REVIEW_MISSING');
  add(!offer.releaseRef, 'RELEASE_REFERENCE_MISSING');
  add(!policy.allowedJurisdictions.includes(intent.jurisdiction), 'JURISDICTION_OUTSIDE_POLICY');
  add(policy.suppressedBuyers.some((b) => b.toLowerCase() === intent.buyer.toLowerCase()), 'BUYER_SUPPRESSED');
  add(intent.contact === 'DO_NOT_CONTACT', 'DO_NOT_CONTACT');
  add(intent.contact !== 'PERMISSION_RECORDED' || !intent.contactPermissionRef, 'CONTACT_PERMISSION_MISSING');
  add(Date.parse(intent.observedAt) > now, 'INTENT_FROM_FUTURE');
  add(now - Date.parse(intent.observedAt) > policy.maximumIntentAgeDays * 86400000, 'INTENT_STALE');
  add(Date.parse(intent.expiresAt) <= now, 'INTENT_EXPIRED');
  add(Date.parse(intent.expiresAt) <= Date.parse(intent.observedAt), 'INVALID_INTENT_WINDOW');
  add(Date.parse(intent.deadline) <= now, 'DEADLINE_PASSED');
  for (const field of intent.fields) add(!offer.fields.includes(field), `FIELD_MISSING:${field}`);
  for (const geo of intent.geographies) add(!offer.geographies.includes(geo), `COVERAGE_MISSING:${geo}`);
  add(!offer.permittedUses.includes(intent.intendedUse), 'USE_NOT_DECLARED');
  add(!offer.deliveryFormats.includes(intent.deliveryFormat), 'FORMAT_UNAVAILABLE');
  const evidence = offer.evidence.filter((e) => Date.parse(e.validUntil) > now);
  for (const claim of intent.requiredEvidence) add(!evidence.some((e) => e.claim === claim), `EVIDENCE_MISSING_OR_EXPIRED:${claim}`);
  for (const term of new Set([...offer.terms, ...intent.requiredTerms])) {
    add(!policy.allowedTerms.includes(term), `TERM_OUTSIDE_POLICY:${term}`);
  }
  for (const term of intent.requiredTerms) add(!offer.terms.includes(term), `TERM_UNSUPPORTED:${term}`);
  add(offer.capacity < 1, 'NO_CAPACITY');
  add(offer.availableAt === null || Date.parse(offer.availableAt) > Date.parse(intent.deadline), 'DEADLINE_UNSUPPORTED');
  add(intent.currency !== offer.currency, 'CURRENCY_MISMATCH');

  const { listPriceCents: list, floorPriceCents: floor, costCents: cost } = offer;
  const budget = intent.budgetCents;
  add(list === null || floor === null || cost === null || budget === null, 'ECONOMICS_INCOMPLETE');
  let economics: null | { currency: string; suggestedPriceCents: number; minimumPriceCents: number;
    maximumPriceCents: number; contributionCents: number; expectedContributionCents: number | null } = null;
  if (list !== null && floor !== null && cost !== null && budget !== null && intent.currency === offer.currency) {
    // Integer cents; ceiling protects the margin and discount boundaries from rounding down.
    const minimum = Math.max(floor, Math.ceil(cost * 10000 / (10000 - policy.minimumMarginBps)),
      Math.ceil(list * (10000 - policy.maximumDiscountBps) / 10000));
    const maximum = Math.min(list, budget);
    add(minimum > maximum || maximum === 0, 'NO_FEASIBLE_PRICE');
    if (minimum <= maximum && maximum > 0) {
      economics = { currency: offer.currency, suggestedPriceCents: maximum, minimumPriceCents: minimum,
        maximumPriceCents: maximum, contributionCents: maximum - cost,
        expectedContributionCents: intent.conversionProbability !== null && intent.probabilityBasis
          ? Math.round((maximum - cost) * intent.conversionProbability) : null };
    }
  }
  const qualified = blockers.length === 0;
  return {
    intentId: intent.id, buyer: intent.buyer, offerId: offer.id, offerVersion: offer.version,
    status: qualified ? 'HUMAN_REVIEW' as const : 'BLOCKED' as const, blockers,
    basis: { sourceRef: intent.sourceRef, observedAt: intent.observedAt, releaseRef: offer.releaseRef,
      sourceUseReviewRef: offer.sourceUseReviewRef, evidence, verification: 'OPERATOR_DECLARATIONS_ONLY' as const },
    economics, probabilityBasis: intent.probabilityBasis,
    priorityEstimateCents: qualified ? economics?.expectedContributionCents ?? null : null,
    escalations: qualified ? ['PRINCIPAL_APPROVAL_REQUIRED', 'VERIFY_SOURCE_RIGHTS_AND_RECIPIENT_AGREEMENT',
      'RECHECK_CAPACITY_AND_CURRENT_EVIDENCE',
      ...(economics && economics.suggestedPriceCents > policy.humanReviewAboveCents ? ['VALUE_ABOVE_POLICY_THRESHOLD'] : [])] : [],
    proposal: qualified && economics ? {
      label: 'INTERNAL_NON_BINDING_DRAFT', buyer: intent.buyer, product: offer.name,
      fields: intent.fields, geographies: intent.geographies, intendedUse: intent.intendedUse,
      deliveryFormat: intent.deliveryFormat, deadline: intent.deadline, terms: offer.terms,
      priceCents: economics.suggestedPriceCents, currency: economics.currency,
      subject: `Data licensing review: ${offer.name}`,
      body: `Internal draft for ${intent.buyer}: evaluate ${offer.name} (${offer.id}, version ${offer.version}) for ${intent.intendedUse}. Proposed scope: ${intent.fields.join(', ')}; coverage: ${intent.geographies.join(', ')}. Price and delivery remain subject to principal review, current source-use verification, recipient agreement and capacity confirmation.`,
    } : null,
    nextAction: qualified ? 'Review the exact draft and its evidence before authorizing any contact.'
      : 'Resolve the listed gaps with supported evidence; do not send a commercial proposal.',
  };
}

export function evaluateCommercialRequest(input: unknown, evaluatedAt = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(evaluatedAt))) throw new Error('Invalid evaluation time');
  const request = requestSchema.parse(input);
  const assessments = request.intents.flatMap((intent) => {
    const offers = request.offers.filter((offer) => offer.domain === intent.domain);
    return offers.map((offer) => assess(offer, intent, request.policy, Date.parse(evaluatedAt)));
  });
  assessments.sort((a, b) => Number(b.status === 'HUMAN_REVIEW') - Number(a.status === 'HUMAN_REVIEW')
    || (b.priorityEstimateCents ?? -1) - (a.priorityEstimateCents ?? -1)
    || a.intentId.localeCompare(b.intentId) || a.offerId.localeCompare(b.offerId));
  return {
    schema: 'notation.commercial-report.v1', requestId: request.requestId, evaluatedAt,
    inputDigest: `sha256:${createHash('sha256').update(canonicalJson(request)).digest('hex')}`,
    policyVersion: request.policy.version, mode: 'LOCAL_DECISION_SUPPORT',
    authority: { canContact: false, canSign: false, canSpend: false, canDeliver: false },
    summary: { assessed: assessments.length, humanReview: assessments.filter((a) => a.status === 'HUMAN_REVIEW').length,
      blocked: assessments.filter((a) => a.status === 'BLOCKED').length },
    unmatchedIntentIds: request.intents.filter((i) => !request.offers.some((o) => o.domain === i.domain)).map((i) => i.id),
    rankingBasis: 'Feasible candidates first; then estimated contribution times operator-supplied conversion probability. Unknown estimates rank last. Candidates are alternatives, not capacity reservations.',
    assessments,
  };
}
