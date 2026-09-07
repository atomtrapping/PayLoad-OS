import type { NextRequest } from 'next/server';
import { asOfPayload } from '@/adapter/feed';
import { QUESTION_MEANING, type AsOfQuestion } from '@/domain/corpus';
import { json, refusal } from '../../../_lib';

const QUESTIONS = Object.keys(QUESTION_MEANING) as AsOfQuestion[];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;

/**
 * GET /api/v1/releases/:releaseId/as-of?subject=&predicate=&validAt=&knownAt=&question=
 * — one reconstructed answer or a typed refusal.
 *
 * `question` has no default on purpose. The two as-of questions use different
 * clocks, so a caller that does not name one would be served whichever clock
 * this route happened to carry, and would have no way to know which. That is
 * the fabrication the third clock exists to prevent, so an unnamed question is
 * a refusal rather than a guess.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await ctx.params;
  const p = req.nextUrl.searchParams;
  const subjectId = p.get('subject');
  const predicate = p.get('predicate');
  const validAt = p.get('validAt');
  const knownAt = p.get('knownAt');
  const question = p.get('question');
  if (!subjectId || !predicate || !validAt || !knownAt) {
    return refusal(400, 'query_incomplete', 'subject, predicate, validAt and knownAt are all required.', 'Name the subject and predicate, the world time the answer must describe, and the knowledge cutoff.');
  }
  if (!question || !QUESTIONS.includes(question as AsOfQuestion)) {
    return refusal(400, 'question_not_named', `question must be one of ${QUESTIONS.join(' or ')}. There is no default: the two are bounded by different clocks, and an answer to one is not a weaker answer to the other.`, QUESTIONS.map((q) => `${q}: ${QUESTION_MEANING[q]}`).join(' '));
  }
  if (!ISO.test(validAt) || !ISO.test(knownAt)) {
    return refusal(400, 'time_not_iso_utc', 'validAt and knownAt must be ISO 8601 UTC instants, e.g. 2026-08-28T14:00:00Z.', 'State both clocks in UTC.');
  }
  const body = await asOfPayload(decodeURIComponent(releaseId), { subjectId, predicate, validAt, knownAt, question: question as AsOfQuestion });
  if (!body) return refusal(404, 'release_not_found', `No release ${releaseId} in the current source.`, 'List releases at /api/v1/releases.');
  return json(body);
}
