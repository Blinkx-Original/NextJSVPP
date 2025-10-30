import { excerptFromHtml } from './seo';
import type { NormalizedBlogPost } from './blog-posts';

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(text: string, maxLength = 160): string {
  if (text.length <= maxLength) {
    return text;
  }
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLength * 0.4)) {
    return `${truncated.slice(0, lastSpace).trimEnd()}…`;
  }
  return `${truncated.trimEnd()}…`;
}

function resolveDescription(post: NormalizedBlogPost): string {
  const seoDescription = collapseWhitespace(post.seo_description || '');
  if (seoDescription) {
    return truncateText(seoDescription);
  }
  const summary = collapseWhitespace(post.short_summary || '');
  if (summary) {
    return truncateText(summary);
  }
  return excerptFromHtml(post.content_html, 160);
}

function resolveCanonical(post: NormalizedBlogPost, canonicalUrl: string): string {
  const override = collapseWhitespace(post.canonical_url || '');
  return override || canonicalUrl;
}

export interface BuildBlogSeoResult {
  description: string;
  jsonLd: string;
  canonical: string;
}

export function buildBlogSeo(post: NormalizedBlogPost, canonicalUrl: string): BuildBlogSeoResult {
  const description = resolveDescription(post);
  const canonical = resolveCanonical(post, canonicalUrl);
  const publishedAt = post.published_at || null;
  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title_h1 || post.slug,
    description: description || undefined,
    url: canonical,
    mainEntityOfPage: canonical,
    datePublished: publishedAt || undefined
  };

  const coverImage = collapseWhitespace(post.cover_image_url || '');
  if (coverImage) {
    payload.image = [coverImage];
  }

  const articleBody = excerptFromHtml(post.content_html, 320);
  if (articleBody) {
    payload.articleBody = articleBody;
  }

  if (post.category_slug) {
    payload.articleSection = post.category_slug;
  }

  return {
    description,
    jsonLd: JSON.stringify(payload, null, 2),
    canonical
  };
}

export function buildBlogMetaTitle(post: NormalizedBlogPost): string {
  const seoTitle = collapseWhitespace(post.seo_title || '');
  if (seoTitle) {
    return seoTitle;
  }
  return collapseWhitespace(post.title_h1 || post.slug);
}
