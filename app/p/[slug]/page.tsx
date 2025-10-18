import { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductHero } from '@/components/product-hero';
import { getPublishedProductBySlug, resolvePrimaryCta } from '@/lib/products';
import { getSiteUrl } from '@/lib/urls';

export const revalidate = 60;

interface PageProps {
  params: { slug: string };
}

async function fetchProduct(slug: string) {
  const product = await getPublishedProductBySlug(slug);
  if (!product) {
    notFound();
  }
  return product;
}

export async function generateMetadata(
  { params }: PageProps,
  _parent: ResolvingMetadata
): Promise<Metadata> {
  const product = await getPublishedProductBySlug(params.slug);
  if (!product) {
    notFound();
  }
  const title = product.title;
  const description = product.shortSummary?.slice(0, 160) ?? undefined;
  const siteUrl = getSiteUrl();
  const primary = resolvePrimaryCta(product);
  const ogImage = product.images[0];

  return {
    title,
    description,
    alternates: {
      canonical: `${siteUrl}/p/${product.slug}`
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/p/${product.slug}`,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
      // Cast required because Next.js' OpenGraph type union omits `product`,
      // even though it is emitted correctly at runtime.
      type: 'product' as any
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage ? [ogImage] : undefined
    },
    other: primary?.url ? { 'product:primary_cta': primary.url } : undefined
  };
}

export default async function ProductPage({ params }: PageProps) {
  const product = await fetchProduct(params.slug);
  const siteUrl = getSiteUrl();
  const primary = resolvePrimaryCta(product);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    model: product.model ?? undefined,
    sku: product.sku ?? undefined,
    image: product.images,
    description: product.shortSummary ?? undefined,
    url: primary?.url ?? `${siteUrl}/p/${product.slug}`,
    offers: primary
      ? {
          '@type': 'Offer',
          url: primary.url
        }
      : undefined
  };

  return (
    <>
      <ProductHero product={product} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
