import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import { ClassRegister } from '@/components/discovery/ClassRegister';
import { MiningRun } from '@/components/discovery/MiningRun';
import { demonstrationMining } from '@/discovery/demonstrationRun';
import {
  ACQUISITION_LOOP, CLASS_CONTRACTS, DERIVATION_RULE, DISCOVERY_BLOCKED_ON,
  EXECUTION_IS_NOT_VALIDITY, FLYWHEEL, GAP_LOOP, GAP_LOOP_RULE, INFERENCE_CONTRACT,
  INFORMATION_CAPITAL, LAYER_POSITION, MINING_CONTRACTS, PRESCRIPTIVE_BOUNDARY,
  RIGHTS_INHERITANCE_RULE, SUBSTRATE_RULE, SUBSTRATE_WORKLOADS, VALIDATION_RECORD,
  VALIDATION_RULE, WORKLOAD_IDENTITY_CONTRACTS, discoveryStanding,
} from '@/domain/discoveryLayer';

export const metadata: Metadata = { title: 'Computational discovery' };

/**
 * The layer that produces information the corpus was not told.
 *
 * Everything at `/corpora` and `/coverage` describes what would be acquired.
 * This describes what would be computed from it once acquired — and the page
 * exists mainly to make one distinction visible, because it is the one that
 * costs money when it is lost: a claim the corpus computed is not a claim a
 * source made.
 */
