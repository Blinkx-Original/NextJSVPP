import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

interface RequestBody {
  slug?: string;
  sitemap?: boolean;
}

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Secret not configured' }, { status: 503 });
  }

  const providedSecret = request.nextUrl.searchParams.get('secret') ?? request.headers.get('x-revalidate-secret');
  if (providedSecret !== secret) {
    return NextResponse.json({ ok: false, error: 'Invalid secret' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const paths: string[] = [];
  if (body.slug) {
    paths.push(`/p/${body.slug}`);
  }
  if (body.sitemap !== false) {
    paths.push('/sitemap.xml');
  }

  const revalidated: string[] = [];
  for (const path of paths) {
    revalidatePath(path);
    revalidated.push(path);
  }

  console.log('[revalidate]', { revalidated });
  return NextResponse.json({ ok: true, revalidated });
}
