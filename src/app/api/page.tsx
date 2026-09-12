import type { Metadata } from 'next';
import Link from 'next/link';
import { getCorpusSource } from '@/adapter/corpusSource';
import { asOfPayload, recordsPayload, releaseManifestPayload, releasesPayload, retractionsPayload, rulingManifestPayload } from '@/adapter/feed';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Section } from '@/components/primitives/Section';
import { QueryCostPanel } from '@/components/corpus/QueryCostPanel';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease } from '@/domain/corpus';
import { GRAMMAR_LOSS, QUESTION_MEANING, whatChanged, whatIsMissing } from '@/domain/queryGrammar';
import { MCP_TOOLS } from '@/mcp/tools';
import { CALLER_IS_A_SOURCE, INTENT_IS_THE_UPGRADE, PURPOSE_SHAPING, TRANSPORT_AXES, TWO_PART_RULE, servingStanding } from '@/domain/servingBoundary';
import { REASONER_MAY, REASONER_MAY_NOT, REASONING_RULES, WITNESS_NOT_AUTHORITY } from '@/domain/reasoningWitness';
import { CopyButton } from '@/components/primitives/CopyButton';

export const metadata: Metadata = { title: 'API' };

const CORPUS_CONTRACT = `interface CorpusSource {
  origin: { kind: 'FIXTURE' | 'LIVE'; label: string };
  listCorpora(): Promise<Corpus[]>;
  listReleases(corpusId?): Promise<CorpusRelease[]>;
  getRelease(releaseId): Promise<{ corpus; release } | undefined>;
  records(releaseId, viewer): Promise<{ records; withheldByRights; withheldByVisibility }>;
  asOf(releaseId, { subjectId, predicate, validAt, knownAt, question: 'WHAT_WE_HELD' }): Promise<AsOfAnswer>;
  retractions(since?, viewer): Promise<Retraction[]>;
}`;

const DECISION_RULE = `// customer-side, any language: settle provisionally if the measured gross weight,
// including its stated bound, is within 0.5 % of the declared quantity
const a = await get(\`/api/v1/releases/\${release}/as-of?subject=LOT-5B-221&predicate=quantity.gross&validAt=\${validAt}&knownAt=\${knownAt}&question=WHAT_WE_HELD\`);
if (a.refusal) return { decision: 'hold', because: a.refusal.code, remedy: a.refusal.remedy };
if (a.answer.evidenceClass.claimStrength === 'estimated') return { decision: 'hold', because: 'estimate, not a measurement' };
const { low, high } = a.answer.uncertainty;
const withinTolerance = Math.abs(low - declared) / declared <= 0.005 && Math.abs(high - declared) / declared <= 0.005;
return { decision: withinTolerance ? 'settle_provisionally' : 'hold', release: a.release.releaseId, knownAt: a.query.knownAt, record: a.answer.recordId };`;

const CASE_CONTRACT = `interface CaseSource {            // application layer
  listCases(): Promise<ClaimCaseBundle[]>;
  getCase(caseId): Promise<ClaimCaseBundle | undefined>;
  getRuling(rulingId): Promise<{ bundle; ruling } | undefined>;
  listProfiles(): Promise<AdmissionProfile[]>;
  getProfile(profileId): Promise<AdmissionProfile | undefined>;
  getRemediation(remediationId): Promise<Remediation | undefined>;
}`;

