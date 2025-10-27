export const CATEGORY_SLUG_MAX_LENGTH = 80;
export const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function stripDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u0300-\u036f]/g, '');
}

export function slugifyCategoryName(value: string): string {
  const base = stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, CATEGORY_SLUG_MAX_LENGTH);
}

export function coerceCategorySlug(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    if (fallback) {
      return fallback;
    }
    throw new Error('slug');
  }
  const normalized = value.trim().toLowerCase();
  if (!CATEGORY_SLUG_REGEX.test(normalized) || normalized.length === 0 || normalized.length > CATEGORY_SLUG_MAX_LENGTH) {
    if (fallback) {
      return fallback;
    }
    throw new Error('slug');
  }
  return normalized;
}

export function ensureCategorySlug(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('slug');
  }
  const normalized = value.trim().toLowerCase();
  if (!CATEGORY_SLUG_REGEX.test(normalized) || normalized.length === 0 || normalized.length > CATEGORY_SLUG_MAX_LENGTH) {
    throw new Error('slug');
  }
  return normalized;
}
