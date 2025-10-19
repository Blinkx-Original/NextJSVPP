import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { clearProductCache } from '@/lib/products';
import { clearSitemapCache } from '@/lib/sitemap-cache';
import { createRequestId } from '@/lib/request-id';

interface RequestBody {
  slug?: string;
}

type RevalidateTarget =
  | { type: 'product'; slug: string; paths: string[] }
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

  let target: RevalidateTarget;
  if (typeof body.slug === 'string' && body.slug.trim()) {
    const slug = body.slug.trim();
    target = { type: 'product', slug, paths: [`/p/${slug}`] };
  } else {
    target = {
      type: 'sitemap',
      paths: ['/sitemap.xml', '/sitemap_index.xml', '/sitemaps/[sitemap]']
    };
  }

  try {
    if (target.type === 'product') {
      clearProductCache(target.slug);
    } else {
      clearSitemapCache();
    }

    for (const path of target.paths) {
      revalidatePath(path);
    }

    const duration = Date.now() - startedAt;
    console.log(
      `[revalidate][${requestId}] target=${target.paths.join(',')} status=ok (${duration}ms)`
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(
      `[revalidate][${requestId}] target=${target.paths.join(',')} status=error (${duration}ms)`,
      error
    );
    return NextResponse.json({ ok: false, error: 'Revalidate failed' }, { status: 500 });
  }
}
