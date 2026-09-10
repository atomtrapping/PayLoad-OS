'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Inspector, InspectorSection } from '@/components/primitives/Inspector';
import { Digest } from '@/components/primitives/ManifestCommitment';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { openedWith, useLinkedSelection } from '@/components/primitives/useLinkedSelection';
import { fmtUtc } from '@/lib/format';
import type { AssuranceClass, CheckStatus, RulingStatus, VisibilityClass } from '@/domain/types';
import { registerKeys } from '@/components/primitives/registerKeys';

/**
 * Every ruling ever issued, as a register with an inspector.
 *
 * WHY THE TABLE WAS CHANGED
 *
 * Nine columns, of which 531 pixels' worth sat past the right edge of a
 * 1024px viewport inside a silent scroll region — measured, on the rendered
 * page. The manifest commitment, the visibility class and the knowledge
 * cutoff were all out there. A register whose last four columns are only
 * reachable by a scroll nobody suspects is a register that has stopped being
 * one.
 *
 * Five columns now: the ruling and its revision, its standing, the case it
 * decided, when it was ruled, and on what assurance. That is what a reader
 * compares down a column of rulings. Everything about one ruling is in the
 * inspector beside it.
 *
 * WHAT THE INSPECTOR ADDS THAT A CELL COULD NOT
 *
 * A ruling is never edited: a later revision supersedes it and the earlier one
 * still says what it said, with the reason for the transition recorded beside
 * it. That is a chain with an annotation on every link, and a table cell can
 * print one identifier of it. Here each end is a button that selects that
 * revision, and the recorded reason is shown with it — so the question a
 * reader actually has ("why is this one no longer the ruling?") is answered
 * where it is asked.
 *
 * Nothing here evaluates. Every status, class, count and digest is the
 * ruling's own field, counted on the server and passed through; a ruling that
 * supersedes nothing says so rather than showing an empty row.
 */
export interface RulingRow {
  rulingId: string;
  caseId: string;
  caseTitle: string;
  revision: number;
  status: RulingStatus;
  purpose: string;
  scopeStatement: string;
  ruledAt?: string;
  knownAt?: string;
  validAt?: string;
  assuranceClass: AssuranceClass;
  assuranceLabel: string;
  assuranceMeaning: string;
  visibility: VisibilityClass;
  visibilityMeaning: string;
  profileId: string;
  profileVersion: string;
  registerDigest: string;
  manifestCommitment?: string;
  supersedesRulingId?: string;
  supersededByRulingId?: string;
  transitionReason?: string;
  ruledClaims: number;
  consideredEvidence: number;
  /** Invariant results by outcome, counted from the ruling's own register. */
  checks: Record<CheckStatus, number>;
}

const CHECK_ORDER: CheckStatus[] = ['PASSED', 'FAILED', 'NOT_APPLICABLE', 'NOT_EVALUATED'];
const CHECK_COLOUR: Record<CheckStatus, string> = {
  PASSED: 'var(--check-passed)', FAILED: 'var(--check-failed)',
  NOT_APPLICABLE: 'var(--check-na)', NOT_EVALUATED: 'var(--check-not-evaluated)',
};

