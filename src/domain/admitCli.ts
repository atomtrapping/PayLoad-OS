/**
 * The `admit` command, as a pure function over its arguments.
 *
 * It rules; it does not write. The one door that writes lives in
 * `src/db/admitRecords.ts` and needs a database; this reads a declared
 * candidate document, puts every candidate through the gate, and prints what
 * the gate said. Dry by default, and loudly so: a run that would have written
 * says it would have, because a command that cannot tell you what it is about
 * to do is not an operator tool.
 *
 * Two arguments are required and neither has a default. `--authority` is the
 * person or role making the act, because the gate refuses a ruling whose
 * authority is the method itself and this command will not invent one on an
 * operator's behalf. `--at` is the knowledge instant of the act, because a
 * command that stamped `now` would make the ruling's clock an accident of
 * when the process happened to run.
 */
import { admit, isAdmitting, type AdmissionCandidate, type AdmissionRuling } from './admission';

export const ADMIT_CLI_HELP = `payload admit — rule on declared candidates. Rules only; never writes.

  --candidates <file>   JSON: a candidate object, or an array of them.
  --authority <who>     The person or role making the act. Required; never defaulted.
  --at <instant>        The knowledge instant of the act. Required; never "now".
  --write               Reserved. Writing needs the one door and a database; this
                        command refuses rather than pretending it wrote.

Every ruling is printed, admitted or refused, because a refusal is a record too.`;

export interface AdmitCliArgs {
  candidatesPath: string;
  authority: string;
  at: string;
  write: boolean;
}

export interface AdmitCliResult {
  mode: 'RULED_NOT_WRITTEN';
  authority: string;
  at: string;
  rulings: AdmissionRuling[];
  wouldWrite: string[];
  refused: number;
  because: string;
}

export function parseAdmitArgs(argv: readonly string[]): AdmitCliArgs | { help: string } {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) return { help: ADMIT_CLI_HELP };
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
  };
  const candidatesPath = read('--candidates');
  const authority = read('--authority');
  const at = read('--at');
  const missing = [!candidatesPath && '--candidates', !authority && '--authority', !at && '--at'].filter(Boolean);
  if (missing.length) throw new Error(`${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} required and ${missing.length === 1 ? 'has' : 'have'} no default. An admission names who made it and when; this command supplies neither.`);
  if (!Number.isFinite(Date.parse(at!))) throw new Error(`--at ${at} is not a readable instant. The act's knowledge time is declared, never taken from the clock this process happened to run on.`);
  return { candidatesPath: candidatesPath!, authority: authority!, at: at!, write: argv.includes('--write') };
}

/** Rule on each candidate, in the order given, and report. Nothing is written. */
export function runAdmit(args: AdmitCliArgs, candidates: readonly AdmissionCandidate[]): AdmitCliResult {
  if (args.write) {
    throw new Error('--write is not implemented here. Writing an admitted row goes through src/db/admitRecords.ts, which needs a database and writes the row, its ruling and its ancestry in one transaction. This command rules and prints; it will not pretend to have written.');
  }
  const rulings = candidates.map((candidate) => admit(candidate, args.authority, args.at));
  const wouldWrite = rulings.filter((ruling) => isAdmitting(ruling.outcome)).map((ruling) => ruling.recordId);
  const refused = rulings.length - wouldWrite.length;
  return {
    mode: 'RULED_NOT_WRITTEN',
    authority: args.authority,
    at: args.at,
    rulings,
    wouldWrite,
    refused,
    because: `${wouldWrite.length} of ${rulings.length} would be admitted by ${args.authority} at ${args.at}; ${refused} refused. Nothing was written: this command rules, and the one door writes.`,
  };
}
