import type { Metadata } from 'next';
import { ProductDesk } from '@/components/products/ProductDesk';
import type { WorkspaceParams } from '@/domain/productWorkspace';

export const metadata: Metadata = { title: 'Landshark · parcel inquiry' };
export const dynamic = 'force-dynamic';
export default async function LandsharkPage({ searchParams }: { searchParams: Promise<WorkspaceParams> }) {
  return <ProductDesk domain="LANDSHARK" params={await searchParams} />;
}
