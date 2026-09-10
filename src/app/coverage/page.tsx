import type { Metadata } from 'next';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Section } from '@/components/primitives/Section';
import { CoverageRegister } from '@/components/corpora/CoverageRegister';
import {
  COMMERCIALIZATION, COMMERCIALIZATION_NOTES, CORRIDOR_EXAMPLE, CORRIDOR_RULES, CORRIDOR_UNIT,
  COVERAGE_LEVELS, COMMERCIAL_HYPOTHESIS, CONFIRMATION_ROUTE, EXPANSION_SEQUENCE, FIRST_WORKFLOW,
  GEOGRAPHIC_DIMENSIONS, GEOGRAPHIC_MANDATE, HYPOTHESIS_COROLLARY, MANDATE_STANDING, MODULE_RULE,
  NOT_A_REASON, PROMOTION_RULE, REGIONAL_MODULE_CONTENTS, SECOND_MARKET_TEST, SEPARATION_PROHIBITIONS,
  SEPARATION_RULE, SHARED_SUBSTRATE, STRATEGIC_DISTINCTION,
} from '@/domain/coverageUniverse';

export const metadata: Metadata = { title: 'Coverage universe' };

/**
 * The priority coverage universe: where evidence is built, and to what depth.
 *
 * `/corpora` says what is assembled. This says where, for whom and how deeply,
 * and the two are separate pages because they are separate questions. The
 * corridor is the join: a product or process, its supplier facilities, its
 * transport dependencies, its destination requirements and the buyer's
 * commitments, assembled from the eight corpora and maintained at one of three
 * coverage levels.
 */
