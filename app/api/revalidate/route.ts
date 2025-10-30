import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { clearProductCache } from '@/lib/products';
import { clearBlogPostCache } from '@/lib/blog-posts';
import { clearSitemapCache } from '@/lib/sitemap-cache';
import { createRequestId } from '@/lib/request-id';

interface RequestBody {
  slug?: string;
  type?: 'product' | 'blog';
}

type RevalidateTarget =
  | { type: 'product'; slug: string; paths: string[] }
  | { type: 'blog'; slug: string; paths: string[] }
  | { type: 'sitemap'; paths: string[] };

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Secret not configured' }, { status: 503 });
  }

  const providedSecret = request.headers.get('x-revalidate-secret');
  if (providedSecret !== secret) {
    return NextResponse.json({ ok: false, error: 'Invalid secret' }, { status: 401 });
  }

  const requestId = createRequestId();
  const startedAt = Date.now();

  let body: RequestBody = {};
  const rawBody = await request.text();
  if (rawBody && rawBody.trim().length > 0) {
    try {
      body = JSON.parse(rawBody) as RequestBody;
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  let target: RevalidateTarget | null = null;

  try {
    if (typeof body.slug === 'string' && body.slug.trim()) {
      const slug = body.slug.trim();
      const targetType = body.type === 'blog' ? 'blog' : 'product';
      target =
        targetType === 'blog'
          ? { type: 'blog' as const, slug, paths: [`/b/${slug}`] }
          : { type: 'product' as const, slug, paths: [`/p/${slug}`] };
    } else {
      target = {
        type: 'sitemap',
        paths: ['/sitemap.xml', '/sitemap_index.xml', '/sitemaps/[sitemap]']
      };
    }

    if (!target) {
      throw new Error('revalidate_target_unset');
    }

    const paths = new Set(target.paths);

    if (target.type === 'product') {
      clearProductCache(target.slug);
      clearSitemapCache();
      paths.add('/sitemap.xml');
      paths.add('/sitemap_index.xml');
      paths.add('/sitemaps/[sitemap]');
    } else if (target.type === 'blog') {
      clearBlogPostCache(target.slug);
      clearSitemapCache();
      paths.add('/sitemap.xml');
      paths.add('/sitemap_index.xml');
      paths.add('/sitemaps/[sitemap]');
    } else {
      clearSitemapCache();
    }

    const orderedPaths = Array.from(paths);

    for (const path of orderedPaths) {
      revalidatePath(path);
    }

    const duration = Date.now() - startedAt;
    console.log(
      `[revalidate][${requestId}] target=${orderedPaths.join(',')} status=ok (${duration}ms)`
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const duration = Date.now() - startedAt;
    const targetLabel = target ? target.paths.join(',') : 'unknown';
    console.error(
      `[revalidate][${requestId}] target=${targetLabel} status=error (${duration}ms)`,
      error
    );
    return NextResponse.json({ ok: false, error: 'Revalidate failed' }, { status: 500 });
  }
}
