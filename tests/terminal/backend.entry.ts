/** Test harness only. Loopback HTTP and disposable fixture SQL, never deployment. */
import { PGlite } from '@electric-sql/pglite';
import type { Serializable } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { isAbsolute, basename, dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { FixtureCorpusSource } from '../../src/adapter/corpusSource';
import { FIXTURE_CORPORA } from '../../src/fixtures';
import type { TerminalDatabase } from '../../src/terminal/database';
import { terminalHttp } from '../../src/terminal/http';
import { executeMining, workerArtifact, type MiningExecutor } from '../../src/terminal/mining';
import { installTerminalSchema } from '../../src/terminal/schema';
import { TerminalService } from '../../src/terminal/service';
import { LocalImmutableObjectStore } from '../../src/data-os/local-immutable-object-store';
import { PublicationWorker } from '../../src/terminal/publication';
import { publicationPermission } from '../../src/terminal/retention';
import { publishTerminalLake } from '../../src/terminal/lake';
import { localLakeConfig, lakeDestination, runLocalLake } from '../../src/terminal/lakeRuntime';

type Init = { kind: 'initialize'; dataDir: string; principals: string; holdFirstClaim: boolean; browserUi?: boolean; storage?: boolean; holdPublication?: boolean; lake?: { python: string; packages: string } };
let client: PGlite;
let server: Server;
let service: TerminalService;
let publisher: PublicationWorker | undefined;
let lakePublish: ((publicationId: string) => Promise<unknown>) | undefined;
let stopping = false;
let running = false;
let loop: Promise<void> | undefined;
const send = (value: unknown) => { if (process.connected) process.send?.(value as Serializable); };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function initialize(value: Init) {
  if (!process.send || process.env.PAYLOAD_TERMINAL_QUALIFICATION !== '1'
    || !isAbsolute(value.dataDir) || basename(value.dataDir) !== 'postgres'
    || !basename(dirname(value.dataDir)).startsWith('payload-terminal-process-test-')
    || typeof value.principals !== 'string' || value.principals.length > 65536) throw new Error('QUALIFICATION_CONFIGURATION_INVALID');
  process.env.PAYLOAD_TERMINAL_PRINCIPALS = value.principals;
  client = new PGlite(value.dataDir); await client.waitReady;
  const database: TerminalDatabase = { transaction: work => client.transaction(tx => work({
    query: async <T>(sql: string, values?: unknown[]) => values !== undefined
      ? { rows: (await tx.query<T>(sql, values)).rows }
      : { rows: (await tx.exec(sql)).flatMap(result => result.rows as T[]) },
  })) };
  const state = (await client.query<{ corpus: string | null }>("SELECT to_regclass('public.corpora')::text corpus")).rows[0];
  if (!state.corpus) {
    await client.exec(`CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, title text NOT NULL, description text NOT NULL, data jsonb NOT NULL);
      CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);`);
    for (const corpus of FIXTURE_CORPORA) {
      if (!corpus.fixture_only) throw new Error('QUALIFICATION_FIXTURE_REQUIRED');
      await client.query('INSERT INTO corpora VALUES($1,$2,$3,$4,$5::jsonb)', [corpus.corpusId, corpus.domain, corpus.title, corpus.description, JSON.stringify(corpus)]);
      for (const release of corpus.releases) {
        if (!release.fixture_only) throw new Error('QUALIFICATION_FIXTURE_REQUIRED');
        await client.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5::jsonb)', [release.releaseId, corpus.corpusId, release.status, release.knownAt, JSON.stringify(release)]);
      }
    }
  }
  await installTerminalSchema(database);
  let hold = value.holdFirstClaim;
  const executor: MiningExecutor = async work => {
    if (hold) {
      hold = false;
      // runNext has committed RUNNING before this dedicated test-only failpoint.
      const row = (await client.query<{ state: string; attempts: number; lease_until: Date }>('SELECT state,attempts,lease_until FROM payload_terminal_job WHERE job_id=$1', [work.jobId])).rows[0];
      send({ kind: 'claim-held', jobId: work.jobId, state: row.state, attempts: row.attempts, leaseUntil: new Date(row.lease_until).toISOString() });
      await new Promise<void>(() => {}); // Parent hard-kills the process. No fake SQL clock.
    }
    return executeMining(work);
  };
  const source = new FixtureCorpusSource();
  const store = value.storage ? new LocalImmutableObjectStore(resolve(dirname(value.dataDir), 'objects')) : undefined;
  service = new TerminalService(database, source, () => workerArtifact().digest, executor, store?.destination);
  if (store) {
    let holdPublication = value.holdPublication;
    publisher = new PublicationWorker(database, {
      destination: store.destination,
      ensure: async (key, bytes, signal) => {
        const receipt = await store.ensure(key, bytes, signal);
        if (holdPublication) {
          holdPublication = false;
          send({ kind: 'publication-held', receipt });
          await new Promise<void>(() => {}); // Actual bytes exist, but SQL acknowledgement has not happened.
        }
        return receipt;
      },
      get: (key, max, signal) => store.get(key, max, signal),
      readReceipt: (receipt, signal) => store.readReceipt(receipt, signal),
    }, { permit: publicationPermission(database, source, store.destination) });
    if (value.lake) {
      const config = localLakeConfig({ PAYLOAD_LAKE_PYTHON: value.lake.python, PAYLOAD_LAKE_PYTHON_PACKAGES: value.lake.packages,
        PAYLOAD_LAKE_ROOT: resolve(dirname(value.dataDir), 'lake') });
      await runLocalLake(config, 'init');
      lakePublish = (publicationId: string) => publishTerminalLake(database, source, store, publicationId,
        lakeDestination(config), (mode, input) => runLocalLake(config, mode, input));
    }
  }
  // Fixed test artifact only; never expose arbitrary paths or embed a credential.
  const browserBundle = value.browserUi ? readFileSync(resolve('.stamp/terminal-qualification-browser.js')) : null;
  const browserPage = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture TerminalWorkbench qualification</title></head><body><main id="qualification-root"></main><script src="/qualification/terminal-workbench.js"></script></body></html>';
  server = createServer(async (incoming, outgoing) => {
    try {
      if (browserBundle && incoming.method === 'GET' && ['/qualification', '/qualification/terminal-workbench.js'].includes(incoming.url ?? '')) {
        const script = incoming.url === '/qualification/terminal-workbench.js';
        outgoing.writeHead(200, { 'content-type': script ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
          'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
        outgoing.end(script ? browserBundle : browserPage); return;
      }
      if (incoming.url !== '/api/v1/terminal') { outgoing.writeHead(404); outgoing.end(); return; }
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error();
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const controller = new AbortController(); incoming.once('aborted', () => controller.abort());
      const method = incoming.method ?? 'GET';
      const request = new Request(`http://127.0.0.1:${address.port}/api/v1/terminal`, {
        method, headers, signal: controller.signal,
        ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: 'half' } : {}),
      } as RequestInit);
      const response = await terminalHttp(request, async () => service);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(503, { 'content-type': 'application/json' }); outgoing.end('{"error":"QUALIFICATION_UNAVAILABLE"}'); }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000; server.keepAliveTimeout = 1000; server.maxHeadersCount = 30;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('QUALIFICATION_LISTEN_FAILED');
  send({ kind: 'ready', port: address.port, pid: process.pid, methodDigest: workerArtifact().digest, fixture_only: true });
}
function startWorkers() {
  if (running || stopping) return;
  running = true;
  loop = (async () => {
    while (!stopping) {
      try {
        const mined = await service.runNext();
        const published = publisher ? await publisher.runNext() : false;
        if (mined || published) continue;
      }
      catch { send({ kind: 'worker-failed' }); return; }
      await delay(200);
    }
  })();
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server?.closeIdleConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await loop; await client?.close(); send({ kind: 'closed' }); process.disconnect?.();
}
async function stats() {
  const rows = await client.query(`SELECT
    (SELECT count(*)::int FROM operation_proposal) proposals,
    (SELECT count(*)::int FROM proposal_review) reviews,
    (SELECT count(*)::int FROM payload_terminal_job) jobs,
    (SELECT count(*)::int FROM payload_terminal_result) results,
    (SELECT count(*)::int FROM payload_terminal_receipt) receipts,
    (SELECT count(*)::int FROM execution_attempt) attempts,
    (SELECT count(*)::int FROM attempt_reconciliation) reconciliations`);
  send({ kind: 'stats', counts: rows.rows[0] });
}
let initialized = false;
process.on('message', message => {
  const value = message as { kind?: string; publicationId?: string };
  if (!initialized && value?.kind === 'initialize') {
    initialized = true;
    void initialize(value as Init).catch(() => { send({ kind: 'failed', code: 'QUALIFICATION_START_FAILED' }); process.exitCode = 1; void shutdown(); });
  } else if (value?.kind === 'start-workers' && service) startWorkers();
  else if (value?.kind === 'stats' && service) void stats().catch(() => send({ kind: 'failed', code: 'QUALIFICATION_STATS_FAILED' }));
  else if (value?.kind === 'lake' && lakePublish && value.publicationId) void lakePublish(value.publicationId)
    .then(receipt => send({ kind: 'lake', receipt })).catch(() => send({ kind: 'failed', code: 'QUALIFICATION_LAKE_FAILED' }));
  else if (value?.kind === 'shutdown') void shutdown();
});
process.on('disconnect', () => { void shutdown(); });
