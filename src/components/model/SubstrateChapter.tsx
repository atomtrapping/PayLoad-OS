import Link from 'next/link';
import { AS_OF_COMPOSITION, LAYER_CONVENTION, MAPPING_STATE_LABEL, UNCERTAINTY_ENCODING, USD_BOUNDARY, USD_MAPPING, USD_ROLE } from '@/domain/usdProjection';
import { ATTRIBUTED_ABSENCE, CONCEPT_MAPPING, REANALYSIS_IS_A_WITNESS, SENSOR_FAMILIES, TWO_CONVERGENCES, VERTICAL_DATUM_TRAP, WEATHER_ROLE } from '@/domain/sensorFamilies';
import { BLOCKING_MEANING, CROSS_LINE_LOSS, crossLineStanding } from '@/domain/crossLineJoin';
import { COMPLEX, HYPERBOLIC, LEARNED_LAYER, MANIFOLD_TRAPS, PROJECTION_TIER } from '@/domain/earthComplex';
import { COORDINATE_SEMANTICS, PROJECTION_MODES, PROJECTION_ROUTING, REPRESENTATIONS, STRUCTURE_SOURCE } from '@/domain/projection';
import { CROSS_LINE_JOIN, CORE_STATE_LABEL, FAMILY_STATE_LABEL, IDENTIFIER_FAMILIES, IDENTITY_CORE, JOIN_KEYS } from '@/domain/identity';
import { EPISTEMIC_OF_BLOCKING } from '@/domain/epistemic';
import { EXTRACTION_INTERFACE, PROJECTION_ENGINES_IN_REPOSITORY, WORKBENCH_RUNTIME } from '@/domain/doctrine';
import { FIXTURE_CORPORA } from '@/fixtures';
import { PRESENCE_LABEL } from '@/domain/product';
import { Readout, Rule } from '@/components/hud/Instrument';
import { SPATIAL_CAPABILITIES, SPATIAL_DERIVATIONS, SPATIAL_DISCIPLINE, SPATIAL_ROLES, SPATIAL_ROLE_STATE_LABEL, SPATIAL_SEQUENCE } from '@/domain/spatialDerivation';
import { STORAGE_CLASSES, STORAGE_PRESENT_STATE, STORAGE_SEQUENCE, STORAGE_STATE_LABEL, STORE_KIND_LABEL } from '@/domain/storage';
import { Section } from '@/components/primitives/Section';
import { fmtUtc } from '@/lib/format';

/**
 * Chapter two of the operating model: the substrate every line shares. Two figures are derived rather than described: the join keys run across every line that carries records, and the projection routing table's own tally.
 */
