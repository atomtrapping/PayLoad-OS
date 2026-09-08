/**
 * What an operator asks on opening a control system.
 *
 * This terminal had no home. `/` was a six-line redirect into the release
 * catalogue, so opening the operating system landed you in a product listing
 * and nothing anywhere reported on the system itself: not which stores were
 * reachable, not what the admitted count read, not which rails were refusing
 * and why. Every number the terminal showed was about the corpus. None was
 * about the terminal.
 *
 * THE CONSOLE IS A READING, NOT AN AUTHORITY
 *
 * It computes nothing the rest of the system does not already know, writes
 * nothing, and holds no connection it opens for itself. It asks the corpus
 * source the two questions that source can answer, reads the environment for
 * which local rails an operator has enabled, and reports both. A structural
 * test holds it to that: no import of the database, no admission, no write.
 *
 * SILENCE IS NOT ZERO, AND THIS IS WHERE IT MATTERS MOST
 *
 * A console is the surface where an unreadable number most tempts a system to
 * print a confident zero. Every count here is `number | 'UNKNOWN'` and the two
 * are drawn differently: "nothing has been admitted" and "I could not check"
 * are different facts, and only one of them is a claim about the world.
 *
 * A DISABLED RAIL IS NOT A BROKEN ONE
 *
 * The local rails are off by default and that is the design, not a fault. So a
 * rail reports DISABLED with the exact command that enables it, never a red
 * error. What the console will not do is imply a rail is running because its
 * flag is set: the flag says an operator permitted it, and nothing here
 * observes a process.
 */
import type { AdmittedCount } from '@/domain/compression';
import type { AdmittedReading, LedgerReading } from '@/adapter/corpusSource';

export const CONSOLE_METHOD = 'notationsos.console.v1';

/**
 * What a reading is. Closed, and deliberately without a failure member: a rail
 * an operator has not enabled is not failing, and painting it as a fault is how
 * a console teaches its reader to ignore red.
 */
export type ConsoleState =
  /** Read from the thing itself, and the reading is what is shown. */
  | 'READ'
  /** Asked for and not readable from here. Never rendered as a number. */
  | 'UNREADABLE'
  /** Off by an operator's own configuration, with the command that turns it on. */
  | 'DISABLED'
  /** Declared and not built. The system says so elsewhere and the console repeats it. */
  | 'ABSENT';

export const CONSOLE_STATE_MEANING: Record<ConsoleState, string> = {
  READ: 'Read from the thing itself at the moment this page rendered. The number is what was there.',
  UNREADABLE: 'Asked for and not answerable from here. Drawn hollow and never as a digit, because an unreadable count is not a zero.',
  DISABLED: 'Off because an operator has not enabled it. This is the default and not a fault; the command that enables it is shown.',
  ABSENT: 'Not built. The system declares this elsewhere and the console repeats the declaration rather than inventing a state for it.',
};

export interface ConsoleRow {
  id: string;
  label: string;
  state: ConsoleState;
  /** The reading, when there is one. A row that is not READ carries no number. */
  reading?: AdmittedCount;
  /** What the reading is counted in, when a bare number would be ambiguous. */
  unit?: string;
  /** The one sentence that says what this row means, in the row's own terms. */
  because: string;
  /** For a DISABLED row, exactly what an operator runs. Never a link, never a button. */
  enableWith?: string;
}

export interface ConsolePanel {
  id: string;
  title: string;
  /** What question this panel answers, so a reader knows what it is not answering. */
  asks: string;
  rows: readonly ConsoleRow[];
}

export interface ConsoleReading {
  method: typeof CONSOLE_METHOD;
  /** When the page rendered. The only clock the console has: it observes no history. */
  readAt: string;
  panels: readonly ConsolePanel[];
  /** Deliberately literal. The console navigates and reports; the rails decide. */
  writes: 'NONE';
  because: string;
}

/** The local rails, each with the flag that permits it and the command that sets the flag. */
export const LOCAL_RAILS = [
  { id: 'PRODUCTION', label: 'Production rail', flag: 'PAYLOAD_PRODUCTION_LOCAL', enableWith: 'npm run dev:production', what: 'The acquisition, normalization and candidate-build rail, plus the GAT audit and spatial analysis routes.' },
  { id: 'STATE_KERNEL', label: 'Notation state kernel', flag: 'PAYLOAD_STATE_KERNEL_LOCAL', enableWith: 'npm run dev:state-kernel', what: 'Saving a notation version through the Rust kernel. Previewing works without it; saving does not.' },
  { id: 'COORDINATION', label: 'Coordination board', flag: 'PAYLOAD_COORDINATION_LOCAL', enableWith: 'npm run dev:coordination', what: 'Posting, registering and acknowledging on the agent board. Reading works without it.' },
  { id: 'SOURCE_COLLECTION', label: 'Source collection', flag: 'PAYLOAD_SOURCE_COLLECTION', enableWith: 'PAYLOAD_SOURCE_COLLECTION=1', what: 'Permission to make a new outbound source capture. Replaying a capture already on disk never needs it and never contacts the provider.' },
] as const;

export interface ConsoleInputs {
  readAt: string;
  origin: { kind: 'FIXTURE' | 'LIVE'; label: string };
  admitted: AdmittedReading;
  ledger: LedgerReading;
  corpora: { corpora: number; releases: number; records: number; retractions: number };
  /** Which rail flags are set, as the process sees them. The caller reads the environment; this module does not. */
  rails: Readonly<Record<(typeof LOCAL_RAILS)[number]['id'], boolean>>;
}

