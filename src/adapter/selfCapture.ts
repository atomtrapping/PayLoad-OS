/**
 * Reading this repository's object store, under the same discipline as the
 * native kernel and with the same refusal to be told what to run.
 *
 * `selfObservation` parses bytes and `selfAdmission` rules on them; neither
 * touches a process. This is the only module in the rail that does, and it is
 * therefore where the argument-injection surface lives.
 *
 * THE OBJECT NAME IS VALIDATED BEFORE ANYTHING IS SPAWNED
 *
 * Every value that reaches an argv position is checked against
 * /^[0-9a-f]{40}$/ first, so a caller cannot supply `--upload-pack=…`, a path,
 * a revision expression, an option-looking string, or anything else git would
 * interpret. That is the whole of the defence and it is deliberately not a
 * sanitiser: a name that does not match is refused rather than repaired,
 * because a repaired name is a different object.
 *
 * No shell. A fixed subcommand and a fixed flag shape, both literals in this
 * file. The repository directory is operator configuration and never comes off
 * a request, the same rule `productionRoot` follows.
 *
 * WHAT THE OPERATOR STILL DECIDES
 *
 * That the rail runs at all: PAYLOAD_SELF_CAPTURE_LOCAL=1, off by default like
 * every other local rail. Reading your own object store needs no credential and
 * no network, which is what makes this source usable where FMCSA and SERFF are
 * not — but spawning a process on an operator's machine is still their call,
 * not a default this repository takes on their behalf.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not fetch, clone, push, or read a remote. It does not write to the
 * repository. It runs one read-only plumbing command per object and computes a
 * digest over exactly the bytes that came back. Git's own stderr is consumed
 * and never relayed, because it carries host paths.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import { observeCommit, type CaptureDeclaration, type CommitObservation } from '@/domain/selfObservation';

export const SELF_CAPTURE_METHOD = 'notationsos.self-capture.v1';

/** A git object name: forty lowercase hex characters and nothing else. */
export const OBJECT_NAME = /^[0-9a-f]{40}$/;

const MAX_OBJECT_BYTES = 1024 * 1024;
const CAPTURE_TIMEOUT_MS = 10_000;
/** One batch is bounded so a caller cannot ask for the whole history in one request. */
export const MAX_OBJECTS_PER_CAPTURE = 64;

export class SelfCaptureError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export const selfCaptureEnabled = () => process.env.PAYLOAD_SELF_CAPTURE_LOCAL === '1';

/** Operator configuration only. An HTTP request never selects the repository read. */
export const selfCaptureRoot = () => process.env.PAYLOAD_SELF_CAPTURE_DIR ?? process.cwd();

/**
 * Run one read-only plumbing command and return exactly what it wrote to stdout.
 *
 * `args` is built here from literals and a validated object name; nothing in it
 * comes from a caller unchecked.
 */
function runGit(args: readonly string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...args], { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failed = false;
    const fail = (code: string, message: string) => {
      if (failed) return;
      failed = true; clearTimeout(timer); child.kill();
      reject(new SelfCaptureError(code, message, 503));
    };
    const timer = setTimeout(() => fail('CAPTURE_TIMEOUT', 'The object read did not complete within ten seconds.'), CAPTURE_TIMEOUT_MS);
    child.on('error', () => fail('GIT_UNAVAILABLE', 'git could not be run here.'));
    child.stdout.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > MAX_OBJECT_BYTES) fail('OBJECT_TOO_LARGE', 'The object exceeds the 1 MiB this rail reads.');
      else chunks.push(data);
    });
    // Consumed and never relayed: git's diagnostics carry host paths.
    child.stderr.on('data', (data: Buffer) => { bytes += data.length; if (bytes > MAX_OBJECT_BYTES) fail('OBJECT_TOO_LARGE', 'The object exceeds the 1 MiB this rail reads.'); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0) { reject(new SelfCaptureError('OBJECT_NOT_READ', 'git did not return the object. It may not exist in this store.', 404)); return; }
      resolve(Buffer.concat(chunks));
    });
  });
}

