import { NextResponse } from 'next/server';
import { getPublishingActivityById } from '@/lib/publishing-activity';

export const runtime = 'nodejs';

function escapeCsv(value: string | null | undefined): string {
  const text = value ?? '';
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const entry = getPublishingActivityById(context.params.id);
  if (!entry) {
    return NextResponse.json({ ok: false, error_code: 'not_found' }, { status: 404 });
  }
  if (!entry.error_items || entry.error_items.length === 0) {
    return NextResponse.json({ ok: false, error_code: 'no_errors' }, { status: 404 });
  }

  const header = ['slug', 'message', 'code', 'identifier'];
  const lines = [header.map(escapeCsv).join(',')];
  for (const item of entry.error_items) {
    lines.push(
      [escapeCsv(item.slug ?? item.identifier ?? ''), escapeCsv(item.message ?? ''), escapeCsv(item.code ?? ''), escapeCsv(item.identifier ?? '')]
        .join(',')
    );
  }
  const content = `${lines.join('\n')}\n`;
  const filename = `publishing-errors-${context.params.id}.csv`;
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
