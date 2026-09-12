import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthenticatedBoard } from '@/components/coordination/AuthenticatedBoard';
import { CoordinationWorkspace } from '@/components/coordination/CoordinationWorkspace';
import { getCoordinationSnapshot } from '@/coordination/store';

export const metadata: Metadata = { title: 'Agent & apparatus stable' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  if ((await searchParams).mode === 'authenticated') return <AuthenticatedBoard view="stable" />;
  return <><nav className="px-3 sm:px-4 pt-3 text-[12px] max-w-[1600px] mx-auto w-full" aria-label="Coordination mode">
    <Link href="/agents?mode=authenticated">Open authenticated stable</Link>
  </nav><CoordinationWorkspace initial={await getCoordinationSnapshot()} view="stable" /></>;
}
