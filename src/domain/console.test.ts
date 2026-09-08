import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CONSOLE_LOSS, CONSOLE_METHOD, CONSOLE_STATE_MEANING, LOCAL_RAILS, readConsole, type ConsoleInputs, type ConsoleState } from './console';
import { EPISTEMIC_OF_CONSOLE } from './epistemic';

const RAILS_OFF = { PRODUCTION: false, STATE_KERNEL: false, COORDINATION: false, SOURCE_COLLECTION: false } as const;

const inputs = (over: Partial<ConsoleInputs> = {}): ConsoleInputs => ({
  readAt: '2026-09-08T12:00:00.000Z',
  origin: { kind: 'FIXTURE', label: 'Demonstration corpus (fixture_only: true)' },
  admitted: { count: 'UNKNOWN', because: 'no store from here' },
  ledger: { rulings: 'UNKNOWN', byOutcome: [], ancestry: 'UNKNOWN', because: 'no store from here' },
  corpora: { corpora: 3, releases: 7, records: 34, retractions: 4 },
  rails: RAILS_OFF,
  ...over,
});

const rowsOf = (input: ConsoleInputs) => readConsole(input).panels.flatMap((panel) => panel.rows);
const row = (input: ConsoleInputs, id: string) => rowsOf(input).find((entry) => entry.id === id)!;

describe('an unreadable count is never a number, and this is the page where that matters most', () => {
  it('draws an unreadable reading as UNREADABLE and gives it no number at all', () => {
    const admitted = row(inputs(), 'ADMITTED');
    expect(admitted.state).toBe('UNREADABLE');
    // Not zero, and not a dash either: the field is simply absent, so nothing
    // downstream can format it as a digit by accident.
    expect(admitted.reading).toBeUndefined();
    expect('reading' in admitted).toBe(false);
    expect(EPISTEMIC_OF_CONSOLE[admitted.state]).toBe('UNKNOWN');
  });

  it('draws a real zero as a read zero, because a store that answered none is not a store that could not be asked', () => {
    const zero = row(inputs({ admitted: { count: 0, because: 'the table holds no gate-stamped row' } }), 'ADMITTED');
    expect(zero.state).toBe('READ');
    expect(zero.reading).toBe(0);
    expect(EPISTEMIC_OF_CONSOLE[zero.state]).toBe('MEASURED');
    // And the two are not the same row: the state word separates them before
    // any colour or glyph does.
    expect(zero.state).not.toBe(row(inputs(), 'ADMITTED').state);
  });

  it('carries the source’s own sentence rather than writing a new one', () => {
    const because = 'A corpus store is configured and could not be read.';
    expect(row(inputs({ admitted: { count: 'UNKNOWN', because } }), 'ADMITTED').because).toBe(because);
  });
});

describe('the gate’s own account of itself, read back', () => {
  it('reports rulings, ancestry and each outcome the gate wrote', () => {
    const read = inputs({
      ledger: {
        rulings: 5,
        byOutcome: [{ outcome: 'REFUSED', rulings: 3 }, { outcome: 'ADMITTED', rulings: 2 }],
        ancestry: 2,
        because: 'five rulings recorded',
      },
    });
    expect(row(read, 'RULINGS').reading).toBe(5);
    expect(row(read, 'ANCESTRY').reading).toBe(2);
    // Refusals are counted, not only successes: a gate that only reported what
    // it admitted would be reporting its own best case.
    expect(row(read, 'RULING_REFUSED').reading).toBe(3);
    expect(row(read, 'RULING_ADMITTED').reading).toBe(2);
  });

  it('lists no outcome rows at all when the ledger is unreadable', () => {
    expect(rowsOf(inputs()).filter((entry) => entry.id.startsWith('RULING_'))).toHaveLength(0);
  });
});

describe('a rail an operator has not enabled is not a rail that failed', () => {
  it('reports every rail off with the exact command, and never as a refusal', () => {
    const read = readConsole(inputs());
    const rails = read.panels.find((panel) => panel.id === 'RAILS')!;
    expect(rails.rows).toHaveLength(LOCAL_RAILS.length);
    for (const entry of rails.rows) {
      expect(entry.state).toBe('DISABLED');
      expect(entry.enableWith).toBeTruthy();
      expect(entry.reading).toBeUndefined();
      // DECLARED, not REFUSED. A rail nobody switched on has declined nothing,
      // and a home page red on every visit teaches its reader to ignore red.
      expect(EPISTEMIC_OF_CONSOLE[entry.state]).toBe('DECLARED');
      expect(EPISTEMIC_OF_CONSOLE[entry.state]).not.toBe('REFUSED');
    }
  });

  it('reports a set flag as permission and says so, without claiming anything runs', () => {
    const read = row(inputs({ rails: { ...RAILS_OFF, PRODUCTION: true } }), 'PRODUCTION');
    expect(read.state).toBe('READ');
    expect(read.enableWith).toBeUndefined();
    expect(read.because).toMatch(/is set in this process, so the rail is permitted/);
    // Nothing here pings a process, so "permitted" is the strongest word used.
    expect(read.because).not.toMatch(/running|healthy|reachable/);
  });

  it('counts the disabled rails in its own summary rather than leaving it to the reader', () => {
    expect(readConsole(inputs()).because).toContain(`${LOCAL_RAILS.length} of ${LOCAL_RAILS.length} local rails are off`);
    expect(readConsole(inputs({ rails: { ...RAILS_OFF, PRODUCTION: true, COORDINATION: true } })).because).toContain(`2 of ${LOCAL_RAILS.length} local rails are off`);
  });
});

describe('the console is a reading and never an authority', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/domain/console.ts'), 'utf8');
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('declares that it writes nothing, and the literal is the declaration', () => {
    expect(readConsole(inputs()).writes).toBe('NONE');
    expect(readConsole(inputs()).method).toBe(CONSOLE_METHOD);
  });

  it('reaches no store, no admission and no environment', () => {
    // The page takes the readings; this module only decides what they mean. A
    // pure derivation that reaches for process.env is not pure, and this one is
    // tested as though it were.
    expect(body).not.toMatch(/from '@\/db|admitRecords|drizzle|postgres|process\.env/);
    expect(body).not.toMatch(/\binsert\(|\bupdate\(|\bdelete\(|writeFileSync|fetch\(/);
  });

  it('gives every state a meaning and a drawing, so none is ornamental', () => {
    const states: ConsoleState[] = ['READ', 'UNREADABLE', 'DISABLED', 'ABSENT'];
    for (const state of states) {
      expect(CONSOLE_STATE_MEANING[state].length).toBeGreaterThan(0);
      expect(EPISTEMIC_OF_CONSOLE[state]).toBeTruthy();
    }
    expect(CONSOLE_LOSS.length).toBeGreaterThanOrEqual(4);
  });
});
