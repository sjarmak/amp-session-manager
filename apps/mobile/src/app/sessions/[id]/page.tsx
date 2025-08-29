import { SessionDetailClient } from './session-detail-client';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  return <SessionDetailClient id={params.id} />;
}
