import { NextResponse } from 'next/server';
import { getCategoryTypeSynonyms } from '@/lib/categories';

export type CategoryType = 'product' | 'blog';

export type ErrorCode =
  | 'unauthorized'
  | 'missing_env'
  | 'invalid_query'
  | 'invalid_payload'
  | 'sql_error'
  | 'duplicate_slug'
  | 'not_found';

export const SHORT_DESCRIPTION_MAX_LENGTH = 255;
export const LONG_DESCRIPTION_MAX_LENGTH = 4000;
export const HERO_IMAGE_MAX_LENGTH = 2000;

export function buildErrorResponse(
  code: ErrorCode,
  init?: { status?: number; message?: string; details?: unknown }
): NextResponse<{ ok: false; error_code: ErrorCode; message?: string; error_details?: unknown }> {
  return NextResponse.json(
    {
      ok: false,
      error_code: code,
      message: init?.message,
      error_details: init?.details
    },
    { status: init?.status ?? 400 }
  );
}

export function normalizeType(input: string | null): CategoryType {
  const value = input ? input.trim().toLowerCase() : '';
  if (value && getCategoryTypeSynonyms('blog').includes(value)) {
    return 'blog';
  }
  return 'product';
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'false' || trimmed === '0') {
      return false;
    }
    if (trimmed === 'true' || trimmed === '1') {
      return true;
    }
  }
  return fallback;
}

export function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;

export function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('name');
  }
  const trimmed = value.trim();
  if (trimmed.length < NAME_MIN_LENGTH || trimmed.length > NAME_MAX_LENGTH) {
    throw new Error('name');
  }
  return trimmed;
}