export default function CoveragePage() {
  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Coverage universe</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          Where the firm builds evidence, and to what depth. Broad reference coverage across selected regions,
          deep evidence around customer-dependent industrial corridors.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>SPECIFICATION</span>
        <span style={{ color: 'var(--accent)' }}>No region is entered and no corridor is maintained.</span>
        <span>Six regions are the coverage ambition, not a promise of equally deep coverage of six enormous regions.</span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="label-sm m-0">The geographic mandate</p>
        <p className="m-0 text-[13px]" data-testid="geographic-mandate" style={{ color: 'var(--text-primary)' }}>{GEOGRAPHIC_MANDATE}</p>
        <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{MANDATE_STANDING}</p>
        <div className="mt-1">
          <p className="label-sm m-0 mb-1.5">The distinction it turns on</p>
          <ChainFigure objects={STRATEGIC_DISTINCTION} label="The strategic distinction" />
        </div>
      </div>

      <CoverageRegister />

      <Section title="The unit of coverage is a corridor, not a country" id="corridor">
        <div className="surface p-3 flex flex-col gap-2">
          <ChainFigure objects={CORRIDOR_UNIT} label="What a corridor is made of" />
          <p className="m-0 text-[12.5px]" data-testid="corridor-example" style={{ color: 'var(--text-secondary)' }}>
            <span className="label-sm">For example</span> {CORRIDOR_EXAMPLE}
          </p>
          <ul className="m-0 pl-4 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }} data-testid="corridor-rules">
            {CORRIDOR_RULES.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </div>
      </Section>

      <Section title="Three coverage levels, and what may be sold from each" id="levels">
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Coverage levels">
            <thead><tr>
              <th scope="col">Level</th><th scope="col">What is maintained</th>
              <th scope="col">What may reasonably be sold</th><th scope="col">What it does not support</th>
            </tr></thead>
            <tbody>
              {COVERAGE_LEVELS.map((level) => (
                <tr key={level.id}>
                  <td><span className="mono">{level.order}</span> {level.name}</td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{level.maintains}</td>
                  <td className="text-[12px]">{level.mayBeSold}</td>
                  <td className="text-[12px]" style={{ color: 'var(--status-conditional)' }}>{level.doesNotSupport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[12px]" data-testid="promotion-rule" style={{ color: 'var(--text-secondary)' }}>{PROMOTION_RULE}</p>
      </Section>

      <Section title="Three geographic dimensions, kept apart" id="dimensions">
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Geographic dimensions">
            <thead><tr><th scope="col">Dimension</th><th scope="col">What it determines</th></tr></thead>
            <tbody>
              {GEOGRAPHIC_DIMENSIONS.map((dimension) => (
                <tr key={dimension.dimension}>
                  <td>{dimension.dimension}</td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{dimension.determines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="commercialization"><span className="label-sm">Commercialization</span> {COMMERCIALIZATION}</p>
          <ul className="m-0 pl-4 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
            {COMMERCIALIZATION_NOTES.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      </Section>

      <Section title="Why these regions" id="hypothesis">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="hypothesis" style={{ color: 'var(--text-secondary)' }}>{COMMERCIAL_HYPOTHESIS}</p>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>{HYPOTHESIS_COROLLARY}</p>
        </div>
      </Section>

      <Section title="Regional modules, not separate platforms" id="modules">
        <div className="surface p-3 grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
          <div className="min-w-0">
            <p className="label-sm m-0 mb-1.5">A regional evidence module carries</p>
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
              {REGIONAL_MODULE_CONTENTS.map((entry) => <li key={entry} className="pill" style={{ color: 'var(--text-secondary)' }}>{entry}</li>)}
            </ul>
          </div>
          <div className="min-w-0">
            <p className="label-sm m-0 mb-1.5">The shared substrate keeps supplying</p>
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
              {SHARED_SUBSTRATE.map((entry) => <li key={entry} className="pill" style={{ color: 'var(--accent)' }}>{entry}</li>)}
            </ul>
          </div>
          <p className="m-0 md:col-span-2 text-[12px]" data-testid="module-rule" style={{ color: 'var(--text-secondary)' }}>{MODULE_RULE}</p>
        </div>
      </Section>

      <Section title="Jurisdiction, condition and uncertainty stay separate" id="separation">
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[13px]" data-testid="separation-rule" style={{ color: 'var(--text-primary)' }}>{SEPARATION_RULE}</p>
          <ul className="m-0 pl-4 text-[12.5px] flex flex-col gap-1" data-testid="separation-prohibitions" style={{ color: 'var(--status-conditional)' }}>
            {SEPARATION_PROHIBITIONS.map((prohibition) => <li key={prohibition}>{prohibition}</li>)}
          </ul>
          <p className="m-0 text-[12px]" data-testid="confirmation-route" style={{ color: 'var(--text-secondary)' }}>{CONFIRMATION_ROUTE}</p>
        </div>
      </Section>

      <Section title="How the first expansion goes" id="expansion">
        <div className="surface overflow-x-auto" tabIndex={0}>
          <table className="ledger-table" aria-label="Expansion sequence">
            <thead><tr><th scope="col">Step</th><th scope="col">Why it is that way round</th></tr></thead>
            <tbody>
              {EXPANSION_SEQUENCE.map((step) => (
                <tr key={step.order}>
                  <td className="text-[12.5px]"><span className="mono">{step.order}</span> {step.step}</td>
                  <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{step.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="surface p-3 flex flex-col gap-2">
          <p className="m-0 text-[12.5px]" data-testid="first-workflow" style={{ color: 'var(--text-secondary)' }}>{FIRST_WORKFLOW}</p>
          <div>
            <p className="label-sm m-0 mb-1.5">The second market is chosen on these, in no fixed order</p>
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
              {SECOND_MARKET_TEST.map((test) => <li key={test} className="pill" style={{ color: 'var(--text-secondary)' }}>{test}</li>)}
            </ul>
          </div>
          <p className="m-0 text-[12px]" data-testid="not-a-reason" style={{ color: 'var(--status-conditional)' }}>
            <span className="label-sm">Not a reason</span> {NOT_A_REASON}
          </p>
        </div>
      </Section>
    </div>
  );
}
