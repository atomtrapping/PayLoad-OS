import { postgresTerminalDatabase } from './database';
import { getCorpusSource } from '@/adapter/corpusSource';
import { executeMining, workerArtifact } from './mining';
import { TerminalService } from './service';

export async function configuredTerminalService(): Promise<TerminalService> {
  const { createPool } = await import('@/db');
  return new TerminalService(postgresTerminalDatabase(createPool()), getCorpusSource(), () => workerArtifact().digest, executeMining);
}
