/** Explicit operator qualification; no runtime migration, provider discovery or real-data indexing. */
import { localLakeConfig, lakeDestination, runLocalLake } from '../src/terminal/lakeRuntime';
import { publishTerminalLake } from '../src/terminal/lake';
import { retentionPlan } from '../src/terminal/retention';
import { postgresTerminalDatabase } from '../src/terminal/database';
import { getCorpusSource } from '../src/adapter/corpusSource';
import type { ImmutableObjectStore } from '../src/data-os/immutable-object-store';

const [command, publicationId, ...extra] = process.argv.slice(2);
if (!['init', 'publish'].includes(command) || extra.length || (command === 'init' ? !!publicationId : !publicationId)) throw new Error('Use terminal:lake -- init|publish <publication-id>');
const config = localLakeConfig();
if (command === 'init') {
  process.stdout.write(JSON.stringify(await runLocalLake(config, 'init')) + '\n');
} else {
  const plan = retentionPlan();
  if (!plan) throw new Error('RETENTION_NOT_CONFIGURED');
  const { createPool } = await import('../src/db');
  const store: ImmutableObjectStore & { close?: () => void } = plan.open();
  try {
    const receipt = await publishTerminalLake(postgresTerminalDatabase(createPool()), getCorpusSource(), store, publicationId,
      lakeDestination(config), (mode, input) => runLocalLake(config, mode, input));
    process.stdout.write(JSON.stringify(receipt) + '\n');
  } finally { try { store.close?.(); } finally { await createPool().end(); } }
}
