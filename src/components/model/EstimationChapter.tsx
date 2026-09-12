import { AUTHORITY_DIRECTION, CARD_PROPERTIES, CONGRUENCE, FROZEN_SIDE, GENERAL_PROVING, MIRRORS_THE_MODEL, NOT_CREDIBILITY } from '@/domain/computationCarrier';
import { CLOSURE_IS_THE_MEASUREMENT, VESSEL_CHANNELS, VESSEL_JOINS, VESSEL_STATE } from '@/domain/vessel';
import { COMPOSITION_IS_ADJUDICATION, INTEROP_VOCABULARY } from '@/domain/usdProjection';
import { CONSTRAINT_IS_AN_OBSERVATION, ENFORCEMENT_METHODS, HARDNESS_RULE, HARVEST_RULE, INEQUALITIES, VIOLATION_TAPE } from '@/domain/constraints';
import { FACTOR_KINDS, DISAGREEMENT_IS_REPRESENTABLE, REPRODUCIBILITY, SOLVER_ADOPTION, SOLVER_NEVER_DECIDES, THE_JOINT } from '@/domain/factorGraph';
import { FILTER_TIERS, FRAME_RISKS, REFERENCE_CHANNEL, VERDICTS_ARE_THE_ESTATE } from '@/domain/invariantScoring';
import { PORT_SET_LOSS, SET_OBJECTS, SET_PRODUCTS } from '@/domain/portSet';
import { Section } from '@/components/primitives/Section';

/**
 * Chapter three of the operating model: estimation, scoring, the vessel and the carrier. Nothing here solves, scores, acquires or proves anything; each section says so.
 */
export function EstimationChapter() {
  return (
    <>
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
    </>
  );
}
