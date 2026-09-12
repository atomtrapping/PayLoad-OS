import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixtureCorpusSource } from '@/adapter/corpusSource';
import { authenticateTerminal, tokenDigest } from './auth';
import { pinRelease, recheckSnapshotSources } from './mining';

const releaseId = 'REL-LS-2026.08.20';
const token = 'synthetic-token-used-only-for-mining-permission-tests';
const who = () => authenticateTerminal(new Request('http://localhost', { headers: { authorization: `Bearer ${token}` } }), JSON.stringify([{
  principalId: 'research', terminalId: 'test', displayName: 'Synthetic researcher', kind: 'AGENT', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research',
  corpusScope: ['landshark.terminal-parcels'], canReview: false, tokenSha256: tokenDigest(token), expiresAt: '2099-01-01T00:00:00Z',
}]));
afterEach(() => vi.useRealTimers());
describe('current mining rights and retention', () => {
  it.each(['2026-09-01T00:00:00Z', '2026-09-12T12:00:00Z'])('refuses use at and after the retention boundary %s even while use grant remains effective', async until => {
    vi.useFakeTimers(); vi.setSystemTime('2026-09-12T12:00:00Z');
    const source = new FixtureCorpusSource();
    const snapshot = await pinRelease(source, who(), releaseId);
    const hit = structuredClone((await source.getRelease(releaseId))!);
    const registration = hit.release.sources.find(s => s.sourceId === 'cadastral-registry')!.registration;
    registration.retention = { mode: 'UNTIL', until };
    registration.effectiveUntil = '2099-01-01T00:00:00Z';
    vi.spyOn(source, 'getRelease').mockResolvedValue(hit);
    await expect(pinRelease(source, who(), releaseId)).rejects.toThrow('MINING_INPUT_LIMIT');
    await expect(recheckSnapshotSources(source, snapshot)).rejects.toThrow('MINING_SOURCE_USE_REFUSED');
  });
  it('refuses an unresolved source-expiry retention and current permission revocation', async () => {
    const source = new FixtureCorpusSource();
    const snapshot = await pinRelease(source, who(), releaseId);
    const hit = structuredClone((await source.getRelease(releaseId))!);
    const registration = hit.release.sources.find(s => s.sourceId === 'cadastral-registry')!.registration;
    registration.retention = { mode: 'UNTIL_SOURCE_EXPIRY' }; delete registration.effectiveUntil;
    vi.spyOn(source, 'getRelease').mockResolvedValue(hit);
    await expect(recheckSnapshotSources(source, snapshot)).rejects.toThrow('MINING_SOURCE_USE_REFUSED');
    registration.retention = { mode: 'INDEFINITE' }; registration.allowedOperations = ['RETRIEVE'];
    await expect(recheckSnapshotSources(source, snapshot)).rejects.toThrow('MINING_SOURCE_USE_REFUSED');
  });
});
