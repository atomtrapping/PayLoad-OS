import { join } from 'node:path';
import { SourceConnectorError } from '@/acquisition/errors';
import { ProductionError } from '@/production/errors';

/** The three source readbacks share validation and error handling, not their response contracts. */
export function inspectSourceHistory<T>(id: string, options: {
  invalidMessage: string;
  notFound: { code: string; message: string };
  inspect: (root: string) => T | null;
}): T {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new ProductionError('INVALID_REQUEST', options.invalidMessage);
  // Operator configuration only; a request never selects a root. Same default as the source CLI.
  const root = process.env.PAYLOAD_SOURCE_QUALIFICATION_DIR ?? join(process.cwd(), '.payload', 'source-qualification');
  let result;
  try { result = options.inspect(root); }
  catch (error) {
    if (error instanceof SourceConnectorError) throw new ProductionError(error.code, error.message, error.status === 400 ? 400 : 409);
    throw new ProductionError('SOURCE_HISTORY_INVALID', 'Stored source history failed local integrity checks; no history was changed.', 409);
  }
  if (!result) throw new ProductionError(options.notFound.code, options.notFound.message, 404);
  return result;
}
