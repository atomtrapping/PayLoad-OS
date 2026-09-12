import { postgresTerminalDatabase } from './database';
import { getCorpusSource } from '@/adapter/corpusSource';
import { executeMining, workerArtifact } from './mining';
import { TerminalService } from './service';
import { createPublicationWorker, retentionPlan } from './retention';

export async function configuredTerminalService(): Promise<TerminalService> {
  const { createPool } = await import('@/db');
  return new TerminalService(postgresTerminalDatabase(createPool()), getCorpusSource(), () => workerArtifact().digest, executeMining, retentionPlan()?.destination);
}

export async function configuredPublicationWorker() {
  const { createPool } = await import('@/db');
  const plan = retentionPlan();
  if (!plan) throw new Error('RETENTION_NOT_CONFIGURED');
  const store = plan.open();
  return { worker: createPublicationWorker(postgresTerminalDatabase(createPool()), getCorpusSource(), store), store };
}