/** What the caller asks for. The repository is not among the fields, deliberately. */
export interface CaptureRequest {
  objectNames: readonly string[];
  /** The instant the operator states the read happened at. Knowledge time, and the caller's to declare. */
  capturedAt: string;
  /** How the operator names this repository in the corpus. */
  repository: string;
}

export interface CaptureResult {
  method: typeof SELF_CAPTURE_METHOD;
  observations: CommitObservation[];
  /** Names asked for and not read, with the reason. A capture that lost an object says so. */
  notRead: Array<{ objectName: string; because: string }>;
  because: string;
}

/**
 * Read commit objects and observe them.
 *
 * Every name is validated before the first spawn, so a batch containing one bad
 * name refuses that name and reads the rest rather than running anything with
 * it. The digest is computed over the bytes git returned and over nothing else.
 */
export async function captureCommits(request: CaptureRequest): Promise<CaptureResult> {
  if (!selfCaptureEnabled()) {
    throw new SelfCaptureError('LOCAL_MODE_DISABLED', 'Set PAYLOAD_SELF_CAPTURE_LOCAL=1 to let this process read the object store.', 403);
  }
  if (request.objectNames.length === 0) {
    throw new SelfCaptureError('NO_OBJECTS', 'No object was named. An empty capture is not a capture.');
  }
  if (request.objectNames.length > MAX_OBJECTS_PER_CAPTURE) {
    throw new SelfCaptureError('TOO_MANY_OBJECTS', `${request.objectNames.length} objects exceeds the limit of ${MAX_OBJECTS_PER_CAPTURE} per capture.`, 413);
  }

  const cwd = selfCaptureRoot();
  const observations: CommitObservation[] = [];
  const notRead: CaptureResult['notRead'] = [];

  for (const objectName of request.objectNames) {
    if (!OBJECT_NAME.test(objectName)) {
      notRead.push({
        objectName,
        because: 'Not a forty-character lowercase hex object name. It is refused rather than repaired, because a repaired name is a different object — and because a value that reaches an argv position must be a name and not an instruction.',
      });
      continue;
    }
    const declaration: CaptureDeclaration = {
      repository: request.repository,
      readBy: `git cat-file commit ${objectName}`,
      capturedAt: request.capturedAt,
      beganAs: 'OBJECT_STORE_READ',
    };
    try {
      // Literal subcommand, literal type, validated name. Nothing else.
      const bytes = await runGit(['cat-file', 'commit', objectName], cwd);
      const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
      observations.push(observeCommit(bytes.toString('utf8'), objectName, declaration, digest));
    } catch (error) {
      notRead.push({ objectName, because: error instanceof SelfCaptureError ? error.message : 'The object could not be read.' });
    }
  }

  return {
    method: SELF_CAPTURE_METHOD,
    observations,
    notRead,
    because: `${observations.length} of ${request.objectNames.length} objects read from the store and observed; ${notRead.length} were not, and each says why. A capture that quietly returned fewer objects than it was asked for would be a silent loss, which is the one thing a capture must never be.`,
  };
}

export const SELF_CAPTURE_LOSS = [
  'This reads an object store and nothing else. It does not fetch, clone, push, or contact a remote, and there is no code path from here to a network.',
  'The digest is over the bytes git returned. That the store itself is intact — that the object it returned is the object it holds — is git’s own guarantee and is not re-derived here.',
  'A name that is not forty hex characters is refused and never repaired. The rail would rather lose an object than run a command with a value it could not read as a name.',
  'The capture instant is the operator’s declaration, not a reading of a clock this system trusts. It is knowledge time, and the rail carries it rather than checking it.',
  'The rail is off by default. Reading your own repository needs no credential and no network, which is what makes it usable where a third-party source is not — but spawning a process on an operator’s machine is still their decision.',
] as const;
