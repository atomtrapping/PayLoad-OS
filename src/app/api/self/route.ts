/**
 * The self-observation rail, served.
 *
 * `PAYLOAD_SELF_CAPTURE_LOCAL=1` has been printed on the console as an
 * operable rail since the rail was built, and until now setting it did
 * nothing: `captureCommits` checks the flag, `buildSelfCandidates` turns
 * observations into candidates and `admitSelfBuild` rules on them, and no
 * transport reached any of the three. A flag an operator can set that changes
 * nothing is worse than an absent one, because it reports a capability the
 * system does not have. This is the transport.
 *
 * WHAT THE ROUTE DECIDES, WHICH IS ALMOST NOTHING
 *
 * It reads a body, refuses what it cannot read, and calls three functions in
 * order. Every judgement belongs to somebody else: the flag is the operator's,
 * the object names and the two clocks are the caller's declarations, the
 * provenance class is declared per build and never inferred here, and the
 * admitting authority is the caller's and is checked by the gate — passing the
 * method's own name is refused on AUTHORITY_IS_NOT_THE_PROCESS, as it is for
 * every other source.
 *
 * NOT UNDER /api/v1
 *
 * The v1 feed stamps every response `data_class: synthetic` and
 * `X-Payload-Fixture-Only: true`, which is true of that feed and would be a
 * lie about this one: rows admitted here descend from bytes read out of a real
 * object store. It sits with the other local rails instead, behind the same
 * loopback guard, because it spawns a process on the operator's machine.
 *
 * GET DESCRIBES THE RAIL WHETHER OR NOT IT IS ON
 *
 * An operator whose flag is unset needs to be told that, and told what to set.
 * A surface that 403s while off would leave them reading source to find out
 * why. GET spawns nothing in either state; POST is the only verb that reads
 * the store.
 */
import { NextResponse } from 'next/server';
import { readBoundedBody } from '@/http/boundedBody';
import { requireLocalRequest } from '@/coordination/http';
import { CoordinationError } from '@/coordination/ledger';
import {
  captureCommits, selfCaptureEnabled, SelfCaptureError,
  MAX_OBJECTS_PER_CAPTURE, OBJECT_NAME, SELF_CAPTURE_LOSS, SELF_CAPTURE_METHOD,
} from '@/adapter/selfCapture';
import {
  admitSelfBuild, buildSelfCandidates, SELF_ADMISSION_LOSS, SELF_ADMISSION_METHOD,
  SELF_OBSERVATION_CONTEXT, SELF_PREDICATE,
} from '@/domain/selfAdmission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Forty-one bytes per name at 64 names is under 3 KiB; the rest is the declarations. */
export const MAX_SELF_BODY_BYTES = 16 * 1024;

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Payload-Rail': 'self-capture' } });

const refuse = (status: number, error: string, detail: string, remedy: string) =>
  reply({ method: SELF_CAPTURE_METHOD, error, detail, remedy }, status);

const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export async function GET(request: Request) {
  try { requireLocalRequest(request); }
  catch (error) { return refuse(403, error instanceof CoordinationError ? error.code : 'LOCAL_ONLY', 'The self-observation rail is reachable from the machine it runs on and from nowhere else.', 'Open it from the same loopback origin.'); }

  return reply({
    method: SELF_CAPTURE_METHOD,
    admission: SELF_ADMISSION_METHOD,
    enabled: selfCaptureEnabled(),
    enableWith: 'PAYLOAD_SELF_CAPTURE_LOCAL=1',
    // Stated whether or not the flag is set: an operator deciding whether to
    // set it is entitled to know what setting it lets the process do.
    reads: 'git cat-file commit <object>, once per named object, in the directory the operator configured. No fetch, no clone, no remote, no write.',
    maxObjectsPerCapture: MAX_OBJECTS_PER_CAPTURE,
    objectNamePattern: OBJECT_NAME.source,
    predicates: SELF_PREDICATE,
    context: SELF_OBSERVATION_CONTEXT,
    declare: {
      objectNames: 'Forty-character lowercase hex object names. A name that is not one is refused rather than repaired.',
      capturedAt: 'The instant the operator states the read happened at. Knowledge time, and the caller’s to declare.',
      repository: 'How the operator names this repository in the corpus.',
      buildId: 'The build these candidates belong to.',
      knownThrough: 'Nothing captured later than this becomes a candidate.',
      provenanceClass: 'LIVE_CAPTURE or BACKFILLED, declared per build and never inferred from a gap between the clocks.',
      authority: 'Who admits. Not this method: the gate refuses a process admitting on its own behalf.',
      ruledAt: 'When the authority ruled.',
    },
    loss: [...SELF_CAPTURE_LOSS, ...SELF_ADMISSION_LOSS],
  });
}

