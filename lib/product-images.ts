import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from './db';
import { buildDeliveryUrl, normalizeBaseUrl } from './cloudflare-images';

export type ImagesJsonFormat = 'strings' | 'objects';

export interface ParsedImagesJson {
  entries: unknown[];
  format: ImagesJsonFormat;
}

export interface BasicProductImageInfo {
  id: string;
  slug: string;
  title: string | null;
  imagesJson: string | null;
}

export interface ProductIdentifier {
  slug?: string | null;
  id?: string | number | bigint | null;
}

export interface CloudflareImageDetails {
  imageId: string | null;
  variant: string | null;
}

export interface NormalizedImageEntry {
  rawIndex: number;
  rawValue: unknown;
  url: string;
  source: 'cloudflare' | 'external';
  imageId?: string | null;
  variant?: string | null;
  variantUrlPublic?: string | null;
}

function cloneEntry(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }
  return { ...(entry as Record<string, unknown>) };
}

function detectFormat(entries: unknown[]): ImagesJsonFormat {
  return entries.some((item) => item && typeof item === 'object') ? 'objects' : 'strings';
}

export function parseImagesJson(value: string | null): ParsedImagesJson {
  if (!value) {
    return { entries: [], format: 'strings' };
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const entries = parsed.map((item) => cloneEntry(item));
      return { entries, format: detectFormat(entries) };
    }
  } catch {
    // ignored
  }

  return { entries: [], format: 'strings' };
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

export function inferCloudflareImageDetails(
  url: string,
  baseUrl?: string
): CloudflareImageDetails {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+/g, '/');
    const segments = pathname.split('/').filter(Boolean);

    if (normalizedBase && url.startsWith(normalizedBase)) {
      const remainder = url.slice(normalizedBase.length).split('?')[0];
      const parts = remainder.split('/').filter(Boolean);
      if (parts.length >= 1) {
        return {
          imageId: parts[0] || null,
          variant: parts.length >= 2 ? parts[1] || null : null
        };
      }
    }

    if (segments.length >= 3 && parsed.hostname.endsWith('imagedelivery.net')) {
      return {
        imageId: segments[segments.length - 2] || null,
        variant: segments[segments.length - 1] || null
      };
    }

    return { imageId: null, variant: null };
  } catch {
    return { imageId: null, variant: null };
  }
}

function resolveVariantUrlPublic(baseUrl: string | undefined, imageId: string | null): string | null {
  if (!imageId) {
    return null;
  }
  return buildDeliveryUrl(baseUrl, imageId, 'public');
}

export function normalizeImageEntry(
  rawValue: unknown,
  index: number,
  baseUrl?: string
): NormalizedImageEntry | null {
  if (typeof rawValue === 'string') {
    const url = normalizeUrl(rawValue);
    if (!url) {
      return null;
    }
    const details = inferCloudflareImageDetails(url, baseUrl);
    const source = details.imageId ? 'cloudflare' : 'external';
    return {
      rawIndex: index,
      rawValue,
      url,
      source,
      imageId: details.imageId,
      variant: details.variant,
      variantUrlPublic: resolveVariantUrlPublic(baseUrl, details.imageId)
    };
  }

  if (rawValue && typeof rawValue === 'object') {
    const record = rawValue as Record<string, unknown>;
    const url = normalizeUrl(record.url ?? record.src ?? record.href);
    if (!url) {
      return null;
    }
    const explicitImageId = normalizeUrl(record.image_id ?? record.imageId);
    const variant = normalizeUrl(record.variant ?? record.defaultVariant);
    const details = explicitImageId
      ? { imageId: explicitImageId, variant: variant ?? null }
      : inferCloudflareImageDetails(url, baseUrl);
    const source = details.imageId ? 'cloudflare' : 'external';
    return {
      rawIndex: index,
      rawValue,
      url,
      source,
      imageId: details.imageId,
      variant: details.variant ?? variant ?? null,
      variantUrlPublic: resolveVariantUrlPublic(baseUrl, details.imageId)
    };
  }

  return null;
}

export function normalizeImages(
  parsed: ParsedImagesJson,
  baseUrl?: string
): NormalizedImageEntry[] {
  const results: NormalizedImageEntry[] = [];
  for (let index = 0; index < parsed.entries.length; index++) {
    const normalized = normalizeImageEntry(parsed.entries[index], index, baseUrl);
    if (normalized) {
      results.push(normalized);
    }
  }
  return results;
}

export function toImagesJsonString(parsed: ParsedImagesJson): string {
  return JSON.stringify(parsed.entries);
}

export function appendImageEntry(
  parsed: ParsedImagesJson,
  url: string,
  options?: { imageId?: string | null; variant?: string | null }
): ParsedImagesJson {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    return parsed;
  }

  const entries = [...parsed.entries];

  if (parsed.format === 'objects') {
    const record: Record<string, unknown> = { url: cleanUrl };
    if (options?.imageId) {
      record.image_id = options.imageId;
    }
    if (options?.variant) {
      record.variant = options.variant;
    }
    entries.push(record);
    return { entries, format: 'objects' };
  }

  entries.push(cleanUrl);
  return { entries, format: detectFormat(entries) };
}

