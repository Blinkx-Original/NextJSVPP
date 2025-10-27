import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/basic-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface BlogPdfUploadSuccessResponse {
  ok: true;
  url: string;
  filename?: string | null;
}

interface BlogPdfUploadErrorResponse {
  ok: false;
  error_code: 'auth_required' | 'pdf_upload_disabled' | 'invalid_form' | 'upload_failed';
  message?: string;
  status?: number;
  error_details?: unknown;
}

function resolvePdfUrl(
  payload: Record<string, unknown> | null,
  baseUrl: string | null
): { url: string | null; filename?: string | null } {
  if (!payload) {
    return { url: null };
  }

  if (typeof payload.url === 'string' && payload.url.trim()) {
    return { url: payload.url.trim(), filename: typeof payload.filename === 'string' ? payload.filename : null };
  }

  const candidate =
    (typeof payload.path === 'string' && payload.path.trim()) ||
    (typeof payload.key === 'string' && payload.key.trim()) ||
    null;

  if (!candidate || !baseUrl) {
    return { url: null };
  }

  try {
    const resolved = new URL(candidate, baseUrl);
    return { url: resolved.toString(), filename: typeof payload.filename === 'string' ? payload.filename : null };
  } catch {
    return { url: null };
  }
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response ?? NextResponse.json<BlogPdfUploadErrorResponse>(
      { ok: false, error_code: 'auth_required', message: 'Autenticación requerida' },
      { status: 401 }
    );
  }

  const endpoint = process.env.BLOG_PDF_UPLOAD_ENDPOINT?.trim() || null;
  const authHeader = process.env.BLOG_PDF_UPLOAD_AUTH_HEADER?.trim() || null;
  const baseUrl = process.env.BLOG_PDF_PUBLIC_BASE_URL?.trim() || null;

  if (!endpoint) {
    return NextResponse.json<BlogPdfUploadErrorResponse>(
      {
        ok: false,
        error_code: 'pdf_upload_disabled',
        message: 'La carga de PDFs no está configurada. Define BLOG_PDF_UPLOAD_ENDPOINT.'
      },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json<BlogPdfUploadErrorResponse>(
      { ok: false, error_code: 'invalid_form', message: 'Debes adjuntar un archivo PDF.' },
      { status: 400 }
    );
  }

  const uploadForm = new FormData();
  uploadForm.append('file', file, file.name || 'upload.pdf');

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      body: uploadForm,
      headers: authHeader ? { Authorization: authHeader } : undefined
    });
  } catch (error) {
    return NextResponse.json<BlogPdfUploadErrorResponse>(
      {
        ok: false,
        error_code: 'upload_failed',
        message: 'No se pudo conectar con el endpoint de almacenamiento de PDFs.',
        error_details: { message: (error as Error)?.message }
      },
      { status: 502 }
    );
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await upstreamResponse.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  if (!upstreamResponse.ok) {
    return NextResponse.json<BlogPdfUploadErrorResponse>(
      {
        ok: false,
        error_code: 'upload_failed',
        message:
          (typeof payload?.message === 'string' && payload.message) || 'El proveedor de almacenamiento rechazó la carga.',
        status: upstreamResponse.status,
        error_details: payload
      },
      { status: upstreamResponse.status }
    );
  }

  const { url, filename } = resolvePdfUrl(payload, baseUrl);
  if (!url) {
    return NextResponse.json<BlogPdfUploadErrorResponse>(
      {
        ok: false,
        error_code: 'upload_failed',
        message: 'No se pudo determinar la URL pública del PDF subido.',
        error_details: payload
      },
      { status: 502 }
    );
  }

  return NextResponse.json<BlogPdfUploadSuccessResponse>({
    ok: true,
    url,
    filename: filename || file.name || null
  });
}
