import type { Metadata } from 'next';
import { Section } from '@/components/primitives/Section';
import {
  CAPABILITIES, CAPABILITY_KINDS, CAPABILITY_KIND_MEANING, CAPABILITY_RULE, CAPABILITY_SUBSYSTEMS,
  TOOL_CAPABILITY, TERMINAL_OPERATIONS, capabilitiesOf, type Capability, type CapabilityKind,
} from '@/domain/capabilityRegistry';
import { GENERIC_OPERATION_BLOCKER, OPERATE_WAITS_ON, PLUG_IN_RULE } from '@/domain/terminalPlane';

export const metadata: Metadata = { title: 'Capabilities' };

const KIND_COLOUR: Record<CapabilityKind, string> = {
  READ: 'var(--status-admitted)',
  OPERATE: 'var(--status-conditional)',
  ADMIT: 'var(--status-refused)',
};

const WIRED = new Set([...Object.values(TOOL_CAPABILITY), ...TERMINAL_OPERATIONS]);

/**
 * The registry drawn, from the same data the plane enforces.
 *
 * The operator's map and the plug-in contract used to be two things that could
 * disagree: a person read the pages, an integrator read the tool list, and
 * neither said what the substrate could actually do. This is one list. What a
 * terminal may ask for and what an operator can see here are the same rows,
 * and the plane refuses anything absent from them.
 *
 * Count implemented transports separately from live availability, which requires
 * authentication, configured storage, a fixed worker and permitted source data.
 */
export default function CapabilitiesPage() {
  const kinds = CAPABILITY_KINDS.map((kind) => ({ kind, count: CAPABILITIES.filter((c) => c.kind === kind).length }));
  const reachable = CAPABILITIES.filter((c) => WIRED.has(c.id)).length;
  const estates = CAPABILITIES.filter((c) => c.touchesEstates).length;

  return (
    <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3">
      <header className="flex flex-col gap-1 max-w-[900px]">
        <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Capabilities</h1>
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          What the substrate can do, and which of it a terminal can reach.
        </p>
      </header>

      <div className="surface px-3 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
        <span className="pill" style={{ color: 'var(--text-muted)' }}>REGISTRY</span>
        <span style={{ color: 'var(--accent)' }} data-testid="capability-standing">
          {CAPABILITIES.length} capabilities. {reachable} implemented terminal interfaces.
        </span>
        {kinds.map(({ kind, count }) => (
          <span key={kind} data-testid={`kind-count-${kind}`}>{count} {kind.toLowerCase()}</span>
        ))}
        <span>{estates} reach an estate</span>
      </div>

      <div className="surface p-3 flex flex-col gap-2">
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          {Object.keys(TOOL_CAPABILITY).length} governed reads and {TERMINAL_OPERATIONS.length} bounded HTTP mining method. Runtime availability is returned by authenticated discovery; implementation is not deployment or admission.
        </p>
        <p className="m-0 text-[13px]" data-testid="capability-rule" style={{ color: 'var(--text-primary)' }}>{CAPABILITY_RULE}</p>
        <p className="m-0 text-[12.5px]" data-testid="plug-in-rule" style={{ color: 'var(--text-secondary)' }}>{PLUG_IN_RULE}</p>
      </div>

      <Section title="Three kinds, and what the plane does with each" id="kinds">
        <div className="surface p-0 overflow-x-auto" tabIndex={0}>
          <table className="ledger-table w-full">
            <thead><tr><th scope="col">Kind</th><th scope="col">Count</th><th scope="col">What it means</th></tr></thead>
            <tbody>
              {kinds.map(({ kind, count }) => (
                <tr key={kind} data-testid={`kind-${kind}`}>
                  <td><span className="pill" style={{ color: KIND_COLOUR[kind] }}>{kind}</span></td>
                  <td className="tabular">{count}</td>
                  <td className="cell-wide">{CAPABILITY_KIND_MEANING[kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What an operate waits on" id="waits-on">
        <div className="surface p-3 flex flex-col gap-2 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          {/* Numbered, visibly: the order is the argument, and the estate's reset removes the markers. */}
          <ol className="m-0 pl-5 flex flex-col gap-1" style={{ listStyle: 'decimal outside' }}>
            {OPERATE_WAITS_ON.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p className="m-0" data-testid="generic-operation-boundary" style={{ color: 'var(--status-conditional)' }}>{GENERIC_OPERATION_BLOCKER}</p>
        </div>
      </Section>

      {CAPABILITY_SUBSYSTEMS.map((subsystem) => (
        <Section key={subsystem} title={subsystem} id={`area-${subsystem.replace(/\s+/g, '-').toLowerCase()}`}>
          <div className="surface p-0 overflow-x-auto" tabIndex={0}>
            <table className="ledger-table w-full" aria-label={`${subsystem} capabilities`}>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Does</th>
                  <th scope="col">Reachable today</th>
                  <th scope="col">Authority</th>
                </tr>
              </thead>
              <tbody>
                {capabilitiesOf(subsystem).map((capability) => (
                  <CapabilityRow key={capability.id} capability={capability} />
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
    </div>
  );
}

function CapabilityRow({ capability }: { capability: Capability }) {
  const wired = WIRED.has(capability.id);
  return (
    <tr data-testid={`capability-${capability.id}`} data-kind={capability.kind} data-wired={wired}>
      <td>
        <span className="id">{capability.id}</span>
        <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{capability.module}</span>
      </td>
      <td>
        <span className="pill" style={{ color: KIND_COLOUR[capability.kind] }}>{capability.kind}</span>
        {capability.touchesEstates ? (
          <span className="pill ml-1" style={{ color: 'var(--status-refused)' }} title="Reaches an estate: not served outside the firm">ESTATE</span>
        ) : null}
      </td>
      <td className="cell-wide">
        {capability.title}
        {capability.sideEffects ? (
          <span className="block text-[11px] mt-1" style={{ color: 'var(--status-conditional)' }}>
            Changes: {capability.sideEffects.join(' ')}
          </span>
        ) : null}
        {capability.serves ? (
          <span className="block text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Serves {capability.serves}</span>
        ) : null}
      </td>
      <td className="cell-wide" style={{ color: wired ? 'var(--status-admitted)' : 'var(--text-muted)' }}>
        {capability.reachableToday}
      </td>
      <td className="cell-wide" style={{ color: 'var(--text-muted)' }}>{capability.authorityNeeded}</td>
    </tr>
  );
}