function Example({ title, url, body }: { title: string; url: string; body: unknown }) {
  const text = JSON.stringify(body, null, 2);
  // The button copies the printed example by id rather than carrying its own copy.
  const preId = `api-example-${url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
  return (
    <details className="surface-inset p-3">
      <summary className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>{title} — <Link href={url} className="id" style={{ color: 'var(--info)' }}>GET {url}</Link></summary>
      <div className="mt-2 flex items-center justify-end"><CopyButton target={preId} label="Copy JSON" /></div>
      <pre id={preId} tabIndex={0} className="m-0 mt-1 surface-inset p-2 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)', maxHeight: 360 }}>{text}</pre>
    </details>
  );
}

export default async function ApiPage() {
  const source = getCorpusSource();
  const releases = await releasesPayload();
  const current = releases.releases.find((r) => r.status === 'CURRENT')?.releaseId ?? '';
  const records = await recordsPayload(current, 'COUNTERPARTY_SHARED', { subjectId: 'LOT-5B-221' });
  const asOf = await asOfPayload(current, { subjectId: 'LOT-7C-104', predicate: 'condition.moisture', validAt: '2026-08-28T14:00:00Z', knownAt: '2026-09-01T12:00:00Z', question: 'WHAT_WE_HELD' });
  const asOfHit = await asOfPayload(current, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-20T00:00:00Z', question: 'WHAT_WE_HELD' });
  // The question this corpus cannot answer, refused rather than served on the wrong clock.
  const asOfSourceQuestion = await asOfPayload(current, { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', knownAt: '2026-08-20T00:00:00Z', question: 'WHAT_THE_SOURCE_KNEW' });
  const retractions = await retractionsPayload('2026-08-26T00:00:00Z', 'COUNTERPARTY_SHARED');
  const manifest = await rulingManifestPayload('RUL-7C104-r2', 'COUNTERPARTY_SHARED');
  const releaseManifest = await releaseManifestPayload(current);
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>API</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>The corpora are the finished information inventory. APIs, feeds, reports, workbenches and MCP tools distribute it; this page is the API and the MCP tools. A customer applies their own inference, models, agents and workflows to the stream. The endpoints below serve the committed demonstration corpus; every response says <span className="id">fixture_only: true</span> and names the release it was served from. Shapes are the product&apos;s; the data is synthetic.</p>
        </header>

        <Section title="Endpoints" id="api-endpoints">
          <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12.5px]" aria-label="Endpoints">
            <thead><tr><th scope="col">Endpoint</th><th scope="col">Returns</th></tr></thead>
            <tbody>
              <tr><td className="id">GET /api/v1/releases[?corpus=]</td><td>Release history: id, status, knowledge cutoff, build, methodology, digest, supersession.</td></tr>
              <tr><td className="id">GET /api/v1/releases/:id</td><td>Build record with input digests, coverage, sources with their rights schedule, links.</td></tr>
              <tr><td className="id">GET /api/v1/releases/:id/manifest</td><td>The certified release manifest and its commitment: build record with stages and input digests, release digest, sources with rights, certification and governance.</td></tr>
              <tr><td className="id">GET /api/v1/releases/:id/records[?subject=&amp;predicate=&amp;projection=]</td><td>Deliverable records after the rights guard and the visibility projection, with withheld counts.</td></tr>
              <tr><td className="id">GET /api/v1/releases/:id/as-of?subject=&amp;predicate=&amp;validAt=&amp;knownAt=&amp;question=</td><td>One reconstructed answer with status at the knowledge time, the identity link used if any, or a typed refusal with a remedy and the candidates set aside. <span className="id">question</span> is required and has no default: <span className="id">WHAT_WE_HELD</span> is bounded by this corpus&apos;s knowledge time, <span className="id">WHAT_THE_SOURCE_KNEW</span> by the source&apos;s own clock. Every answer states the <span className="id">boundedBy</span> clock, so which question was answered is never inferred.</td></tr>
              <tr><td className="id">GET /api/v1/retractions[?since=&amp;projection=]</td><td>Push retractions: corrections and withdrawals, oldest first, with affected and replacement records and affected rulings.</td></tr>
              <tr><td className="id">GET /api/v1/rulings/:id[?projection=]</td><td>Application layer: a ruling as the workbench returns it, at the requested projection.</td></tr>
              <tr><td className="id">GET /api/v1/rulings/:id/manifest</td><td>The <span className="id">notations.result-manifest.v1</span> sidecar and its commitment.</td></tr>
            </tbody>
          </table>
          </div>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Projections served: <span className="id">COUNTERPARTY_SHARED</span> (default) and <span className="id">PUBLIC_RULING</span>. Internal classes are never served. Times are ISO 8601 UTC. Responses are uncached and carry <span className="id">X-Payload-Fixture-Only: true</span>.</p>
        </Section>

        <Section title="Examples from the demonstration corpus" id="api-examples">
          <Example title="Releases" url="/api/v1/releases" body={releases} />
          <Example title="Certified release manifest of the current release" url={`/api/v1/releases/${current}/manifest`} body={releaseManifest} />
          <Example title="Records for lot 5B-221 in the current release" url={`/api/v1/releases/${current}/records?subject=LOT-5B-221`} body={records} />
          <Example title="As-of: lot 5B-221 quantity as knowable on 2026-08-20 (before the correction)" url={`/api/v1/releases/${current}/as-of?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z&question=WHAT_WE_HELD`} body={asOfHit} />
          <Example title="As-of: lot 7C-104 moisture — a typed refusal (no identity link)" url={`/api/v1/releases/${current}/as-of?subject=LOT-7C-104&predicate=condition.moisture&validAt=2026-08-28T14:00:00Z&knownAt=2026-09-01T12:00:00Z&question=WHAT_WE_HELD`} body={asOf} />
          <Example title="As-of: the same query asking what the source knew — refused, not answered on the wrong clock" url={`/api/v1/releases/${current}/as-of?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z&question=WHAT_THE_SOURCE_KNEW`} body={asOfSourceQuestion} />
          <Example title="Retractions issued after 2026-08-26" url="/api/v1/retractions?since=2026-08-26T00:00:00Z" body={retractions} />
          <Example title="Application layer: ruling manifest for RUL-7C104-r2" url="/api/v1/rulings/RUL-7C104-r2/manifest" body={manifest} />
        </Section>

        <Section title="Automating against the feed" id="api-automate">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Inference is the customer&apos;s. A decision rule over an as-of answer needs only what the answer states:</p>
          <pre tabIndex={0} className="m-0 surface-inset p-3 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)' }}>{DECISION_RULE}</pre>
          <ol className="m-0 pl-4 text-[13px] flex flex-col gap-1" style={{ color: 'var(--text-primary)' }}>
            <li>Hold a release id and its knowledge cutoff. Query records or as-of answers against it; every answer states the release, both clocks and the bounds, so the decision rule runs on stated inputs, not on a black box.</li>
            <li>Poll <span className="id">/api/v1/retractions?since=&lt;cutoff&gt;</span>. A correction names the replacement record; a withdrawal names what to stop relying on and which rulings it touched.</li>
            <li>When a new release appears, re-run the same queries against it and compare. The earlier release still answers as it did.</li>
          </ol>
        </Section>

        <Section title="Questions the endpoints do not yet ask" id="api-grammar">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            The four shapes above are point and set lookups. The questions worth paying for are temporal joins over the
            correction tape, the supersession chain and the dependency edges — three structures this corpus has. The grammar
            that composes them is in <span className="id">src/domain/queryGrammar.ts</span> and is exercised over the
            demonstration corpus below. <strong>No endpoint serves it yet</strong>: the shapes are specified and tested, and
            the routes are the next step rather than a claim made here.
          </p>
          {(() => {
            const release = currentRelease(CARAVAN_CORPUS);
            const subject = 'LOT-5B-221';
            const log = whatChanged(CARAVAN_CORPUS, release, { subjectId: subject, since: '2026-08-01T00:00:00Z', knownBy: release.knownAt });
            // The subjects are supplied because the corpus has no census; asked to
            // find absences in its own records it could only ever answer nothing.
            // Samples, because moisture is a sample-level predicate: asked of a lot
            // it correctly answers NOT_HELD for everything, which is a true answer
            // to a malformed question. These three show all it can say — one held,
            // one withdrawn, one never reported.
            const missing = whatIsMissing(CARAVAN_CORPUS, release, {
              subjectIds: ['SAMPLE-S-4402', 'SAMPLE-S-4390', 'SAMPLE-S-4499-NEVER-REPORTED'],
              predicate: 'condition.moisture',
              knownBy: release.knownAt,
            });
            return (
              <div className="flex flex-col gap-3" data-testid="query-grammar">
                <dl className="kv text-[12.5px]">
                  {(Object.keys(QUESTION_MEANING) as Array<keyof typeof QUESTION_MEANING>).map((shape) => (
                    <div key={shape} className="contents">
                      <dt className="mono">{shape}</dt>
                      <dd>{QUESTION_MEANING[shape]}</dd>
                    </div>
                  ))}
                </dl>
                <div className="surface-inset p-3 flex flex-col gap-1" data-testid="grammar-changed">
                  <span className="label-sm">WHAT_CHANGED · {subject} · since 2026-08-01</span>
                  {log.changes.map((change) => (
                    <p key={`${change.kind}:${change.recordId}`} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      <span className="label-sm" style={{ color: change.kind === 'WITHDRAWN' ? 'var(--status-revoked)' : change.kind === 'CORRECTED' ? 'var(--status-superseded)' : 'var(--status-admitted)' }}>{change.kind}</span>{' '}
                      <span className="mono">{change.predicate}</span> <span className="ts">{change.at}</span>
                    </p>
                  ))}
                  <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{log.because}</p>
                </div>
                <div className="surface-inset p-3 flex flex-col gap-1" data-testid="grammar-missing">
                  <span className="label-sm">WHAT_IS_MISSING · condition.moisture · three named samples</span>
                  {missing.coverage === null ? (
                    <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{missing.because}</p>
                  ) : (
                    <>
                      {missing.coverage.map((entry) => (
                        <p key={entry.subjectId} className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                          <span className="mono">{entry.subjectId}</span>{' '}
                          <span className="label-sm" style={{ color: entry.holding === 'HELD' ? 'var(--status-admitted)' : entry.holding === 'HELD_THEN_WITHDRAWN' ? 'var(--status-revoked)' : 'var(--check-na)' }}>{entry.holding}</span>
                        </p>
                      ))}
                      <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{missing.because}</p>
                    </>
                  )}
                </div>
                <ul className="m-0 pl-4 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
                  {GRAMMAR_LOSS.map((entry) => <li key={entry}>{entry}</li>)}
                </ul>
              </div>
            );
          })()}
        </Section>

        <Section title="What a read costs" id="api-cost">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            The product noun is <em>indexed and queryable</em>. There is no index: an as-of answer filters the whole record
            array, so it costs the corpus rather than the answer. That was an inference from reading the code until
            <span className="id"> scripts/bench-query.ts</span> made it a number, and these are the numbers, said by the
            system rather than worked out by the reader. Outside the sizes that were actually run the answer is
            <span className="mono"> UNKNOWN</span> — a projected curve would be the most convincing figure here precisely
            because it would carry a decimal point.
          </p>
          <QueryCostPanel />
        </Section>

        <Section title="MCP tools" id="api-mcp">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The same feed, exposed as tools for a model client. One logic path: each tool wraps the payload the HTTP endpoint serves. A refusal is a successful return with a remedy; tool errors are for malformed arguments only. Run with <span className="id">npm run mcp</span> (stdio; opens no port).</p>
          <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12.5px]" aria-label="MCP tools">
            <thead><tr><th scope="col">Tool</th><th scope="col">Arguments</th><th scope="col">Returns</th></tr></thead>
            <tbody>
              {MCP_TOOLS.map((t) => (
                <tr key={t.name}>
                  <td className="id">{t.name}</td>
                  <td className="id">{Object.keys(t.shape).join(', ')}</td>
                  <td>{t.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Section>

        <Section title="What a transport can enforce, and what it cannot" id="api-boundary">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="serving-standing">{servingStanding().statement}</p>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12px]" aria-label="An open surface against a tool surface">
              <thead><tr><th scope="col">Question</th><th scope="col">Open surface</th><th scope="col">Tool surface</th><th scope="col">Stronger</th></tr></thead>
              <tbody>
                {TRANSPORT_AXES.map((a) => (
                  <tr key={a.axis} data-transport-axis={a.axis} data-stronger={a.stronger}>
                    <td style={{ color: 'var(--text-heading)' }}>{a.question}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{a.openSurface}</td>
                    <td>{a.toolSurface}</td>
                    <td style={{ color: a.stronger === 'NEITHER' ? 'var(--status-conditional)' : 'var(--check-passed)' }}>{a.stronger === 'NEITHER' ? 'Neither' : a.stronger === 'TOOL_SURFACE' ? 'Tool surface' : 'Open surface'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="intent-upgrade">{INTENT_IS_THE_UPGRADE.claim} {INTENT_IS_THE_UPGRADE.because} {INTENT_IS_THE_UPGRADE.notASubstitute}</p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-heading)' }} data-testid="two-part-rule">Serve the corpus under a purpose. Serve the estates never.</p>
          <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }} aria-label="What never leaves the wall">
            {TWO_PART_RULE.estates.map((e) => <li key={e}>{e}</li>)}
          </ul>
          <ul className="m-0 p-0 list-none grid gap-1 sm:grid-cols-3" aria-label="How a purpose shapes an answer">
            {PURPOSE_SHAPING.map((p) => (
              <li key={p.purpose} className="surface-inset p-2 text-[12px]" data-purpose={p.purpose}>
                <span style={{ color: 'var(--text-heading)' }}>{p.purpose}</span>
                <div style={{ color: 'var(--text-secondary)' }}>{p.shape}</div>
                <div style={{ color: 'var(--text-muted)' }}>{p.reason}</div>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{CALLER_IS_A_SOURCE.claim} {CALLER_IS_A_SOURCE.soThen} {CALLER_IS_A_SOURCE.sharedWithBilling}</p>
        </Section>

        <Section title="A reasoner over this surface" id="api-reasoner">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="witness-not-authority">{WITNESS_NOT_AUTHORITY.statement} {WITNESS_NOT_AUTHORITY.because} {WITNESS_NOT_AUTHORITY.sameWall}</p>
          <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label="The three rules a reasoner is held to">
            {REASONING_RULES.map((r) => (
              <li key={r.id} className="surface-inset p-2 text-[12px]" data-reasoning-rule={r.id} data-rule-enforced={String(r.enforced)}>
                <span style={{ color: 'var(--text-heading)' }}>{r.rule}</span>
                <div style={{ color: 'var(--text-secondary)' }}>{r.prevents}</div>
                <div style={{ color: r.enforced ? 'var(--check-passed)' : 'var(--status-refused)' }}>{r.enforced ? 'Enforced: ' : 'Not enforced. Would be: '}{r.enforcement}</div>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><span className="label-sm">May</span><ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>{REASONER_MAY.map((m) => <li key={m}>{m}</li>)}</ul></div>
            <div><span className="label-sm">May not</span><ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--status-refused)' }}>{REASONER_MAY_NOT.map((m) => <li key={m}>{m}</li>)}</ul></div>
          </div>
        </Section>

        <Section title="Adapter contracts" id="api-contract" aside={<CopyButton target="api-contracts-text" />}>
          <pre id="api-contracts-text" tabIndex={0} className="m-0 surface-inset p-3 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)' }}>{CORPUS_CONTRACT}{'\n\n'}{CASE_CONTRACT}</pre>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>src/adapter/corpusSource.ts and src/adapter/caseSource.ts. The only implementations read committed fixtures. A live corpus source sits on the release store and the retraction log; a live case source maps the workbench&apos;s objects. Neither re-implements a gate; the browser computes no fact and adjudicates nothing.</p>
        </Section>

        <Section title="Substrate vocabulary carried by the feed" id="api-vocab">
          <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12.5px]" aria-label="Substrate vocabulary">
            <thead><tr><th scope="col">Concept</th><th scope="col">Substrate origin</th><th scope="col">Feed field</th></tr></thead>
            <tbody>
              <tr><td>Evidence class, two axes + interest</td><td className="id">corpus-contract/contract.json 1.0.0</td><td className="id">evidenceClass.claimStrength / productionClass / interest</td></tr>
              <tr><td>Canonical identity</td><td className="id">control-plane/src/identity/canonical-uri.js</td><td className="id">canonicalId, subject.canonicalId, provenance.transformId</td></tr>
              <tr><td>knownAt distinct from valid time</td><td className="id">payload-methodology.js temporalSemantics</td><td className="id">knownAt, validity.validFrom / validTo</td></tr>
              <tr><td>Result manifest</td><td className="id">control-plane/src/governance/result-manifest.js</td><td className="id">/rulings/:id/manifest → notations.result-manifest.v1</td></tr>
              <tr><td>Capability maturity</td><td className="id">control-plane/src/governance/maturity.js</td><td className="id">release.methodology.status</td></tr>
              <tr><td>Source policy: permitted use and redistribution</td><td className="id">payload-methodology.js licensing</td><td className="id">sources[].permittedUses / nonUse / redistribution; record.rights.attribution</td></tr>
              <tr><td>Build record</td><td className="id">notations-corpus-graph ncg/platform/build.py</td><td className="id">release.build (inputDigests, deterministic, stages)</td></tr>
              <tr><td>Source-use policy: exact purpose, operation, audience decisions</td><td className="id">src/data-os/source-policy.ts (Bench-derived)</td><td className="id">sources[].registration; rights.deliveryDecision; withheld.reasons</td></tr>
              <tr><td>Evidence capture: content digest, storage key, receipt, source truth not claimed</td><td className="id">src/data-os/evidence-capture.ts (notations.binary-evidence.v1, notations.storage-receipt.v1)</td><td className="id">provenance.contentDigest / storageKey / receiptId</td></tr>
              <tr><td>Candidate records, separate from canonical admission: UNADMITTED, identity UNRESOLVED, source truth not claimed</td><td className="id">src/data-os/local-normalization.ts · local-candidate-build.ts</td><td className="id">/candidates only; never a field of any /api/v1 payload or MCP result</td></tr>
              <tr><td>Refusal with remedy</td><td className="id">controlTower.ts {'{'}kind:&apos;refusal&apos;, code, detail, remedy{'}'}</td><td className="id">refusal.code / reason / remedy</td></tr>
            </tbody>
          </table>
          </div>
        </Section>
      </div>
    </>
  );
}
