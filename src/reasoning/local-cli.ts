import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { readBoundedSourceRequest } from '../acquisition/request-file';
import { FileContentAddressedStore } from '../data-os/file-object-store';
import { encodeLocalRecord } from '../data-os/local-record';
import { contextSearchPreview, parseContextSearch, SakanaToolError } from './local-contracts';
import { searchContextWithTreeQuest } from './local-worker';

const USAGE = 'sakana:tools preview|run --request <metadata.json> [--allow-local] [--store <object-root>]';

/** Operator CLI, not a public route. No model or source acquisition is performed. */
export async function runLocalToolsCli(args: string[], io: {
  stdout: (text: string) => void; stderr: (text: string) => void;
}, search = searchContextWithTreeQuest): Promise<number> {
  try {
    const { values, positionals, tokens } = parseArgs({ args, strict: true, tokens: true, allowPositionals: true, options: {
      request: { type: 'string' }, 'allow-local': { type: 'boolean' }, store: { type: 'string' },
    } });
    const flags = tokens.filter((token) => token.kind === 'option').map((token) => token.name);
    if (new Set(flags).size !== flags.length) throw new SakanaToolError('SAKANA_TOOLS_USAGE');
    const command = positionals[0];
    if (positionals.length !== 1 || !['preview', 'run'].includes(command) || !values.request?.trim() ||
        (command === 'preview' && (values['allow-local'] || values.store !== undefined)) ||
        (values.store !== undefined && !values.store.trim())) throw new SakanaToolError('SAKANA_TOOLS_USAGE');
    let input: unknown;
    try { input = readBoundedSourceRequest(values.request, 65536); }
    catch { throw new SakanaToolError('SAKANA_TOOLS_REQUEST_FILE_INVALID'); }
    const request = parseContextSearch(input);
    if (command === 'preview') {
      io.stdout(JSON.stringify(contextSearchPreview(request), null, 2));
      return 0;
    }
    const candidate = await search(request, { allowLocal: values['allow-local'] === true });
    // Reuse existing immutable content-addressed storage, not a second receipt database.
    // An interrupted pair may leave an unreferenced request object; neither object is overwritten.
    let retention;
    if (values.store !== undefined) {
      const store = new FileContentAddressedStore(resolve(values.store));
      const requestObject = store.put(encodeLocalRecord(request, 65536));
      const candidateObject = store.put(encodeLocalRecord(candidate, 2 * 1048576));
      if (!store.get(requestObject.contentDigest) || !store.get(candidateObject.contentDigest))
        throw new SakanaToolError('SAKANA_TOOLS_RETENTION_READBACK_FAILED');
      retention = { request: requestObject, candidate: candidateObject };
    }
    io.stdout(JSON.stringify({ ...candidate, ...(retention ? { retention } : {}) }, null, 2));
    return 0;
  } catch (error) {
    const code = error instanceof SakanaToolError ? error.code : 'SAKANA_TOOLS_COMMAND_FAILED';
    // Do not print request content, paths, subprocess diagnostics or credentials on failure.
    io.stderr(JSON.stringify({ error: code, usage: USAGE }));
    return 1;
  }
}
