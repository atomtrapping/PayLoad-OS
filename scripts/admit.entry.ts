import { readFileSync } from 'node:fs';
import { parseAdmitArgs, runAdmit } from '../src/domain/admitCli';
import type { AdmissionCandidate } from '../src/domain/admission';

try {
  const parsed = parseAdmitArgs(process.argv.slice(2));
  if ('help' in parsed) {
    console.log(parsed.help);
  } else {
    const raw: unknown = JSON.parse(readFileSync(parsed.candidatesPath, 'utf8'));
    const candidates = (Array.isArray(raw) ? raw : [raw]) as AdmissionCandidate[];
    const result = runAdmit(parsed, candidates);
    console.log(JSON.stringify(result, null, 2));
    // A run in which nothing was admitted is not a failure of the command; it
    // is the gate doing its job, and the exit code says which happened.
    if (result.refused > 0) process.exitCode = 2;
  }
} catch (error) {
  console.error(JSON.stringify({ mode: 'LOCAL_DEVELOPMENT', error: error instanceof Error ? error.message : 'Local admission failed.' }));
  process.exitCode = 1;
}
