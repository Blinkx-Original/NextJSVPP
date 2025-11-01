import type { Metadata } from 'next';
import { headers } from 'next/headers';
import styles from './index.module.css';
import { CategoryArchiveView } from './archive-view';
import { buildProductCategoryArchiveUrl } from '@/lib/urls';

export const runtime = 'nodejs';
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const host = headers().get('host') ?? undefined;
  const canonical = buildProductCategoryArchiveUrl(host);
  const title = 'Product Categories Catalog | BlinkX Virtual Product Pages';
  const description =
    'Browse every published BlinkX product category. Discover how many listings are available and dive into each curated catalog.';
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: 'summary_large_image', title, description }
  };
}

export default function CategoryArchiveIndexPage() {
  return (
    <main className={styles.page}>
      <CategoryArchiveView page={1} />
    </main>
  );
}