export function SubstrateChapter() {
  // The two present join keys, run across every line that carries records.
  // Read from the counterparty seat's deliverable set, never the release: a
  // position this seat may not be delivered is not a position it may join on.
  const keysRun = crossLineStanding(FIXTURE_CORPORA);
  const unkeyablePairs = keysRun.pairs.filter((pair) => pair.outcome === 'NOT_KEYABLE').length;
  // The routing table's own tally, so the count above the table is derived
  // from the table rather than typed beside it.
  const routing = {
    ready: PROJECTION_ROUTING.filter((route) => route.currentResult === 'READY').length,
    unavailable: PROJECTION_ROUTING.filter((route) => route.currentResult === 'UNAVAILABLE').length,
  };
  return (
    <>
      <Section title="Identity: one core, three families, one join" id="pm-identity">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Identity is line-agnostic; the verticals are not. Resolution, provenance, bitemporality and linkage are solved once for every line; the identifiers beneath them belong to their line. {CROSS_LINE_JOIN.claim}</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="The identity core">
            <thead><tr><th scope="col">Facility</th><th scope="col">Owes every line</th><th scope="col">State</th><th scope="col">Here</th></tr></thead>
            <tbody>
              {IDENTITY_CORE.map((f) => (
                <tr key={f.id} data-core={f.id} data-core-state={f.state}>
                  <td style={{ color: 'var(--text-heading)' }}>{f.title}</td>
                  <td>{f.obligation}</td>
                  <td style={{ color: f.state === 'ABSENT' ? 'var(--status-refused)' : f.state === 'PARTIAL' ? 'var(--status-conditional)' : 'var(--check-passed)' }}>{CORE_STATE_LABEL[f.state]}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{f.here}{f.missing ? <> <span style={{ color: 'var(--status-conditional)' }}>Missing: {f.missing}</span></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {IDENTIFIER_FAMILIES.map((family) => (
            <article key={family.domain} className="surface p-3 flex flex-col gap-1.5" aria-labelledby={`family-${family.domain}`} data-family={family.domain}>
              <h3 id={`family-${family.domain}`} className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>{family.domain}</h3>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {family.identifiers.map((i) => (
                  <li key={i.id} data-identifier={i.id} data-identifier-state={i.state} className="text-[12px]">
                    <span className="id">{i.id}</span> <span style={{ color: 'var(--text-muted)' }}>— {i.what}. Issued by {i.issuer}.</span>{' '}
                    <span style={{ color: i.state === 'IN_USE' ? 'var(--check-passed)' : 'var(--status-conditional)' }}>{FAMILY_STATE_LABEL[i.state]}</span>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{family.whyLineSpecific}</p>
            </article>
          ))}
        </div>
        <div className="surface p-3 flex flex-col gap-2" data-testid="cross-line-join">
          <h3 className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>The cross-line join <span style={{ color: 'var(--status-refused)' }}>Absent</span></h3>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{CROSS_LINE_JOIN.why}</p>
          <ol className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }} aria-label="What the cross-line join requires">
            {CROSS_LINE_JOIN.requires.map((r) => <li key={r}>{r}</li>)}
          </ol>
          <table className="ledger-table text-[12px]" aria-label="Join keys and their hazards">
            <thead><tr><th scope="col">Key</th><th scope="col">State</th><th scope="col">The mistake it invites</th></tr></thead>
            <tbody>
              {JOIN_KEYS.map((k) => (
                <tr key={k.id} data-join-key={k.id} data-join-state={k.state}>
                  <td style={{ color: 'var(--text-heading)' }}>{k.title}</td>
                  <td style={{ color: k.state === 'ABSENT' ? 'var(--status-refused)' : 'var(--check-passed)' }}>{k.state === 'ABSENT' ? 'Absent' : 'Present'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{k.hazard}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{CROSS_LINE_JOIN.discipline}</p>
        </div>

        <div className="hud-panel flex flex-col gap-3" data-testid="keys-run">
          <Rule label="The keys, run" right={<span data-epistemic="DERIVED" style={{ border: 0, background: 'transparent' }}>RESOLVED {keysRun.resolved} · {keysRun.resolutionState}</span>} state="DERIVED" />
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>Two of the three keys are present, and all three lines carry records, so they were run rather than described. Every pair below was compared at the coarser of its two stated precisions, over valid time, at knowledge time <span className="mono">{fmtUtc(keysRun.knownAt)}</span>, from the <span className="mono">{keysRun.seat.replace('_', ' ').toLowerCase()}</span> seat.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Readout label="Cross-line pairs" value={keysRun.pairs.length} state="DERIVED" testId="keys-pairs" />
            <Readout label="Co-located" value={keysRun.coLocated} state="DERIVED" testId="keys-colocated" />
            <Readout label="Unkeyable" value={unkeyablePairs} state="DERIVED" testId="keys-unkeyable" />
            <Readout label="Resolved" value={keysRun.resolved} state="DERIVED" testId="keys-resolved" />
          </div>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12px]" aria-label="Declared positions per line">
              <thead><tr><th scope="col">Line</th><th scope="col">Corpus</th><th scope="col">Positions</th><th scope="col">Keyed</th><th scope="col">Unkeyable</th></tr></thead>
              <tbody>
                {keysRun.lines.map((line) => (
                  <tr key={line.corpusId} data-line={line.domain}>
                    <td style={{ color: 'var(--text-heading)' }}>{line.domain}</td>
                    <td className="mono">{line.corpusId}</td>
                    <td className="mono">{line.positions}</td>
                    <td className="mono">{line.keyed}</td>
                    <td className="mono">{line.unkeyable === 0 ? '0' : <span data-epistemic="UNKNOWN" style={{ border: 0, background: 'transparent' }}>{line.unkeyable}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12px]" aria-label="Cross-line pairs and what the keys established">
              <thead><tr><th scope="col">Left</th><th scope="col">Right</th><th scope="col">Outcome</th><th scope="col">Cell</th><th scope="col">At precision</th><th scope="col">What it establishes</th></tr></thead>
              <tbody>
                {keysRun.pairs.map((pair) => (
                  <tr key={`${pair.left.recordId}-${pair.right.recordId}`} data-pair-outcome={pair.outcome}>
                    <td className="whitespace-nowrap"><span className="id">{pair.left.subjectId}</span><br /><span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{pair.left.domain}</span></td>
                    <td className="whitespace-nowrap"><span className="id">{pair.right.subjectId}</span><br /><span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{pair.right.domain}</span></td>
                    <td><span className="pill" data-epistemic={EPISTEMIC_OF_BLOCKING[pair.outcome]} title={BLOCKING_MEANING[pair.outcome]}>{pair.outcome.replace(/_/g, ' ')}</span></td>
                    <td className="mono">{pair.comparedCell ?? <span data-epistemic="UNKNOWN" style={{ border: 0, background: 'transparent' }}>NONE</span>}</td>
                    <td className="mono">{pair.comparedAtPrecision ?? <span data-epistemic="UNKNOWN" style={{ border: 0, background: 'transparent' }}>UNKNOWN</span>}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{pair.because}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }} data-testid="keys-because">{keysRun.because}</p>
          <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }} aria-label="What running the keys gives up">
            {CROSS_LINE_LOSS.map((loss) => <li key={loss}>{loss}</li>)}
          </ul>
        </div>
      </Section>

      <Section title="Space: the display was the easy half" id="pm-spatial">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Space is the one dimension that runs through every line, and until now it was a display attribute here: surfaces that draw positions and derive nothing from them. It has four other jobs. It is the resolver — geometry refutes an identity claim more cheaply than any name match. It is the join key, so a flow and a parcel meet with no shared identifier. It is a validity clock, because a boundary is a claim with two times and almost nobody versions geometry. It is an inference engine, because a scene is a source and a detector is an extraction adapter. The <Link href="/earth" style={{ color: 'var(--info)' }}>Earth Twin</Link> now shows the first derivation beneath the globe.</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="What space is used for">
            <thead><tr><th scope="col">Job</th><th scope="col">What it would do</th><th scope="col">State</th><th scope="col">Here</th></tr></thead>
            <tbody>
              {SPATIAL_ROLES.map((r) => (
                <tr key={r.id} data-spatial-role={r.id} data-spatial-state={r.state}>
                  <td style={{ color: 'var(--text-heading)' }}>{r.title}</td>
                  <td>{r.job}</td>
                  <td style={{ color: r.state === 'ABSENT' ? 'var(--status-refused)' : r.state === 'PARTIAL' ? 'var(--status-conditional)' : 'var(--check-passed)' }}>{SPATIAL_ROLE_STATE_LABEL[r.state]}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.here}{r.missing ? <> <span style={{ color: 'var(--status-conditional)' }}>Missing: {r.missing}</span></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {SPATIAL_DERIVATIONS.map((d) => (
            <article key={d.id} className="surface p-3 flex flex-col gap-1.5" aria-labelledby={`spatial-${d.id}`} data-derivation={d.id} data-derivation-state={d.state}>
              <h3 id={`spatial-${d.id}`} className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}><span className="mono" style={{ color: 'var(--text-muted)' }}>{d.rank}</span> {d.title} <span style={{ color: d.state === 'ABSENT' ? 'var(--status-refused)' : 'var(--status-conditional)' }}>{d.state === 'ABSENT' ? 'Absent' : 'Partly built'}</span></h3>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{d.what}</p>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">Why here</span> {d.whyHere}</p>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}><span className="label-sm">Here</span> {d.here}</p>
              <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }} aria-label={`What ${d.title} needs`}>
                {d.needs.map((n) => <li key={n}>{n}</li>)}
              </ul>
              <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }}><span className="label-sm">Hazard</span> {d.hazard}</p>
            </article>
          ))}
        </div>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Spatial capabilities and where they live">
            <thead><tr><th scope="col">Capability</th><th scope="col">Component</th><th scope="col">State</th><th scope="col">Note</th></tr></thead>
            <tbody>
              {SPATIAL_CAPABILITIES.map((c) => (
                <tr key={c.capability} data-spatial-capability={c.state}>
                  <td style={{ color: 'var(--text-heading)' }}>{c.capability}</td>
                  <td className="mono">{c.component}</td>
                  <td style={{ color: c.state === 'ABSENT' ? 'var(--status-refused)' : c.state === 'PARTIAL' ? 'var(--status-conditional)' : 'var(--check-passed)' }}>{SPATIAL_ROLE_STATE_LABEL[c.state]}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }} aria-label="Spatial build order">
          {SPATIAL_SEQUENCE.map((step) => <li key={step}>{step}</li>)}
        </ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{SPATIAL_DISCIPLINE.buyTheCommodity} {SPATIAL_DISCIPLINE.uncertaintyCutsBothWays} {SPATIAL_DISCIPLINE.rightsBiteHardest} {SPATIAL_DISCIPLINE.displayIsNotDerivation}</p>

        <h3 className="m-0 mt-2 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>Three families, and the convergence that is actually missing</h3>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="two-convergences">{TWO_CONVERGENCES.sensor.what} Blocked by: {TWO_CONVERGENCES.sensor.blockedBy} {TWO_CONVERGENCES.semantic.what} Blocked by: {TWO_CONVERGENCES.semantic.blockedBy}</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Sensor families and the frames they live in">
            <thead><tr><th scope="col">Family</th><th scope="col">Role</th><th scope="col">Constrains</th><th scope="col">Its own vocabulary</th><th scope="col">Frame fields</th><th scope="col">Here</th></tr></thead>
            <tbody>
              {SENSOR_FAMILIES.map((f) => (
                <tr key={f.id} data-sensor-family={f.id} data-sensor-role={f.role}>
                  <td style={{ color: 'var(--text-heading)' }}>{f.title}</td>
                  <td style={{ color: f.role === 'FORCES_AND_GATES' ? 'var(--status-conditional)' : 'var(--text-secondary)' }}>{f.role === 'FORCES_AND_GATES' ? 'Forces and gates' : 'Observes structure'}</td>
                  <td>{f.constrains}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{f.nativeVocabulary}</td>
                  <td className="mono">{f.frameFields.join(', ')}</td>
                  <td style={{ color: 'var(--status-refused)' }}>{f.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ol className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }} aria-label="The concept mapping, in four stages">
          {CONCEPT_MAPPING.map((m) => <li key={m.stage} data-mapping-stage={m.stage}>{m.what} <span style={{ color: 'var(--text-muted)' }}>Same discipline as: {m.sameAs}</span></li>)}
        </ol>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }} data-testid="weather-role"><span className="label-sm">Weather is not a third sensor</span> {WEATHER_ROLE.asymmetry} {WEATHER_ROLE.missedPoint} {ATTRIBUTED_ABSENCE.rule} {REANALYSIS_IS_A_WITNESS.rule}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }} data-testid="vertical-datum"><span className="label-sm">Before the first elevation</span> {VERTICAL_DATUM_TRAP.trap} {VERTICAL_DATUM_TRAP.rule} {VERTICAL_DATUM_TRAP.here}</p>
      </Section>

      <Section title="Where the corpus is stored" id="pm-storage">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Six classes of information with different access patterns ask for different stores. The technologies below are candidates, not selections. {STORAGE_PRESENT_STATE.summary}</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Storage classes and their candidate stores">
            <thead><tr><th scope="col">Information</th><th scope="col">Store kind</th><th scope="col">Candidates</th><th scope="col">Fabric</th><th scope="col">Here</th></tr></thead>
            <tbody>
              {STORAGE_CLASSES.map((c) => (
                <tr key={c.id} data-storage={c.id} data-state={c.here.state}>
                  <td style={{ color: 'var(--text-heading)' }}>{c.dataClass}</td>
                  <td>{STORE_KIND_LABEL[c.kind]}</td>
                  <td className="mono">{c.candidates.join(', ')}</td>
                  <td className="id">{c.fabric}</td>
                  <td style={{ color: c.here.state === 'ABSENT' ? 'var(--status-refused)' : c.here.state === 'FIXTURE' ? 'var(--status-conditional)' : 'var(--text-secondary)' }}>{STORAGE_STATE_LABEL[c.here.state]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {STORAGE_CLASSES.map((c) => (
            <article key={c.id} className="surface p-3 flex flex-col gap-1.5" aria-labelledby={`storage-${c.id}`}>
              <h3 id={`storage-${c.id}`} className="m-0 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>{STORE_KIND_LABEL[c.kind]}</h3>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{c.why}</p>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">Must not break</span> {c.invariant}</p>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}><span className="label-sm">Here</span> {c.here.what}{c.here.where ? <> <Link href={c.here.where} style={{ color: 'var(--info)' }}>{c.here.where}</Link></> : null}</p>
              <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}><span className="label-sm">Before choosing one</span> {c.before}</p>
            </article>
          ))}
        </div>
        <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }} aria-label="Adoption sequence">
          {STORAGE_SEQUENCE.map((step) => <li key={step}>{step}</li>)}
        </ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Local roots today: <span className="mono">{STORAGE_PRESENT_STATE.roots}</span>. {STORAGE_PRESENT_STATE.dependencies}</p>
      </Section>

      <Section title="Projection fabric" id="pm-projection">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Instruments for different questions over one corpus, and the records view. A projection changes representation, never identity; it derives no relation from where things land; it has no path back into its source. The closed spec, the source-pinned compiler and the read-only preview endpoints are in <span className="mono">src/projection</span>; the routing table is in <span className="mono">src/domain/projection.ts</span>; the engines are routed to, not installed.</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Projection engines">
            <thead><tr><th scope="col">Engine</th><th scope="col">Question</th><th scope="col">Role</th><th scope="col">Runtime</th><th scope="col">Here</th></tr></thead>
            <tbody>
              {PROJECTION_ENGINES_IN_REPOSITORY.map((e) => (
                <tr key={e.engine} data-engine={e.engine} data-presence={e.presence}>
                  <td className="id">{e.engine}</td><td style={{ color: 'var(--text-heading)' }}>{e.question}</td><td>{e.role}</td><td className="mono">{e.runtime}</td>
                  <td style={{ color: e.presence === 'ABSENT' ? 'var(--status-refused)' : 'var(--check-passed)' }}>{PRESENCE_LABEL[e.presence]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{WORKBENCH_RUNTIME.statement} Here: {WORKBENCH_RUNTIME.inThisRepository}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{EXTRACTION_INTERFACE.statement} Here: {EXTRACTION_INTERFACE.inThisRepository}</p>

        <div className="hud-panel flex flex-col gap-3" data-testid="projection-routing">
          <Rule label="The routing table" right={<span data-epistemic="DERIVED" style={{ border: 0, background: 'transparent' }}>{routing.ready} READY · {routing.unavailable} UNAVAILABLE</span>} state="DERIVED" />
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}>Every combination of mode, coordinate semantics and representation the compiler will accept. Anything not in this table is rejected by the router rather than approximated, and a test holds the two in agreement over all {PROJECTION_MODES.length} × {COORDINATE_SEMANTICS.length} × {REPRESENTATIONS.length} combinations. The table decided what the fabric serves and no surface had ever shown it.</p>
          <div className="surface overflow-x-auto" tabIndex={0}>
            <table className="ledger-table text-[12px]" aria-label="Projection routing table">
              <thead><tr><th scope="col">Mode</th><th scope="col">Coordinate semantics</th><th scope="col">Representation</th><th scope="col">Engine</th><th scope="col">Today</th><th scope="col">What it returns, or what stands in the way</th></tr></thead>
              <tbody>
                {PROJECTION_ROUTING.map((route) => (
                  <tr key={`${route.mode}-${route.coordinateSemantics}-${route.representation}`} data-route-mode={route.mode} data-route-result={route.currentResult}>
                    <td style={{ color: 'var(--text-heading)' }}>{route.mode}</td>
                    <td className="mono text-[11.5px]">{route.coordinateSemantics}</td>
                    <td className="mono text-[11.5px]">{route.representation}</td>
                    <td className="id">{route.engine}</td>
                    <td><span className="pill text-[10.5px] px-1.5" data-epistemic={route.currentResult === 'READY' ? 'DERIVED' : 'UNKNOWN'}>{route.currentResult}</span></td>
                    <td style={{ color: 'var(--text-muted)' }}>{route.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="surface-inset p-3 flex flex-col gap-1.5" data-testid="structure-seat">
            <span className="label-sm">The STRUCTURE seat</span>
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              Six routes wait on a surface, and this repository pins an engine that makes one: <span className="id">{STRUCTURE_SOURCE.engine}</span>, at an exact commit in <span className="mono">{STRUCTURE_SOURCE.pin}</span>. It would supply {STRUCTURE_SOURCE.wouldSupply}
            </p>
            <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }} aria-label="What stands between the audit and the STRUCTURE seat">
              {STRUCTURE_SOURCE.blockedBy.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
            <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }}>{STRUCTURE_SOURCE.notThis}</p>
          </div>
        </div>

        <h3 className="m-0 mt-2 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>OpenUSD: a target, never a store</h3>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="usd-role">{USD_ROLE.whyNotStore} {USD_ROLE.whyTarget}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{USD_ROLE.theRhyme}</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="The corpus-to-USD mapping">
            <thead><tr><th scope="col">Corpus</th><th scope="col">USD</th><th scope="col">State</th><th scope="col">Here, and the mistake it invites</th></tr></thead>
            <tbody>
              {USD_MAPPING.map((row) => (
                <tr key={row.corpus} data-usd-row={row.corpus} data-usd-state={row.state}>
                  <td style={{ color: 'var(--text-heading)' }}>{row.corpus}</td>
                  <td className="mono">{row.usd}</td>
                  <td style={{ color: row.state === 'BLOCKED' ? 'var(--status-refused)' : row.state === 'PARTIAL' ? 'var(--status-conditional)' : 'var(--text-secondary)' }}>{MAPPING_STATE_LABEL[row.state]}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{row.here} <span style={{ color: 'var(--status-conditional)' }}>{row.hazard}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">The layer stack is the release ABI</span> {LAYER_CONVENTION.oneLayerPerRelease} {LAYER_CONVENTION.order} {LAYER_CONVENTION.correction}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">Two clocks, two mechanisms</span> {AS_OF_COMPOSITION.knowledgeTime} {AS_OF_COMPOSITION.validTime} {AS_OF_COMPOSITION.refusal} {AS_OF_COMPOSITION.receipt}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }}><span className="label-sm">Uncertainty must reach the eye</span> {UNCERTAINTY_ENCODING.rule} {UNCERTAINTY_ENCODING.notThis} Nothing is decided yet.</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{USD_BOUNDARY.oneRow} {USD_BOUNDARY.notAVocabulary} {USD_BOUNDARY.separateFromTheGlobe}</p>

        <h3 className="m-0 mt-2 text-[13px] font-semibold" style={{ color: 'var(--text-heading)' }}>The Earth as a complex, and the tier below the corpus</h3>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="manifold-tier">{PROJECTION_TIER.chain}. {PROJECTION_TIER.rule} {LEARNED_LAYER.neverAuthoritative}</p>
        <ul className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2" aria-label="The combinatorial structure">
          {COMPLEX.map((part) => (
            <li key={part.id} className="surface-inset p-2 text-[12px]" data-complex={part.id} data-complex-state={part.state}>
              <span style={{ color: 'var(--text-heading)' }}>{part.title}</span> <span style={{ color: part.state === 'ABSENT' ? 'var(--status-refused)' : 'var(--status-conditional)' }}>{part.state === 'ABSENT' ? 'Absent' : 'Partly built'}</span>
              <div style={{ color: 'var(--text-secondary)' }}>{part.here}</div>
              <div style={{ color: 'var(--text-muted)' }}>Missing: {part.missing}</div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">Why hyperbolic</span> {HYPERBOLIC.claim} {HYPERBOLIC.reading} <span style={{ color: 'var(--status-conditional)' }}>{HYPERBOLIC.hazard}</span> Here: {HYPERBOLIC.here}</p>
        <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }} aria-label="What a learned manifold would get wrong">
          {MANIFOLD_TRAPS.map((trap) => <li key={trap.id} data-manifold-trap={trap.id}>{trap.trap} <span style={{ color: 'var(--status-conditional)' }}>{trap.rule}</span></li>)}
        </ul>
      </Section>
    </>
  );
}
