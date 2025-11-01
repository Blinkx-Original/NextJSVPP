import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from '../detail.module.css';
import { CategoryArchiveDetail } from '../category-view';
import { loadArchiveCategory } from '../archive-data';
import { createRequestId } from '@/lib/request-id';
import { buildProductCategoryArchiveDetailUrl } from '@/lib/urls';
import { findProductCategoryArchiveEntry } from '@/lib/categories';

export const runtime = 'nodejs';
export const revalidate = 600;

interface PageProps {
  params: { slug: string };
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = normalizeSlug(params.slug);
  const entry = await findProductCategoryArchiveEntry(slug);
  if (!entry) {
    return {};
  }
  const host = headers().get('host') ?? undefined;
  const canonical = buildProductCategoryArchiveDetailUrl(entry.slug, host);
  const title = `${entry.name} Catalog | BlinkX Virtual Product Pages`;
  const description = `Explore ${entry.name} products curated for BlinkX visitors. ${entry.productCount.toLocaleString('en-US')} published listings are available.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: 'summary_large_image', title, description }
  };
}

export default async function CategoryArchivePage({ params }: PageProps) {
  const slug = normalizeSlug(params.slug);
  const requestId = createRequestId();
  const data = await loadArchiveCategory(slug, 1, requestId);
  if (!data) {
    notFound();
  }
  return (
    <main className={styles.page}>
      <CategoryArchiveDetail data={data} />
    </main>
  );
}
