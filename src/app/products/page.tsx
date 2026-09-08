import type { Metadata } from 'next';
import Link from 'next/link';
import { asOfPayload } from '@/adapter/feed';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { DOMAINS } from '@/domain/domains';
import { FLAGSHIP_PRODUCTS } from '@/domain/product';
import { FEDERATION_RISK, INTEGRATION, METERING_BOUNDARY, RECEIPT_FIELDS, TELEMETRY_PILLARS, USAGE_UNITS, meteringReadiness } from '@/domain/metering';
import { Section } from '@/components/primitives/Section';
import { DELIVERED_RECORD_CONTRACT, ENVELOPE_FIELDS } from '@/domain/deliveredRecord';
import { buildSlice, gradeFrom } from '@/domain/catalogSlice';
import { CARAVAN_LOT_STATE as product } from '@/domain/informationProduct';
import { CUSTOMER_CATEGORIES } from '@/domain/product';
import { CARAVAN_CORPUS, CARAVAN_RELEASES } from '@/fixtures/caravan/release';
import { fmtUtc } from '@/lib/format';

export const metadata: Metadata = { title: 'Products' };

/** The first information product, and the promise every delivered record makes. Both are held to the corpus by tests; the page states what they state. */
export default async function ProductsPage() {
  const current = CARAVAN_RELEASES.at(-1)!;
  // Both answers ask what this system held; the two knowledge times are the point of the pair.
  const q = { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', validAt: '2026-08-17T16:00:00Z', question: 'WHAT_WE_HELD' } as const;
  const [early, late] = await Promise.all([
    asOfPayload(current.releaseId, { ...q, knownAt: '2026-08-20T00:00:00Z' }),
    asOfPayload(current.releaseId, { ...q, knownAt: current.knownAt }),
  ]);
  const streamHref = (knownAt: string) => `/stream?subject=${q.subjectId}&predicate=${q.predicate}&validAt=${q.validAt}&knownAt=${knownAt}`;
  const categories = CUSTOMER_CATEGORIES.filter((c) => (product.customerCategories as readonly string[]).includes(c.id));
  const coverage = product.fields.map((f) => {
    const records = CARAVAN_CORPUS.records.filter((r) => r.predicate === f.predicate);
    const within = records.filter((r) => f.subjectTypes.includes(r.subjectType) && (!f.unit || r.unit === f.unit) && f.acceptable.productionClass.includes(r.evidenceClass.productionClass) && f.acceptable.claimStrength.includes(r.evidenceClass.claimStrength) && f.acceptable.interest.includes(r.evidenceClass.interest));
    return { field: f, records: records.length, within: within.length };
  });
  return (
    <>
      <FixtureBanner note="The specification is data in src/domain/informationProduct.ts; informationProduct.test.ts holds it to the demonstration corpus. Fixture clock: 2026-09-01." />
      <div className="p-3 sm:p-5 max-w-[1100px] mx-auto w-full flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <span className="label-sm">Notation Systems \u00b7 the three products</span>
          <h1 className="m-0 text-[20px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>Caravan, Tradewind and Landshark</h1>
          <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{FLAGSHIP_PRODUCTS.statement}</p>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }} data-testid="products-state">{FLAGSHIP_PRODUCTS.here}</p>
        </header>

        <Section title="The three products" id="ip-products">
          <ul className="m-0 p-0 list-none grid gap-3 sm:grid-cols-3">
            {DOMAINS.map((d) => (
              <li key={d.id} className="surface p-3 flex flex-col gap-1.5" data-flagship={d.id} data-corpus={d.enabled ? 'PRESENT' : 'ABSENT'} style={{ borderStyle: d.enabled ? 'solid' : 'dashed' }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold" style={{ color: d.enabled ? 'var(--text-heading)' : 'var(--text-muted)' }}>{d.label}</span>
                  <span className="label-sm">{d.delivery}</span>
                </div>
                <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{d.scope}</div>
                <div className="text-[11.5px]" style={{ color: d.enabled ? 'var(--text-muted)' : 'var(--status-conditional)' }}>{d.note}</div>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>NotationsOS, the terminal you are reading this in, is not among them. It operates, monitors and navigates the backend these are produced from. <Link href="/model" style={{ color: 'var(--info)' }}>The operating model</Link> states the rest.</p>
        </Section>

        <Section title="Usage, and what a bill could point at" id="ip-metering">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Every query against a corpus, every compute run over it and every agent invocation through it is a lap. A lap is billable by construction only when the response it produced can be pointed at afterwards, so what a response carries is the whole question.</p>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12px]" aria-label="What a response carries, and what a bill line needs">
              <thead><tr><th scope="col">Field</th><th scope="col">Half</th><th scope="col">Why a bill needs it</th><th scope="col">State</th></tr></thead>
              <tbody>
                {RECEIPT_FIELDS.map((f) => (
                  <tr key={f.field} data-receipt={f.field} data-receipt-state={f.state}>
                    <td className="mono">{f.field}</td>
                    <td>{f.half === 'CONTENT' ? 'What the corpus was' : 'Which response, and to whom'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{f.why}</td>
                    <td style={{ color: f.state === 'CARRIED' ? 'var(--check-passed)' : 'var(--status-refused)' }}>{f.state === 'CARRIED' ? 'Carried' : 'Absent'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--status-conditional)' }} data-testid="metering-readiness">{meteringReadiness().statement}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <article className="surface p-3 flex flex-col gap-1.5">
              <h3 className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>The units</h3>
              <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
                {USAGE_UNITS.map((u) => <li key={u.id} data-usage-unit={u.id} data-counted={String(u.counted)}><span style={{ color: 'var(--text-heading)' }}>{u.title}</span> — {u.what} <span style={{ color: 'var(--text-muted)' }}>{u.here}</span></li>)}
              </ul>
            </article>
            <article className="surface p-3 flex flex-col gap-1.5" data-testid="metering-boundary">
              <h3 className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>Meter the usage; do not become the rails</h3>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{METERING_BOUNDARY.posture}</p>
              <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
                {METERING_BOUNDARY.notThis.map((n) => <li key={n.role}><span style={{ color: 'var(--status-refused)' }}>Not {n.role.toLowerCase()}</span> — {n.why}</li>)}
              </ul>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{METERING_BOUNDARY.instead}</p>
            </article>
          </div>
          <div className="surface p-3 flex flex-col gap-1.5" data-testid="federation-risk">
            <h3 className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>If customers federate</h3>
            <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{FEDERATION_RISK.risk}</p>
            <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{FEDERATION_RISK.defence}</p>
            <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
              {FEDERATION_RISK.whatCannotBePooled.map((x) => <li key={x}>{x}</li>)}
            </ul>
            <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }}>{FEDERATION_RISK.here}</p>
          </div>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12px]" aria-label="One asset, three ways">
              <thead><tr><th scope="col">Pillar</th><th scope="col">Sells</th><th scope="col">Here</th></tr></thead>
              <tbody>
                {TELEMETRY_PILLARS.map((p) => (
                  <tr key={p.pillar} data-pillar={p.pillar}><td style={{ color: 'var(--text-heading)' }}>{p.pillar}</td><td>{p.sells}</td><td style={{ color: 'var(--text-muted)' }}>{p.here}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}><span className="label-sm">Where the firm plugs in</span> {INTEGRATION.dependency.role} {INTEGRATION.dependency.what} It is absent: {INTEGRATION.dependency.needs} The inverse — {INTEGRATION.provider.what.toLowerCase()} — is rejected, because {INTEGRATION.provider.why.toLowerCase()}</p>
        </Section>

        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap"><span className="label-sm">What Caravan delivers</span><span className="label-sm">{product.domain}</span><span className="id">{product.productId}</span><span className="label-sm">{product.schema}</span></div>
          <h1 className="m-0 text-[20px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>{product.title}</h1>
          <p className="m-0 text-[14px]" style={{ color: 'var(--text-primary)' }} data-testid="customer-question">{product.customerQuestion}</p>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Customer categories">
            {categories.map((c) => <li key={c.id} className="pill text-[11px] px-2" data-customer-category={c.id}>{c.title}</li>)}
          </ul>
        </header>

        <Section title="A catalog slice, and why this one is not for sale" id="ip-slice">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            A closed catalog sells bounded extracts, and the manifest is the whole surface a buyer reads before paying and an
            auditor reads afterwards — so every figure on it is derived from the records it describes. This is that manifest over
            the current release. The admission grade is not read from the corpus, because a corpus value carries none: it is
            supplied, three-valued, and <span className="mono">UNKNOWN</span> does not sell either.
          </p>
          {(() => {
            // No store access here, so the count is unreadable rather than zero —
            // the same argument the compression derivation settles.
            const built = buildSlice(CARAVAN_CORPUS, {
              sliceId: 'caravan.lot-state.demonstration',
              title: 'Caravan lot state — current release',
              question: product.customerQuestion,
              releaseId: current.releaseId,
            }, gradeFrom('UNKNOWN'));
            // `records` is the discriminant. This page never ships bytes, so it
            // reads the description either way — but an unsellable slice has no
            // records to read, which is the boundary rather than a caveat.
            if (built.records === null && built.manifest === null) return <p className="m-0 text-[12.5px]">{built.because}</p>;
            const manifest = built.manifest!;
            const cut = built.records !== null;
            return (
              <div className="flex flex-col gap-3" data-testid="catalog-slice">
                <div className="surface p-3 flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="label-sm" style={{ color: manifest.readiness === 'SELLABLE' ? 'var(--status-admitted)' : 'var(--status-refused)' }}>{manifest.readiness}</span>
                    <span className="label-sm">grade {manifest.admissionGrade}</span>
                    <span className="label-sm">{manifest.recordCount} records {cut ? 'cut' : 'described, not cut'}</span>
                    <span className="label-sm">cutoff {fmtUtc(manifest.release.knowledgeCutoff)}</span>
                  </div>
                  <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{manifest.because}</p>
                  <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }} data-testid="slice-corrections">{manifest.corrections.because}</p>
                  <p className="m-0 text-[11.5px] hash break-all" style={{ color: 'var(--text-muted)' }}>{manifest.digest}</p>
                </div>
                <div className="surface overflow-x-auto" tabIndex={0}>
                  <table className="w-full text-[12.5px] border-collapse min-w-[520px]">
                    <thead>
                      <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                        <th scope="col" className="px-3 py-2 font-semibold">Predicate carried</th>
                        <th scope="col" className="px-3 py-2 font-semibold text-right">Records</th>
                        <th scope="col" className="px-3 py-2 font-semibold text-right">Subjects</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manifest.coverage.map((entry) => (
                        <tr key={entry.predicate} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <td className="px-3 py-2 mono">{entry.predicate}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{entry.records}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{entry.subjects}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="m-0 pl-4 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
                  {manifest.loss.map((entry) => <li key={entry}>{entry}</li>)}
                </ul>
              </div>
            );
          })()}
        </Section>

        <Section title="Subjects" id="ip-subjects">
          <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2" aria-label="Subjects">
            {product.subjects.map((s) => (
              <li key={s.subjectType} className="surface p-3 text-[12.5px] flex flex-col gap-1" data-subject-type={s.subjectType}>
                <div className="flex items-baseline gap-2"><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{s.subjectType}</span><span className="id">{s.identity}</span></div>
                <div style={{ color: 'var(--text-secondary)' }}>{s.meaning}</div>
                {s.linkedBy && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Linked to a lot only by <span className="id">{s.linkedBy}</span></div>}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={`Fields and evidence requirements (${product.fields.length})`} id="ip-fields">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>What a released record of each field may be, on the corpus contract&apos;s three evidence axes. The last column counts the demonstration corpus&apos;s records of that field and how many are within the requirement; the test requires all of them.</p>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12px]" aria-label="Fields">
              <thead><tr><th scope="col">Field</th><th scope="col">Meaning</th><th scope="col">Unit</th><th scope="col">Subject</th><th scope="col">Production class</th><th scope="col">Claim strength</th><th scope="col">Interest</th><th scope="col">In the corpus</th></tr></thead>
              <tbody>
                {coverage.map(({ field: f, records, within }) => (
                  <tr key={f.predicate} data-product-field={f.predicate} data-within={within === records}>
                    <td><span className="id">{f.predicate}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{f.meaning}{f.note && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{f.note}</div>}</td>
                    <td className="mono">{f.unit ?? '—'}</td>
                    <td>{f.subjectTypes.join(', ')}</td>
                    <td className="mono">{f.acceptable.productionClass.join(' | ')}</td>
                    <td className="mono">{f.acceptable.claimStrength.join(' | ')}</td>
                    <td className="mono">{f.acceptable.interest.join(' | ')}</td>
                    <td style={{ color: within === records ? 'var(--check-passed)' : 'var(--check-failed)' }}>{within} of {records} within</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Freshness" id="ip-freshness">
          <dl className="kv m-0 text-[12.5px]">
            <dt>Cutoff</dt><dd>{product.freshness.cutoff}</dd>
            <dt>Cadence</dt><dd>{product.freshness.cadence} <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{CARAVAN_RELEASES.map((r) => `${r.releaseId} · ${fmtUtc(r.knownAt)}`).join(' — ')}</span></dd>
            <dt>Staleness</dt><dd>{product.freshness.staleness}</dd>
          </dl>
        </Section>

        <Section title="Permitted uses" id="ip-rights">
          <dl className="kv m-0 text-[12.5px]">
            <dt>Delivery</dt><dd>{product.permittedUses.delivery}</dd>
            <dt>Prohibited</dt><dd className="mono" data-testid="prohibited-purposes">{product.permittedUses.prohibitedPurposes.join(', ')} <span className="text-[11.5px]" style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}>on every source registration; see the rights matrix on each <Link href={`/releases/${current.releaseId}`} style={{ color: 'var(--info)' }}>release</Link></span></dd>
            <dt>Redistribution</dt><dd>{product.permittedUses.redistribution}</dd>
          </dl>
        </Section>

        <Section title="Correction" id="ip-correction">
          <dl className="kv m-0 text-[12.5px]">
            <dt>Mechanism</dt><dd>{product.correction.mechanism} <Link href="/retractions" style={{ color: 'var(--info)' }}>Retractions</Link></dd>
            <dt>History</dt><dd>{product.correction.history}</dd>
            <dt>As of</dt><dd>{product.correction.asOf}</dd>
          </dl>
          <div className="surface-inset p-3 text-[12.5px] flex flex-col gap-1" data-testid="correction-demonstration">
            <span className="label-sm">The same question at two knowledge times</span>
            <div><span className="id">{q.subjectId}</span> · <span className="id">{q.predicate}</span> · valid at {fmtUtc(q.validAt)}</div>
            <div data-asof="early">Known by {fmtUtc('2026-08-20T00:00:00Z')}: {early?.answer ? <><span className="mono">{early.answer.value} {early.answer.unit}</span> <span style={{ color: 'var(--text-muted)' }}>({early.answer.recordId}, {early.answer.evidenceClass.productionClass}, {early.answer.evidenceClass.claimStrength})</span></> : 'refused'} <Link href={streamHref('2026-08-20T00:00:00Z')} style={{ color: 'var(--info)' }}>stream</Link></div>
            <div data-asof="late">Known by {fmtUtc(current.knownAt)}: {late?.answer ? <><span className="mono">{late.answer.value} {late.answer.unit}</span> <span style={{ color: 'var(--text-muted)' }}>({late.answer.recordId}, {late.answer.evidenceClass.productionClass}, {late.answer.evidenceClass.claimStrength}; supersedes {late.answer.supersedesRecordId})</span></> : 'refused'} <Link href={streamHref(current.knownAt)} style={{ color: 'var(--info)' }}>stream</Link></div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>The earlier record is not erased; it is superseded, and the earlier question still returns it.</div>
          </div>
        </Section>

        <Section title="What a delivered record answers" id="ip-contract">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The ten questions of <span className="id">{DELIVERED_RECORD_CONTRACT.schema}</span>, each carried by named payload fields. Required fields are present and not null; declared fields are present, and null there states absence. <span className="mono">src/domain/deliveredRecord.test.ts</span> holds every record the feed delivers, on both projections and in every release, to all ten; the envelope names {ENVELOPE_FIELDS.join(', ')}.</p>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12px]" aria-label="Delivered-record contract">
              <thead><tr><th scope="col">#</th><th scope="col">Question</th><th scope="col">Carried by</th><th scope="col">Required</th><th scope="col">Declared</th><th scope="col">When</th></tr></thead>
              <tbody>
                {DELIVERED_RECORD_CONTRACT.questions.map((c) => (
                  <tr key={c.n} data-contract-question={c.n}>
                    <td className="mono">{c.n}</td>
                    <td style={{ color: 'var(--text-heading)' }}>{c.question}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.carriedBy}</td>
                    <td className="mono text-[11px]">{c.required.join(', ') || '—'}</td>
                    <td className="mono text-[11px]">{c.declared.join(', ') || '—'}</td>
                    <td className="mono text-[11px]">{(c.when ?? []).map((w) => `${w.path} = ${String(w.equals)} ⇒ ${w.require.join(', ')}`).join('; ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="The acceptance target" id="ip-acceptance">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>A permitted source becomes an inspectable candidate, the candidate crosses a recorded admission boundary, the admitted information reaches a versioned customer interface, and a later correction remains traceable without erasing history. Step by step, what this repository reaches.</p>
          <ol className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Acceptance target">
            {product.acceptance.map((a, i) => (
              <li key={a.step} className="surface-inset p-2 text-[12.5px]" data-acceptance-step={i + 1} data-reached={a.reachedHere}>
                <span className="mono" style={{ color: a.reachedHere ? 'var(--check-passed)' : 'var(--status-refused)' }}>{a.reachedHere ? '✓' : '✕'}</span> <span style={{ color: 'var(--text-heading)' }}>{a.step}</span>
                <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{a.how}</div>
              </li>
            ))}
          </ol>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>The missing bridge is the second and third step: a recorded admission boundary and a release assembled from admitted candidates. Everything on either side of it exists here: the rail on <Link href="/candidates" style={{ color: 'var(--info)' }}>Candidates</Link>, the interface on <Link href="/api" style={{ color: 'var(--info)' }}>API</Link>.</p>
        </Section>
      </div>
    </>
  );
}
