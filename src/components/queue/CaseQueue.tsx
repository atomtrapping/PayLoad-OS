'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { ClaimCaseBundle, RulingStatus, VisibilityClass } from '@/domain/types';
import { RULING_STATUSES, VISIBILITY_CLASSES } from '@/domain/types';
import { STATUS_SEMANTICS, ASSURANCE_SEMANTICS, VISIBILITY_SEMANTICS, isNearingExpiry, summarizeQueue, tenSecondSummary, partyName } from '@/domain/selectors';
import { RulingStatusPill } from '@/components/primitives/RulingStatus';
import { VisibilityBadge } from '@/components/primitives/VisibilityClass';
import { Inspector } from '@/components/primitives/Inspector';
import { openedWith, useLinkedSelection } from '@/components/primitives/useLinkedSelection';
import { fmtUtc, fmtDelta } from '@/lib/format';

type Filters = {
  status: RulingStatus | 'ALL' | 'ACTION';
  party: string;
  profile: string;
  validFrom: string;
  validTo: string;
  knownFrom: string;
  knownTo: string;
  visibility: VisibilityClass | 'ALL';
  reviewer: string;
  q: string;
};

const EMPTY: Filters = { status: 'ACTION', party: '', profile: '', validFrom: '', validTo: '', knownFrom: '', knownTo: '', visibility: 'ALL', reviewer: '', q: '' };

