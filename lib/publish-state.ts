export interface PublishBatch {
  slugs: string[];
  createdAt: number;
}

let lastPublishedBatch: PublishBatch | null = null;

function sanitizeSlugs(input: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const slug of input) {
    if (typeof slug !== 'string') {
      continue;
    }
    const trimmed = slug.trim();
    if (!trimmed) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function setLastPublishedBatch(slugs: string[], options?: { createdAt?: number }): void {
  const sanitized = sanitizeSlugs(slugs);
  if (sanitized.length === 0) {
    lastPublishedBatch = null;
    return;
  }
  const createdAt = typeof options?.createdAt === 'number' ? options.createdAt : Date.now();
  lastPublishedBatch = { slugs: sanitized, createdAt };
}

export function getLastPublishedBatch(): PublishBatch | null {
  return lastPublishedBatch;
}

export function clearLastPublishedBatch(): void {
  lastPublishedBatch = null;
}