const readingRow = (id: string, label: string, reading: AdmittedCount, because: string, unit?: string): ConsoleRow =>
  reading === 'UNKNOWN'
    ? { id, label, state: 'UNREADABLE', because }
    : { id, label, state: 'READ', reading, because, ...(unit === undefined ? {} : { unit }) };

/**
 * Pure: the console's whole content, derived from readings the caller took.
 *
 * The caller takes the readings because taking them needs a store connection
 * and an environment, and this module is held to having neither. What it does
 * is decide what each reading means and refuse to turn an absent one into a
 * number.
 */
export function readConsole(input: ConsoleInputs): ConsoleReading {
  const corpus: ConsolePanel = {
    id: 'CORPUS',
    title: 'Where the corpus is being served from',
    asks: 'Which store answered this page, and how much it holds. Not whether that store is correct, and not whether anything in it has been admitted — that is the next panel.',
    rows: [
      {
        id: 'ORIGIN',
        label: 'Origin',
        state: 'READ',
        because: input.origin.kind === 'FIXTURE'
          ? `${input.origin.label}. No database is configured, so every corpus surface reads the committed demonstration and says so in its own banner.`
          : `${input.origin.label}. A database is configured and answered, so the corpus surfaces are reading it rather than the committed demonstration.`,
      },
      readingRow('CORPORA', 'Corpora served', input.corpora.corpora, 'Lines carried by whichever store answered. A line becomes servable by appearing in that store; it does not become live by appearing there.', 'lines'),
      readingRow('RELEASES', 'Releases', input.corpora.releases, 'Every release across every line, superseded ones included. A superseded release is still readable, which is the point of never editing one.', 'releases'),
      readingRow('RECORDS', 'Records', input.corpora.records, 'Every record in every release. Not the deliverable set: what a given seat may be delivered is decided per request, and this is the whole.', 'records'),
      readingRow('RETRACTIONS', 'Retractions', input.corpora.retractions, 'Corrections and withdrawals issued across every line. A retraction is a record of a change of mind and is never removed.', 'retractions'),
    ],
  };

  const gate: ConsolePanel = {
    id: 'ADMISSION',
    title: 'What the admission gate has done',
    asks: 'How many records carry a gate-stamped provenance, and what the gate has ruled. This is the one number the whole system is organised around, so it is the one that must never be guessed.',
    rows: [
      readingRow('ADMITTED', 'Admitted records', input.admitted.count, input.admitted.because, 'records'),
      readingRow('RULINGS', 'Rulings recorded', input.ledger.rulings, input.ledger.because, 'rulings'),
      readingRow('ANCESTRY', 'Records with ancestry', input.ledger.ancestry, 'Released records that can still name the candidate and build that proposed them. The join lives outside the release, because a release carries no build identifier.', 'records'),
      ...input.ledger.byOutcome.map((entry): ConsoleRow => ({
        id: `RULING_${entry.outcome}`,
        label: `Ruled ${entry.outcome}`,
        state: 'READ',
        reading: entry.rulings,
        unit: 'rulings',
        because: 'Counted by the outcome word the gate itself wrote. Refusals are written in the same transaction as admissions, so this is the gate’s whole history and not only its successes.',
      })),
    ],
  };

  const rails: ConsolePanel = {
    id: 'RAILS',
    title: 'What is refused right now, and why',
    asks: 'Which local rails an operator has permitted in this process. A flag says permission was given; nothing here observes a running process, so an enabled rail is not a reachable one.',
    rows: LOCAL_RAILS.map((rail): ConsoleRow => input.rails[rail.id]
      ? { id: rail.id, label: rail.label, state: 'READ', because: `${rail.flag} is set in this process, so the rail is permitted. ${rail.what}` }
      : { id: rail.id, label: rail.label, state: 'DISABLED', because: `${rail.flag} is not set, so every write on this rail is refused. ${rail.what}`, enableWith: rail.enableWith }),
  };

  const unreadable = [corpus, gate, rails].flatMap((panel) => panel.rows).filter((row) => row.state === 'UNREADABLE').length;
  const disabled = rails.rows.filter((row) => row.state === 'DISABLED').length;

  return {
    method: CONSOLE_METHOD,
    readAt: input.readAt,
    panels: [corpus, gate, rails],
    writes: 'NONE',
    because: `Read at ${input.readAt} from ${input.origin.label}. ${unreadable} ${unreadable === 1 ? 'reading is' : 'readings are'} not answerable from here and ${disabled} of ${LOCAL_RAILS.length} local rails are off by configuration. Nothing on this page writes, and nothing on it observes a running process: it reports what the store answered and which flags this process was started with.`,
  };
}

export const CONSOLE_LOSS = [
  'It is a reading and never an authority. Nothing on the console admits, corrects, enables or retries; the commands that would enable a rail are printed as text an operator runs in a terminal, not as buttons, because a console that can start a rail is a second actor with its own unlogged state.',
  'A count it cannot take is UNKNOWN and is drawn hollow. The temptation to print zero is strongest exactly here — a console full of zeros looks calm — and a confident zero about a store this process cannot reach is the worst lie the system could tell about itself.',
  'A disabled rail is not a fault and is not drawn as one. The rails are off by default by design; colouring them red would teach a reader that red on this page means nothing.',
  'A set flag is permission, not health. Nothing here pings a process, opens a socket or measures a latency, so the console reports what an operator permitted and what a store answered, and claims nothing about whether anything is running.',
  'There is no history. The console reads at the instant the page rendered and retains nothing, so it cannot tell you that something was reachable an hour ago. Run history lives in the retained receipts on the production path, which is where it belongs.',
] as const;
