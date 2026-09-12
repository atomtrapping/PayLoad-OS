import { configuredTerminalService, configuredPublicationWorker } from '../src/terminal/runtime';
import { installTerminalSchema } from '../src/terminal/schema';
import { postgresTerminalDatabase } from '../src/terminal/database';

const mode = process.argv[2];
if (!['migrate','worker','publisher'].includes(mode)) throw new Error('Use terminal:service -- migrate|worker|publisher');
const { createPool } = await import('../src/db');
let closeStore: (() => void) | undefined;
try {
  if (mode === 'migrate') {
    await installTerminalSchema(postgresTerminalDatabase(createPool()));
    process.stdout.write('Terminal schema ready. No corpus records were admitted.\n');
  } else {
    const publication = mode === 'publisher' ? await configuredPublicationWorker() : undefined;
    if (publication && 'close' in publication.store && typeof publication.store.close === 'function') {
      const close = publication.store.close; closeStore = () => close.call(publication.store);
    }
    const service = publication?.worker ?? await configuredTerminalService();
    let stopping = false;
    process.on('SIGINT', () => { stopping = true; }); process.on('SIGTERM', () => { stopping = true; });
    while (!stopping) {
      try { if (await service.runNext()) continue; }
      catch { process.stderr.write('TERMINAL_WORKER_UNAVAILABLE\n'); }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
} finally { try { closeStore?.(); } finally { await createPool().end(); } }
