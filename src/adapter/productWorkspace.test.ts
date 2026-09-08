import { describe, expect, it, vi } from 'vitest';
import { FixtureCorpusSource } from './corpusSource';
import { loadProductWorkspace } from './productWorkspace';

describe('product workspace source adapter', () => {
  it.each(['LANDSHARK', 'TRADEWIND'] as const)('reads %s from the configured corpus interface', async (domain) => {
    const model = await loadProductWorkspace(domain, {}, new FixtureCorpusSource());
    expect(model.domain).toBe(domain);
    expect(model.records.length).toBeGreaterThan(0);
  });

  it.each([
    { release: 'missing' },
    { corpus: 'missing' },
    { release: 'REL-TW-2026.09.01' },
    { release: 'REL-LS-2026.09.01', corpus: 'tradewind.freight-rates' },
  ])('does not fall back for explicit wrong scope %j', async (params) => {
    const source = new FixtureCorpusSource();
    const list = vi.spyOn(source, 'listCorpora');
    await expect(loadProductWorkspace('LANDSHARK', params, source)).rejects.toThrow('CORPUS_NOT_AVAILABLE');
    expect(list).not.toHaveBeenCalled();
  });

  it('does not turn an unavailable source into a fixture result', async () => {
    const source = new FixtureCorpusSource();
    vi.spyOn(source, 'listCorpora').mockRejectedValue(new Error('store unavailable'));
    await expect(loadProductWorkspace('LANDSHARK', {}, source)).rejects.toThrow('store unavailable');
  });
});
