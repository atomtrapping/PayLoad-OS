import { isAbsolute } from 'node:path';
import { sosConfig, type SosEnvironment } from '@/data-os/sos-config';
import { SosImmutableObjectStore, sosDestination } from '@/data-os/sos-object-store';
import { LocalImmutableObjectStore, localObjectDestination } from '@/data-os/local-immutable-object-store';
import type { ImmutableObjectStore } from '@/data-os/immutable-object-store';
import type { CorpusSource } from '@/adapter/corpusSource';
import { commitment, refuse } from './contracts';
import type { TerminalDatabase } from './database';
import { recheckSnapshotSources, snapshotDigest, type MiningSnapshot } from './mining';
import { PublicationWorker } from './publication';

/** Deployment-owned internal retention only. Disabled by default; no implicit local fallback. */
export function retentionPlan(env: SosEnvironment = process.env): { destination: string; open: () => ImmutableObjectStore } | null {
  const deployment = env.PAYLOAD_DEPLOYMENT_MODE?.trim() || 'local';
  if (!['local', 'internal'].includes(deployment)) refuse('RETENTION_CONFIG_INVALID', 503);
  const mode = env.PAYLOAD_TERMINAL_RETENTION || 'disabled';
  if (mode === 'disabled') return null;
  if (mode === 'local') {
    const root = env.PAYLOAD_TERMINAL_OBJECT_ROOT;
    if (!root || !isAbsolute(root) || deployment === 'internal') refuse('RETENTION_CONFIG_INVALID', 503);
    return { destination: localObjectDestination(root), open: () => new LocalImmutableObjectStore(root) };
  }
  if (mode !== 'sos' || env.PAYLOAD_OBJECT_STORE !== 'sos') refuse('RETENTION_CONFIG_INVALID', 503);
  const config = sosConfig(env);
  if (!config || !config.prefix) refuse('RETENTION_CONFIG_INVALID', 503);
  return { destination: sosDestination(config), open: () => new SosImmutableObjectStore(config) };
}

/** Fresh source-use checks before any artifact storage/readback. Hashes do not confer permission. */
export function publicationPermission(db: TerminalDatabase, source: CorpusSource, destination: string) {
  return async (jobId: string): Promise<void> => {
    const job = await db.transaction(async sql => (await sql.query<{
      snapshot: MiningSnapshot; snapshot_digest: string; request: { retentionDestination?: string }; request_digest: string; state: string;
      action_digest: string; authorization_action_digest: string; authorization_id: string;
    }>(`SELECT j.snapshot,j.snapshot_digest,j.request,j.request_digest,j.state,j.action_digest,
      a.action_digest AS authorization_action_digest,a.authorization_id FROM payload_terminal_job j
      JOIN execution_authorization a ON a.authorization_id=j.authorization_id AND a.proposal_id=j.job_id
      WHERE j.job_id=$1 AND a.envelope_class='NARROW_ACTION' AND a.review_response='APPROVE'
        AND a.granted_at<=clock_timestamp() AND a.expires_at>clock_timestamp()
        AND NOT EXISTS (SELECT 1 FROM authorization_revocation r
          WHERE r.authorization_id=a.authorization_id AND r.revoked_at<=clock_timestamp())`, [jobId])).rows[0]);
    // The reviewed action includes this destination. Completing pure computation
    // does not turn that expiring/revocable grant into perpetual write authority.
    if (!job) refuse('PUBLICATION_AUTHORITY_UNAVAILABLE');
    if (job.state !== 'SUCCEEDED' || job.request.retentionDestination !== destination
      || snapshotDigest(job.snapshot) !== job.snapshot_digest || commitment(job.request) !== job.request_digest
      || commitment({ request: job.request, snapshotDigest: job.snapshot_digest }) !== job.action_digest
      || job.authorization_action_digest !== job.action_digest) refuse('PUBLICATION_BINDING_INVALID');
    await recheckSnapshotSources(source, job.snapshot);
    // Rights may require asynchronous source IO. A grant can expire or be
    // revoked while that lookup runs, so check its current authority again.
    const active = await db.transaction(async sql => (await sql.query(`SELECT authorization_id FROM execution_authorization a
      WHERE authorization_id=$1 AND proposal_id=$2 AND action_digest=$3
        AND envelope_class='NARROW_ACTION' AND review_response='APPROVE'
        AND granted_at<=clock_timestamp() AND expires_at>clock_timestamp()
        AND NOT EXISTS (SELECT 1 FROM authorization_revocation r
          WHERE r.authorization_id=a.authorization_id AND r.revoked_at<=clock_timestamp())`,
    [job.authorization_id, jobId, job.action_digest])).rows.length === 1);
    if (!active) refuse('PUBLICATION_AUTHORITY_UNAVAILABLE');
  };
}

export function createPublicationWorker(db: TerminalDatabase, source: CorpusSource, store: ImmutableObjectStore): PublicationWorker {
  return new PublicationWorker(db, store, { permit: publicationPermission(db, source, store.destination) });
}
