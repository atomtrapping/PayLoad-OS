import type { Metadata } from 'next';
import { getCorpusSource } from '@/adapter/corpusSource';
import { Readout, Rule, Segments } from '@/components/hud/Instrument';
import Link from 'next/link';
import { CUSTOMER_CATEGORIES, DISTRIBUTION_MECHANISMS, ECONOMIC_ARCHITECTURE, ENGINES, MATERIAL_CLASSES_IN_CORPUS, PRESENCE_LABEL, PRODUCTION_SYSTEM, PRODUCT_ARCHITECTURE, REFERENCE_IMPLEMENTATION, THESIS, VALUE_PROPOSITION } from '@/domain/product';
import { DOCTRINE, EXTRACTION_INTERFACE, FABRICS, IDENTITY_CHAIN, INFORMATION_STATES, OPERATIONAL_RULE, PROJECTION_ENGINES_IN_REPOSITORY, VERIFICATION_TIERS, WORKBENCH_RUNTIME } from '@/domain/doctrine';
import { CROSS_LINE_JOIN, CORE_STATE_LABEL, FAMILY_STATE_LABEL, IDENTIFIER_FAMILIES, IDENTITY_CORE, JOIN_KEYS } from '@/domain/identity';
import { BLOCKING_MEANING, CROSS_LINE_LOSS, crossLineStanding } from '@/domain/crossLineJoin';
import { EPISTEMIC_OF_BLOCKING } from '@/domain/epistemic';
import { STORAGE_CLASSES, STORAGE_PRESENT_STATE, STORAGE_SEQUENCE, STORAGE_STATE_LABEL, STORE_KIND_LABEL } from '@/domain/storage';
import { SPATIAL_CAPABILITIES, SPATIAL_DERIVATIONS, SPATIAL_DISCIPLINE, SPATIAL_ROLES, SPATIAL_ROLE_STATE_LABEL, SPATIAL_SEQUENCE } from '@/domain/spatialDerivation';
import { AS_OF_COMPOSITION, LAYER_CONVENTION, MAPPING_STATE_LABEL, UNCERTAINTY_ENCODING, USD_BOUNDARY, USD_MAPPING, USD_ROLE } from '@/domain/usdProjection';
import { COMPLEX, HYPERBOLIC, LEARNED_LAYER, MANIFOLD_TRAPS, PROJECTION_TIER } from '@/domain/earthComplex';
import { CONSTRAINT_IS_AN_OBSERVATION, ENFORCEMENT_METHODS, HARDNESS_RULE, HARVEST_RULE, INEQUALITIES, VIOLATION_TAPE } from '@/domain/constraints';
import { ATTRIBUTED_ABSENCE, CONCEPT_MAPPING, REANALYSIS_IS_A_WITNESS, SENSOR_FAMILIES, TWO_CONVERGENCES, VERTICAL_DATUM_TRAP, WEATHER_ROLE } from '@/domain/sensorFamilies';
import { FACTOR_KINDS, DISAGREEMENT_IS_REPRESENTABLE, REPRODUCIBILITY, SOLVER_ADOPTION, SOLVER_NEVER_DECIDES, THE_JOINT } from '@/domain/factorGraph';
import { FILTER_TIERS, FRAME_RISKS, REFERENCE_CHANNEL, VERDICTS_ARE_THE_ESTATE } from '@/domain/invariantScoring';
import { CLOSURE_IS_THE_MEASUREMENT, VESSEL_CHANNELS, VESSEL_JOINS, VESSEL_STATE } from '@/domain/vessel';
import { PORT_SET_LOSS, SET_OBJECTS, SET_PRODUCTS } from '@/domain/portSet';
import { AUTHORITY_DIRECTION, CARD_PROPERTIES, CONGRUENCE, FROZEN_SIDE, GENERAL_PROVING, MIRRORS_THE_MODEL, NOT_CREDIBILITY } from '@/domain/computationCarrier';
import { COMPOSITION_IS_ADJUDICATION, INTEROP_VOCABULARY } from '@/domain/usdProjection';
import { CORRESPONDENCES, FIT_DEPTH_LABEL, MANDATE_INVERSION } from '@/domain/actuarial';
import { CAPABILITIES, PRESSURE, THE_FINDING, accommodationStanding, fitOf } from '@/domain/accommodation';
import { ATTESTOR_KINDS, LIABILITY_BOUNDARY, scalar, LIFECYCLE, NEVER, TRUST_ORDER, VEHICLE_ROLE, VEHICLE_SEQUENCE, VENUE_PROPERTIES, evaluateRelease, exposureAfter, restatementExposure, type ReleaseCondition } from '@/domain/collateralVehicle';
import { NEGATIVE_RULES, WHY_ONE_IS_NOT_ENOUGH } from '@/domain/negativeStates';
import { STACK, WHAT_IS_BEING_CLAIMED, compressionAvailable } from '@/domain/compression';
import { currentRelease } from '@/domain/corpus';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { FIXTURE_CORPORA } from '@/fixtures';
import { Section } from '@/components/primitives/Section';
import { fmtUtc } from '@/lib/format';

export const metadata: Metadata = { title: 'Operating model' };

