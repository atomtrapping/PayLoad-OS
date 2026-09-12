import { z } from 'zod';
import { digest, parseReasoningRequest } from '../reasoning/contracts';
import { evaluateCommercialRequest } from './agent';
import { requestSchema } from './contracts';

const MAX_PACKET_BYTES = 32768;
const MAX_SOURCE_CHARACTERS = 8000;
const optionsSchema = z.strictObject({
  requestId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/),
  externalProcessingBasis: z.string().trim().min(1).max(500),
  evaluatedAt: z.iso.datetime({ offset: true }),
});

/** Preserve JSON exactly despite the reasoning schema trimming each source. */
function reportParts(text: string): string[] {
  const parts: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + MAX_SOURCE_CHARACTERS, text.length);
    if (end < text.length) {
      // Neither side of a boundary may be whitespace or half of a surrogate pair.
      while (end > start && (/\s/.test(text[end - 1]) || /\s/.test(text[end])
        || /[\uD800-\uDBFF]/.test(text[end - 1]))) end--;
      if (end === start) throw new Error('COMMERCIAL_REASONING_SOURCE_LIMIT');
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

/** Prepare local decision support for synthetic exercises; this never calls a provider. */
export function prepareCommercialReasoning(input: unknown, options: {
  requestId: string; externalProcessingBasis: string; evaluatedAt: string;
}) {
  const settings = optionsSchema.parse(options);
  const commercial = requestSchema.parse(input);
  if (Buffer.byteLength(JSON.stringify(commercial)) > MAX_PACKET_BYTES)
    throw new Error('COMMERCIAL_REASONING_INPUT_LIMIT');

  // The deterministic evaluator owns qualification and economics before any LLM handoff.
  const report = evaluateCommercialRequest(commercial, settings.evaluatedAt);
  if (commercial.offers.some((offer) => !offer.synthetic || offer.status === 'INTERNAL_ONLY')
    || commercial.intents.some((intent) => !intent.synthetic))
    throw new Error('COMMERCIAL_REASONING_SYNTHETIC_ONLY');

  const reportJson = JSON.stringify(report);
  if (Buffer.byteLength(reportJson) > MAX_PACKET_BYTES) throw new Error('REASONING_INPUT_LIMIT');
  const reportDigest = digest(reportJson);
  const parts = reportParts(reportJson);
  const request = parseReasoningRequest({
    schema: 'notation.reasoning-request.v1', requestId: settings.requestId,
    task: 'COMMERCIAL_REVIEW', classification: 'SYNTHETIC',
    externalProcessingBasis: settings.externalProcessingBasis,
    question: `Explain this SYNTHETIC deterministic commercial evaluation made at ${settings.evaluatedAt}. `
      + 'The ordered source texts concatenate to the exact report JSON; part numbers are in the references. '
      + 'Preserve every blocker, qualification decision, economic bound, uncertainty and authority restriction. '
      + 'Identify the evidence gaps for human review. Synthetic records are an exercise and cannot authorize contact or delivery.',
    sources: parts.map((text, index) => ({
      id: `commercial-report-${String(index + 1).padStart(3, '0')}`,
      reference: `synthetic:commercial-report:${report.requestId};input=${report.inputDigest};report=${reportDigest};part=${index + 1}/${parts.length}`,
      knownAt: settings.evaluatedAt, standing: 'SYNTHETIC', text,
    })),
  });
  return { report, request };
}
