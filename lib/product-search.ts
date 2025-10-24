export type NormalizedProductQuery =
  | { type: 'slug'; value: string; searchTerm: string; raw: string }
  | { type: 'id'; value: string; searchTerm: string; raw: string };

function cleanPathSegment(segment: string): string {
  let value = segment.replace(/\+/g, ' ').trim();
  if (!value) {
    return '';
  }

  try {
    value = decodeURIComponent(value);
  } catch {
    // ignore decoding issues
  }

  const queryIndex = value.indexOf('?');
  if (queryIndex >= 0) {
    value = value.slice(0, queryIndex);
  }

  const hashIndex = value.indexOf('#');
  if (hashIndex >= 0) {
    value = value.slice(0, hashIndex);
  }

  return value.trim();
}

function sanitizeSlug(candidate: string): string {
  const cleaned = candidate
    .replace(/\.html?$/i, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .toLowerCase();

  return cleaned;
}

function fromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const segments = url.pathname
      .split('/')
      .map((segment) => cleanPathSegment(segment))
      .filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    if (segments[0].toLowerCase() === 'p' && segments.length > 1) {
      return segments[1];
    }

    return segments[segments.length - 1];
  } catch {
    return null;
  }
}

export function normalizeProductQuery(input: string | null | undefined): NormalizedProductQuery | null {
  if (!input) {
    return null;
  }

  let value = input.trim();
  if (!value) {
    return null;
  }

  const urlCandidate = fromUrl(value);
  if (urlCandidate) {
    value = urlCandidate;
  }

  value = cleanPathSegment(value);
  if (!value) {
    return null;
  }

  const numeric = /^[0-9]+$/.test(value) ? value : null;
  if (numeric) {
    return { type: 'id', value: numeric, searchTerm: numeric, raw: input };
  }

  const slug = sanitizeSlug(value);
  if (!slug) {
    return null;
  }

  const searchTerm = slug.replace(/-/g, ' ').trim() || slug;

  return { type: 'slug', value: slug, searchTerm, raw: input };
}
