import { Section } from '@/components/primitives/Section';
import type { Corpus } from '@/domain/corpus';
import {
  AREAL_GEOMETRY, CELL_SCHEME, CONSISTENCY_MEANING, CROSS_SUBJECT_TEST, KEY_REFUSAL_REASON,
  crossSubjectPairs, formatMetres, positionKeys, spatialKeyStanding,
} from '@/domain/spatialKey';

const metres = (value: number) => `${Math.round(value).toLocaleString('en-US')} m`;

// DISJOINT is a decision and is accented as one. OVERLAPPING is plain, not green:
// it is not a positive finding, and colouring it as one would say the sources agree.
const ANSWER_TONE: Record<string, string> = {
  DISJOINT: 'var(--text-heading)',
  OVERLAPPING: 'var(--text-secondary)',
  NOT_ASSESSABLE: 'var(--status-conditional)',
};

/**
 * The derivation beneath the globe. The twin above draws the positions; this
 * reads them: a cell key bounded by what each source actually claimed, and a
 * verdict on whether two positions can be told apart at all. Server-rendered
 * from the same release the twin is drawn from.
 */
export function SpatialKeys({ corpus, releaseId }: { corpus: Corpus; releaseId: string }) {
  const keys = positionKeys(corpus);
  const pairs = crossSubjectPairs(corpus);
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
            <thead><tr><th scope="col">Record</th><th scope="col">Subject</th><th scope="col">Shape</th><th scope="col">Stated uncertainty</th><th scope="col">Cell</th><th scope="col">Resolution it supports</th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.recordId} data-key-record={k.recordId} data-keyed={String(k.outcome.keyed)}>
                  <td className="id">{k.recordId}</td>
                  <td style={{ color: 'var(--text-heading)' }}>{k.subjectId}<div style={{ color: 'var(--text-muted)' }}>{k.title}</div></td>
                  <td><span className="pill text-[10.5px] px-1.5" data-shape={k.geometry.kind}>{k.geometry.kind}</span></td>
                  <td className="mono">{k.geometry.horizontalUncertaintyM ? <>±{metres(k.geometry.horizontalUncertaintyM)}{k.outcome.keyed && k.outcome.key.bound.featureReachM > 0 ? <span style={{ color: 'var(--text-muted)' }}> + {metres(k.outcome.key.bound.featureReachM)} reach</span> : null}</> : <span style={{ color: 'var(--status-refused)' }}>none stated</span>}</td>
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

      <Section title="Can two subjects be told apart?" id="sk-pairs">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          {CROSS_SUBJECT_TEST.asks} Not {CROSS_SUBJECT_TEST.notThis.charAt(0).toLowerCase()}{CROSS_SUBJECT_TEST.notThis.slice(1)} {CROSS_SUBJECT_TEST.blocking} The measurement is the same one the twin uses: the geodesic on the WGS84 ellipsoid, tested against the radii the sources stated.
        </p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Co-location verdicts between declared positions">
            <thead><tr><th scope="col">Pair</th><th scope="col">Blocked together</th><th scope="col">Separation</th><th scope="col">Combined uncertainty</th><th scope="col">Answer</th></tr></thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={`${p.a.recordId}-${p.b.recordId}`} data-pair={`${p.a.recordId}-${p.b.recordId}`} data-answer={p.state}>
                  <td className="id">{p.a.recordId} · {p.b.recordId}<div style={{ color: 'var(--text-muted)' }}>{p.a.subjectId} · {p.b.subjectId}</div></td>
                  <td style={{ color: p.blockedTogether ? 'var(--status-conditional)' : 'var(--text-muted)' }}>
                    {p.blockingCells
                      ? <>{p.blockedTogether ? 'Yes' : 'No'}<div className="mono">{p.blockingCells.a} · {p.blockingCells.b}</div></>
                      : 'Not comparable'}
                  </td>
                  <td className="mono">{p.separation.state === 'MEASURED' ? formatMetres(p.separation.metres) : '—'}</td>
                  <td className="mono">{p.combinedRadiusM === null ? '—' : formatMetres(p.combinedRadiusM)}</td>
                  <td style={{ color: ANSWER_TONE[p.state] }}>{p.state === 'DISJOINT' ? 'Not the same place' : p.state === 'OVERLAPPING' ? 'Cannot be separated' : 'Not assessable'}<div style={{ color: 'var(--text-muted)' }}>{p.because}</div></td>
                </tr>
              ))}
              {pairs.length === 0 ? <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>Fewer than two subjects declare a position, so there is no pair to test.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{CONSISTENCY_MEANING.OVERLAPPING}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--status-refused)' }}>
          Containment is the join that would matter, and it is still absent — the shape is carried now, the predicate is not. {AREAL_GEOMETRY.why} {AREAL_GEOMETRY.hazard}
        </p>
      </Section>
    </div>
  );
}
