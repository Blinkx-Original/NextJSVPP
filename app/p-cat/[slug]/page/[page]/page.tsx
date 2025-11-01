import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from '../../../detail.module.css';
import { CategoryArchiveDetail } from '../../../category-view';
import { loadArchiveCategory } from '../../../archive-data';
import { createRequestId } from '@/lib/request-id';
import { buildProductCategoryArchiveDetailPageUrl } from '@/lib/urls';
import { findProductCategoryArchiveEntry } from '@/lib/categories';

export const runtime = 'nodejs';
export const revalidate = 600;

interface PageProps {
  params: { slug: string; page: string };
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function parsePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return NaN;
  }
  return parsed;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = normalizeSlug(params.slug);
  const pageNumber = parsePage(params.page);
  if (!Number.isFinite(pageNumber)) {
    return {};
  }
  const entry = await findProductCategoryArchiveEntry(slug);
  if (!entry) {
    return {};
  }
  const host = headers().get('host') ?? undefined;
  const canonical = buildProductCategoryArchiveDetailPageUrl(entry.slug, pageNumber, host);
  const baseTitle = `${entry.name} Catalog`;
  const title = `${baseTitle} – Page ${pageNumber}`;
  const description = `Explore page ${pageNumber} of ${entry.name} products curated for BlinkX visitors.`;
  return {
    title: `${title} | BlinkX Virtual Product Pages`,
    description,
    alternates: { canonical, languages: { 'en-US': canonical } },
    openGraph: { title, description, url: canonical },
    twitter: { card: 'summary_large_image', title, description }
  };
}

export default async function CategoryArchivePageNumber({ params }: PageProps) {
  const slug = normalizeSlug(params.slug);
  const pageNumber = parsePage(params.page);
  if (!Number.isFinite(pageNumber)) {
    notFound();
  }
  const requestId = createRequestId();
  const data = await loadArchiveCategory(slug, pageNumber, requestId);
  if (!data) {
    notFound();
  }
  return (
    <main className={styles.page}>
      <CategoryArchiveDetail data={data} />
    </main>
  );
}
