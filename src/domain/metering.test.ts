import { describe, expect, it } from 'vitest';
import { STANDARD_ATTESTATION_HEADERS } from '@/app/api/v1/_lib';
import { DELIVERY_LEDGER } from './correction';
import {
  ENVELOPE_TODAY, FEDERATION_RISK, INTEGRATION, METERING_BOUNDARY,
  METERING_LEDGER_IS_THE_DELIVERY_LEDGER, RECEIPT_FIELDS, TELEMETRY_PILLARS,
  USAGE_UNITS, meteringReadiness,
} from './metering';

describe('usage as telemetry', () => {
  it('names each unit of usage once, and counts none of them yet', () => {
    const ids = USAGE_UNITS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Nothing meters anything here. When something does, this is the test that changes.
    expect(USAGE_UNITS.every((u) => u.counted === false)).toBe(true);
    for (const u of USAGE_UNITS) expect(u.what.trim().length).toBeGreaterThan(40);
  });

  /**
   * The claim under test is "every response is receipted, so billing is
   * traceable by construction". It is half true, and the module must say which
   * half. If a response later carries the event fields, this test fails until
   * RECEIPT_FIELDS is updated to match — which is the intended signal.
   */
  it('reports the receipt gap instead of asserting the conclusion', () => {
    const readiness = meteringReadiness();
    expect(readiness.billableByConstruction).toBe(false);
    expect(readiness.carried).toEqual(['corpus_release', 'parameter_set_version', 'verification_rung', 'data_class']);
    expect(readiness.missing).toContain('response_id');
    expect(readiness.missing).toContain('recipient_id');
    expect(readiness.statement).toMatch(/not which response it is or who received it/);
  });

  it('keeps the carried fields in step with the headers a response actually sets', () => {
    const headers = Object.keys(STANDARD_ATTESTATION_HEADERS).map((h) => h.toLowerCase());
    const carried = RECEIPT_FIELDS.filter((f) => f.state === 'CARRIED');
    for (const field of carried) {
      const header = `x-payload-${field.field.replace(/_version$/, '').replace(/_/g, '-')}`;
      expect(headers, `${field.field} is claimed carried, so a response header should set it`).toContain(header);
    }
    // Every carried field is content; every missing field is event. That split is the finding.
    expect(carried.every((f) => f.half === 'CONTENT')).toBe(true);
    expect(RECEIPT_FIELDS.filter((f) => f.state === 'ABSENT').every((f) => f.half === 'EVENT')).toBe(true);
  });

  it('will not let a synthetic demonstration read as billable', () => {
    expect(ENVELOPE_TODAY.dataClass).toBe('synthetic');
    expect(ENVELOPE_TODAY.note).toMatch(/a lap over a demonstration is not a lap/);
  });

  it('meters usage and refuses to become the rails', () => {
    expect(METERING_BOUNDARY.posture).toMatch(/License prepared data and analytics packages/);
    const roles = METERING_BOUNDARY.notThis.map((n) => n.role);
    expect(roles).toContain('Settlement participant');
    expect(roles).toContain('The tax');
    for (const n of METERING_BOUNDARY.notThis) expect(n.why.trim().length).toBeGreaterThan(40);
    expect(METERING_BOUNDARY.instead).toMatch(/internal compute usage does not establish a customer charge/);
    expect(USAGE_UNITS.map((unit) => unit.id)).not.toContain('CLEAN_ROOM_HOUR');
  });

  it('chooses the dependency posture and records the provider one as rejected', () => {
    expect(INTEGRATION.chosen).toBe('DEPENDENCY');
    expect(INTEGRATION.dependency.state).toBe('ABSENT');
    expect(INTEGRATION.provider.state).toBe('REJECTED');
    expect(INTEGRATION.provider.why).toMatch(/settlement participant/);
  });

  it('states the federation defence as work to do, not as protection already held', () => {
    expect(FEDERATION_RISK.whatCannotBePooled.length).toBe(3);
    expect(FEDERATION_RISK.here).toMatch(/Issued-identifier resolution and source-comparison mechanisms exist/);
    expect(FEDERATION_RISK.here).toMatch(/not a claim about what protects the firm today/);
  });

  it('describes licensed information and its internal support without offering compute or capital services', () => {
    expect(TELEMETRY_PILLARS.length).toBe(3);
    expect(TELEMETRY_PILLARS.map((entry) => entry.pillar)).toEqual(['Licensed data and analytics', 'Internal preparation', 'Delivery and correction records']);
    expect(TELEMETRY_PILLARS[2].here).toMatch(/prohibited proprietary strategy and trading/);
  });

  it('points the metering ledger at the delivery ledger rather than defining a second one', () => {
    expect(METERING_LEDGER_IS_THE_DELIVERY_LEDGER.specifiedAt).toMatch(/DELIVERY_LEDGER/);
    expect(METERING_LEDGER_IS_THE_DELIVERY_LEDGER.state).toBe(DELIVERY_LEDGER.state);
    expect(DELIVERY_LEDGER.fields).toContain('recipientId');
  });
});