export default function DiscoveryPage() {
  const standing = discoveryStanding();
  const mining = demonstrationMining();
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Computational discovery</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          Information produced from the accumulated corpus rather than acquired into it, and the classes
          that keep it distinguishable from evidence.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>CONTRACT</span>
        <span style={{ color: 'var(--accent)' }} data-testid="derivation-count">
          {standing.derivations} derivations over admitted evidence.
        </span>
        <span>{DISCOVERY_BLOCKED_ON[1]}</span>
        <span data-testid="demonstration-count">
          The engine below has run {mining.counts.runs} times over the demonstration corpus and produced{' '}
          {mining.counts.artifacts} artifacts. Those are not derivations over admitted evidence, and the count
          beside them stays where it is.
        </span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="label-sm m-0">The distinction the layer exists to hold</p>
        <p className="m-0 text-[13px]" data-testid="derivation-rule" style={{ color: 'var(--text-primary)' }}>
          A graph algorithm discovering a likely dependency must never silently become equivalent to a
          bill of lading establishing that dependency.
        </p>
        <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{DERIVATION_RULE}</p>
        <div className="mt-1">
          <p className="label-sm m-0 mb-1.5">Where the layer sits</p>
          <ChainFigure objects={LAYER_POSITION} label="Where the discovery layer sits" emphasise="Computational discovery" />
        </div>
      </div>

      <ClassRegister />

      <Section title="Four kinds of question, in increasing order of commitment" id="kinds">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead>
              <tr><th scope="col">Kind</th><th scope="col">Question</th><th scope="col">Yields</th><th scope="col">Produces</th></tr>
            </thead>
            <tbody>
              {MINING_CONTRACTS.map((contract) => (
                <tr key={contract.kind} data-testid={`kind-${contract.kind}`}>
                  <td><span className="id">{contract.kind}</span></td>
                  <td className="cell-wide">{contract.question}</td>
                  <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{contract.yields.join(', ')}</td>
                  <td><span className="pill">{contract.produces}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{PRESCRIPTIVE_BOUNDARY}</p>
      </Section>

      <Section title="A workload, a run and an artifact are three things" id="identities">
        <div className="surface p-3 flex flex-col gap-2">
          {WORKLOAD_IDENTITY_CONTRACTS.map((contract) => (
            <div key={contract.identity} className="flex flex-col gap-0.5">
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>
                <span className="id">{contract.identity}</span> — {contract.is}
              </p>
              <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{contract.collapsing}</p>
            </div>
          ))}
          <p className="m-0 mt-1 text-[12.5px]" data-testid="execution-is-not-validity" style={{ color: 'var(--accent)' }}>
            {EXECUTION_IS_NOT_VALIDITY}
          </p>
        </div>
      </Section>

      <Section title="What a derivation must retain to be re-examinable" id="retained">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Field</th><th scope="col">Answers</th><th scope="col">Required for</th></tr></thead>
            <tbody>
              {INFERENCE_CONTRACT.map((field) => (
                <tr key={field.field}>
                  <td><span className="id">{field.field}</span></td>
                  <td className="cell-wide">{field.answers}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{field.requiredFor.length === 4 ? 'every derived class' : field.requiredFor.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{VALIDATION_RULE}</p>
      </Section>

      <Section title="A validation says what would have counted as passing" id="validation">
        <div className="surface p-3 flex flex-col gap-1.5">
          {VALIDATION_RECORD.map((field) => (
            <p key={field.field} className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="id">{field.field}</span> — {field.answers}
            </p>
          ))}
        </div>
      </Section>

      <Section title="Rights descend into the result" id="rights">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[13px]" data-testid="rights-rule" style={{ color: 'var(--text-primary)' }}>{RIGHTS_INHERITANCE_RULE}</p>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            Computation is not a laundering step for rights any more than it is one for evidence. The floor is
            computed from the records each claim actually read, not declared on the artifact.
          </p>
        </div>
      </Section>

      <Section title="Which substrate answers which question" id="substrates">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Substrate</th><th scope="col">Workload</th><th scope="col">Held today</th></tr></thead>
            <tbody>
              {SUBSTRATE_WORKLOADS.map((entry) => (
                <tr key={entry.substrate}>
                  <td><span className="id">{entry.substrate}</span></td>
                  <td className="cell-wide">{entry.workload}</td>
                  <td><span className="pill" style={{ color: entry.present ? 'var(--ok)' : 'var(--text-muted)' }}>{entry.present ? 'PRESENT' : 'ABSENT'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{SUBSTRATE_RULE}</p>
      </Section>

      <Section title="The engine, run" id="run">
        <div className="surface p-3 flex flex-col gap-3">
          {/* The basis first, because everything under it is a statement about
              a demonstration corpus and a reader who scrolls past this line
              would read it as a statement about the world. */}
          <p className="m-0 text-[12.5px]" data-testid="mining-basis" style={{ color: 'var(--status-conditional)' }}>{mining.basis}</p>

          <div className="flex flex-col gap-1">
            <p className="label-sm m-0">One computation</p>
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>
              <span className="id">{mining.spec.workloadId}</span> — {mining.spec.miningKind.toLowerCase()}, produces{' '}
              {mining.spec.producesClass}, {mining.spec.arithmetic.replace(/_/g, ' ').toLowerCase()} arithmetic,
              minimum {String((mining.spec.parameters as { minRecords?: unknown }).minRecords)} claims per subject.
            </p>
            <p className="m-0 text-[11.5px] mono break-all" data-testid="spec-fingerprint" style={{ color: 'var(--text-muted)' }}>
              {mining.spec.specFingerprint}
            </p>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              The identity of the computation, not of any execution: method, parameters, implementation, output
              schema and produced class. Every run below carries it, and changing the parameter would change it.
            </p>
          </div>

          <div className="surface p-0 overflow-x-auto" tabIndex={0}>
            <table className="ledger-table w-full" aria-label="Runs of the workload">
              <thead><tr>
                <th scope="col">Line</th><th scope="col">Release</th><th scope="col">Read</th>
                <th scope="col">Taken back</th><th scope="col">Artifacts</th><th scope="col">Read as</th>
              </tr></thead>
              <tbody>
                {mining.runs.map((run) => (
                  <tr key={run.result.runId} data-run={run.result.runId} data-status={run.result.status}>
                    <td><span className="pill">{run.domain}</span></td>
                    <td className="text-[12px] mono">{run.releaseId}</td>
                    <td className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{run.read}</td>
                    <td className="text-[12px]" data-taken-back={run.takenBack.length} style={{ color: 'var(--status-conditional)' }}>
                      {run.takenBack.length === 0 ? '—' : run.takenBack.map((entry) => `${entry.recordId} (${entry.kind.toLowerCase()})`).join(', ')}
                    </td>
                    <td className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{run.result.artifacts.length}</td>
                    <td className="text-[11.5px] mono break-all" style={{ color: 'var(--text-muted)' }}>{run.result.inputFingerprint.slice(0, 23)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[11.5px]" data-testid="taken-back-rule" style={{ color: 'var(--text-muted)' }}>
            One spec fingerprint across three runs, three different input fingerprints: a re-run is not a second
            result, and a different input is not a different computation. {mining.counts.recordsTakenBack} records
            were withdrawn or corrected and none of them was read — a computation does not read what the corpus
            took back, and a correction read alongside its replacement would count the same claim twice.
          </p>
        </div>

        <MiningRun mining={mining} />

        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="not-served" style={{ color: 'var(--text-secondary)' }}>{mining.notServedBecause}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            What may be done with all of it together: {mining.rightsFloor.join(', ')} — the intersection across
            every artifact, which is narrower than any one of them and is the only honest floor for the set.
          </p>
          <p className="m-0 text-[12px]" data-testid="proposals-count" style={{ color: 'var(--text-muted)' }}>
            {mining.counts.gaps} gaps detected, {mining.counts.proposals} acquisition proposals written, none
            authorized. {mining.proposalRule}
          </p>
        </div>
      </Section>

      <Section title="The corpus directing its own acquisition" id="loop">
        <div className="surface p-3 flex flex-col gap-3">
          <div>
            <p className="label-sm m-0 mb-1.5">The acquisition loop</p>
            <ChainFigure objects={ACQUISITION_LOOP} label="The acquisition loop" emphasise="Identify uncertainty" />
          </div>
          <div>
            <p className="label-sm m-0 mb-1.5">And where a detected gap goes</p>
            <ChainFigure objects={GAP_LOOP} label="The gap loop" emphasise="AcquisitionProposal" />
            <p className="m-0 mt-2 text-[12px]" data-testid="gap-loop-rule" style={{ color: 'var(--text-secondary)' }}>{GAP_LOOP_RULE}</p>
          </div>
          <div>
            <p className="label-sm m-0 mb-1.5">The flywheel it turns</p>
            <ChainFigure objects={FLYWHEEL} label="The information flywheel" />
          </div>
        </div>
      </Section>

      <Section title="What accumulates that cannot be bought" id="capital">
        <div className="surface p-3">
          <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            A competitor can buy the same customs dataset. They cannot buy {INFORMATION_CAPITAL.slice(0, -1).join(', ')} or {INFORMATION_CAPITAL.at(-1)} —
            those come from having operated a corpus, and this one holds {standing.derivations} derivations so far.
          </p>
        </div>
      </Section>

      <p className="m-0 px-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
        {CLASS_CONTRACTS.length} claim classes. {MINING_CONTRACTS.length} mining kinds. {standing.substratesPresent} of {SUBSTRATE_WORKLOADS.length} substrates held.
      </p>
    </div>
  );
}