/** What the firm is, what it makes, how it distributes it, whom it serves, and what exists here. The three APIs are the products; this terminal is not one. The text is the founder's; the presence flags are facts about this repository. */
const FIT_LABEL = {
  RUNS_TODAY: 'Runs today',
  ONE_THING_AWAY: 'One thing away',
  SEVERAL_THINGS_AWAY: 'Several things away',
} as const;

export default async function ProductPage() {
  const capabilityFits = CAPABILITIES.map((capability) => fitOf(capability, CARAVAN_CORPUS));
  // The two present join keys, run across every line that carries records.
  // Read from the counterparty seat's deliverable set, never the release: a
  // position this seat may not be delivered is not a position it may join on.
  const keysRun = crossLineStanding(FIXTURE_CORPORA);
  const unkeyablePairs = keysRun.pairs.filter((pair) => pair.outcome === 'NOT_KEYABLE').length;
  const accommodation = accommodationStanding(CARAVAN_CORPUS);

  // The worked demonstration: a condition sitting between the draft survey and
  // the weighbridge, decided before the correction was knowable.
  const condition: ReleaseCondition = {
    conditionId: 'COND-GROSS-40-05',
    agreedText: 'Release on confirmation that the gross quantity of lot 5B-221 does not exceed 40.05 t.',
    root: scalar('LOT-5B-221', 'quantity.gross', 'AT_MOST', 40.05, 'Gross quantity not to exceed 40.05 t.'),
  };
  const vehicleRelease = currentRelease(CARAVAN_CORPUS);
  const decision = evaluateRelease(CARAVAN_CORPUS, vehicleRelease, condition, '2026-08-20T00:00:00Z');
  const exposure = exposureAfter(CARAVAN_CORPUS, vehicleRelease, decision, '2026-09-01T12:00:00Z');
  const window = restatementExposure(CARAVAN_CORPUS);
  // Derived, never asserted. The count comes from the store the adapter can
  // reach: a live store answers with the rows the admission gate stamped, and a
  // process with no store answers UNKNOWN. Neither answers zero on a guess —
  // which is the mistake this page renders a table about three sections down.
  const admitted = await getCorpusSource().admittedRecords();
  const compression = compressionAvailable(CARAVAN_CORPUS, admitted.count);
  return (
    <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="label-sm">Notation Systems · operating model</span>
        <h1 className="m-0 text-[20px] font-semibold leading-snug" style={{ color: 'var(--text-heading)' }}>{THESIS.firm}</h1>
        <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.production}</p>
        <p className="m-0 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.inventory}</p>
      </header>

      <Section title="Source material" id="pm-material">
        <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Classes of authorized source material">
          {MATERIAL_CLASSES_IN_CORPUS.map((m) => (
            <li key={m.materialClass} className="surface-inset px-3 py-2 text-[12.5px]" data-material={m.materialClass} data-present={m.presentInDemo}>
              <span style={{ color: 'var(--text-heading)' }}>{m.label}</span>
              <div className="text-[11.5px]" style={{ color: m.presentInDemo ? 'var(--status-conditional)' : 'var(--text-muted)' }}>{m.presentInDemo ? 'In the demonstration corpus' : 'Not represented in the demonstration corpus'}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="The production system" id="pm-production">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Twelve stages. Each release page shows this record as it ran for that build, and says which stages did not run.</p>
        <ol className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2">
          {PRODUCTION_SYSTEM.map((s, i) => (
            <li key={s.stage} className="surface-inset p-2 text-[12.5px]" data-stage={s.stage}><span className="mono" style={{ color: 'var(--text-muted)' }}>{String(i + 1).padStart(2, '0')}</span> <span style={{ color: 'var(--text-heading)' }}>{s.label}</span><div style={{ color: 'var(--text-secondary)' }}>{s.meaning}</div></li>
          ))}
        </ol>
      </Section>

      <Section title="The five fabrics" id="pm-fabrics">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The production system, arranged as the architecture the firm carries forward: five fabrics, each a transformation, feedback returning to the first. The presence flag is a fact about this repository.</p>
        <ol className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Fabrics">
          {FABRICS.map((f) => (
            <li key={f.id} className="surface-inset p-2 text-[12.5px] grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)_auto]" data-fabric={f.id} data-presence={f.presence}>
              <span className="mono" style={{ color: 'var(--text-muted)' }}>{f.order}</span>
              <span><span style={{ color: 'var(--text-heading)' }}>{f.title}</span> <span className="mono text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{f.transforms}</span><div style={{ color: 'var(--text-secondary)' }}>{f.inThisRepository}</div></span>
              <span className="text-[11.5px] whitespace-nowrap" style={{ color: f.presence === 'ABSENT' ? 'var(--status-refused)' : f.presence === 'FIXTURE' ? 'var(--status-conditional)' : 'var(--check-passed)' }}>{f.where ? <Link href={f.where} style={{ color: 'inherit' }}>{PRESENCE_LABEL[f.presence]}</Link> : PRESENCE_LABEL[f.presence]}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Inventory and distribution" id="pm-distribution">
        <table className="ledger-table text-[13px]">
          <thead><tr><th scope="col">Layer</th><th scope="col">Role</th></tr></thead>
          <tbody>{THESIS.layers.map((l) => <tr key={l.layer}><td style={{ color: 'var(--text-heading)' }}>{l.layer}</td><td>{l.role}</td></tr>)}</tbody>
        </table>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Distribution mechanisms: {DISTRIBUTION_MECHANISMS.join(' · ')}. In this repository: the <Link href="/api" style={{ color: 'var(--info)' }}>feed API</Link>, the <Link href="/stream" style={{ color: 'var(--info)' }}>stream</Link>, <Link href="/api#api-mcp" style={{ color: 'var(--info)' }}>MCP tools</Link> and the <Link href="/cases" style={{ color: 'var(--info)' }}>Caravan workbench</Link>; reports are absent.</p>
      </Section>

      <Section title="Customer categories" id="pm-customers">
        <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3" aria-label="Customer categories">
          {CUSTOMER_CATEGORIES.map((c) => (
            <li key={c.id} className="surface p-3 text-[12.5px]" data-customer={c.id}>
              <div className="font-medium" style={{ color: 'var(--text-heading)' }}>{c.title}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{c.need}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Economic architecture" id="pm-economics">
        <ol className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Economic architecture">
          {ECONOMIC_ARCHITECTURE.map((e) => (
            <li key={e.step} className="surface p-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 text-[13px]" data-step={e.step}>
              <span className="mono shrink-0" style={{ color: 'var(--text-muted)' }}>{e.step}</span>
              <span className="sm:w-[340px] shrink-0" style={{ color: 'var(--text-heading)' }}>{e.statement}</span>
              <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{e.inThisRepository}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-primary)' }}>{THESIS.separation}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Separation is recorded as governance on the corpus and as prohibited uses in every rights schedule; see the rights matrix on any <Link href="/releases" style={{ color: 'var(--info)' }}>release</Link>.</p>
      </Section>

      <Section title="Product architecture" id="pm-architecture">
        <pre className="m-0 surface-inset p-3 text-[12.5px] mono overflow-x-auto" aria-label="Product architecture tree" tabIndex={0}>{`${PRODUCT_ARCHITECTURE.company}
${PRODUCT_ARCHITECTURE.domains.map((d, i, a) => `${i === a.length - 1 ? '└─' : '├─'} ${d.label} — ${d.delivery} — ${d.scope.toLowerCase()}`).join('\n')}

   ${PRODUCT_ARCHITECTURE.terminal} — ${PRODUCT_ARCHITECTURE.terminalRole.toLowerCase()}`}</pre>
        <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3">
          {PRODUCT_ARCHITECTURE.domains.map((d) => (
            <li key={d.id} className="surface-inset p-3 text-[12.5px]" style={{ borderStyle: d.enabled ? 'solid' : 'dashed' }}>
              <div className="font-medium" style={{ color: d.enabled ? 'var(--text-heading)' : 'var(--text-muted)' }}>{d.label} <span className="label-sm">{d.delivery}</span> {!d.enabled && <span className="label-sm">declared</span>}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{d.scope}</div>
              {d.note && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{d.note}</div>}
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{THESIS.platform}</p>
      </Section>

      <Section title="Three states of information" id="pm-states">
        <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-3" aria-label="States of information">
          {INFORMATION_STATES.map((st) => (
            <li key={st.id} className="surface p-3 text-[12.5px] flex flex-col gap-1" data-information-state={st.id}>
              <div className="flex items-baseline gap-2"><span className="mono" style={{ color: 'var(--status-conditional)' }}>{st.symbol}</span><span className="font-medium" style={{ color: 'var(--text-heading)' }}>{st.title}</span></div>
              <div style={{ color: 'var(--text-secondary)' }}>{st.meaning}</div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{st.invariants.join(' · ')}</div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>Here: {st.inThisRepository} <Link href={st.where} style={{ color: 'var(--info)' }}>{st.where}</Link></div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Distinct identities, with the morphisms between them preserved rather than collapsed: {IDENTITY_CHAIN.join(' ≠ ')}.</p>
      </Section>

      <Section title="Doctrine" id="pm-doctrine">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Seven rules strong enough to be doctrine, each with where this repository enforces it and which tests prove it. <span className="mono">src/domain/doctrine.test.ts</span> fails if a named test disappears.</p>
        <ol className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Doctrine">
          {DOCTRINE.map((r) => (
            <li key={r.n} className="surface-inset p-2 text-[12.5px] flex flex-col gap-0.5" data-doctrine-rule={r.n}>
              <div><span className="mono" style={{ color: 'var(--text-muted)' }}>{r.n}</span> <span style={{ color: 'var(--text-heading)' }}>{r.rule}</span> <span style={{ color: 'var(--text-secondary)' }}>{r.meaning}</span></div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>Here: {r.enforcedHere}{r.where ? <> <Link href={r.where} style={{ color: 'var(--info)' }}>{r.where}</Link></> : null}</div>
              <div className="text-[11px] mono" style={{ color: 'var(--text-muted)' }}>{r.tests.join(' · ')}</div>
            </li>
          ))}
        </ol>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-heading)' }} data-testid="operational-rule">{OPERATIONAL_RULE}</p>
      </Section>

      <Section title="What exists in this repository" id="pm-presence">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-heading)' }}>{REFERENCE_IMPLEMENTATION.name}</span> — {REFERENCE_IMPLEMENTATION.role} {REFERENCE_IMPLEMENTATION.inThisRepository}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {ENGINES.map((e) => (
            <article key={e.id} className="surface p-3 flex flex-col gap-2" aria-labelledby={`engine-${e.id}`}>
              <h3 id={`engine-${e.id}`} className="m-0 text-[14px] font-semibold" style={{ color: 'var(--text-heading)' }}>{e.title}</h3>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{e.description}</p>
              <table className="ledger-table text-[12px]" aria-label={`${e.title}: presence`}>
                <thead><tr><th scope="col">Item</th><th scope="col">Presence</th></tr></thead>
                <tbody>
                  {e.inThisRepository.map((x) => (
                    <tr key={x.item} data-presence={x.presence}>
                      <td>{x.where ? <Link href={x.where} style={{ color: 'var(--text-primary)' }}>{x.item}</Link> : x.item}</td>
                      <td style={{ color: x.presence === 'ABSENT' ? 'var(--status-refused)' : x.presence === 'FIXTURE' ? 'var(--status-conditional)' : 'var(--text-secondary)' }}>{PRESENCE_LABEL[x.presence]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Shared OS coordination" id="pm-coordination">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The <Link href="/agents" style={{ color: 'var(--info)' }}>agent and apparatus stable</Link> records definitions, capabilities, and compatible input/output contracts. The <Link href="/board" style={{ color: 'var(--info)' }}>message board</Link> records requests, handoffs, blockers, results, and acknowledgements with corpus release context.</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Present as a local coordination prototype with a demonstration registry, participant inboxes, and JavaScript/Python clients. A manually started local worker reviews declared contracts and records results and receipts. The board does not launch workers, authenticate customers, or execute models.</p>
      </Section>

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

      <Section title="Estimation: one joint, its constraints, and what may not decide identity" id="pm-estimation">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{THE_JOINT.statement} {THE_JOINT.why} Nothing here solves anything: no factor is declared, no constraint is enforced, no solver is installed.</p>
        <ul className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2" aria-label="Kinds of factor">
          {FACTOR_KINDS.map((f) => (
            <li key={f.id} className="surface-inset p-2 text-[12px]" data-factor={f.id} data-factor-state={f.state}>
              <span style={{ color: 'var(--text-heading)' }}>{f.title}</span> <span style={{ color: f.state === 'ABSENT' ? 'var(--status-refused)' : 'var(--status-conditional)' }}>{f.state === 'ABSENT' ? 'Absent' : 'Material exists as data'}</span>
              <div style={{ color: 'var(--text-secondary)' }}>{f.what}</div>
              <div style={{ color: 'var(--text-muted)' }}>{f.from}</div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="constraint-identity">{CONSTRAINT_IS_AN_OBSERVATION.identity} {CONSTRAINT_IS_AN_OBSERVATION.consequence} {CONSTRAINT_IS_AN_OBSERVATION.neverLiterally}</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="How a constraint is enforced">
            <thead><tr><th scope="col">Method</th><th scope="col">What it does</th><th scope="col">When</th><th scope="col">Verdict</th></tr></thead>
            <tbody>
              {ENFORCEMENT_METHODS.map((m) => (
                <tr key={m.id} data-enforcement={m.id} data-verdict={m.verdict}>
                  <td style={{ color: 'var(--text-heading)' }}>{m.title}</td>
                  <td className="mono">{m.what}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{m.use}</td>
                  <td style={{ color: m.verdict === 'FORBIDDEN' ? 'var(--status-refused)' : m.verdict === 'RECOMMENDED' ? 'var(--check-passed)' : 'var(--text-secondary)' }}>{m.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }} data-testid="harvest-rule"><span className="label-sm">{HARVEST_RULE.rule}</span> {HARVEST_RULE.why} {HARVEST_RULE.therefore} Hard is for {HARDNESS_RULE.HARD.charAt(0).toLowerCase()}{HARDNESS_RULE.HARD.slice(1)}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">Violation tape</span> {VIOLATION_TAPE.meaning} {VIOLATION_TAPE.estate} {VIOLATION_TAPE.twoAnalyses}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}><span className="label-sm">Inequalities</span> {INEQUALITIES.truth} {INEQUALITIES.doNotConflate}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">Disagreement is representable</span> {DISAGREEMENT_IS_REPRESENTABLE.claim} {DISAGREEMENT_IS_REPRESENTABLE.contrast} Here: {DISAGREEMENT_IS_REPRESENTABLE.here}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }} data-testid="solver-boundary"><span className="label-sm">Two disciplines, before the first solve</span> {REPRODUCIBILITY.hazard} {REPRODUCIBILITY.discipline[0]} {SOLVER_NEVER_DECIDES.rule} {SOLVER_NEVER_DECIDES.whatIsNot} {SOLVER_ADOPTION.candidate} is a candidate solver for the factor layer, {SOLVER_ADOPTION.role.charAt(0).toLowerCase()}{SOLVER_ADOPTION.role.slice(1)} It waits for {SOLVER_ADOPTION.waitsFor.charAt(0).toLowerCase()}{SOLVER_ADOPTION.waitsFor.slice(1)}</p>
      </Section>

      <Section title="Scoring by what a record survives, and the channel that cannot score" id="pm-scoring">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Data earns credence by surviving declared checks. Four tiers, and the fourth is the one that compounds: recording the verdicts turns scoring into an estate rather than a gate. {VERDICTS_ARE_THE_ESTATE.difference}</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Filter tiers and what a pass is worth">
            <thead><tr><th scope="col">Tier</th><th scope="col">What it checks</th><th scope="col">What a pass is worth</th><th scope="col">Here</th></tr></thead>
            <tbody>
              {FILTER_TIERS.map((t) => (
                <tr key={t.id} data-filter-tier={t.id} data-filter-state={t.state}>
                  <td style={{ color: 'var(--text-heading)' }}>{t.title}</td>
                  <td>{t.what}</td>
                  <td style={{ color: 'var(--status-conditional)' }}>{t.worth}</td>
                  <td style={{ color: t.state === 'ABSENT' ? 'var(--status-refused)' : 'var(--text-muted)' }}>{t.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="m-0 p-0 list-none flex flex-col gap-1" aria-label="Where invariant scoring stops being sufficient">
          {FRAME_RISKS.map((r) => (
            <li key={r.id} className="surface-inset p-2 text-[12px]" data-frame-risk={r.id}>
              <span style={{ color: 'var(--text-heading)' }}>{r.title}</span>
              <div style={{ color: 'var(--text-secondary)' }}>{r.failure}</div>
              <div style={{ color: 'var(--status-conditional)' }}>{r.discipline}</div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} data-testid="reference-firewall"><span className="label-sm">The reference channel</span> {REFERENCE_CHANNEL.role} {REFERENCE_CHANNEL.firewall} {REFERENCE_CHANNEL.posture} Here: {REFERENCE_CHANNEL.here} ({REFERENCE_CHANNEL.hereTier.tier} {REFERENCE_CHANNEL.hereTier.name}, not reached.)</p>
      </Section>

      <Section title="Caravan: the vessel is the state, the port is a set" id="pm-maritime">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>The vessel is not a fifth source: meteorology drives it, imagery and ranging see it, dispatch commands it, and until now the state space had no object at that centre. Nothing is acquired — no position feed, no imagery, no port-call record, no charter.</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Channels that observe a vessel, and the one that does not">
            <thead><tr><th scope="col">Channel</th><th scope="col">Kind</th><th scope="col">What it fixes</th><th scope="col">How it fails</th></tr></thead>
            <tbody>
              {VESSEL_CHANNELS.map((c) => (
                <tr key={c.id} data-vessel-channel={c.id} data-channel-kind={c.kind}>
                  <td style={{ color: 'var(--text-heading)' }}>{c.title}</td>
                  <td style={{ color: c.kind === 'PRIOR' ? 'var(--status-conditional)' : 'var(--text-secondary)' }}>{c.kind === 'PRIOR' ? 'Prior, not an observation' : 'Observation'}</td>
                  <td>{c.fixes}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.failureMode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>State the corpus can carry today: {VESSEL_STATE.filter((c) => c.carried).map((c) => c.id).join(', ')}. Absent: {VESSEL_STATE.filter((c) => !c.carried).map((c) => c.id).join(', ')}.</p>
        <ul className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2" aria-label="The five joins">
          {VESSEL_JOINS.map((j) => (
            <li key={j.id} className="surface-inset p-2 text-[12px]" data-vessel-join={j.id}>
              <span style={{ color: 'var(--text-heading)' }}>{j.with}</span>
              <div style={{ color: 'var(--text-secondary)' }}>{j.operation}</div>
              <div style={{ color: 'var(--status-conditional)' }}>{j.hazard}</div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="closure-measurement">{CLOSURE_IS_THE_MEASUREMENT.what} {CLOSURE_IS_THE_MEASUREMENT.whyItIsTheMoat} Here: {CLOSURE_IS_THE_MEASUREMENT.here}</p>
        <ul className="m-0 pl-5 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }} aria-label="What a port set is not" data-testid="membership-ruling">
          {PORT_SET_LOSS.map((loss) => <li key={loss}>{loss}</li>)}
        </ul>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Set-level objects and what each prices">
            <thead><tr><th scope="col">Set object</th><th scope="col">What it prices</th><th scope="col">As a state</th></tr></thead>
            <tbody>
              {SET_OBJECTS.map((o) => (
                <tr key={o.id} data-set-object={o.id}>
                  <td style={{ color: 'var(--text-heading)' }}>{o.title}</td><td>{o.prices}</td><td style={{ color: 'var(--text-muted)' }}>{o.asAState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{SET_PRODUCTS.differentiator} {SET_PRODUCTS.notThis} {SET_PRODUCTS.archiveGated}</p>
      </Section>

      <Section title="The carrier: a punch card, not a proof" id="pm-carrier">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="not-credibility">{NOT_CREDIBILITY.whereCredibilityLives} {NOT_CREDIBILITY.soThen} {GENERAL_PROVING.what} is <span style={{ color: 'var(--status-refused)' }}>refused</span>: {GENERAL_PROVING.reasons.join(' ')}</p>
        <ul className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2" aria-label="What makes a card a card">
          {CARD_PROPERTIES.map((p) => (
            <li key={p.id} className="surface-inset p-2 text-[12px]" data-card-property={p.id} data-card-present={String(p.present)}>
              <span style={{ color: 'var(--text-heading)' }}>{p.title}</span> <span style={{ color: p.present ? 'var(--check-passed)' : 'var(--status-refused)' }}>{p.present ? 'Present' : 'Absent'}</span>
              <div style={{ color: 'var(--text-secondary)' }}>{p.what}</div>
              <div style={{ color: 'var(--text-muted)' }}>{p.here}</div>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-secondary)' }}><span className="label-sm">Congruence</span> {CONGRUENCE.claim} {CONGRUENCE.unification} {FROZEN_SIDE.payoff} {FROZEN_SIDE.butStill}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--status-conditional)' }} data-testid="mirrors-the-model">{MIRRORS_THE_MODEL.limit} {MIRRORS_THE_MODEL.danger} {MIRRORS_THE_MODEL.therefore}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} data-testid="authority-direction"><span className="label-sm">Interoperation</span> {AUTHORITY_DIRECTION.rightWay} {AUTHORITY_DIRECTION.residualIs} {AUTHORITY_DIRECTION.therefore}</p>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="composition-adjudication">{COMPOSITION_IS_ADJUDICATION.recognition} {COMPOSITION_IS_ADJUDICATION.differenceIsPolicy} {COMPOSITION_IS_ADJUDICATION.notThis}</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="The interop vocabulary, canonical">
            <thead><tr><th scope="col">Scene grammar</th><th scope="col">Here</th><th scope="col">Why the pairing holds</th></tr></thead>
            <tbody>
              {INTEROP_VOCABULARY.map((pair) => (
                <tr key={pair.ours} data-vocabulary-pair={pair.ours}>
                  <td className="mono">{pair.theirs}</td><td style={{ color: 'var(--text-heading)' }}>{pair.ours}</td><td style={{ color: 'var(--text-muted)' }}>{pair.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Where the doctrine is already someone's obligation" id="pm-actuarial">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="mandate-inversion">{MANDATE_INVERSION.claim} {MANDATE_INVERSION.because} {MANDATE_INVERSION.restraint}</p>
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="The actuarial correspondence">
            <thead><tr><th scope="col">Here</th><th scope="col">Theirs</th><th scope="col">Depth</th><th scope="col">Here, actually</th></tr></thead>
            <tbody>
              {CORRESPONDENCES.map((c) => (
                <tr key={c.ours} data-correspondence={c.depth}>
                  <td style={{ color: 'var(--text-heading)' }}>{c.ours}</td>
                  <td>{c.theirs}</td>
                  <td style={{ color: c.depth === 'IDENTICAL' ? 'var(--check-passed)' : c.depth === 'ADJACENT' ? 'var(--status-conditional)' : 'var(--text-secondary)' }}>{FIT_DEPTH_LABEL[c.depth]}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Conditional custody: the documentary credit, with receipts for documents" id="pm-custody">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{VEHICLE_ROLE.is} {VEHICLE_ROLE.why}</p>
        <ul className="m-0 pl-4 text-[12.5px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }} aria-label="Roles the vehicle refuses">
          {VEHICLE_ROLE.isNot.map((line) => <li key={line}>{line}</li>)}
        </ul>

        <h3 className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--text-heading)' }}>Release is irreversible and facts are not</h3>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          A chain settles at machine speed and a correction arrives at world speed. The gap between them is the whole
          liability of this role, and it is the one quantity a general-purpose oracle cannot represent, because an oracle
          publishes a value and has no notion of that value being restated later. Worked over the committed corpus:
        </p>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="A release decision and what happened to the facts afterwards" data-testid="custody-worked">
            <tbody>
              <tr data-custody-row="condition"><td>The condition</td><td>{condition.agreedText}</td></tr>
              <tr data-custody-row="decision"><td>Decided {fmtUtc(decision.decidedAtKnowledge)}</td><td><span className="id">{decision.verdict}</span> · <span className="id">{decision.standing}</span> — {decision.because}</td></tr>
              <tr data-custody-row="restatement"><td>What arrived later</td><td>{exposure.restatements.map((r) => `${r.retractionId} (${r.kind}) after ${(r.lagSeconds / 86_400).toFixed(1)} d`).join('; ') || 'Nothing.'}</td></tr>
              <tr data-custody-row="now" data-post-release={exposure.state}><td>The same condition now</td><td style={{ color: exposure.reversed ? 'var(--status-refused)' : 'var(--text-secondary)' }}><span className="id">{exposure.verdictNow}</span> · <span className="id">{exposure.state}</span> — {exposure.because}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} data-testid="custody-window">{window.statement}</p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} data-testid="custody-priceability">
          Priceability is a gate rather than a refusal: {window.unmet.join('; ')}. It flips on its own when the corpus earns it.
        </p>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="custody-exportable">
          Every oracle in production publishes a value and has no representation of that value being wrong later, because a feed
          has no correction tape. So under every conditional mechanism built on one there is an invisible tail risk — correct at
          settlement, incorrect afterwards, and no party able to state the exposure. What is computed above is not a fact about
          this vehicle: <span style={{ color: 'var(--text-heading)' }}>reversal exposure is a measurable property of a corpus</span>,
          and a feed-based architecture cannot compute it at any price because its history has nothing to compute over.
        </p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} data-testid="custody-neighbourhood">
          The decision carries the risk neighbourhood it was made in, bounded by its own clock so an audit cannot rebuild it with
          hindsight: at {fmtUtc(decision.decidedAtKnowledge)}, {decision.exposureAtDecision.statement}
        </p>

        <h3 className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--text-heading)' }}>The lifecycle, and what exists here for each stage</h3>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Vehicle lifecycle">
            <thead><tr><th scope="col">State</th><th scope="col">Machinery</th><th scope="col">Here</th></tr></thead>
            <tbody>
              {LIFECYCLE.map((stage) => (
                <tr key={stage.state} data-vehicle-state={stage.state}>
                  <td><span className="id">{stage.state}</span><div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{stage.what}</div></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{stage.machinery}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{stage.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--text-heading)' }}>What it must never do</h3>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Prohibitions and where each is enforced">
            <thead><tr><th scope="col">Never</th><th scope="col">Why</th><th scope="col">Enforced</th></tr></thead>
            <tbody>
              {NEVER.map((prohibition) => (
                <tr key={prohibition.act} data-never={prohibition.act}>
                  <td style={{ color: 'var(--status-refused)' }}>{prohibition.act}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{prohibition.why}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{prohibition.enforcedHere}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-heading)' }}>Attested:</span> {LIABILITY_BOUNDARY.attests} <span style={{ color: 'var(--text-heading)' }}>Not warranted:</span> {LIABILITY_BOUNDARY.doesNotWarrant} {LIABILITY_BOUNDARY.soADispute}</p>
        <h3 className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--text-heading)' }}>Where a release could execute, and whose trust governs</h3>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          The vehicle targets a property set rather than a venue: {VENUE_PROPERTIES.map((p) => p.property.toLowerCase()).join(', ')}.
          Any venue with those four can host one, and naming a chain in the design would bet the architecture on a vendor.
        </p>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Two kinds of attestor" data-testid="custody-attestors">
            <thead><tr><th scope="col">Attestor</th><th scope="col">Proves</th><th scope="col">Scarcity</th><th scope="col">Says nothing about</th></tr></thead>
            <tbody>
              {ATTESTOR_KINDS.map((attestor) => (
                <tr key={attestor.kind} data-attestor={attestor.kind}>
                  <td><span className="id">{attestor.kind}</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{attestor.proves}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{attestor.scarcity}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{attestor.saysNothingAbout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }} data-testid="custody-trust-order">
          <span style={{ color: 'var(--text-heading)' }}>First:</span> {TRUST_ORDER.first} <span style={{ color: 'var(--text-heading)' }}>Second:</span> {TRUST_ORDER.second} <span style={{ color: 'var(--text-heading)' }}>Third:</span> {TRUST_ORDER.third} {TRUST_ORDER.theConfusion}
        </p>
        <ol className="m-0 pl-4 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-muted)' }} aria-label="What is missing before any of this is real">
          {VEHICLE_SEQUENCE.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </Section>

      <Section title="What compresses, and what must not" id="pm-compression">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-heading)' }}>{WHAT_IS_BEING_CLAIMED.is}</span> {WHAT_IS_BEING_CLAIMED.isNot} {WHAT_IS_BEING_CLAIMED.theTest}
        </p>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} data-testid="compression-standing">{compression.statement}</p>
        {/* Two readings side by side, drawn as instruments. The meter shows its
            empty cells so the denominator is visible: five translation steps,
            and however many of them the corpus can currently carry.
            The meter is DERIVED and not UNKNOWN. How many steps collapse is
            computed from records the corpus holds and is a real number; what is
            unreadable is the admitted count beside it, which is why two of the
            five are unlit. Painting the whole meter as unknown would overstate
            the uncertainty, which is the same failure as understating it. */}
        <div className="flex flex-wrap items-end gap-6" data-testid="compression-instruments">
          <div className="min-w-[220px] flex-1 max-w-[380px]">
            <Segments
              label="Translation steps that collapse"
              filled={compression.availableNow}
              of={compression.translationSteps}
              state="DERIVED"
              testId="compression-meter"
            />
          </div>
          <Readout label="Admitted records" value={admitted.count} state="MEASURED" testId="admitted-readout" />
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }} data-testid="admitted-standing" data-admitted={String(admitted.count)}>
          {admitted.because}
        </p>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="The distrust stack, and which layer each step is in">
            <thead><tr><th scope="col">Today</th><th scope="col">Layer</th><th scope="col">Disposition</th></tr></thead>
            <tbody>
              {STACK.map((step) => (
                <tr key={step.id} data-stack-step={step.id} data-layer={step.layer}>
                  <td style={{ color: 'var(--text-secondary)' }}>{step.today}</td>
                  <td style={{ color: step.layer === 'JUDGMENT' ? 'var(--status-refused)' : 'var(--text-secondary)' }}>
                    <span className="id">{step.layer}</span>
                    {step.requires ? <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>needs {step.requires}</div> : null}
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-heading)' }}>{step.disposition}</span>
                    <div className="text-[11.5px] mono" style={{ color: 'var(--text-muted)' }}>{step.compressedBy ?? `answerable: ${step.answerable}`}</div>
                    {step.ifCompressed ? <div className="text-[11.5px]" style={{ color: 'var(--status-refused)' }}>{step.ifCompressed}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="The kinds of no, kept apart" id="pm-negative">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          Every data system has one negative state and calls it null. {WHY_ONE_IS_NOT_ENOUGH.ours} Each pair below, collapsed,
          produces a specific fabrication, and the fabrication is always in the same direction: a claim about the world manufactured
          out of a fact about records. {WHY_ONE_IS_NOT_ENOUGH.theTest}
        </p>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Named negative-state rules">
            <thead><tr><th scope="col">Rule</th><th scope="col">Kept apart from</th><th scope="col">What collapsing them fabricates</th></tr></thead>
            <tbody>
              {NEGATIVE_RULES.map((rule) => (
                <tr key={rule.id} data-negative-rule={rule.id}>
                  <td>
                    <span style={{ color: 'var(--text-heading)' }}>{rule.rule}</span>
                    <div className="text-[11.5px] mono" style={{ color: 'var(--text-muted)' }}>{rule.enforcedIn.module.replace('src/domain/', '')} · {rule.enforcedIn.symbol}</div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{rule.distinguishes[0]} <span style={{ color: 'var(--status-refused)' }}>≠</span> {rule.distinguishes[1]}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{rule.theFabrication}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What the additions cost, and what one acquisition would move" id="pm-accommodation">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{THE_FINDING.theSeedIsAlreadyHere}</p>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{THE_FINDING.andItCannotBeAdjudicated}</p>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{accommodation.statement}</p>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Every capability, what it waits on, and the mistake available to a reader">
            <thead><tr><th scope="col">Capability</th><th scope="col">Fit</th><th scope="col">Waiting on</th></tr></thead>
            <tbody>
              {capabilityFits.map((f) => (
                <tr key={f.capability.id} data-capability={f.capability.id} data-fit={f.fit}>
                  <td>
                    <span style={{ color: 'var(--text-heading)' }}>{f.capability.what}</span>
                    <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{f.capability.ifMistaken}</div>
                  </td>
                  <td style={{ color: f.fit === 'RUNS_TODAY' ? 'var(--status-conditional)' : f.fit === 'ONE_THING_AWAY' ? 'var(--text-secondary)' : 'var(--status-refused)' }}>
                    {FIT_LABEL[f.fit]}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{f.unmet.length ? f.unmet.map((u) => u.what.replace(/\.$/, '')).join('; ') : 'Nothing. It runs on what the repository holds.'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{THE_FINDING.order} {THE_FINDING.theOneThingBuildingCannotDo}</p>
        <h3 className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--text-heading)' }}>What the parts that already existed now owe</h3>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="ledger-table text-[12px]" aria-label="Pressure the additions put on existing parts">
            <thead><tr><th scope="col">On</th><th scope="col">Obligation</th><th scope="col">Absorbed</th></tr></thead>
            <tbody>
              {PRESSURE.map((pressure) => (
                <tr key={pressure.on} data-pressure={pressure.on} data-absorbed={pressure.absorbed}>
                  <td>
                    <span style={{ color: 'var(--text-heading)' }}>{pressure.on}</span>
                    <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{pressure.from}</div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{pressure.obligation}<div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{pressure.cost}</div></td>
                  <td style={{ color: pressure.absorbed ? 'var(--text-secondary)' : 'var(--status-refused)' }}>{pressure.absorbed ? 'Absorbed' : 'Owed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Verification tiers" id="pm-verification">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Verification is selective. An application chooses the tier it needs; this repository reaches the first two and claims no more.</p>
        <ol className="m-0 p-0 list-none grid gap-1 sm:grid-cols-2" aria-label="Verification tiers">
          {VERIFICATION_TIERS.map((t) => (
            <li key={t.tier} className="surface-inset p-2 text-[12.5px]" data-tier={t.tier} data-reached={t.reachedHere}>
              <span className="mono" style={{ color: t.reachedHere ? 'var(--check-passed)' : 'var(--text-muted)' }}>{t.tier}</span> <span style={{ color: 'var(--text-heading)' }}>{t.name}</span> <span className="text-[11.5px]" style={{ color: t.reachedHere ? 'var(--check-passed)' : 'var(--status-refused)' }}>{t.reachedHere ? 'reached' : 'not reached'}</span>
              <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{t.how}</div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="The value proposition, kept concrete" id="pm-value">
        <ul className="m-0 pl-4 text-[13px] flex flex-col gap-1">{VALUE_PROPOSITION.map((v) => <li key={v}>{v}</li>)}</ul>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Where each is demonstrated: <Link href="/stream" style={{ color: 'var(--info)' }}>as-of answers and bounds</Link> · <Link href="/releases" style={{ color: 'var(--info)' }}>certified release manifests</Link> · <Link href="/retractions" style={{ color: 'var(--info)' }}>push retractions</Link> · <Link href="/api" style={{ color: 'var(--info)' }}>provenance and rights on every delivered record, and automating against the feed</Link>.</p>
      </Section>
    </div>
  );
}
