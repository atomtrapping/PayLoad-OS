import { describe, expect, it } from 'vitest';
import { PERMITTED_USES } from './corpus';
import { MCP_TOOLS } from '@/mcp/tools';
import { RECEIPT_FIELDS } from './metering';
import { GENERAL_PROVING } from './computationCarrier';
import {
  ATTESTATION_COSTS, ATTESTATION_PRECONDITIONS, CALLER_IS_A_SOURCE, POLICY_ATTESTATION, INTENT_IS_THE_UPGRADE, PURPOSE_SHAPING, TRANSPORT_AXES,
  TWO_PART_RULE, servingStanding,
} from './servingBoundary';

describe('two transports, compared on five axes', () => {
  it('gives each axis a question and both answers', () => {
    expect(TRANSPORT_AXES).toHaveLength(5);
    for (const a of TRANSPORT_AXES) {
      expect(a.question.endsWith('?')).toBe(true);
      expect(a.openSurface.trim().length).toBeGreaterThan(40);
      expect(a.toolSurface.trim().length).toBeGreaterThan(40);
    }
  });

  it('refuses to claim the tool surface wins the axis it does not', () => {
    const retention = TRANSPORT_AXES.find((a) => a.axis === 'RETENTION')!;
    expect(retention.stronger).toBe('NEITHER');
    expect(retention.toolSurface).toMatch(/and worse/);
    // Four axes favour the tool surface; the fifth is honest about not doing so.
    expect(TRANSPORT_AXES.filter((a) => a.stronger === 'TOOL_SURFACE')).toHaveLength(4);
  });

  it('names intent as the upgrade, and declaring a purpose as not proving one', () => {
    expect(INTENT_IS_THE_UPGRADE.claim).toMatch(/executable at the boundary instead of asserted in a contract/);
    expect(INTENT_IS_THE_UPGRADE.because).toContain(String(PERMITTED_USES.length));
    expect(INTENT_IS_THE_UPGRADE.notASubstitute).toMatch(/not proof of one/);
  });
});

describe('the rule transport does not change', () => {
  it('serves the corpus under a purpose and the estates never', () => {
    expect(TWO_PART_RULE.serve).toMatch(/under a purpose/);
    expect(TWO_PART_RULE.neverServe).toMatch(/on any transport/);
    expect(TWO_PART_RULE.estates).toHaveLength(4);
    expect(TWO_PART_RULE.why).toMatch(/inventory and the estates are the business/);
  });

  it('shapes an answer by purpose, and refuses training at the type level', () => {
    const training = PURPOSE_SHAPING.find((p) => p.purpose === 'Model training')!;
    expect(training.shape).toMatch(/Refused at the type level, not rate-limited/);
    expect(training.reason).toMatch(/no longer carries its receipts/);
    for (const p of PURPOSE_SHAPING) expect(p.reason.trim().length).toBeGreaterThan(40);
  });

  it('treats a caller as a source, sharing its fields with the bill', () => {
    expect(CALLER_IS_A_SOURCE.soThen).toMatch(/not a defence against a first pull/);
    expect(CALLER_IS_A_SOURCE.sharedWithBilling).toMatch(/neither exists/);
    // The same three fields the metering receipt is missing.
    const missing = RECEIPT_FIELDS.filter((f) => f.state === 'ABSENT').map((f) => f.field);
    expect(missing).toContain('recipient_id');
    expect(missing).toContain('served_at');
  });
});

describe('what exists', () => {
  it('says the argument is about what could be enforced, and that none of it is', () => {
    const standing = servingStanding();
    expect(standing.tools).toBe(MCP_TOOLS.length);
    expect(standing.callersIdentified).toBe(0);
    expect(standing.purposesDeclarable).toBe(0);
    expect(standing.rightsEvaluatedPerCaller).toBe(false);
    expect(standing.statement).toMatch(/against a declared viewer class rather than against a party/);
    expect(standing.statement).toMatch(/none of it is enforced yet/);
  });
});

describe('attesting the policy, which is not attesting the corpus', () => {
  it('does not contradict the refusal it sits beside', () => {
    // General proving of corpus computation stays refused; this is a different boundary.
    expect(GENERAL_PROVING.state).toBe('REFUSED');
    expect(POLICY_ATTESTATION.compatibleWithTheRefusal).toMatch(/stays refused/);
    expect(POLICY_ATTESTATION.compatibleWithTheRefusal).toMatch(/enforcement rather than credibility/);
    expect(POLICY_ATTESTATION.inversion).toMatch(/prove the policy ran/);
  });

  it('claims the three things it buys, and the two it does not', () => {
    expect(POLICY_ATTESTATION.buys).toHaveLength(3);
    expect(POLICY_ATTESTATION.buys.map((b) => b.property)).toContain('Selective disclosure');
    expect(POLICY_ATTESTATION.answers).toMatch(/partly/);
    // No cryptography fixes an architecture error.
    expect(POLICY_ATTESTATION.doesNotAnswer).toMatch(/because they are unserved, not because they are proven unserved/);
    expect(POLICY_ATTESTATION.state).toBe('ABSENT');
  });

  it('names preconditions this system already had to build for other reasons', () => {
    expect(ATTESTATION_PRECONDITIONS).toHaveLength(3);
    expect(ATTESTATION_PRECONDITIONS[0].why).toMatch(/same precondition/);
    expect(ATTESTATION_PRECONDITIONS.map((p) => p.needs).join(' ')).toMatch(/digest-addressed artifact/);
  });

  it('prices the costs rather than assuming them away', () => {
    expect(ATTESTATION_COSTS).toHaveLength(3);
    expect(ATTESTATION_COSTS[0].detail).toMatch(/bought, not assumed/);
    // A wrong guest proves the wrong policy perfectly.
    expect(ATTESTATION_COSTS[1].detail).toMatch(/proves the wrong policy perfectly/);
    expect(ATTESTATION_COSTS[2].detail).toMatch(/Doctrine draws the line/);
  });
});
