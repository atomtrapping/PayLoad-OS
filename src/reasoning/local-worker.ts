import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runBoundedProcess } from '../runtime/boundedProcess';
import { executionPolicy } from '../runtime/policy';
import { localRecordDigest } from '../data-os/local-record';
import { rejectDuplicateJsonKeys } from '../data-os/json-keys';
import { parseContextSearch, SakanaToolError, verifyContextSearchResult } from './local-contracts';

type Environment = Readonly<Record<string, string | undefined>>;
function config(env: Environment) {
  if (env.PAYLOAD_SAKANA_TOOLS !== '1') throw new SakanaToolError('SAKANA_TOOLS_DISABLED');
  const executable = env.PAYLOAD_SAKANA_TOOLS_PYTHON;
  const dependencyRoot = env.PAYLOAD_SAKANA_TOOLS_DEPENDENCIES ?? resolve('.stamp/sakana-python');
  try {
    if (!executable || !isAbsolute(executable) || !isAbsolute(dependencyRoot) ||
        !statSync(executable).isFile() || !statSync(dependencyRoot).isDirectory()) throw new Error();
    const runtime = realpathSync(executable);
    const dependencies = realpathSync(dependencyRoot);
    const worker = realpathSync(resolve('tools/sakana/worker.py'));
    return { runtime, dependencies, worker };
  } catch { throw new SakanaToolError('SAKANA_TOOLS_UNAVAILABLE'); }
}

/** No inherited API credentials, Python hooks, model endpoint or user-selected executable. */
export function localToolEnvironment(env: Environment): NodeJS.ProcessEnv {
  const allowed = Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== undefined &&
    /^(SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR)$/i.test(key)));
  return { ...allowed, NODE_ENV: 'production', PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1',
    OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', MKL_NUM_THREADS: '1', NUMEXPR_NUM_THREADS: '1' };
}

export async function searchContextWithTreeQuest(input: unknown, options: {
  allowLocal: boolean; env?: Environment; transport?: typeof runBoundedProcess;
}) {
  if (!options.allowLocal) throw new SakanaToolError('SAKANA_TOOLS_LOCAL_RUN_NOT_AUTHORIZED');
  const request = parseContextSearch(input);
  const env = options.env ?? process.env;
  const settings = config(env);
  const policy = executionPolicy(); // Same operator throttle used by the shared process pool.
  if (request.budget.iterations > (policy.profile === 'conserve' ? 32 : 128))
    throw new SakanaToolError('SAKANA_TOOLS_SEARCH_BUDGET_EXCEEDED');
  const submitted = JSON.stringify(request);
  const inputDigest = localRecordDigest(request, 65536);
  const workerDigest = `sha256:${createHash('sha256').update(readFileSync(settings.worker)).digest('hex')}`;
  const requirementsDigest = `sha256:${createHash('sha256').update(readFileSync(resolve('tools/sakana/requirements.txt'))).digest('hex')}`;
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const result = await (options.transport ?? runBoundedProcess)({ pool: 'production', executable: settings.runtime,
    args: ['-I', '-S', '-B', settings.worker, '--dependencies', settings.dependencies], input: submitted,
    maxOutputBytes: 1048576, timeoutMs: policy.profile === 'conserve' ? 15000 : 60000,
    env: localToolEnvironment(env), failure: (code) => new SakanaToolError(`SAKANA_TOOLS_${code}`) });
  if (result.code !== 0) throw new SakanaToolError('SAKANA_TOOLS_WORKER_FAILED');
  let output: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    rejectDuplicateJsonKeys(text, () => new Error());
    output = JSON.parse(text);
  } catch { throw new SakanaToolError('SAKANA_TOOLS_RESULT_INVALID'); }
  const verified = verifyContextSearchResult(request, output);
  return { schema: 'notation.sakana-context-candidate.v1', requestId: request.requestId,
    status: 'UNADMITTED', reviewRequired: true, inputDigest, workerDigest, requirementsDigest,
    outputDigest: localRecordDigest(verified, 1048576), startedAt, completedAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - started) * 1000) / 1000,
    limits: { profile: policy.profile, timeoutMs: policy.profile === 'conserve' ? 15000 : 60000,
      maxInputBytes: 65536, maxOutputBytes: 1048576, processPool: 'production' },
    evaluator: 'weighted-declared-coverage/v1', verification: 'BUDGET_AND_DECLARED_COVERAGE_RECOMPUTED',
    externalRequestMade: false, modelCalls: 0,
    selectedSources: request.sources.filter((source) => verified.selectedSourceIds.includes(source.id)),
    result: verified,
    limitations: ['Coverage labels and token estimates are supplied metadata, not verified factual support.',
      'Source standing, timestamps and content digests are supplied metadata; this worker does not resolve or authenticate source objects.',
      'The requirements digest identifies the declared dependency pins, not an attestation of every installed byte.',
      'Search is bounded; global optimality and LLM reasoning quality are not established.'],
    authority: { canAdmit: false, canContact: false, canSpend: false, canDeliver: false, canExecuteCode: false },
  } as const;
}
