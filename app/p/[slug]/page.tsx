import { notFound } from 'next/navigation';
import { getProductRecordBySlug, isProductPublished } from '@/lib/products';
import { createRequestId } from '@/lib/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function ProductDebugPage({ params }: PageProps) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const product = await getProductRecordBySlug(params.slug);
  const duration = Date.now() - startedAt;

  if (!product) {
    console.log(`[page/p][${requestId}] slug=${params.slug} not found (${duration}ms)`);
    notFound();
  }

  if (!isProductPublished(product)) {
    console.log(`[page/p][${requestId}] slug=${params.slug} unpublished (${duration}ms)`);
    notFound();
  }

  console.log(`[page/p][${requestId}] slug=${params.slug} loaded (${duration}ms)`);

  return (
    <main>
      <h1>{product.title_h1 ?? product.slug}</h1>
      <pre>{JSON.stringify(product, null, 2)}</pre>
    </main>
  );
}
