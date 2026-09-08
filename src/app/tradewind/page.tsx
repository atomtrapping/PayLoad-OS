import type { Metadata } from 'next';
import { ProductDesk } from '@/components/products/ProductDesk';
import type { WorkspaceParams } from '@/domain/productWorkspace';

export const metadata: Metadata = { title: 'Tradewind · market inquiry' };
export const dynamic = 'force-dynamic';
export default async function TradewindPage({ searchParams }: { searchParams: Promise<WorkspaceParams> }) {
  return <ProductDesk domain="TRADEWIND" params={await searchParams} />;
}
