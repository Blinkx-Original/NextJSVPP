import { NextRequest, NextResponse } from 'next/server';
import { POST as revalidatePost } from '@/app/api/revalidate/route';

export const runtime = 'nodejs';

interface RevalidateResponse {
  ok: boolean;
  error_code?: 'missing_env' | 'error';
  error_details?: unknown;
}

export async function POST() {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (!secret) {
    const body: RevalidateResponse = { ok: false, error_code: 'missing_env' };
    return NextResponse.json(body, { status: 500 });
  }

  try {
    const request = new NextRequest('http://internal/api/admin/connectivity/revalidate', {
      method: 'POST',
      headers: new Headers({ 'x-revalidate-secret': secret })
    });
    const response = await revalidatePost(request);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const body: RevalidateResponse = {
      ok: false,
      error_code: 'error',
      error_details: { message: (error as Error)?.message }
    };
    return NextResponse.json(body, { status: 500 });
  }
}