export async function POST(request: Request) {
  try { requireLocalRequest(request); }
  catch (error) { return refuse(403, error instanceof CoordinationError ? error.code : 'LOCAL_ONLY', 'The self-observation rail is reachable from the machine it runs on and from nowhere else.', 'Post to it from the same loopback origin.'); }

  if (!request.body) return refuse(400, 'NO_BODY', 'A capture request is required.', 'Send a JSON object naming objects and the declarations the rail cannot make for you.');
  let body: Record<string, unknown>;
  try {
    const bytes = await readBoundedBody(request.body, MAX_SELF_BODY_BYTES, () => {
      throw new SelfCaptureError('BODY_TOO_LARGE', `A capture request is limited to ${MAX_SELF_BODY_BYTES} bytes.`, 413);
    });
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SelfCaptureError) return refuse(error.status, error.code, error.message, `Name at most ${MAX_OBJECTS_PER_CAPTURE} objects per capture.`);
    return refuse(400, 'UNREADABLE_BODY', 'The request body is not readable JSON.', 'Send a JSON object with objectNames, capturedAt, repository, buildId, knownThrough, provenanceClass, authority and ruledAt.');
  }

  const { objectNames, capturedAt, repository, buildId, knownThrough, provenanceClass, authority, ruledAt } = body;
  if (!Array.isArray(objectNames) || objectNames.some((name) => typeof name !== 'string')) {
    return refuse(400, 'NO_OBJECTS', 'objectNames must be an array of strings.', 'Name the commit objects to read.');
  }
  if (typeof repository !== 'string' || repository.length === 0) return refuse(400, 'NO_REPOSITORY', 'repository is not declared.', 'State how this repository is named in the corpus.');
  if (typeof buildId !== 'string' || buildId.length === 0) return refuse(400, 'NO_BUILD_ID', 'buildId is not declared.', 'Name the build these candidates belong to.');
  if (!instant(capturedAt)) return refuse(400, 'UNREADABLE_CAPTURED_AT', 'capturedAt is not a readable instant.', 'Declare the instant the read happened at, as ISO 8601.');
  if (!instant(knownThrough)) return refuse(400, 'UNREADABLE_KNOWN_THROUGH', 'knownThrough is not a readable instant.', 'Declare the knowledge horizon, as ISO 8601.');
  if (!instant(ruledAt)) return refuse(400, 'UNREADABLE_RULED_AT', 'ruledAt is not a readable instant.', 'Declare when the authority ruled, as ISO 8601.');
  if (provenanceClass !== 'LIVE_CAPTURE' && provenanceClass !== 'BACKFILLED') {
    return refuse(400, 'PROVENANCE_NOT_DECLARED', 'provenanceClass must be LIVE_CAPTURE or BACKFILLED.', 'Declare it. This rail infers provenance from nothing, because provenance inferred from a clock gap is a guess about testimony.');
  }
  // Refused here rather than passed through: the gate would refuse an absent
  // authority too, but it would do it as one failed check among ten, and a
  // caller who forgot the field deserves to be told which field.
  if (typeof authority !== 'string' || authority.length === 0) {
    return refuse(400, 'NO_AUTHORITY', 'authority is not declared.', 'Name who admits. This route will not name itself, and the gate refuses a process admitting on its own behalf.');
  }

  try {
    const capture = await captureCommits({ objectNames, capturedAt, repository });
    const build = buildSelfCandidates({ buildId, knownThrough, observations: capture.observations, provenanceClass });
    const receipt = admitSelfBuild(build, authority, ruledAt);
    return reply({
      method: SELF_CAPTURE_METHOD,
      capture: { because: capture.because, read: capture.observations.length, notRead: capture.notRead },
      build: { buildId: build.buildId, state: build.state, candidateCount: build.candidateCount, excluded: build.excluded, because: build.because },
      receipt,
    });
  } catch (error) {
    if (error instanceof SelfCaptureError) {
      return refuse(error.status, error.code, error.message, error.code === 'LOCAL_MODE_DISABLED' ? 'Set PAYLOAD_SELF_CAPTURE_LOCAL=1 in the process that serves this route.' : 'Inspect the named objects and try again.');
    }
    throw error;
  }
}
