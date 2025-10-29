import type { Metadata } from 'next';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { cache } from 'react';

import { findFooterLinkBySlug, getInternalFooterSlugs } from '@/lib/footer-links';
import { renderMarkdown } from '@/lib/simple-markdown';

const FOOTER_CONTENT_DIR = path.join(process.cwd(), 'content', 'footer');

const loadMarkdown = cache(async (slug: string): Promise<string | null> => {
  const filePath = path.join(FOOTER_CONTENT_DIR, `${slug}.md`);
  try {
    const file = await fs.readFile(filePath, 'utf8');
    return file;
  } catch {
    return null;
  }
});

async function readAvailableSlugs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(FOOTER_CONTENT_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

function humanizeSlug(slug: string): string {
  return (
    slug
      .split('/')
      .pop()
      ?.replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase()) ?? slug
  );
}

export async function generateStaticParams() {
  const slugsFromFiles = await readAvailableSlugs();
  const slugsFromLinks = getInternalFooterSlugs();
  const unique = Array.from(new Set([...slugsFromFiles, ...slugsFromLinks]));
  return unique.map((slug) => ({ footerSlug: slug }));
}

interface PageProps {
  params: { footerSlug: string };
}

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { footerSlug } = params;
  const link = findFooterLinkBySlug(footerSlug);
  const markdown = await loadMarkdown(footerSlug);
  const baseTitle = link?.title ?? humanizeSlug(footerSlug);
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Virtual Product Pages';
  const title = markdown ? baseTitle : `${baseTitle} (en preparación)`;
  const description = markdown
    ? `${baseTitle} de ${siteName}.`
    : `Añade el archivo ${footerSlug}.md en content/footer para publicar esta página.`;

  return {
    title,
    description
  };
}

export default async function FooterPage({ params }: PageProps) {
  const { footerSlug } = params;
  const markdown = await loadMarkdown(footerSlug);
  const link = findFooterLinkBySlug(footerSlug);
  const title = link?.title ?? humanizeSlug(footerSlug);

  if (!markdown) {
    return (
      <section className="legal-page">
        <article className="legal-page__container">
          <header className="legal-page__header">
            <h1 className="legal-page__title">{title}</h1>
          </header>
          <div className="legal-page__content">
            <p>
              Aún no hay contenido para esta página. Añade un archivo llamado{' '}
              <code>{footerSlug}.md</code> en <code>content/footer</code> para publicar este
              documento.
            </p>
          </div>
        </article>
      </section>
    );
  }

  const html = renderMarkdown(markdown);

  return (
    <section className="legal-page">
      <article className="legal-page__container">
        <header className="legal-page__header">
          <h1 className="legal-page__title">{title}</h1>
        </header>
        <div
          className="legal-page__content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </section>
  );
}
