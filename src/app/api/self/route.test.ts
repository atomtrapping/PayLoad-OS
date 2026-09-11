/**
 * The self-observation rail, exercised end to end against this repository.
 *
 * The admitting run reads a real object out of this checkout's own store, so
 * the test proves the transport reaches the rail rather than proving a mock
 * returns what it was told to. It is the one source in this system that can be
 * tested that way: no credential, no network, and bytes that are already here.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { GET, POST } from './route';

const ORIGIN = 'http://127.0.0.1:3111';
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const req = (method: 'GET' | 'POST', body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/self`, {
    method,
    headers: { host: '127.0.0.1:3111', origin: ORIGIN, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

const DECLARED = {
  objectNames: [HEAD],
  capturedAt: '2026-09-11T09:00:00.000Z',
  repository: 'notation://source/self/notationsos',
  buildId: 'self-build-1',
  knownThrough: '2026-09-11T12:00:00.000Z',
  provenanceClass: 'LIVE_CAPTURE' as const,
  authority: 'role:corpus-steward',
  ruledAt: '2026-09-11T12:00:00.000Z',
};

const enabled = <T>(run: () => T): T => {
  process.env.PAYLOAD_SELF_CAPTURE_LOCAL = '1';
  return run();
};

afterEach(() => { delete process.env.PAYLOAD_SELF_CAPTURE_LOCAL; });

describe('the self-observation rail, served', () => {
  it('describes the rail while the flag is unset, and says what to set', async () => {
    // A surface that refused while off would leave an operator reading source
    // to find out why the flag they were told about did nothing.
    const body = await (await GET(req('GET'))).json();
    expect(body.enabled).toBe(false);
    expect(body.enableWith).toBe('PAYLOAD_SELF_CAPTURE_LOCAL=1');
    expect(body.reads).toMatch(/No fetch, no clone, no remote, no write/);
    expect(body.maxObjectsPerCapture).toBe(64);
  });

  it('is reachable from loopback and from nowhere else', async () => {
    const res = await GET(req('GET', undefined, { host: 'payload.example.com' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/LOCAL_ONLY|RELAYED_REQUEST/);
  });

  it('reads nothing while the flag is unset, and says which flag', async () => {
    const res = await POST(req('POST', DECLARED));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('LOCAL_MODE_DISABLED');
    expect(body.remedy).toMatch(/PAYLOAD_SELF_CAPTURE_LOCAL=1/);
  });

  it('captures, builds and admits a real object out of this repository', async () => {
    const res = await enabled(() => POST(req('POST', DECLARED)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.capture.read).toBe(1);
    expect(body.capture.notRead).toEqual([]);
    expect(body.build.state).toBe('UNADMITTED');
    expect(body.build.candidateCount).toBeGreaterThan(0);
    // The flag did something: rows exist that did not exist before it was set.
    expect(body.receipt.counts.admitted).toBeGreaterThan(0);
    expect(body.receipt.rows.length).toBe(body.receipt.counts.rows);
    expect(body.receipt.authority).toBe('role:corpus-steward');
  });

  it('refuses a name that is not an object name, and reads the rest of the batch', async () => {
    const res = await enabled(() => POST(req('POST', { ...DECLARED, objectNames: ['--upload-pack=touch /tmp/x', HEAD] })));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.capture.read).toBe(1);
    expect(body.capture.notRead).toHaveLength(1);
    expect(body.capture.notRead[0].objectName).toBe('--upload-pack=touch /tmp/x');
    expect(body.capture.notRead[0].because).toMatch(/refused rather than repaired/);
  });

  it('will not let the rail admit on its own behalf', async () => {
    // Not refused by this route — it is refused by the gate, which is where
    // the rule lives and where it applies to every source equally.
    const res = await enabled(() => POST(req('POST', { ...DECLARED, authority: 'notationsos.self-admission.v1' })));
    const body = await res.json();
    expect(body.receipt.counts.admitted).toBe(0);
    expect(body.receipt.refusalTally.map((entry: { check: string }) => entry.check)).toContain('AUTHORITY_IS_NOT_THE_PROCESS');
  });

  it('names the missing declaration rather than failing as one check among ten', async () => {
    const cases: Array<[Partial<typeof DECLARED>, string]> = [
      [{ authority: '' }, 'NO_AUTHORITY'],
      [{ repository: '' }, 'NO_REPOSITORY'],
      [{ buildId: '' }, 'NO_BUILD_ID'],
      [{ capturedAt: 'whenever' }, 'UNREADABLE_CAPTURED_AT'],
      [{ knownThrough: 'soon' }, 'UNREADABLE_KNOWN_THROUGH'],
      [{ ruledAt: 'later' }, 'UNREADABLE_RULED_AT'],
      [{ provenanceClass: 'DERIVED' as never }, 'PROVENANCE_NOT_DECLARED'],
      [{ objectNames: 'HEAD' as never }, 'NO_OBJECTS'],
    ];
    for (const [override, code] of cases) {
      const res = await enabled(() => POST(req('POST', { ...DECLARED, ...override })));
      expect(res.status, code).toBe(400);
      expect((await res.json()).error).toBe(code);
    }
  });

  it('infers provenance from nothing, and says so when refusing', async () => {
    const res = await enabled(() => POST(req('POST', { ...DECLARED, provenanceClass: undefined })));
    expect((await res.json()).remedy).toMatch(/guess about testimony/);
  });

  it('refuses a body past its limit before spending the memory on it', async () => {
    const res = await enabled(() => POST(req('POST', JSON.stringify({ ...DECLARED, pad: 'x'.repeat(32 * 1024) }))));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('BODY_TOO_LARGE');
  });

  it('refuses a body it cannot parse without guessing at what was meant', async () => {
    const res = await enabled(() => POST(req('POST', '{not json')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('UNREADABLE_BODY');
  });
});
