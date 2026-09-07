import { Section } from '@/components/primitives/Section';
import type { Corpus } from '@/domain/corpus';
import {
  AREAL_GEOMETRY, CELL_SCHEME, KEY_REFUSAL_REASON, SEPARATION_METHOD, VERDICT_MEANING,
  positionKeys, positionPairs, spatialKeyStanding,
} from '@/domain/spatialKey';

const metres = (value: number) => `${Math.round(value).toLocaleString('en-US')} m`;

const VERDICT_TONE: Record<string, string> = {
  DISTINGUISHABLE: 'var(--check-passed)',
  INDISTINGUISHABLE: 'var(--status-conditional)',
  UNDECIDABLE: 'var(--text-muted)',
};

/**
 * The derivation beneath the globe. The twin above draws the positions; this
 * reads them: a cell key bounded by what each source actually claimed, and a
 * verdict on whether two positions can be told apart at all. Server-rendered
 * from the same release the twin is drawn from.
 */
export function SpatialKeys({ corpus, releaseId }: { corpus: Corpus; releaseId: string }) {
  const keys = positionKeys(corpus);
  const pairs = positionPairs(corpus);
  const standing = spatialKeyStanding(corpus);

  return (
    <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-5" data-testid="spatial-keys">
      <Section title="Derived from the positions above" id="sk-keys">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          The globe is the display. This is what the corpus can derive from the same positions in release <span className="mono">{releaseId}</span>:
          a cell key each position can be joined on, and a verdict on whether two of them are the same place. {standing.statement}
        </p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {CELL_SCHEME.what} {CELL_SCHEME.whyThisOne} {CELL_SCHEME.successor}
        </p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Spatial keys for declared positions">
            <thead><tr><th scope="col">Record</th><th scope="col">Subject</th><th scope="col">Stated uncertainty</th><th scope="col">Cell</th><th scope="col">Resolution it supports</th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.recordId} data-key-record={k.recordId} data-keyed={String(k.outcome.keyed)}>
                  <td className="id">{k.recordId}</td>
                  <td style={{ color: 'var(--text-heading)' }}>{k.subjectId}<div style={{ color: 'var(--text-muted)' }}>{k.title}</div></td>
                  <td className="mono">{k.point.horizontalUncertaintyM ? `±${metres(k.point.horizontalUncertaintyM)}` : <span style={{ color: 'var(--status-refused)' }}>none stated</span>}</td>
                  <td>
                    {k.outcome.keyed
                      ? <span className="mono" style={{ color: 'var(--text-heading)' }}>{k.outcome.key.cell}</span>
                      : <span style={{ color: 'var(--status-refused)' }}>Refused</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {k.outcome.keyed
                      ? <>Precision {k.outcome.key.precision}, {metres(k.outcome.key.extent.widthM)} × {metres(k.outcome.key.extent.heightM)} at this latitude. No finer: the source claimed ±{metres(k.outcome.key.boundedByM)}.</>
                      : KEY_REFUSAL_REASON[k.outcome.refusal]}
                  </td>
                </tr>
              ))}
              {keys.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No record in this release declares a position.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Can two positions be told apart?" id="sk-pairs">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          The cell decides which pairs are worth comparing. The comparison itself is metric: separation against combined stated uncertainty, by {SEPARATION_METHOD.method} on a {SEPARATION_METHOD.figure}. {SEPARATION_METHOD.consequence}
        </p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Co-location verdicts between declared positions">
            <thead><tr><th scope="col">Pair</th><th scope="col">Blocked together</th><th scope="col">Separation</th><th scope="col">Combined uncertainty</th><th scope="col">Verdict</th></tr></thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={`${p.a.recordId}-${p.b.recordId}`} data-pair={`${p.a.recordId}-${p.b.recordId}`} data-verdict={p.verdict}>
                  <td className="id">{p.a.recordId} · {p.b.recordId}<div style={{ color: 'var(--text-muted)' }}>{p.a.subjectId} · {p.b.subjectId}</div></td>
                  <td style={{ color: p.blockedTogether ? 'var(--status-conditional)' : 'var(--text-muted)' }}>
                    {p.blockingCells
                      ? <>{p.blockedTogether ? 'Yes' : 'No'}<div className="mono">{p.blockingCells.a} · {p.blockingCells.b}</div></>
                      : 'Not comparable'}
                  </td>
                  <td className="mono">{metres(p.separationM)}</td>
                  <td className="mono">{p.combinedUncertaintyM === null ? '—' : metres(p.combinedUncertaintyM)}</td>
                  <td style={{ color: VERDICT_TONE[p.verdict] }}>{p.verdict === 'DISTINGUISHABLE' ? 'Not the same place' : p.verdict === 'INDISTINGUISHABLE' ? 'Cannot be separated' : 'Undecidable'}<div style={{ color: 'var(--text-muted)' }}>{p.because}</div></td>
                </tr>
              ))}
              {pairs.length === 0 ? <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>Fewer than two subjects declare a position, so there is no pair to compare.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{VERDICT_MEANING.INDISTINGUISHABLE}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--status-refused)' }}>
          Containment is the join that would matter, and it is absent. {AREAL_GEOMETRY.why} {AREAL_GEOMETRY.hazard}
        </p>
      </Section>
    </div>
  );
}