export function moveImageEntry(
  parsed: ParsedImagesJson,
  fromIndex: number,
  toIndex: number
): ParsedImagesJson {
  if (fromIndex === toIndex) {
    return parsed;
  }

  const entries = parsed.entries.map((entry) => cloneEntry(entry));
  if (fromIndex < 0 || fromIndex >= entries.length || toIndex < 0 || toIndex >= entries.length) {
    return parsed;
  }

  const [item] = entries.splice(fromIndex, 1);
  entries.splice(toIndex, 0, item);

  return { entries, format: detectFormat(entries) };
}

export function moveImageEntryToFront(parsed: ParsedImagesJson, index: number): ParsedImagesJson {
  if (index <= 0) {
    return parsed;
  }
  return moveImageEntry(parsed, index, 0);
}

export function replaceImageEntry(
  parsed: ParsedImagesJson,
  index: number,
  url: string,
  options?: { imageId?: string | null; variant?: string | null }
): ParsedImagesJson {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    return parsed;
  }

  const entries = parsed.entries.map((entry) => cloneEntry(entry));
  if (index < 0 || index >= entries.length) {
    return parsed;
  }

  const current = entries[index];

  if (typeof current === 'string' || current === null || current === undefined) {
    entries[index] = cleanUrl;
  } else if (typeof current === 'object') {
    const record = { ...(current as Record<string, unknown>) };
    record.url = cleanUrl;
    if (typeof record.src === 'string') {
      record.src = cleanUrl;
    }
    if (typeof record.href === 'string') {
      record.href = cleanUrl;
    }

    if (options?.imageId) {
      record.image_id = options.imageId;
      record.imageId = options.imageId;
    } else {
      delete record.image_id;
      delete record.imageId;
    }

    if (options?.variant) {
      record.variant = options.variant;
      record.defaultVariant = options.variant;
    } else {
      delete record.variant;
      delete record.defaultVariant;
    }

    entries[index] = record;
  } else {
    entries[index] = cleanUrl;
  }

  return { entries, format: detectFormat(entries) };
}

export function removeImageEntries(
  parsed: ParsedImagesJson,
  predicate: (entry: NormalizedImageEntry) => boolean,
  baseUrl?: string
): { parsed: ParsedImagesJson; removed: NormalizedImageEntry[] } {
  const normalized = normalizeImages(parsed, baseUrl);
  if (normalized.length === 0) {
    return { parsed, removed: [] };
  }

  const keptEntries: unknown[] = [];
  const removed: NormalizedImageEntry[] = [];

  for (const entry of normalized) {
    if (predicate(entry)) {
      removed.push(entry);
    } else {
      keptEntries.push(cloneEntry(parsed.entries[entry.rawIndex]));
    }
  }

  if (removed.length === 0) {
    return { parsed, removed };
  }

  const format = keptEntries.length > 0 ? detectFormat(keptEntries) : parsed.format;
  return { parsed: { entries: keptEntries, format }, removed };
}

export async function getProductForImages(
  identifier: ProductIdentifier,
  options?: { connection?: PoolConnection }
): Promise<BasicProductImageInfo | null> {
  const pool = options?.connection ? null : getPool();
  const connection = options?.connection ?? (await pool!.getConnection());
  let releaseConnection = false;

  if (!options?.connection) {
    releaseConnection = true;
  }

  try {
    const records: RowDataPacket[] = [];

    const slug = identifier.slug?.toString().trim();
    const idValue = identifier.id;

    if (slug) {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT id, slug, title_h1, images_json FROM products WHERE slug = ? LIMIT 1',
        [slug]
      );
      if (rows.length > 0) {
        records.push(rows[0]);
      }
    }

    if (records.length === 0 && idValue !== null && idValue !== undefined && idValue !== '') {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT id, slug, title_h1, images_json FROM products WHERE id = ? LIMIT 1',
        [idValue]
      );
      if (rows.length > 0) {
        records.push(rows[0]);
      }
    }

    if (records.length === 0) {
      return null;
    }

    const row = records[0] as RowDataPacket & {
      id?: string | number | bigint;
      slug?: string;
      title_h1?: string | null;
      images_json?: string | null;
    };

    const id = row.id != null ? row.id.toString() : '';
    const slugValue = row.slug ?? slug ?? '';
    const title = typeof row.title_h1 === 'string' ? row.title_h1 : null;

    return {
      id,
      slug: slugValue,
      title,
      imagesJson: typeof row.images_json === 'string' ? row.images_json : null
    };
  } finally {
    if (releaseConnection) {
      connection.release();
    }
  }
}
