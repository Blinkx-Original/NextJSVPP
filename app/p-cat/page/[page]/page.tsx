import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from '../../index.module.css';
import { CategoryArchiveView } from '../../archive-view';
import { buildProductCategoryArchivePageUrl } from '@/lib/urls';

export const runtime = 'nodejs';
export const revalidate = 600;

interface PageProps {
  params: { page: string };
}

function parsePageNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return NaN;
  }
  return parsed;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const pageNumber = parsePageNumber(params.page);
  if (!Number.isFinite(pageNumber)) {
    return {};
  }
  const host = headers().get('host') ?? undefined;
  const canonical = buildProductCategoryArchivePageUrl(pageNumber, host);
  const title = `Product Categories – Page ${pageNumber}`;
  const description =
    'Browse every published BlinkX product category. Discover how many listings are available and dive into each curated catalog.';
  return {
    title: `${title} | BlinkX Virtual Product Pages`,
    description,
    alternates: { canonical, languages: { 'en-US': canonical } },
    openGraph: { title, description, url: canonical },
    twitter: { card: 'summary_large_image', title, description }
  };
}

export default function CategoryArchivePageNumber({ params }: PageProps) {
  const pageNumber = parsePageNumber(params.page);
  if (!Number.isFinite(pageNumber)) {
    notFound();
  }
  return (
    <main className={styles.page}>
      <CategoryArchiveView page={pageNumber} />
    </main>
  );
}
