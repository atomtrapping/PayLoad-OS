import { readBoundedSourceRequest } from '../acquisition/request-file';
import { reasoningPreview } from './contracts';
import { ReasoningError } from './config';
import { reasonWithSakana } from './sakana';
import { ReasoningRunStore } from './run-store';
import { prepareCommercialReasoning } from '../commercial/reasoning';

const WORKFLOW_USAGE = [
  'npm run reasoning -- prepare --request <file.json> --policy <policy.json> [--root <directory>]',
  'npm run reasoning -- prepare-commercial --request <commercial.json> --policy <policy.json> --basis <text> [--at <ISO-time>] [--root <directory>]',
  'npm run reasoning -- inspect --run-id <64-hex-id> [--root <directory>]',
  'npm run reasoning -- dispatch --run-id <64-hex-id> --allow-external [--root <directory>]',
].join('\n');

async function workflow(args: readonly string[]) {
  const command = args[0];
  const allowed: Record<string, string[]> = {
    prepare: ['--request', '--policy', '--root'],
    'prepare-commercial': ['--request', '--policy', '--basis', '--at', '--root'],
    inspect: ['--run-id', '--root'], dispatch: ['--run-id', '--root', '--allow-external'],
  };
  const options: Record<string, string> = {};
  for (let index = 1; index < args.length; index++) {
    const key = args[index];
    if (!allowed[command].includes(key) || Object.hasOwn(options, key)) throw new ReasoningError('REASONING_ARGUMENTS_INVALID');
    if (key === '--allow-external') { options[key] = 'true'; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new ReasoningError('REASONING_ARGUMENTS_INVALID');
    options[key] = value;
  }
  const store = new ReasoningRunStore(options['--root'] ?? process.env.PAYLOAD_REASONING_RUN_DIR ?? '.payload/reasoning-runs');
  if (command === 'inspect' || command === 'dispatch') {
    if (!options['--run-id'] || command === 'dispatch' && !options['--allow-external']) throw new ReasoningError('REASONING_ARGUMENTS_INVALID');
    if (command === 'dispatch') return store.dispatch(options['--run-id'], { allowExternal: true });
    const result = store.inspect(options['--run-id']);
    if (!result) throw new ReasoningError('REASONING_RUN_NOT_FOUND');
    return result;
  }
  if (!options['--request'] || !options['--policy'] || command === 'prepare-commercial' && !options['--basis']) throw new ReasoningError('REASONING_ARGUMENTS_INVALID');
  const input = readBoundedSourceRequest(options['--request'], 32768);
  const policy = readBoundedSourceRequest(options['--policy'], 32768);
  let request = input;
  if (command === 'prepare-commercial') {
    // The bridge validates the actual ID together with the complete commercial contract.
    const requestId = (input as { requestId?: unknown } | null)?.requestId;
    request = prepareCommercialReasoning(input, { requestId: typeof requestId === 'string' ? requestId : '',
      externalProcessingBasis: options['--basis'], evaluatedAt: options['--at'] ?? new Date().toISOString() }).request;
  }
  const prepared = store.prepare(request, policy);
  return { schema: 'notation.reasoning-preparation-receipt.v1', runId: prepared.runId, disposition: prepared.disposition,
    state: prepared.state, externalRequestMade: false, root: store.root };
}

export async function runReasoningCli(args: readonly string[], io: { stdout(text: string): void; stderr(text: string): void }) {
  try {
    if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
      io.stdout(`npm run reasoning -- preview --request <file.json>\nnpm run reasoning -- run --request <file.json> --allow-external\n${WORKFLOW_USAGE}\nPreview and prepare are offline. Dispatch requires enabled Sakana configuration and explicit external authorization. Legacy run is unretained.`);
      return 0;
    }
    if (['prepare', 'prepare-commercial', 'inspect', 'dispatch'].includes(args[0])) {
      io.stdout(JSON.stringify(await workflow(args), null, 2)); return 0;
    }
    if (!['preview', 'run'].includes(args[0]) || args[1] !== '--request' || !args[2]
      || (args[0] === 'preview' ? args.length !== 3 : args.length !== 4 || args[3] !== '--allow-external'))
      throw new ReasoningError('REASONING_ARGUMENTS_INVALID');
    const request = readBoundedSourceRequest(args[2], 32768);
    const result = args[0] === 'preview' ? reasoningPreview(request) : await reasonWithSakana(request, { allowExternal: true });
    io.stdout(JSON.stringify(result, null, 2)); return 0;
  } catch (error) {
    io.stderr(JSON.stringify({ error: error instanceof ReasoningError ? error.code : 'REASONING_INVALID_INPUT',
      automaticRetry: false, message: 'No successful reasoning result was confirmed. A dispatched call may still be billed.' }));
    return 1;
  }
}
