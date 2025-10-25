function stripQueryAndHash(input: string): string {
  const queryIndex = input.indexOf('?');
  const hashIndex = input.indexOf('#');
  let end = input.length;
  if (queryIndex !== -1) {
    end = Math.min(end, queryIndex);
  }
  if (hashIndex !== -1) {
    end = Math.min(end, hashIndex);
  }
  return input.slice(0, end);
}

function cleanPath(path: string): string {
  const withoutQuery = stripQueryAndHash(path.trim());
  const normalized = withoutQuery.replace(/\/+/g, '/');
  return normalized
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('/');
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function extractSlugFromSegments(segments: string[]): string | null {
  if (segments.length === 0) {
    return null;
  }

  const cleanedSegments = [...segments];
  if (cleanedSegments[0]?.toLowerCase() === 'p') {
    cleanedSegments.shift();
  }

  if (cleanedSegments.length === 0) {
    return null;
  }

  const [first, ...rest] = cleanedSegments.map(decodeSegment);
  if (!first) {
    return null;
  }

  if (rest.length === 0) {
    return first;
  }

  return [first, ...rest].join('/');
}

function tryParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    try {
      return new URL(input, 'https://example.com');
    } catch {
      return null;
    }
  }
}

export function normalizeProductSlugInput(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const url = tryParseUrl(trimmed);
  if (url) {
    const path = cleanPath(url.pathname);
    const segments = path.split('/').filter(Boolean);
    const slug = extractSlugFromSegments(segments);
    return slug && slug.length > 0 ? slug : null;
  }

  const cleaned = cleanPath(trimmed);
  if (!cleaned) {
    return null;
  }

  const segments = cleaned.split('/').filter(Boolean);
  const slug = extractSlugFromSegments(segments);
  return slug && slug.length > 0 ? slug : null;
}

