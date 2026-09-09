'use client';

import Link from 'next/link';
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Inspector } from '@/components/primitives/Inspector';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { openedWith, useLinkedSelection } from '@/components/primitives/useLinkedSelection';
import { fmtUtc } from '@/lib/format';

/**
 * The release history as a register with an inspector, rather than as nine
 * columns of everything.
 *
 * WHY THE TABLE WAS CHANGED
 *
 * It carried the coverage sentence, the build identity, the methodology, the
 * digest and the supersession pointer in the same row as the counts. Two
 * things followed and both were measured on the rendered page. Every row was
 * six lines tall because one cell held a paragraph while the rest held a word.
 * And the row would not fit: the supersession column sat past the right edge
 * of a 1440px viewport, in a scroll region a reader has no reason to suspect,
 * so the one field that says which release replaced this one was the field
 * nobody saw.
 *
 * The register keeps what a reader compares down a column — the release, its
 * standing, its cutoff, what it holds, whether it is certified. Everything a
 * reader wants about *one* release moved to the inspector beside it, which is
 * the pattern the notation, candidate and spatial surfaces already use.
 *
 * WHAT THE INSPECTOR ADDS THAT A CELL COULD NOT
 *
 * The supersession chain is walkable: the release this one replaced, and the
 * one that replaced it, are buttons that select those releases rather than
 * identifiers to read and go looking for. That is the whole argument for the
 * inspector on this surface — a corrections history is a chain, and a table
 * cell can only ever print one link of it.
 *
 * Nothing here computes. Counts, certification, digests and the chain are the
 * corpus's own fields, passed through; a release that names no predecessor
 * says so rather than showing an empty row.
 */
export interface ReleaseRow {
  releaseId: string;
  corpusId: string;
  status: 'CURRENT' | 'SUPERSEDED';
  knownAt: string;
  coverage: string;
  note: string;
  buildId: string;
  methodologyId: string;
  methodologyVersion: string;
  methodologyStatus: string;
  releaseDigest: string;
  supersedesReleaseId?: string;
  supersededByReleaseId?: string;
  certificationStatus: 'CERTIFIED' | 'CANDIDATE' | 'WITHDRAWN';
  verification: string;
  /** Records and retractions knowable at this release's cutoff, counted on the server. */
  records: number;
  retractions: number;
}

export interface CorpusGroup {
  corpusId: string;
  domain: string;
  title: string;
  description: string;
  records: number;
  retractions: number;
  releaseCount: number;
  releases: ReleaseRow[];
}

const CERTIFICATION: Record<ReleaseRow['certificationStatus'], { mark: string; colour: string }> = {
  CERTIFIED: { mark: '◉ Certified', colour: 'var(--status-admitted)' },
  CANDIDATE: { mark: '◌ Candidate', colour: 'var(--status-pending)' },
  WITHDRAWN: { mark: '⊗ Withdrawn', colour: 'var(--status-revoked)' },
};

