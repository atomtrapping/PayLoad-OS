import { describe, expect, it, vi } from 'vitest';
import { streamLink } from '@/domain/streamLink';
import { StreamExplorer } from '@/components/corpus/StreamExplorer';
import { Children, isValidElement } from 'react';
import StreamPage from './page';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));

describe('Stream product routing', () => {
  it.each([
    ['REL-LS-2026.08.20', '/landshark', 'PARCEL-NL-0442'],
    ['REL-TW-2026.09.01', '/tradewind', 'INST-TW-C5'],
  ])('keeps every reading parameter when routing %s', async (release, path, subject) => {
    const reading = { release, subject, predicate: 'test.field', validAt: '2026-08-20T00:00:00.500Z', knownAt: '2026-08-20T09:00:00Z', question: 'WHAT_THE_SOURCE_KNEW', record: 'selected' };
    const params = Object.fromEntries(new URL(streamLink(reading), 'http://test').searchParams);
    let destination = '';
    try { await StreamPage({ searchParams: Promise.resolve(params) }); } catch (e) { destination = (e as Error).message; }
    expect(destination.startsWith(`REDIRECT:${path}?`)).toBe(true);
    const redirected = new URL(destination.slice('REDIRECT:'.length), 'http://test');
    for (const [key, value] of Object.entries(reading)) expect(redirected.searchParams.get(key)).toBe(value);
    expect(redirected.searchParams.get('corpus')).toContain(path.slice(1));
  });

  it('resolves a corpus-only inquiry link to its desk', async () => {
    await expect(StreamPage({ searchParams: Promise.resolve({ corpus: 'landshark.terminal-parcels' }) })).rejects.toThrow('REDIRECT:/landshark?');
  });

  it.each([{ release: 'missing' }, { release: ['REL-LS-2026.08.20', 'REL-TW-2026.09.01'] }, { release: 'REL-LS-2026.08.20', corpus: 'tradewind.freight-rates' }])('refuses wrong explicit selection %j', async (params) => {
    await expect(StreamPage({ searchParams: Promise.resolve(params) })).rejects.toThrow('NOT_FOUND');
  });

  it('preserves the default Caravan explorer', async () => {
    const page = await StreamPage({ searchParams: Promise.resolve({}) });
    const container = Children.toArray(page.props.children).find((child) => isValidElement<{ children: React.ReactNode }>(child) && child.type === 'div');
    if (!isValidElement<{ children: React.ReactNode }>(container)) throw new Error('Missing page container');
    const explorer = Children.toArray(container.props.children).find((child) => isValidElement(child) && child.type === StreamExplorer);
    if (!isValidElement<{ corpus: { domain: string } }>(explorer)) throw new Error('Missing explorer');
    expect(explorer.props.corpus.domain).toBe('CARAVAN');
  });
});
