import { describe, expect, it } from 'vitest';
import { CLOSING_IS_BILATERAL, ROUTE_STATES, UNCLOSED_IS_NOT_FAILURE, routeStateAt } from './routeClosure';

describe('a route has three states', () => {
  it('names all three, each with the properties that distinguish it', () => {
    expect(ROUTE_STATES.map((s) => s.state)).toEqual(['OPEN', 'CLOSED', 'UNCLOSED']);
    for (const state of ROUTE_STATES) {
      for (const field of [state.finality, state.audience, state.correction, state.proves, state.money]) {
        expect(field.length, state.state).toBeGreaterThan(20);
      }
    }
  });

  it('separates the three by audience, which is the property that actually differs', () => {
    const byState = Object.fromEntries(ROUTE_STATES.map((s) => [s.state, s]));
    expect(byState.CLOSED.audience).toContain('Anyone');
    expect(byState.UNCLOSED.audience).toContain('Exactly two parties');
    // And by whether corrections can still reach them.
    expect(byState.CLOSED.correction).toContain('cannot reach the closing');
    expect(byState.UNCLOSED.correction).toContain('in full');
  });

  it('holds closing to being bilateral, and says what a unilateral one would cost', () => {
    expect(CLOSING_IS_BILATERAL.rule).toBe('The system verifies; the parties close.');
    expect(CLOSING_IS_BILATERAL.unilateral).toContain('Verification');
    expect(CLOSING_IS_BILATERAL.joint).toContain('never supplies the missing consent');
    expect(CLOSING_IS_BILATERAL.ifItWereNot).toContain('compel settlement');
  });

  it('records an unclosed route as an instrument rather than a defect', () => {
    expect(UNCLOSED_IS_NOT_FAILURE.worth).toContain('any appointed expert can re-run it');
    expect(UNCLOSED_IS_NOT_FAILURE.butNot).toContain('not enforceable');
    expect(UNCLOSED_IS_NOT_FAILURE.andTheHonestPart).toContain('nothing about the cargo');
  });

  it('derives the state from the deadline, and lets a closing outrank it', () => {
    const deadline = '2026-09-30T00:00:00Z';
    expect(routeStateAt({ closingDeadline: deadline }, '2026-09-01T00:00:00Z').state).toBe('OPEN');
    expect(routeStateAt({ closingDeadline: deadline }, '2026-09-30T00:00:00Z').state).toBe('UNCLOSED');
    expect(routeStateAt({ closingDeadline: deadline }, '2026-10-05T00:00:00Z').because).toContain('reclaimable');
    // A closing is terminal: it reads CLOSED even long past the deadline.
    const closed = routeStateAt({ closedAt: '2026-09-10T00:00:00Z', closingDeadline: deadline }, '2027-01-01T00:00:00Z');
    expect(closed.state).toBe('CLOSED');
    expect(closed.because).toContain('cannot change');
  });
});
