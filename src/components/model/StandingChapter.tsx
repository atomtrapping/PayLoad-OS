import Link from 'next/link';
import { CAPABILITIES, PRESSURE, THE_FINDING, accommodationStanding, fitOf } from '@/domain/accommodation';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { Section } from '@/components/primitives/Section';
import { VALUE_PROPOSITION } from '@/domain/product';
import { VERIFICATION_TIERS } from '@/domain/doctrine';

/**
 * Chapter five of the operating model: every capability with its derived fit, the pressure on what already existed, the verification tiers reached, and the value proposition.
 */
const FIT_LABEL = {
  RUNS_TODAY: 'Runs today',
  ONE_THING_AWAY: 'One thing away',
  SEVERAL_THINGS_AWAY: 'Several things away',
} as const;

export function StandingChapter() {
  const capabilityFits = CAPABILITIES.map((capability) => fitOf(capability, CARAVAN_CORPUS));
  const accommodation = accommodationStanding(CARAVAN_CORPUS);

  return (
    <>
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
    </>
  );
}