function matches(b: ClaimCaseBundle, f: Filters): boolean {
  if (f.status === 'ACTION' && !STATUS_SEMANTICS[b.status].requiresAction) return false;
  if (f.status !== 'ALL' && f.status !== 'ACTION' && b.status !== f.status) return false;
  if (f.party && !b.parties.some((p) => p.partyId === f.party)) return false;
  if (f.profile && b.profileId !== f.profile) return false;
  if (f.visibility !== 'ALL' && b.visibility !== f.visibility) return false;
  if (f.reviewer && b.assignedReviewerId !== f.reviewer) return false;
  const v = b.temporalBasis.validAt ?? '';
  if (f.validFrom && v && v < f.validFrom) return false;
  if (f.validTo && v && v.slice(0, 10) > f.validTo) return false;
  const k = b.temporalBasis.knownAt ?? '';
  if (f.knownFrom && k && k < f.knownFrom) return false;
  if (f.knownTo && k && k.slice(0, 10) > f.knownTo) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [
      b.caseId, b.title, b.subject.subjectId, b.subject.displayName,
      b.currentRuling?.rulingId, b.currentRuling?.release?.manifestId, b.currentRuling?.release?.manifestCommitment,
      ...b.claims.map((c) => c.claimId), ...b.claims.map((c) => c.predicate),
      ...b.evidence.flatMap((e) => Object.values(e.declaredIdentifiers ?? {})),
      ...b.evidence.map((e) => e.evidenceId),
    ].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/**
 * The queue as a register with an inspector.
 *
 * WHY THE TABLE WAS CHANGED
 *
 * Nine columns, of which 596 pixels sat past the right edge of a 1440px
 * viewport and 1012 past a 1024px one — more table hidden than shown, inside a
 * scroll region a reviewer has no reason to suspect. The declared use, both
 * clocks, the assurance class and the sponsor were all out there.
 *
 * Four columns now, and they are the four a reviewer triages on: which case,
 * where it stands, what it needs, and when it last moved. Everything else is
 * in the inspector beside it.
 *
 * WHAT THAT COSTS AND WHAT IT BUYS
 *
 * The case title used to be a link, so opening a case was one click and is now
 * two: select, then **Open the case** from the panel. That is the right trade
 * for a queue, because the queue's job is deciding *whether* to open — and the
 * panel answers that in place, where the alternative was loading five case
 * pages to triage five cases. The register selects from its first cell, as the
 * release and rulings registers do, so one interaction is learned once.
 *
 * A filter hides rows, not cases. A link into a case the current filters
 * exclude still opens on it, and the panel says the case is not in the filter
 * rather than pretending the row is there.
 */
export function CaseQueue({ cases, lastSeenAt }: { cases: ClaimCaseBundle[]; lastSeenAt: string }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const q = useDeferredValue(f.q);
  const summary = useMemo(() => summarizeQueue(cases, lastSeenAt), [cases, lastSeenAt]);
  const rows = useMemo(
    () => cases.filter((b) => matches(b, { ...f, q })).sort((a, b) => (b.lastChangedAt > a.lastChangedAt ? 1 : -1)),
    [cases, f, q],
  );
  const parties = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of cases) for (const p of b.parties) if (p.role === 'CLAIM_SPONSOR' || p.role === 'RELYING_PARTY' || p.role === 'CLAIMANT') m.set(p.partyId, p.displayName);
    return [...m.entries()];
  }, [cases]);
  const reviewers = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of cases) for (const p of b.parties) if (p.role === 'REVIEWER') m.set(p.partyId, p.displayName);
    return [...m.entries()];
  }, [cases]);
  const profiles = useMemo(() => [...new Set(cases.map((b) => b.profileId))], [cases]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));

  const holds = (id: string | undefined) => id !== undefined && cases.some((b) => b.caseId === id);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const opened = openedWith().case;
    return holds(opened) ? opened! : null;
  });
  useLinkedSelection({ case: selectedId }, (values) => { if (holds(values.case)) setSelectedId(values.case!); }, true);
  const selected = cases.find((b) => b.caseId === selectedId) ?? null;
  const selectedInFilter = selected !== null && rows.some((b) => b.caseId === selected.caseId);

  function registerKeys(event: ReactKeyboardEvent<HTMLTableSectionElement>) {
    const ids = rows.map((b) => b.caseId);
    if (ids.length === 0) return;
    const at = ids.indexOf(selectedId ?? '');
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    setSelectedId(ids[next]);
    (event.currentTarget.querySelector(`[data-case-select="${ids[next]}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 max-w-[1600px] mx-auto w-full">
      {/* Operational summary: small, textual, not decorative cards */}
      <section aria-label="Operational summary" className="flex flex-col gap-1">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>
          {summary.requiresAction} {summary.requiresAction === 1 ? 'case requires' : 'cases require'} action
        </h1>
        <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          {(['PENDING_EVIDENCE', 'REFUSED', 'ADMITTED_WITH_CONDITIONS', 'REVOKED', 'DRAFT', 'EVALUATING', 'ADMITTED'] as RulingStatus[])
            .filter((s) => summary.byStatus[s] > 0)
            .map((s) => (
              <li key={s}>
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => set('status', s)} aria-pressed={f.status === s}>
                  <span className="mono" style={{ color: `var(${STATUS_SEMANTICS[s].cssVar})` }}>{summary.byStatus[s]}</span> {STATUS_SEMANTICS[s].label.toLowerCase()}
                </button>
              </li>
            ))}
          {summary.byStatus.SUPERSEDED > 0 && <li><span className="mono">{summary.byStatus.SUPERSEDED}</span> superseded</li>}
          {summary.nearingExpiry > 0 && <li><span className="mono" style={{ color: 'var(--status-conditional)' }}>{summary.nearingExpiry}</span> nearing expiry (7 days)</li>}
          {summary.changedSince > 0 && <li><span className="mono">{summary.changedSince}</span> changed since <span className="ts">{fmtUtc(lastSeenAt)}</span></li>}
        </ul>
      </section>

      {/* Filters */}
      <form className="surface p-3 grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-8" aria-label="Queue filters" onSubmit={(e) => e.preventDefault()}>
        <label className="flex flex-col gap-1 min-w-0 col-span-2">
          <span className="label-sm">Search case, manifest, lot, shipment, claim</span>
          <input type="search" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="7C-104, BAL-77812, RUL-…" className="surface-inset px-2 py-1.5 text-[13px] w-full min-w-0 mono" />
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="label-sm">Status</span>
          <select value={f.status} onChange={(e) => set('status', e.target.value as Filters['status'])} className="surface-inset px-2 py-1.5 text-[13px] w-full min-w-0">
            <option value="ACTION">Requires action</option>
            <option value="ALL">All</option>
            {RULING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_SEMANTICS[s].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="label-sm">Sponsor / counterparty</span>
          <select value={f.party} onChange={(e) => set('party', e.target.value)} className="surface-inset px-2 py-1.5 text-[13px] w-full min-w-0">
            <option value="">Any</option>
            {parties.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="label-sm">Profile</span>
          <select value={f.profile} onChange={(e) => set('profile', e.target.value)} className="surface-inset px-2 py-1.5 text-[13px] w-full min-w-0 mono">
            <option value="">Any</option>
            {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="label-sm">Visibility</span>
          <select value={f.visibility} onChange={(e) => set('visibility', e.target.value as Filters['visibility'])} className="surface-inset px-2 py-1.5 text-[13px] w-full min-w-0">
            <option value="ALL">Any</option>
            {VISIBILITY_CLASSES.map((v) => <option key={v} value={v}>{VISIBILITY_SEMANTICS[v].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="label-sm">Assigned reviewer</span>
          <select value={f.reviewer} onChange={(e) => set('reviewer', e.target.value)} className="surface-inset px-2 py-1.5 text-[13px] w-full min-w-0">
            <option value="">Any</option>
            {reviewers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1 min-w-0">
          <span className="label-sm">World state valid (from / to)</span>
          <div className="flex gap-1 min-w-0">
            <input aria-label="Valid from" type="date" value={f.validFrom} onChange={(e) => set('validFrom', e.target.value)} className="surface-inset px-1 py-1 text-[12px] mono w-full min-w-0 flex-1" />
            <input aria-label="Valid to" type="date" value={f.validTo} onChange={(e) => set('validTo', e.target.value)} className="surface-inset px-1 py-1 text-[12px] mono w-full min-w-0 flex-1" />
          </div>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <span className="label-sm">Information known (from / to)</span>
          <div className="flex gap-1 min-w-0">
            <input aria-label="Known from" type="date" value={f.knownFrom} onChange={(e) => set('knownFrom', e.target.value)} className="surface-inset px-1 py-1 text-[12px] mono w-full min-w-0 flex-1" />
            <input aria-label="Known to" type="date" value={f.knownTo} onChange={(e) => set('knownTo', e.target.value)} className="surface-inset px-1 py-1 text-[12px] mono w-full min-w-0 flex-1" />
          </div>
        </div>
        <div className="col-span-2 md:col-span-4 xl:col-span-8 flex items-center justify-between">
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }} aria-live="polite">{rows.length} of {cases.length} cases</span>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setF(EMPTY)}>Reset filters</button>
        </div>
      </form>

      {/* The queue: four columns a reviewer triages on, and the panel for the rest. */}
      <div className={`workspace workspace-register-wide${selected ? ' has-inspector' : ''}`} data-testid="case-workspace" data-inspecting={selected ? 'case' : undefined}>
        <div className="workspace-top">
          <div className="surface register" tabIndex={0}>
            <table role="table" className="ledger-table" aria-label="Case queue">
              <thead>
                <tr>
                  <th scope="col">Case</th>
                  <th scope="col">Status</th>
                  <th scope="col">Required action</th>
                </tr>
              </thead>
              <tbody role="rowgroup" onKeyDown={registerKeys}>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>No cases match these filters.</td>
                  </tr>
                )}
                {rows.map((b) => {
                  const t = tenSecondSummary(b);
                  const expiring = isNearingExpiry(b);
                  const changed = b.lastChangedAt > lastSeenAt;
                  const active = b.caseId === selectedId;
                  return (
                    <tr role="row" key={b.caseId} data-case-id={b.caseId} aria-selected={active}>
                      <td role="cell" className="min-w-[140px]">
                        <button
                          type="button"
                          className="row-selectable text-left w-full flex flex-col gap-0.5"
                          aria-pressed={active}
                          data-case-select={b.caseId}
                          onClick={() => setSelectedId(active ? null : b.caseId)}
                        >
                          <span className="font-medium" style={{ color: active ? 'var(--accent-strong)' : 'var(--text-heading)' }}>{b.title}</span>
                          <span className="id" style={{ color: 'var(--text-muted)' }}>{b.caseId}</span>
                          {/* The instant of the last change is in the panel, and
                              the register carries what a reviewer reads it for:
                              the rows are ordered newest-changed first, so
                              recency is the order, and this mark is the part the
                              order cannot say — that it moved since you last
                              looked. A column for the timestamp put 80px of this
                              register past its own right edge at 1440. */}
                          {changed && <span className="label-sm" title="Changed since you last looked" style={{ color: 'var(--accent-strong)' }}>new<span className="sr-only"> since you last looked</span></span>}
                        </button>
                      </td>
                      <td role="cell">
                        <span className="cell-label">Status</span>
                        <div className="flex flex-col gap-1 items-start">
                          <RulingStatusPill status={b.status} size="sm" />
                          {expiring && <span className="text-[11px]" style={{ color: 'var(--status-conditional)' }}>Reliance ends {fmtDelta(b.asOf, b.currentRuling!.temporalBasis.expiresAt!)}</span>}
                          {b.previousRulings.length > 0 && <span className="text-[11px]" style={{ color: 'var(--status-superseded)' }}>{b.previousRulings.length} superseded</span>}
                        </div>
                      </td>
                      <td role="cell" className="text-[12.5px] max-w-[230px]">
                        <span className="cell-label">Required action</span>
                        {t.requiredAction ?? <span style={{ color: 'var(--text-muted)' }}>None</span>}
                        {t.blockingInvariant && <div className="id mt-0.5" style={{ color: 'var(--status-refused)' }}>{t.blockingInvariant.invariantId} · {t.blockingInvariant.refusalCode}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selected && <CaseInspector bundle={selected} inFilter={selectedInFilter} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}

/**
 * One case, in context, without opening it.
 *
 * The four fields the register dropped are here, plus the ones a reviewer
 * needs before deciding whether the case is worth a page load: what is
 * blocking it, on what assurance the current ruling stands, who sponsored it,
 * and both clocks kept apart. The primary action is opening the case, because
 * that is what this panel is for — it answers whether, and then gets out of
 * the way.
 */
function CaseInspector({ bundle, inFilter, onClose }: { bundle: ClaimCaseBundle; inFilter: boolean; onClose: () => void }) {
  const summary = tenSecondSummary(bundle);
  const sponsorId = bundle.parties.find((p) => p.role === 'CLAIM_SPONSOR')?.partyId;
  const reviewerId = bundle.assignedReviewerId;
  const expiring = isNearingExpiry(bundle);
  const assurance = bundle.currentRuling ? ASSURANCE_SEMANTICS[bundle.currentRuling.assurance.class] : null;
  const part = (title: string, children: React.ReactNode) => (
    <section className="inspector-section"><h3>{title}</h3>{children}</section>
  );
  return (
    <Inspector
      id="case-inspector"
      testId="case-inspector"
      kicker="Case"
      title={bundle.title}
      subtitle={<span className="id">{bundle.caseId}</span>}
      onClose={onClose}
      focusOnNarrow
      actions={<Link href={`/cases/${encodeURIComponent(bundle.caseId)}`} className="btn btn-sm btn-primary" data-testid="inspector-open-case">Open the case</Link>}
    >
      {/* A filter hides rows, not cases; a link into a filtered-out case still
          opens on it, and the panel says so rather than leaving the reader
          hunting a row that is not drawn. */}
      {!inFilter && (
        <p className="m-0 text-[12px]" data-testid="inspector-out-of-filter" style={{ color: 'var(--status-conditional)' }}>
          This case is not in the current filter, so it has no row above. It is still the case this link names.
        </p>
      )}

      {part('Standing', (
        <>
          <div className="flex items-center gap-2 flex-wrap"><RulingStatusPill status={bundle.status} size="sm" /><VisibilityBadge visibility={bundle.visibility} /></div>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{VISIBILITY_SEMANTICS[bundle.visibility].meaning}</p>
          {expiring && <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }}>Reliance ends {fmtDelta(bundle.asOf, bundle.currentRuling!.temporalBasis.expiresAt!)}</p>}
          {bundle.previousRulings.length > 0 && <p className="m-0 text-[12px]" style={{ color: 'var(--status-superseded)' }}>{bundle.previousRulings.length} superseded {bundle.previousRulings.length === 1 ? 'ruling' : 'rulings'} kept. Nothing is replaced in place.</p>}
        </>
      ))}

      {part('What it needs', (
        <>
          <p className="m-0 text-[12.5px]" data-testid="inspector-action" style={{ color: 'var(--text-secondary)' }}>{summary.requiredAction ?? 'Nothing. No action is required of this case.'}</p>
          {summary.blockingInvariant && (
            <p className="m-0 text-[12px]" data-testid="inspector-blocking">
              <span className="id" style={{ color: 'var(--status-refused)' }}>{summary.blockingInvariant.invariantId}</span>{' '}
              <span className="id" style={{ color: 'var(--status-refused)' }}>{summary.blockingInvariant.refusalCode}</span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>{summary.blockingInvariant.title}</span>
            </p>
          )}
          <dl className="kv m-0 text-[12.5px]">
            <dt>Invariants failed</dt><dd className="mono" data-testid="inspector-failed">{summary.failedCount}</dd>
            <dt>Conditions attached</dt><dd className="mono" data-testid="inspector-conditions">{summary.conditionCount}</dd>
          </dl>
        </>
      ))}

      {part('Declared use', (
        <dl className="kv m-0 text-[12.5px]">
          <dt>Purpose</dt><dd>{bundle.useScope.purpose}</dd>
          <dt>Use code</dt><dd className="id">{bundle.useScope.useCode}</dd>
        </dl>
      ))}

      {part('Clocks', (
        <>
          <dl className="kv m-0 text-[12.5px]">
            <dt>World state valid on</dt><dd className="ts">{fmtUtc(bundle.temporalBasis.validAt)}</dd>
            <dt>Information known by</dt><dd className="ts">{fmtUtc(bundle.temporalBasis.knownAt)}</dd>
            <dt>Last change</dt><dd className="ts">{fmtUtc(bundle.lastChangedAt)}</dd>
          </dl>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>What the world was doing, and what this system knew by. They are different questions and are never merged.</p>
        </>
      ))}

      {part('Assurance', assurance
        ? <><p className="m-0 text-[12.5px]" data-testid="inspector-assurance" style={{ color: `var(${assurance.cssVar})` }}>{assurance.label}</p><p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{assurance.meaning}</p></>
        : <p className="m-0 text-[12.5px]" data-testid="inspector-assurance" style={{ color: 'var(--text-muted)' }}>Not evaluated. No ruling stands on this case yet, so there is no assurance class to state.</p>)}

      {part('Parties', (
        <dl className="kv m-0 text-[12.5px]">
          <dt>Sponsor</dt><dd>{partyName(bundle, sponsorId)}</dd>
          <dt>Assigned reviewer</dt><dd>{reviewerId ? partyName(bundle, reviewerId) : <span style={{ color: 'var(--text-muted)' }}>Nobody is assigned.</span>}</dd>
          <dt>Profile</dt><dd className="id">{bundle.profileId}</dd>
        </dl>
      ))}

      {part('Where to read it', (
        <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[12.5px]">
          <li><Link href={`/cases/${encodeURIComponent(bundle.caseId)}`} style={{ color: 'var(--info)' }}>The case workspace</Link> — claims, evidence and the decision rail</li>
          {bundle.currentRuling && <li><Link href={`/rulings/${encodeURIComponent(bundle.currentRuling.rulingId)}`} style={{ color: 'var(--info)' }}>The current ruling</Link> — <span className="id">{bundle.currentRuling.rulingId}</span></li>}
          <li><Link href={`/replay/${encodeURIComponent(bundle.caseId)}`} style={{ color: 'var(--info)' }}>The case as it stood at an earlier instant</Link></li>
        </ul>
      ))}
    </Inspector>
  );
}