export function ReleaseRegister({ groups, children }: { groups: CorpusGroup[]; children?: React.ReactNode }) {
  const all = groups.flatMap((group) => group.releases);
  const holds = (id: string | undefined) => id !== undefined && all.some((release) => release.releaseId === id);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const opened = openedWith().release;
    return holds(opened) ? opened! : null;
  });
  // The releases are a prop, so the page holds everything the URL could name
  // from its first render and there is nothing to wait for.
  useLinkedSelection({ release: selectedId }, (values) => { if (holds(values.release)) setSelectedId(values.release!); }, true);

  const selected = all.find((release) => release.releaseId === selectedId) ?? null;
  const group = selected ? groups.find((entry) => entry.corpusId === selected.corpusId) ?? null : null;

  /** Up and down move through the register a row at a time, as they do on every other one. */
  function registerKeys(event: ReactKeyboardEvent<HTMLTableSectionElement>, rows: ReleaseRow[]) {
    const ids = rows.map((row) => row.releaseId);
    const at = ids.indexOf(selectedId ?? '');
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    setSelectedId(ids[next]);
    (event.currentTarget.querySelector(`[data-release-select="${ids[next]}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid="release-workspace" data-inspecting={selected ? 'release' : undefined}>
      <div className="workspace-top flex flex-col gap-5">
        {groups.map((entry) => (
          <section key={entry.corpusId} aria-labelledby={`corpus-${entry.corpusId}`} className="flex flex-col gap-3">
            <header className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap"><span className="label-sm">Corpus</span><span className="id" style={{ color: 'var(--text-secondary)' }}>{entry.corpusId}</span><span className="label-sm">{entry.domain}</span></div>
              <h1 id={`corpus-${entry.corpusId}`} className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>{entry.title}</h1>
              <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{entry.description}</p>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                {entry.records} records · {entry.retractions} retractions · {entry.releaseCount} releases · feed <Link href={`/api/v1/releases?corpus=${encodeURIComponent(entry.corpusId)}`} className="id" style={{ color: 'var(--info)' }}>/api/v1/releases</Link> · <Link href={`/stream?corpus=${encodeURIComponent(entry.corpusId)}&question=WHAT_WE_HELD`} style={{ color: 'var(--info)' }}>query as-of</Link> · <Link href={`/retractions?domain=${entry.domain}`} style={{ color: 'var(--info)' }}>retraction feed</Link>
              </p>
            </header>
            {/* `.register` is `overflow-x` plus the scroll shadow: the register
                shows which edge has more table past it, at every width. */}
            <div className="surface register" tabIndex={0}>
              <table className="ledger-table" aria-label={`Releases of ${entry.corpusId}`}>
                <thead><tr><th scope="col">Release</th><th scope="col">Status</th><th scope="col" className="th-wrap">Information<br />known by</th><th scope="col">Records</th><th scope="col">Retractions</th><th scope="col">Certification</th></tr></thead>
                <tbody onKeyDown={(event) => registerKeys(event, entry.releases)}>
                  {entry.releases.map((release) => {
                    const active = release.releaseId === selectedId;
                    const certification = CERTIFICATION[release.certificationStatus];
                    return (
                      <tr key={release.releaseId} data-release-id={release.releaseId} aria-selected={active}>
                        <td>
                          <button
                            type="button"
                            className="row-selectable text-left w-full"
                            aria-pressed={active}
                            data-release-select={release.releaseId}
                            onClick={() => setSelectedId(active ? null : release.releaseId)}
                          >
                            <span className="id" style={{ color: active ? 'var(--accent-strong)' : 'var(--info)' }}>{release.releaseId}</span>
                          </button>
                        </td>
                        <td><span className="pill text-[10.5px] px-1.5" style={{ color: release.status === 'CURRENT' ? 'var(--status-admitted)' : 'var(--status-superseded)', borderColor: 'currentColor' }}>{release.status === 'CURRENT' ? '● Current' : '↷ Superseded'}</span></td>
                        <td className="ts" data-clock="knownAt">{fmtUtc(release.knownAt)}</td>
                        <td className="mono">{release.records}</td>
                        <td className="mono">{release.retractions}</td>
                        <td><span style={{ color: certification.colour }}>{certification.mark}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {selected && group && (
        <Inspector
          id="release-inspector"
          testId="release-inspector"
          kicker={`Release · ${group.title}`}
          title={selected.releaseId}
          subtitle={<>Known by <span className="ts">{fmtUtc(selected.knownAt)}</span> · {selected.status === 'CURRENT' ? 'current' : 'superseded'}</>}
          onClose={() => setSelectedId(null)}
          focusOnNarrow
        >
          <Part title="What it covers">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{selected.coverage}</p>
            {selected.note && <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{selected.note}</p>}
          </Part>

          <Part title="What it holds">
            <dl className="kv m-0 text-[12.5px]">
              <dt>Records</dt><dd className="mono" data-testid="inspector-records">{selected.records}</dd>
              <dt>Retractions</dt><dd className="mono" data-testid="inspector-retractions">{selected.retractions}</dd>
            </dl>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Both counted at this release&rsquo;s knowledge cutoff, which is what a release is: everything knowable by then, and nothing learned since.</p>
          </Part>

          <Part title="Supersession">
            {/* A corrections history is a chain, and a table cell can print one
                link of it. Here each end is a button that selects that release,
                so the chain is walked rather than read and looked up. */}
            <dl className="kv m-0 text-[12.5px]">
              <dt>Supersedes</dt>
              <dd>{selected.supersedesReleaseId
                ? <button type="button" className="btn btn-sm btn-quiet" data-testid="inspector-supersedes" onClick={() => setSelectedId(selected.supersedesReleaseId!)}><span className="id">{selected.supersedesReleaseId}</span></button>
                : <span style={{ color: 'var(--text-muted)' }}>Nothing — this is the first release of the corpus.</span>}</dd>
              <dt>Superseded by</dt>
              <dd>{selected.supersededByReleaseId
                ? <button type="button" className="btn btn-sm btn-quiet" data-testid="inspector-superseded-by" onClick={() => setSelectedId(selected.supersededByReleaseId!)}><span className="id">{selected.supersededByReleaseId}</span></button>
                : <span style={{ color: 'var(--text-muted)' }}>Nothing — no later release has replaced it.</span>}</dd>
            </dl>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>A later release never edits an earlier one. This release still says what it said.</p>
          </Part>

          <Part title="Build">
            <dl className="kv m-0 text-[12.5px]">
              <dt>Build</dt><dd className="id">{selected.buildId}</dd>
              <dt>Methodology</dt><dd><span className="id">{selected.methodologyId}</span> <span className="ver">{selected.methodologyVersion}</span> · {selected.methodologyStatus}</dd>
            </dl>
          </Part>

          <Part title="Certification and identity">
            <dl className="kv m-0 text-[12.5px]">
              <dt>Certification</dt><dd style={{ color: CERTIFICATION[selected.certificationStatus].colour }}>{CERTIFICATION[selected.certificationStatus].mark}</dd>
              <dt>Verification</dt><dd>{selected.verification.replace(/_/g, ' ')}</dd>
              <dt>Release digest</dt><dd><Digest value={selected.releaseDigest} /></dd>
            </dl>
          </Part>

          <Part title="Where to read it">
            <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[12.5px]">
              <li><Link href={`/releases/${encodeURIComponent(selected.releaseId)}`} style={{ color: 'var(--info)' }}>The release page</Link> — its records, one by one</li>
              <li><Link href={`/api/v1/releases?corpus=${encodeURIComponent(selected.corpusId)}`} className="id" style={{ color: 'var(--info)' }}>/api/v1/releases</Link> — the feed a customer reads</li>
              <li><Link href={`/stream?corpus=${encodeURIComponent(selected.corpusId)}&question=WHAT_WE_HELD&knownAt=${encodeURIComponent(selected.knownAt)}`} style={{ color: 'var(--info)' }}>What the corpus held at this cutoff</Link></li>
            </ul>
          </Part>
        </Inspector>
      )}

      <div className="workspace-bottom">{children}</div>
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="inspector-section"><h3>{title}</h3>{children}</section>;
}
