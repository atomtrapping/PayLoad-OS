import Link from 'next/link';
import { loadProductWorkspace } from '@/adapter/productWorkspace';
import { PRODUCT_DESKS, ProductWorkspaceError, productReadingLink, type ProductDeskDomain, type ProductWorkspace, type WorkspaceParams, type WorkspaceReading } from '@/domain/productWorkspace';
import { RecordCard, RecordStatusPill } from '@/components/corpus/RecordCard';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Section } from '@/components/primitives/Section';
import { fmtNumber, fmtUtc } from '@/lib/format';

function Reading({ reading, noPrevious = false }: { reading: WorkspaceReading | null; noPrevious?: boolean }) {
  if (!reading) return <p>{noPrevious ? 'No previous release is available.' : 'No accessible record is available to seed a reading.'}</p>;
  return <div className="flex flex-col gap-2">
    <p className="m-0 text-sm mono">{reading.releaseId} · known by {fmtUtc(reading.query.knownAt)}</p>
    {reading.answer ? <RecordCard {...reading.answer} /> : <div role="status" className="empty-state"><strong>{reading.refusal?.code ?? 'NO_ANSWER'}</strong><span>{reading.refusal?.reason}</span></div>}
  </div>;
}

/** Server-rendered controls and gated results. No raw corpus is serialized to a client component. */
export function ProductDeskView({ model }: { model: ProductWorkspace }) {
  const desk = PRODUCT_DESKS[model.domain];
  const q = model.reading?.query;
  const query = new URLSearchParams({ release: model.release.releaseId, ...(q ? { subject: q.subjectId, predicate: q.predicate, validAt: q.validAt, knownAt: q.knownAt, question: q.question } : {}) });
  const subjectIds = [...new Set([...model.records.map((r) => r.record.subjectId), ...(q ? [q.subjectId] : [])])];
  const predicates = [...new Set([...model.records.map((r) => r.record.predicate), ...(q ? [q.predicate] : [])])];
  const inputClass = 'surface-inset px-2 py-2 text-sm w-full min-w-0';
  return <>
    {model.fixtureOnly && <FixtureBanner note={`${desk.title}: synthetic released records. No live ${model.domain === 'LANDSHARK' ? 'parcel/planning' : 'market'} connector, retained source bytes or completed customer pilot for this corpus.`} />}
    <div className="p-3 sm:p-5 flex flex-col gap-5 max-w-[1500px] mx-auto" data-testid="product-desk" data-domain={model.domain}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><span className="label-sm">{desk.activity}</span><h1 className="m-0 text-2xl font-semibold">{desk.title}</h1><p className="m-0 mt-1">{model.release.coverage}</p><p className="m-0 mt-1 text-sm mono">{model.corpus.corpusId}</p></div>
        <div className="flex flex-wrap gap-2"><Link className="btn" href={`/earth?release=${encodeURIComponent(model.release.releaseId)}`}>Explore spatial records</Link><Link className="btn" href={`/releases?domain=${model.domain}`}>Release history</Link><Link className="btn" href={`/retractions?domain=${model.domain}`}>Corrections & withdrawals</Link></div>
      </header>
      <form key={model.release.releaseId} action={desk.href} method="get" className="surface p-3 flex flex-wrap items-end gap-3" aria-label="Choose product release">
        <input type="hidden" name="corpus" value={model.corpus.corpusId} />
        <label className="flex-1 min-w-0 flex flex-col gap-1"><span className="label">Release</span><select name="release" defaultValue={model.release.releaseId} className={inputClass}>{model.releases.map((r) => <option key={r.releaseId} value={r.releaseId}>{r.releaseId} · {r.status}</option>)}</select></label>
        <button className="btn btn-primary" type="submit">Open release</button>
      </form>
      <Section title="Released observations" id="desk-records" aside={<span className="text-sm">{model.records.length} accessible · {model.withheld} withheld</span>}>
        <p className="m-0 text-sm">Accessible inventory and standing at the release cutoff, {fmtUtc(model.release.knownAt)}. The inquiry below applies its own knowledge time.</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-sm" aria-label={`${desk.title} released records`}>
            <thead><tr><th scope="col">Subject / field</th><th scope="col">Reported value</th><th scope="col">World validity begins</th><th scope="col">Record standing</th><th scope="col">Inquiry</th></tr></thead>
            <tbody>{model.records.map(({ record, status }) => <tr key={record.recordId} data-record-id={record.recordId}><td><div className="mono">{record.subjectId}</div><div>{record.predicate}</div></td><td className="mono">{fmtNumber(record.value)} {record.unit}</td><td>{fmtUtc(record.validFrom)}</td><td><RecordStatusPill status={status} /></td><td><Link className="btn btn-sm" href={productReadingLink(model.domain, model.release.releaseId, record)}>Inspect {record.recordId}</Link></td></tr>)}</tbody>
          </table>
          {!model.records.length && <p className="p-3">No records can be delivered in this view. Withheld records are not absent source observations.</p>}
        </div>
      </Section>
      {q && <Section title="Ask at a world time and knowledge time" id="desk-query">
        <form key={query.toString()} action={desk.href} method="get" aria-label={`${desk.title} as-of inquiry`} className="surface p-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input type="hidden" name="release" value={model.release.releaseId} />
          <label className="flex flex-col gap-1"><span className="label">Subject</span><select name="subject" defaultValue={q.subjectId} className={inputClass}>{subjectIds.map((id) => <option key={id}>{id}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="label">Field</span><select name="predicate" defaultValue={q.predicate} className={inputClass}>{predicates.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="label">Question</span><select name="question" defaultValue={q.question} className={inputClass}><option value="WHAT_WE_HELD">What this system held</option><option value="WHAT_THE_SOURCE_KNEW">What the source knew</option></select></label>
          <label className="flex flex-col gap-1"><span className="label">World time (UTC)</span><input name="validAt" type="datetime-local" step="0.001" required defaultValue={q.validAt.replace(/Z$/, '')} className={inputClass} /></label>
          <label className="flex flex-col gap-1"><span className="label">Knowledge time (UTC)</span><input name="knownAt" type="datetime-local" step="0.001" required defaultValue={q.knownAt.replace(/Z$/, '')} className={inputClass} /></label>
          <div className="flex items-end"><button type="submit" className="btn btn-primary">Run inquiry</button></div>
        </form>
        <p className="m-0 text-sm">Knowledge time is capped at this release’s cutoff. Record standing does not imply current real-world validity.</p>
      </Section>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Selected reading" id="desk-reading"><Reading reading={model.reading} /></Section>
        <Section title="Same question in the previous release" id="desk-previous"><Reading reading={model.previous} noPrevious={model.comparison === 'NO_PREVIOUS_RELEASE'} /><p className="m-0 text-sm" data-testid="desk-comparison">{({ SAME_RECORD: 'Both readings return the same record.', DIFFERENT_RECORD: 'The readings return different records. Inspect their fields and evidence; a different record alone does not establish a correction.', UNRESOLVED: 'At least one reading has no deliverable answer. A numeric change cannot be computed.', NO_PREVIOUS_RELEASE: 'This is the earliest available release; no previous release is being compared.' })[model.comparison]}</p></Section>
      </div>
      <Section title="Reproduce this inquiry" id="desk-delivery">
        <div className="flex flex-wrap gap-2"><Link className="btn" href={`${desk.href}?${query}`}>Exact reading link</Link><Link className="btn" href={`/api/v1/products/${model.domain.toLowerCase()}/inquiry?${query}`}>Inquiry JSON</Link><Link className="btn" href={`/api/v1/releases/${encodeURIComponent(model.release.releaseId)}/records`}>Versioned record feed</Link><Link className="btn" href={`/api/v1/releases/${encodeURIComponent(model.release.releaseId)}/manifest`}>Release manifest</Link></div>
        <p className="m-0 text-sm mono break-all">Release digest: {model.release.releaseDigest}</p>
        <p className="m-0 text-sm">{desk.boundary}</p>
        <p className="m-0 text-sm">These controls read released information; they do not acquire sources, admit claims, publish packages or authorize customer redistribution. Missing source bytes and rights decisions must be resolved on the production path.</p>
        <Link className="btn self-start" href="/production">Shared preparation apparatus</Link>
      </Section>
    </div>
  </>;
}

export async function ProductDesk({ domain, params }: { domain: ProductDeskDomain; params: WorkspaceParams }) {
  let model: ProductWorkspace;
  try { model = await loadProductWorkspace(domain, params); }
  catch (error) {
    const code = error instanceof ProductWorkspaceError ? error.code : 'READ_UNAVAILABLE';
    return <div className="p-5"><h1>{PRODUCT_DESKS[domain].title}</h1><div role="alert" className="empty-state"><strong>{code}</strong><p>The requested inquiry could not be opened. Check the product, release, record and UTC timestamps. No other corpus was substituted.</p><Link className="btn" href={PRODUCT_DESKS[domain].href}>Open current release</Link></div></div>;
  }
  return <ProductDeskView model={model} />;
}
