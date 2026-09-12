'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import type { MiningRequest } from '@/terminal/contracts';
import { Section } from '@/components/primitives/Section';

const PROTOCOL = 'payload.terminal.v1';
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const positive = z.number().int().positive();
const discoverySchema = z.object({
  identity: z.object({ principalId: z.string(), terminalId: z.string(), purpose: z.string(), corpusScope: z.array(z.string()), canReview: z.boolean() }),
  reads: z.array(z.string()),
  mining: z.object({
    capability: z.literal('discovery.run-workload'), methodDigest: hash,
    limits: z.object({ rows: positive, inputBytes: positive, outputBytes: positive, timeoutMs: positive }),
  }).nullable(),
});
const pinSchema = z.object({ snapshotDigest: hash, snapshot: z.object({
  releaseId: z.string(), corpusId: z.string(), knownAt: z.string(), fixture_only: z.boolean(), records: z.array(z.unknown()),
  selection: z.literal('PERMITTED_STANDING_RECORDS'),
  coverage: z.object({ standingRecords: z.number().int().nonnegative(), selectedRecords: z.number().int().nonnegative(), withheldByPermission: z.number().int().nonnegative() }),
}) });
const jobSchema = z.object({
  jobId: z.string(), releaseId: z.string(), state: z.enum(['PROPOSED', 'DENIED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']),
  actionDigest: hash, snapshotDigest: hash, methodDigest: hash, request: z.record(z.string(), z.unknown()),
  failureCode: z.string().nullable().optional(), correctsJobId: z.string().nullable().optional(),
}).passthrough();
const jobsSchema = z.object({ jobs: z.array(jobSchema), nextCursor: z.string().nullable() });
const resultSchema = z.object({ result: z.unknown(), resultDigest: hash, receipt: z.record(z.string(), z.unknown()), receiptDigest: hash });
type Discovery = z.infer<typeof discoverySchema>;
type Job = z.infer<typeof jobSchema>;
type Pin = { snapshotDigest: string; releaseId: string; corpusId: string; knownAt: string; fixtureOnly: boolean;
  selection: 'PERMITTED_STANDING_RECORDS'; coverage: { standingRecords: number; selectedRecords: number; withheldByPermission: number } };
type Budget = { maxRows: string; maxInputBytes: string; maxOutputBytes: string; timeoutMs: string };

const fieldStyle = { background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)' };
const secondary = { color: 'var(--text-secondary)' };
const fieldClass = 'w-full min-w-0 px-2 py-1.5 mono text-[12px]';
const newKey = () => `REQ-${crypto.randomUUID()}`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="min-w-0 flex flex-col gap-1 text-[12px]" style={secondary}><span>{label}</span>{children}</label>;
}
function Json({ value, testId }: { value: unknown; testId?: string }) {
  return <pre data-testid={testId} className="m-0 surface-inset p-2 mono text-[11px] overflow-auto max-h-72 whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(value, null, 2)}</pre>;
}

