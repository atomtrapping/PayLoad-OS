import { ATTESTOR_KINDS, LIABILITY_BOUNDARY, scalar, LIFECYCLE, NEVER, TRUST_ORDER, VEHICLE_ROLE, VEHICLE_SEQUENCE, VENUE_PROPERTIES, evaluateRelease, exposureAfter, restatementExposure, type ReleaseCondition } from '@/domain/collateralVehicle';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { CORRESPONDENCES, FIT_DEPTH_LABEL, MANDATE_INVERSION } from '@/domain/actuarial';
import { NEGATIVE_RULES, WHY_ONE_IS_NOT_ENOUGH } from '@/domain/negativeStates';
import { Readout, Segments } from '@/components/hud/Instrument';
import { STACK, WHAT_IS_BEING_CLAIMED, compressionAvailable } from '@/domain/compression';
import { Section } from '@/components/primitives/Section';
import { currentRelease } from '@/domain/corpus';
import { fmtUtc } from '@/lib/format';
import { getCorpusSource } from '@/adapter/corpusSource';

/**
 * Chapter four of the operating model. The custody section works one release condition through the corpus's own correction, and the compression section reads the admitted count from the store the adapter can reach, so it is async and reports UNKNOWN when there is none.
 */
export async function ObligationsChapter() {
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
  // which is the mistake this chapter renders a table about two sections down.
  const admitted = await getCorpusSource().admittedRecords();
  const compression = compressionAvailable(CARAVAN_CORPUS, admitted.count);
  return (
    <>
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
    </>
  );
}
