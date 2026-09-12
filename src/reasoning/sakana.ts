import { z } from 'zod';
import { rejectDuplicateJsonKeys } from '../data-os/json-keys';
import { answerSchema, digest, parseReasoningRequest, REASONING_INSTRUCTIONS, type ReasoningRequest } from './contracts';
import { ReasoningError, sakanaConfig, type ReasoningEnvironment } from './config';

const endpoint = 'https://api.sakana.ai/v1/responses';
const MAX_RESPONSE_BYTES = 256 * 1024;
const slotKey = Symbol.for('notation.sakana.active.v1');
const host = globalThis as typeof globalThis & { [slotKey]?: boolean };
const responseSchema = z.object({
  id: z.string().min(1).max(300), model: z.string().min(1).max(200).optional(), status: z.literal('completed'),
  error: z.null().optional(), incomplete_details: z.null().optional(),
  output: z.array(z.object({ type: z.string(), role: z.string().optional(),
    status: z.literal('completed').optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).max(64).optional(),
  })).max(64),
  usage: z.record(z.string(), z.unknown()).nullable().optional(),
});

function decodeJson(text: string): unknown {
  try {
    rejectDuplicateJsonKeys(text, () => new ReasoningError('REASONING_RESPONSE_INVALID'));
    return JSON.parse(text);
  } catch { throw new ReasoningError('REASONING_RESPONSE_INVALID'); }
}
async function readResponse(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new ReasoningError('REASONING_RESPONSE_INVALID');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  let cancellation: Promise<void> | undefined;
  const cancel = () => { cancellation ??= reader.cancel().catch(() => {}); };
  // A custom/server transport may not propagate fetch's abort signal to its body.
  // Cancelling the reader settles a pending read; its cleanup must still settle
  // before this invocation releases the process slot.
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new ReasoningError('REASONING_RESPONSE_LIMIT');
      chunks.push(chunk.value);
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { throw new ReasoningError('REASONING_RESPONSE_INVALID'); }
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel(); await cancellation; reader.releaseLock();
  }
}

export type ReasoningPolicy = Readonly<{
  model: string; timeoutMs: number; maxOutputTokens: number; reviewRef: string;
}>;

/** The exact request body, also used to verify retained runs against their original instructions. */
export function sakanaRequestBody(request: ReasoningRequest,
  config: Pick<NonNullable<ReturnType<typeof sakanaConfig>>, 'model' | 'maxOutputTokens'>,
  instructions = REASONING_INSTRUCTIONS): string {
  return JSON.stringify({ model: config.model, instructions,
    input: JSON.stringify(request), stream: false, tools: [], max_output_tokens: config.maxOutputTokens,
    ...(config.model.startsWith('fugu') ? { reasoning: { effort: 'high' } } : {}),
    text: { format: { type: 'json_object' } },
  });
}

/** One invocation, no retries or tool execution. Test transport injection is trusted server code only. */
export async function reasonWithSakana(input: unknown, options: {
  allowExternal: boolean; env?: ReasoningEnvironment; transport?: typeof fetch;
  expectedPolicy?: ReasoningPolicy;
}) {
  if (!options.allowExternal) throw new ReasoningError('REASONING_EXTERNAL_CALL_NOT_AUTHORIZED');
  const config = sakanaConfig(options.env);
  if (!config) throw new ReasoningError('REASONING_DISABLED');
  const expected = options.expectedPolicy;
  if (expected && (expected.model !== config.model || expected.timeoutMs !== config.timeoutMs
    || expected.maxOutputTokens !== config.maxOutputTokens || expected.reviewRef !== config.reviewRef))
    throw new ReasoningError('REASONING_POLICY_CHANGED');
  const request = parseReasoningRequest(input); // Clone and bind before the first await.
  const inputDigest = digest(JSON.stringify(request));
  const body = sakanaRequestBody(request, config);
  if (host[slotKey]) throw new ReasoningError('REASONING_BUSY');
  host[slotKey] = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = new Date().toISOString();
  try {
    const response = await (options.transport ?? fetch)(endpoint, { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body, signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new ReasoningError('REASONING_PROVIDER_ERROR'); // Never retain provider error bodies or headers.
    }
    const raw = await readResponse(response, controller.signal);
    controller.signal.throwIfAborted();
    const parsedEnvelope = responseSchema.safeParse(decodeJson(raw));
    if (!parsedEnvelope.success) throw new ReasoningError('REASONING_RESPONSE_INVALID');
    const envelope = parsedEnvelope.data;
    if (envelope.output.some((item) => !['message', 'reasoning'].includes(item.type)))
      throw new ReasoningError('REASONING_UNEXPECTED_TOOL_OUTPUT');
    const messages = envelope.output.filter((item) => item.type === 'message');
    if (!messages.length || messages.some((item) => item.role !== 'assistant' || !item.content?.length
      || item.content.some((part) => part.type !== 'output_text' || typeof part.text !== 'string')))
      throw new ReasoningError('REASONING_RESPONSE_INVALID');
    const parsedAnswer = answerSchema.safeParse(decodeJson(messages.flatMap((m) => m.content!.map((c) => c.text!)).join('')));
    if (!parsedAnswer.success) throw new ReasoningError('REASONING_RESPONSE_INVALID');
    const answer = parsedAnswer.data;
    for (const claim of answer.claims) {
      if (new Set(claim.sourceIds).size !== claim.sourceIds.length || claim.sourceIds.some((id) => !request.sources.some((s) => s.id === id)))
        throw new ReasoningError('REASONING_CITATION_INVALID');
    }
    return { schema: 'notation.reasoning-candidate.v1', requestId: request.requestId,
      status: 'UNADMITTED', reviewRequired: true, provider: 'sakana', requestedModel: config.model,
      reportedModel: envelope.model ?? null, providerResponseId: envelope.id, startedAt, completedAt: new Date().toISOString(),
      inputDigest, requestBodyDigest: digest(body), responseDigest: digest(raw),
      processingReviewRef: config.reviewRef, externalProcessingBasis: request.externalProcessingBasis,
      context: request.sources.map(({ text, ...source }) => ({ ...source, contentDigest: digest(text) })),
      answer, usage: envelope.usage ?? null,
      verification: 'SCHEMA_AND_CITATION_MEMBERSHIP_ONLY',
      authority: { canAdmit: false, canContact: false, canSpend: false, canDeliver: false },
    } as const;
  } catch (error) {
    if (controller.signal.aborted) throw new ReasoningError('REASONING_TIMEOUT_UNCONFIRMED');
    if (error instanceof ReasoningError) throw error;
    throw new ReasoningError('REASONING_FAILED_UNCONFIRMED');
  } finally {
    clearTimeout(timer); host[slotKey] = false; // Slot remains held until transport/body work settles.
  }
}

export type ReasoningCandidate = Awaited<ReturnType<typeof reasonWithSakana>>;
