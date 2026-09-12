import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthenticatedBoard } from '@/components/coordination/AuthenticatedBoard';
import { CoordinationWorkspace } from '@/components/coordination/CoordinationWorkspace';
import { getCoordinationSnapshot } from '@/coordination/store';

export const metadata: Metadata = { title: 'Message board' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  if ((await searchParams).mode === 'authenticated') return <AuthenticatedBoard view="board" />;
  return <><nav className="px-3 sm:px-4 pt-3 text-[12px] max-w-[1600px] mx-auto w-full" aria-label="Coordination mode">
    <Link href="/board?mode=authenticated">Open authenticated board</Link>
  </nav><CoordinationWorkspace initial={await getCoordinationSnapshot()} view="board" /></>;
}