/** Independent browser terminal: all reads and actions use the versioned HTTP command surface. */
export function TerminalWorkbench() {
  const [token, setToken] = useState('');
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [releaseId, setReleaseId] = useState('');
  const [minRecords, setMinRecords] = useState('2');
  const [budget, setBudget] = useState<Budget>({ maxRows: '1000', maxInputBytes: '1048576', maxOutputBytes: '1048576', timeoutMs: '5000' });
  const [predecessorJobId, setPredecessorJobId] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [pin, setPin] = useState<Pin | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [result, setResult] = useState<z.infer<typeof resultSchema> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Connect to discover this credential’s capabilities.');
  const active = useRef<AbortController | null>(null);
  const working = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; active.current?.abort(); }, []);

  function resetPin() { setPin(null); setIdempotencyKey(''); }
  function resetIdentity(nextToken: string) {
    generation.current++; active.current?.abort(); active.current = null; working.current = false;
    setBusy(null); setToken(nextToken); setDiscovery(null); resetPin(); setJobs([]); setNextCursor(null);
    setJob(null); setJobId(''); setReviewReason(''); setResult(null); setError('');
    setStatus(nextToken ? 'Discover capabilities to connect.' : 'Disconnected. Token and retained responses cleared from this widget.');
  }
  async function command(label: string, input: unknown, accept: (value: unknown) => void) {
    if (working.current || !token.trim()) return;
    working.current = true; setBusy(label); setError('');
    const epoch = generation.current;
    const controller = new AbortController(); active.current = controller;
    try {
      const response = await fetch('/api/v1/terminal', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(input), cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object') throw new Error('TERMINAL_RESPONSE_INVALID');
      const envelope = body as { protocol?: unknown; result?: unknown; error?: unknown };
      if (!response.ok || envelope.error !== undefined) {
        throw new Error(typeof envelope.error === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(envelope.error) ? envelope.error : 'TERMINAL_REQUEST_FAILED');
      }
      if (envelope.protocol !== PROTOCOL || !Object.hasOwn(envelope, 'result')) throw new Error('TERMINAL_RESPONSE_INVALID');
      if (epoch === generation.current) accept(envelope.result);
    } catch (failure) {
      if (epoch === generation.current && !controller.signal.aborted) {
        const code = failure instanceof z.ZodError ? 'TERMINAL_RESPONSE_INVALID'
          : failure instanceof Error && /^[A-Z][A-Z0-9_]{0,79}$/.test(failure.message) ? failure.message : 'TERMINAL_CONNECTION_FAILED';
        setError(code); setStatus('No completion confirmed. Fetch job status or retry an unchanged request with the same key.');
      }
    } finally {
      if (epoch === generation.current) { working.current = false; setBusy(null); active.current = null; }
    }
  }
  function discover() {
    setDiscovery(null); resetPin();
    void command('Discovering capabilities', { command: 'discover' }, (value) => {
      const found = discoverySchema.parse(value);
      setDiscovery(found);
      if (found.mining) {
        const cap = found.mining.limits;
        setBudget({ maxRows: String(cap.rows), maxInputBytes: String(cap.inputBytes), maxOutputBytes: String(cap.outputBytes), timeoutMs: String(cap.timeoutMs) });
        setMinRecords(String(Math.min(2, cap.rows)));
      }
      setStatus(`Connected as ${found.identity.principalId}.`);
    });
  }
  const mining = discovery?.mining;
  const validInteger = (value: string, min: number, max: number) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
  const validInputs = !!mining && !!releaseId.trim() && validInteger(minRecords, 1, mining.limits.rows)
    && validInteger(budget.maxRows, 1, mining.limits.rows) && validInteger(budget.maxInputBytes, 1024, mining.limits.inputBytes)
    && validInteger(budget.maxOutputBytes, 1024, mining.limits.outputBytes) && validInteger(budget.timeoutMs, 100, mining.limits.timeoutMs)
    && ((!predecessorJobId.trim() && !correctionReason.trim()) || (!!predecessorJobId.trim() && !!correctionReason.trim()));
  const request: MiningRequest | null = pin && mining && validInputs && idempotencyKey ? {
    capability: mining.capability, releaseId: pin.releaseId, snapshotDigest: pin.snapshotDigest, methodDigest: mining.methodDigest,
    parameters: { minRecords: Number(minRecords) },
    budget: { maxRows: Number(budget.maxRows), maxInputBytes: Number(budget.maxInputBytes), maxOutputBytes: Number(budget.maxOutputBytes), timeoutMs: Number(budget.timeoutMs) },
    idempotencyKey, ...(predecessorJobId.trim() ? { correction: { jobId: predecessorJobId.trim(), reason: correctionReason.trim() } } : {}),
  } : null;
  function pinRelease() {
    if (!validInputs) return;
    void command('Pinning release', { command: 'pin', releaseId: releaseId.trim() }, (value) => {
      const pinned = pinSchema.parse(value);
      const coverage = pinned.snapshot.coverage;
      if (pinned.snapshot.releaseId !== releaseId.trim() || coverage.selectedRecords !== pinned.snapshot.records.length
        || coverage.standingRecords !== coverage.selectedRecords + coverage.withheldByPermission) throw new Error('TERMINAL_RESPONSE_INVALID');
      setPin({ snapshotDigest: pinned.snapshotDigest, releaseId: pinned.snapshot.releaseId, corpusId: pinned.snapshot.corpusId,
        knownAt: pinned.snapshot.knownAt, selection: pinned.snapshot.selection, coverage, fixtureOnly: pinned.snapshot.fixture_only });
      setIdempotencyKey((key) => key || newKey()); setStatus('Release pinned. Inspect the exact request before submitting it for review.');
    });
  }
  function acceptJob(value: unknown) {
    const found = jobSchema.parse(value);
    setJob(found); setJobId(found.jobId); setResult(null); setReviewReason(''); setStatus(`${found.jobId}: ${found.state}.`);
  }
  function loadJob(id: string) { setJob(null); setResult(null); setReviewReason(''); void command('Fetching job status', { command: 'job', jobId: id.trim() }, acceptJob); }
  function listJobs(after?: string) {
    void command('Fetching jobs', { command: 'jobs', limit: 20, ...(after ? { after } : {}) }, (value) => {
      const page = jobsSchema.parse(value); setJobs((prior) => after ? [...prior, ...page.jobs] : page.jobs); setNextCursor(page.nextCursor);
      setStatus(`${page.jobs.length} retained jobs fetched${page.nextCursor ? '; more available' : ''}.`);
    });
  }
  function review(response: 'APPROVE' | 'DENY') {
    if (!job || job.state !== 'PROPOSED' || !discovery?.identity.canReview || !reviewReason.trim()) return;
    void command(response === 'APPROVE' ? 'Recording approval' : 'Recording denial', {
      command: 'review', review: { jobId: job.jobId, actionDigest: job.actionDigest, response, reason: reviewReason.trim() },
    }, acceptJob);
  }

  return <Section title="Operator terminal" id="operator-terminal" aside={<span className="pill mono">{PROTOCOL}</span>}>
    <div className="surface p-3 flex flex-col gap-3 text-[12.5px]" aria-busy={!!busy}>
      <p className="m-0" style={secondary}>Pure internal research · <span className="mono">NOT_VALIDATED</span> · no admission or export. Every computation is proposed for explicit review.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grow min-w-0"><Field label="Terminal token"><input type="password" autoComplete="off" spellCheck={false} value={token} disabled={!!busy} onChange={(event) => resetIdentity(event.target.value)} className={fieldClass} style={fieldStyle} aria-describedby="terminal-token-note" /></Field></div>
        <button type="button" className="btn btn-primary" disabled={!!busy || !token.trim()} onClick={discover}>Connect and discover</button>
        <button type="button" className="btn" disabled={!token && !discovery} onClick={() => resetIdentity('')}>Forget token</button>
      </div>
      <p id="terminal-token-note" className="m-0 text-[11.5px]" style={secondary}>Held only in this widget’s memory. Sent in the authorization header to the terminal endpoint.</p>
      <p role="status" className="m-0" style={secondary}>{busy ?? status}</p>
      {error && <p role="alert" className="m-0" style={{ color: 'var(--status-refused)' }}>Terminal refused or unavailable: <span className="mono">{error}</span>. No success has been assumed.</p>}
      {discovery && <div className="surface-inset p-2 flex flex-col gap-1" data-testid="terminal-identity">
        <span>{discovery.identity.principalId} · {discovery.identity.purpose} · {discovery.identity.canReview ? 'review credential' : 'request credential'}</span>
        <span className="mono break-words">Scope: {discovery.identity.corpusScope.join(', ')}</span>
        <details><summary>Available read tools ({discovery.reads.length})</summary><p className="mono break-words">{discovery.reads.join(', ')}</p></details>
        {!mining && <span>Mining is not available to this credential.</span>}
      </div>}
    </div>
    {discovery && <div className="grid lg:grid-cols-2 gap-3 min-w-0">
      {mining && <div className="surface p-3 flex flex-col gap-3 min-w-0">
        <h3 className="m-0 text-[14px]" style={{ color: 'var(--text-heading)' }}>Pin and propose research</h3>
        <p className="m-0 mono text-[11px] break-words [overflow-wrap:anywhere]">{mining.capability}<br />Method: {mining.methodDigest}</p>
        <fieldset disabled={!!busy} className="m-0 p-0 border-0 grid sm:grid-cols-2 gap-2 min-w-0">
          <Field label="Release ID"><input value={releaseId} maxLength={128} onChange={(event) => { setReleaseId(event.target.value); resetPin(); }} className={fieldClass} style={fieldStyle} /></Field>
          <Field label="Minimum records"><input type="number" min={1} max={mining.limits.rows} step={1} value={minRecords} onChange={(event) => { setMinRecords(event.target.value); resetPin(); }} className={fieldClass} style={fieldStyle} /></Field>
          {([
            ['maxRows', 'Maximum input rows', 1, mining.limits.rows], ['maxInputBytes', 'Maximum input bytes', 1024, mining.limits.inputBytes],
            ['maxOutputBytes', 'Maximum output bytes', 1024, mining.limits.outputBytes], ['timeoutMs', 'Timeout (ms)', 100, mining.limits.timeoutMs],
          ] as const).map(([key, label, min, max]) => <Field key={key} label={label}><input type="number" min={min} max={max} step={1} value={budget[key]} onChange={(event) => { setBudget({ ...budget, [key]: event.target.value }); resetPin(); }} className={fieldClass} style={fieldStyle} /></Field>)}
          <Field label="Predecessor job ID (optional)"><input value={predecessorJobId} maxLength={128} onChange={(event) => { setPredecessorJobId(event.target.value); resetPin(); }} className={fieldClass} style={fieldStyle} /></Field>
          <Field label="Correction reason"><textarea value={correctionReason} maxLength={1000} rows={2} onChange={(event) => { setCorrectionReason(event.target.value); resetPin(); }} className={fieldClass} style={fieldStyle} /></Field>
        </fieldset>
        <p className="m-0 text-[11.5px]" style={secondary}>Changing request inputs clears the pin. A correction creates a new job linked to its predecessor.</p>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn" disabled={!!busy || !validInputs} onClick={pinRelease}>Pin release</button>
          <button type="button" className="btn" disabled={!!busy || !pin} onClick={() => setIdempotencyKey(newKey())}>New request key</button></div>
        {pin && <div className="flex flex-col gap-2" data-testid="terminal-pin">
          <dl className="kv m-0 text-[12px]"><dt>Snapshot</dt><dd className="mono break-all">{pin.snapshotDigest}</dd><dt>Corpus</dt><dd>{pin.corpusId}</dd><dt>Known at</dt><dd>{pin.knownAt}</dd>
            <dt>Selection</dt><dd className="mono break-words">{pin.selection}</dd><dt>Standing records</dt><dd>{pin.coverage.standingRecords}</dd>
            <dt>Selected records</dt><dd>{pin.coverage.selectedRecords}</dd><dt>Withheld by permission</dt><dd>{pin.coverage.withheldByPermission}</dd></dl>
          <p className="m-0 text-[11.5px]" style={secondary}>{pin.fixtureOnly ? 'Demonstration material. ' : ''}Results cover only these selected records. Concentration counts registered sources; it does not establish independent sources or full release coverage.</p>
        </div>}
        {request && <><p className="m-0 text-[11.5px]" style={secondary}>Exact request. Retry unchanged to reuse its idempotency key.</p><Json value={request} testId="terminal-request" /></>}
        <button type="button" className="btn btn-primary self-start" disabled={!!busy || !request} onClick={() => { if (request) void command('Submitting proposal', { command: 'submit', request }, acceptJob); }}>Submit for review</button>
      </div>}
      <div className="surface p-3 flex flex-col gap-3 min-w-0">
        <h3 className="m-0 text-[14px]" style={{ color: 'var(--text-heading)' }}>Retained jobs and review</h3>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn" disabled={!!busy} onClick={() => listJobs()}>Fetch jobs</button>{nextCursor && <button type="button" className="btn" disabled={!!busy} onClick={() => listJobs(nextCursor)}>Fetch more jobs</button>}</div>
        {jobs.length > 0 && <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Retained jobs">{jobs.map((entry) => <li key={entry.jobId} className="flex gap-2 items-center min-w-0"><button type="button" className="btn btn-sm mono min-w-0 break-all" disabled={!!busy} onClick={() => loadJob(entry.jobId)}>{entry.jobId}</button><span className="pill">{entry.state}</span></li>)}</ul>}
        <div className="flex flex-wrap gap-2 items-end"><div className="grow min-w-0"><Field label="Job ID"><input value={jobId} disabled={!!busy} maxLength={128} onChange={(event) => { setJobId(event.target.value); setJob(null); setResult(null); setReviewReason(''); }} className={fieldClass} style={fieldStyle} /></Field></div><button type="button" className="btn" disabled={!!busy || !jobId.trim()} onClick={() => loadJob(jobId)}>Fetch job status</button></div>
        {job && <div className="flex flex-col gap-3 min-w-0" data-testid="terminal-job">
          <p className="m-0 text-[12.5px]"><span className="mono">{job.jobId}</span> · <span className="pill">{job.state}</span>{job.failureCode ? ` · ${job.failureCode}` : ''}</p>
          <dl className="kv m-0 text-[12px]"><dt>Action digest</dt><dd className="mono break-all" data-testid="terminal-action-digest">{job.actionDigest}</dd><dt>Snapshot digest</dt><dd className="mono break-all">{job.snapshotDigest}</dd><dt>Method digest</dt><dd className="mono break-all">{job.methodDigest}</dd></dl>
          <details><summary className="text-[12px]">Retained request and job details</summary><Json value={job} /></details>
          {job.state === 'PROPOSED' && (discovery.identity.canReview ? <div className="surface-inset p-2 flex flex-col gap-2">
            <p className="m-0 text-[12px]" style={secondary}>Review the retained request and action digest above. The backend verifies this credential’s review authority.</p>
            <Field label="Review reason"><textarea value={reviewReason} disabled={!!busy} rows={3} maxLength={2000} onChange={(event) => setReviewReason(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
            <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={!!busy || !reviewReason.trim()} onClick={() => review('APPROVE')}>Approve exact action</button><button type="button" className="btn" disabled={!!busy || !reviewReason.trim()} onClick={() => review('DENY')}>Deny exact action</button></div>
          </div> : <p className="m-0 text-[12px]" style={secondary}>Awaiting a credential with review authority. Submitting did not approve this action.</p>)}
          <button type="button" className="btn self-start" disabled={!!busy || job.state !== 'SUCCEEDED'} onClick={() => { setResult(null); void command('Fetching retained result', { command: 'result', jobId: job.jobId }, (value) => { setResult(resultSchema.parse(value)); setStatus(`Retained result and receipt fetched for ${job.jobId}.`); }); }}>Fetch result and receipt</button>
          {result && <div className="flex flex-col gap-2"><p className="m-0 text-[12px]" style={secondary}>Retained internal research output · NOT_VALIDATED. Covers the selected permitted records and registered sources; it does not establish source independence or full release coverage.</p><Json value={result} testId="terminal-result" /></div>}
        </div>}
        <p className="m-0 text-[11.5px]" style={secondary}>Status and results are fetched on request. This widget never approves or polls automatically.</p>
      </div>
    </div>}
  </Section>;
}