export function RulingRegister({ rulings }: { rulings: RulingRow[] }) {
  const holds = (id: string | undefined) => id !== undefined && rulings.some((ruling) => ruling.rulingId === id);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const opened = openedWith().ruling;
    return holds(opened) ? opened! : null;
  });
  useLinkedSelection({ ruling: selectedId }, (values) => { if (holds(values.ruling)) setSelectedId(values.ruling!); }, true);

  const selected = rulings.find((ruling) => ruling.rulingId === selectedId) ?? null;

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid="ruling-workspace" data-inspecting={selected ? 'ruling' : undefined}>
      <div className="workspace-top">
        <div className="surface register" tabIndex={0}>
          <table role="table" className="ledger-table" aria-label="Rulings">
            <thead><tr>
              <th scope="col">Ruling</th><th scope="col">Status</th><th scope="col">Case</th>
              <th scope="col" className="th-wrap">Ruling<br />issued on</th><th scope="col">Assurance</th>
            </tr></thead>
            <tbody role="rowgroup" onKeyDown={registerKeys({ ids: rulings.map((ruling) => ruling.rulingId), selected: selectedId, select: setSelectedId, attribute: 'data-ruling-select' })}>
              {rulings.map((ruling) => {
                const active = ruling.rulingId === selectedId;
                return (
                  <tr role="row" key={ruling.rulingId} data-ruling-id={ruling.rulingId} aria-selected={active}>
                    <td role="cell">
                      <button
                        type="button"
                        className="row-selectable text-left w-full"
                        aria-pressed={active}
                        data-ruling-select={ruling.rulingId}
                        onClick={() => setSelectedId(active ? null : ruling.rulingId)}
                      >
                        <span className="id" style={{ color: active ? 'var(--accent-strong)' : 'var(--info)' }}>{ruling.rulingId}</span>
                        <span className="block text-[11px] row-sub">revision {ruling.revision}</span>
                      </button>
                    </td>
                    <td role="cell"><span className="cell-label">Status</span><RulingStatusPill status={ruling.status} size="sm" /></td>
                    <td role="cell" className="cell-wide">
                      <span className="cell-label">Case</span>
                      <Link href={`/cases/${encodeURIComponent(ruling.caseId)}`} style={{ color: 'var(--text-primary)' }}>{ruling.caseTitle}</Link>
                      <div className="id" style={{ color: 'var(--text-muted)' }}>{ruling.caseId}</div>
                    </td>
                    <td role="cell" data-clock="ruledAt"><span className="cell-label">Ruling issued on</span><span className="ts">{fmtUtc(ruling.ruledAt)}</span></td>
                    <td role="cell" className="text-[12px]"><span className="cell-label">Assurance</span><span style={{ color: `var(${assuranceVar(ruling.assuranceClass)})` }}>{ruling.assuranceLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Inspector
          id="ruling-inspector"
          testId="ruling-inspector"
          kicker={`Ruling · revision ${selected.revision}`}
          title={selected.rulingId}
          subtitle={<>{selected.caseTitle} · <span className="id">{selected.caseId}</span></>}
          onClose={() => setSelectedId(null)}
          focusOnNarrow
        >
          <InspectorSection title="Standing">
            <div className="flex items-center gap-2 flex-wrap"><RulingStatusPill status={selected.status} size="sm" /><VisibilityBadge visibility={selected.visibility} /></div>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{selected.visibilityMeaning}</p>
          </InspectorSection>

          <InspectorSection title="What it covers">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{selected.scopeStatement}</p>
            <dl className="kv m-0 text-[12.5px]"><dt>Declared use</dt><dd>{selected.purpose}</dd></dl>
          </InspectorSection>

          <InspectorSection title="Revision">
            {/* A ruling is never edited: a later revision supersedes it and the
                earlier one still says what it said. Each end of that chain is a
                button, and the recorded reason for the transition is shown with
                it, because "why is this no longer the ruling?" is the question
                a reader has at exactly this point. */}
            <dl className="kv m-0 text-[12.5px]">
              <dt>Supersedes</dt>
              <dd>{selected.supersedesRulingId
                ? <button type="button" className="btn btn-sm btn-quiet" data-testid="inspector-supersedes" onClick={() => setSelectedId(selected.supersedesRulingId!)}><span className="id">{selected.supersedesRulingId}</span></button>
                : <span style={{ color: 'var(--text-muted)' }}>Nothing — this is the first ruling on the case.</span>}</dd>
              <dt>Superseded by</dt>
              <dd>{selected.supersededByRulingId
                ? <button type="button" className="btn btn-sm btn-quiet" data-testid="inspector-superseded-by" onClick={() => setSelectedId(selected.supersededByRulingId!)}><span className="id">{selected.supersededByRulingId}</span></button>
                : <span style={{ color: 'var(--text-muted)' }}>Nothing — no later revision has replaced it.</span>}</dd>
            </dl>
            {selected.transitionReason
              ? <p className="m-0 text-[12px]" data-testid="inspector-transition" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">Recorded reason</span> {selected.transitionReason}</p>
              : <p className="m-0 text-[11.5px]" data-testid="inspector-transition" style={{ color: 'var(--text-muted)' }}>No transition reason is recorded on this ruling.</p>}
          </InspectorSection>

          <InspectorSection title="Clocks">
            <dl className="kv m-0 text-[12.5px]">
              <dt>Ruled at</dt><dd className="ts">{fmtUtc(selected.ruledAt)}</dd>
              <dt>Information known by</dt><dd className="ts">{fmtUtc(selected.knownAt)}</dd>
              {selected.validAt && <><dt>World state at</dt><dd className="ts">{fmtUtc(selected.validAt)}</dd></>}
            </dl>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>When it was decided, and the knowledge cutoff it was decided on. They are different questions and are never merged.</p>
          </InspectorSection>

          <InspectorSection title="What it ruled on">
            <dl className="kv m-0 text-[12.5px]">
              <dt>Claims ruled</dt><dd className="mono" data-testid="inspector-claims">{selected.ruledClaims}</dd>
              <dt>Evidence considered</dt><dd className="mono" data-testid="inspector-evidence">{selected.consideredEvidence}</dd>
            </dl>
            <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] mono" data-testid="inspector-checks">
              {CHECK_ORDER.filter((status) => selected.checks[status] > 0).map((status) => (
                <li key={status} style={{ color: CHECK_COLOUR[status] }}>{status.replace(/_/g, ' ').toLowerCase()} {selected.checks[status]}</li>
              ))}
            </ul>
          </InspectorSection>

          <InspectorSection title="Assurance">
            <p className="m-0 text-[12.5px]" style={{ color: `var(${assuranceVar(selected.assuranceClass)})` }}>{selected.assuranceLabel}</p>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{selected.assuranceMeaning}</p>
          </InspectorSection>

          <InspectorSection title="Identity">
            <dl className="kv m-0 text-[12.5px]">
              <dt>Profile</dt><dd><span className="id">{selected.profileId}</span> <span className="ver">{selected.profileVersion}</span></dd>
              <dt>Register digest</dt><dd><Digest value={selected.registerDigest} /></dd>
              <dt>Manifest commitment</dt><dd><Digest value={selected.manifestCommitment} /></dd>
            </dl>
          </InspectorSection>

          <InspectorSection title="Where to read it">
            <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[12.5px]">
              <li><Link href={`/rulings/${encodeURIComponent(selected.rulingId)}`} style={{ color: 'var(--info)' }}>The ruling itself</Link> — every invariant, condition and limitation</li>
              <li><Link href={`/cases/${encodeURIComponent(selected.caseId)}`} style={{ color: 'var(--info)' }}>The case it decided</Link></li>
              <li><Link href={`/replay/${encodeURIComponent(selected.caseId)}`} style={{ color: 'var(--info)' }}>The case as it stood at this cutoff</Link></li>
            </ul>
          </InspectorSection>
        </Inspector>
      )}
    </div>
  );
}

const assuranceVar = (assurance: AssuranceClass) =>
  assurance === 'EXTERNALLY_WITNESSED' ? '--assurance-witnessed'
    : assurance === 'VERIFIED_ATTESTATION' ? '--assurance-verified'
      : assurance === 'HUMAN_REVIEWED' ? '--assurance-reviewed' : '--assurance-unverified';

