import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from './page.module.css';
import { getPublishedCategoryBySlug } from '@/lib/categories';
import { createRequestId } from '@/lib/request-id';
import { buildBlogCategoryUrl } from '@/lib/urls';

export const runtime = 'nodejs';
export const revalidate = 1800;

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const requestId = createRequestId();
  const category = await getPublishedCategoryBySlug(params.slug, { requestId });
  if (!category || category.type !== 'blog') {
    return {};
  }
  const host = headers().get('host') ?? undefined;
  const canonical = buildBlogCategoryUrl(category.slug, host);
  const title = `${category.name} | Blog Category`;
  const description =
    category.shortDescription ||
    'Stories, news, and insights curated for this BlinkX blog category.';
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description
    }
  };
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const requestId = createRequestId();
  const category = await getPublishedCategoryBySlug(params.slug, { requestId });

  if (!category || category.type !== 'blog') {
    notFound();
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{category.name}</h1>
        {category.shortDescription ? (
          <p className={styles.heroDescription}>{category.shortDescription}</p>
        ) : null}
      </section>
      <section className={styles.content}>
        <div className={styles.placeholder}>
          Blog posts for this category will appear here as soon as they are published.
        </div>
      </section>
    </main>
  );
}
