/* eslint-disable @next/next/no-img-element */
'use client';

import type { ChangeEvent, CSSProperties, DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buttonStyle, cardStyle, disabledButtonStyle, inputStyle } from './panel-styles';
import { createAdminApiClient } from './admin-api-client';

interface AssetsPanelProps {
  cfImagesEnabled: boolean;
  cfImagesBaseUrl?: string | null;
  authHeader?: string | null;
  adminToken?: string | null;
}

interface SearchResult {
  id: string;
  slug: string;
  title: string | null;
}

interface ResolvedImage {
  url: string;
  source: 'cloudflare' | 'external';
  image_id?: string | null;
  variant?: string | null;
  variant_url_public?: string | null;
}

type ActivityType =
  | 'upload'
  | 'delete'
  | 'remove'
  | 'preview'
  | 'validate'
  | 'make-primary'
  | 'relink'
  | 'bulk-attach'
  | 'purge';

interface ActivityEntry {
  id: string;
  type: ActivityType;
  slug: string | null;
  target: string;
  status: 'success' | 'error';
  latencyMs?: number | null;
  rayId?: string | null;
  httpStatus?: number | null;
  sizeBytes?: number | null;
  message?: string | null;
  timestamp: number;
}

interface UploadResponseBody {
  ok: boolean;
  image_id?: string;
  delivery_url?: string | null;
  variant?: string;
  variants?: string[];
  latency_ms?: number;
  ray_id?: string | null;
  size_bytes?: number;
  error_code?: string;
  message?: string;
}

interface DeleteResponseBody {
  ok: boolean;
  latency_ms?: number;
  ray_id?: string | null;
  status?: number | null;
  error_code?: string;
  message?: string;
}

interface RemoveResponseBody {
  ok: boolean;
  removed?: number;
  error_code?: string;
  message?: string;
}

interface ValidationResult {
  url: string;
  source: 'cloudflare' | 'external';
  ok: boolean;
  status?: number | null;
  latency_ms?: number | null;
  ray_id?: string | null;
  message?: string | null;
}

interface ValidateResponseBody {
  ok: boolean;
  results?: ValidationResult[];
  message?: string;
  error_code?: string;
}

interface ResolveResponseBody {
  ok: boolean;
  product?: {
    id: string;
    slug: string;
    title: string | null;
  };
  images?: ResolvedImage[];
  images_json_format?: 'strings' | 'objects';
  error_code?: string;
  message?: string;
}

interface VariantPreviewResponseBody {
  ok: boolean;
  url?: string;
  status?: number;
  latency_ms?: number;
  ray_id?: string | null;
  content_length?: number | null;
  error_code?: string;
  message?: string;
}

interface MakePrimaryResponseBody {
  ok: boolean;
  duration_ms?: number;
  moved_from_index?: number;
  revalidated?: boolean;
  purge?: {
    attempted: boolean;
    ok: boolean;
    latency_ms?: number;
    ray_ids?: string[];
    status?: number | null;
  };
  error_code?: string;
  message?: string;
}

interface RelinkResponseBody {
  ok: boolean;
  image?: {
    url: string;
    image_id: string;
    variant: string;
    source: 'cloudflare';
  };
  original_url?: string;
  download_latency_ms?: number;
  upload_latency_ms?: number;
  upload_ray_id?: string | null;
  error_code?: string;
  message?: string;
  status?: number;
}

interface BulkAttachResult {
  slug: string;
  status: 'attached' | 'skipped' | 'error';
  detail?: string;
}

interface BulkAttachResponseBody {
  ok: boolean;
  results?: BulkAttachResult[];
  total?: number;
  attached?: number;
  skipped?: number;
  errors?: number;
  error_code?: string;
  message?: string;
}

interface PurgeResponseBody {
  ok: boolean;
  latency_ms?: number;
  ray_ids?: string[];
  error_code?: string;
  message?: string;
  status?: number;
}

interface SelectedProduct {
  id: string;
  slug: string;
  title: string | null;
}

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

type VariantPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      url: string;
      statusCode: number;
      latencyMs: number;
      rayId: string | null;
      contentLength: number | null;
    }
  | {
      status: 'error';
      message: string;
      statusCode?: number;
      latencyMs?: number;
      rayId?: string | null;
      contentLength?: number | null;
    };

interface NormalizedProductQuery {
  searchTerm: string;
  slugParam: string | null;
  idParam: string | null;
}

function normalizeProductQueryInput(input: string): NormalizedProductQuery {
  const trimmed = input.trim();
  if (!trimmed) {
    return { searchTerm: '', slugParam: null, idParam: null };
  }

  let working = trimmed;

  try {
    const parsed = new URL(working);
    working = parsed.pathname || '';
  } catch {
    if (/^[^/]+\.[^/]+\/.+/.test(working)) {
      const slashIndex = working.indexOf('/');
      working = slashIndex >= 0 ? working.slice(slashIndex) : working;
    }
  }

  const queryIndex = working.indexOf('?');
  if (queryIndex >= 0) {
    working = working.slice(0, queryIndex);
  }

  const hashIndex = working.indexOf('#');
  if (hashIndex >= 0) {
    working = working.slice(0, hashIndex);
  }

  const segments = working
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  while (segments.length > 0) {
    const first = segments[0].toLowerCase();
    if (first === 'p' || first === 'product' || first === 'products') {
      segments.shift();
      continue;
    }
    break;
  }

  let candidate = segments.join('/');
  if (!candidate) {
    candidate = trimmed;
  }

  const numeric = /^[0-9]+$/.test(candidate);

  return {
    searchTerm: candidate,
    slugParam: numeric ? null : candidate,
    idParam: numeric ? candidate : null
  };
}

const searchListStyle: CSSProperties = {
  marginTop: '0.5rem',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  maxHeight: 200,
  overflowY: 'auto',
  background: '#fff'
};

const searchItemStyle: CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #e2e8f0',
  cursor: 'pointer'
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '1rem'
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.15rem 0.5rem',
  borderRadius: 999,
  fontSize: '0.75rem'
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#dc2626'
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#1e293b'
};

const disabledDangerButtonStyle: CSSProperties = {
  ...dangerButtonStyle,
  ...disabledButtonStyle
};

const modalBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  zIndex: 1000
};

const modalContentStyle: CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: '1.5rem',
  maxWidth: '90vw',
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)'
};

const uploadAreaStyle: CSSProperties = {
  border: '2px dashed #94a3b8',
  borderRadius: 12,
  padding: '2rem',
  textAlign: 'center' as CSSProperties['textAlign'],
  background: '#f8fafc'
};

const progressBarContainerStyle: CSSProperties = {
  height: 8,
  background: '#e2e8f0',
  borderRadius: 999,
  overflow: 'hidden'
};

const progressBarStyle = (value: number): React.CSSProperties => ({
  width: `${Math.min(100, Math.max(0, value))}%`,
  height: '100%',
  background: '#0f172a',
  transition: 'width 0.3s ease'
});

const variantOptions = ['public', 'thumb', 'card', 'square', 'banner', 'xl'];

function buildDeliveryUrl(baseUrl: string | null | undefined, imageId: string, variant: string): string | null {
  if (!baseUrl) {
    return null;
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanId = imageId.trim();
  const cleanVariant = variant.trim() || 'public';
  if (!cleanId) {
    return null;
  }
  return `${normalizedBase}${cleanId}/${cleanVariant}`;
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} KB`;
  }
  return `${value} bytes`;
}

function formatLatency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${value} ms`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function createActivityEntry(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return { ...entry, id, timestamp: Date.now() };
}

function canDeleteFromCloudflare(image: ResolvedImage): boolean {
  return image.source === 'cloudflare' && typeof image.image_id === 'string' && image.image_id.length > 0;
}

function ActivityTable({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <p style={{ color: '#64748b' }}>Sin actividad reciente.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Timestamp</th>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Tipo</th>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Slug</th>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Objetivo</th>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Estado</th>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Latencia</th>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>HTTP</th>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Ray ID</th>
            <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Mensaje</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{formatTimestamp(entry.timestamp)}</td>
              <td style={{ padding: '0.5rem', textTransform: 'capitalize' }}>{entry.type}</td>
              <td style={{ padding: '0.5rem' }}>{entry.slug ?? '—'}</td>
              <td style={{ padding: '0.5rem', wordBreak: 'break-all' }}>{entry.target}</td>
              <td style={{ padding: '0.5rem' }}>{entry.status === 'success' ? '✅' : '❌'}</td>
              <td style={{ padding: '0.5rem' }}>{formatLatency(entry.latencyMs)}</td>
              <td style={{ padding: '0.5rem' }}>{entry.httpStatus != null ? entry.httpStatus : '—'}</td>
              <td style={{ padding: '0.5rem' }}>{entry.rayId ?? '—'}</td>
              <td style={{ padding: '0.5rem' }}>{entry.message ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function downloadCsv(entries: ActivityEntry[]) {
  if (entries.length === 0) {
    return;
  }
  const header = 'timestamp,type,slug,target,status,latency_ms,http_code,ray_id,message\n';
  const rows = entries
    .map((entry) => {
      const fields = [
        new Date(entry.timestamp).toISOString(),
        entry.type,
        entry.slug ?? '',
        entry.target,
        entry.status,
        entry.latencyMs != null ? String(entry.latencyMs) : '',
        entry.httpStatus != null ? String(entry.httpStatus) : '',
        entry.rayId ?? '',
        entry.message ?? ''
      ];
      return fields.map((field) => `"${field.replace(/"/g, '""')}"`).join(',');
    })
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `assets-activity-errors-${Date.now()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function AssetsPanel({
  cfImagesEnabled,
  cfImagesBaseUrl,
  authHeader,
  adminToken
}: AssetsPanelProps) {
  const [productQuery, setProductQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<AsyncStatus>('idle');
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const [images, setImages] = useState<ResolvedImage[]>([]);
  const [imagesStatus, setImagesStatus] = useState<AsyncStatus>('idle');
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [imagesFormat, setImagesFormat] = useState<'strings' | 'objects'>('strings');
  const [uploadStatus, setUploadStatus] = useState<AsyncStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadMetrics, setUploadMetrics] = useState<{ latency?: number | null; rayId?: string | null; size?: number | null } | null>(null);
  const [uploadVariant, setUploadVariant] = useState('public');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [variantPreview, setVariantPreview] = useState<VariantPreviewState>({ status: 'idle' });
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [validationStatus, setValidationStatus] = useState<AsyncStatus>('idle');
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [bulkAttachStatus, setBulkAttachStatus] = useState<AsyncStatus>('idle');
  const [bulkAttachResults, setBulkAttachResults] = useState<BulkAttachResult[]>([]);
  const [bulkAttachMessage, setBulkAttachMessage] = useState<string | null>(null);

  const normalizedProductQuery = useMemo(
    () => normalizeProductQueryInput(productQuery),
    [productQuery]
  );

  const adminApi = useMemo(
    () => createAdminApiClient({ authHeader, adminToken }),
    [authHeader, adminToken]
  );

  const fetchWithAuth = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => adminApi.fetchWithAuth(input, init),
    [adminApi]
  );

  const searchAbortRef = useRef<AbortController | null>(null);

  const hasErrors = useMemo(() => activity.some((entry) => entry.status === 'error'), [activity]);

  const selectedImage = useMemo(() => {
    if (selectedImageIndex == null) {
      return null;
    }
    return images[selectedImageIndex] ?? null;
  }, [images, selectedImageIndex]);

  const appendActivity = useCallback((entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => {
    setActivity((prev) => {
      const next = [createActivityEntry(entry), ...prev];
      return next.slice(0, 20);
    });
  }, []);

  const setActionPending = useCallback((key: string, pending: boolean) => {
    setPendingActions((prev) => {
      const next = new Set(prev);
      if (pending) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const isActionPending = useCallback((key: string) => pendingActions.has(key), [pendingActions]);

  const refreshImages = useCallback(
    async (slug: string | null, id: string | null) => {
      if (!slug && !id) {
        return;
      }
      setImagesStatus('loading');
      setImagesError(null);
      try {
        const params = new URLSearchParams();
        if (slug) {
          params.set('slug', slug);
        }
        if (id) {
          params.set('id', id);
        }
        const response = await fetchWithAuth(`/api/assets/images/resolve?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store'
        });
        const body = (await response.json()) as ResolveResponseBody;
        if (!response.ok || !body.ok || !body.product) {
          setImagesStatus('error');
          setImagesError(body.message ?? 'No se pudo obtener las imágenes');
          return;
        }
        const images = body.images ?? [];
        setSelectedProduct({ id: body.product.id, slug: body.product.slug, title: body.product.title });
        setImages(images);
        setImagesFormat(body.images_json_format ?? 'strings');
        setImagesStatus('success');
        setValidationResults(null);
        setValidationStatus('idle');
        setValidationError(null);
        setSelectedImageIndex((prev) => {
          if (images.length === 0) {
            return null;
          }
          if (prev == null) {
            return 0;
          }
          if (prev >= images.length) {
            return images.length - 1;
          }
          return prev;
        });
      } catch (error) {
        setImagesStatus('error');
        setImagesError((error as Error)?.message ?? 'Error desconocido');
      }
    },
    [fetchWithAuth]
  );

  const handleSelectProduct = useCallback(
    (result: SearchResult) => {
      setProductQuery(result.slug);
      setSearchResults([]);
      refreshImages(result.slug, result.id);
    },
    [refreshImages]
  );

  const loadProductFromQuery = useCallback(() => {
    const trimmedInput = productQuery.trim();
    if (!trimmedInput) {
      return;
    }

    const searchTerm = normalizedProductQuery.searchTerm.trim();
    const slugParam = normalizedProductQuery.slugParam;
    const idParam = normalizedProductQuery.idParam;

    const candidate =
      searchResults.find(
        (item) =>
          item.slug === searchTerm ||
          (slugParam != null && slugParam.length > 0 && item.slug === slugParam) ||
          (idParam != null && idParam.length > 0 && item.slug === idParam)
      ) ??
      searchResults.find((item) => idParam != null && idParam.length > 0 && item.id === idParam) ??
      searchResults[0] ??
      null;

    if (candidate) {
      handleSelectProduct(candidate);
      return;
    }

    let slug = slugParam;
    let id = idParam;

    if (!slug && !id) {
      if (/^[0-9]+$/.test(searchTerm)) {
        id = searchTerm;
      } else if (searchTerm) {
        slug = searchTerm;
      } else if (/^[0-9]+$/.test(trimmedInput)) {
        id = trimmedInput;
      } else {
        slug = trimmedInput;
      }
    }

    refreshImages(slug ?? null, id ?? null);
  }, [handleSelectProduct, normalizedProductQuery, productQuery, refreshImages, searchResults]);

  useEffect(() => {
    const trimmedInput = productQuery.trim();
    const searchTerm = normalizedProductQuery.searchTerm.trim();

    if (!trimmedInput) {
      setSearchResults([]);
      setSearchStatus('idle');
      searchAbortRef.current?.abort();
      return;
    }

    if (searchTerm.length < 2) {
      setSearchResults([]);
      setSearchStatus('idle');
      searchAbortRef.current?.abort();
      return;
    }

    setSearchStatus('loading');
    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetchWithAuth(`/api/assets/images/search?query=${encodeURIComponent(searchTerm)}`, {
          method: 'GET',
          signal: controller.signal
        });
        const body = (await response.json()) as { ok: boolean; results?: SearchResult[] };
        if (!response.ok || !body.ok || !body.results) {
          setSearchStatus('error');
          return;
        }
        setSearchResults(body.results);
        setSearchStatus('success');
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        setSearchStatus('error');
      }
    }, 250);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fetchWithAuth, normalizedProductQuery.searchTerm, productQuery]);

  useEffect(() => {
    setValidationStatus('idle');
    setValidationError(null);
    setValidationResults(null);
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (!cfImagesEnabled || !selectedImage || selectedImage.source !== 'cloudflare' || !selectedImage.image_id) {
      setVariantPreview({ status: 'idle' });
      return;
    }

    const imageId = selectedImage.image_id;
    const variant = uploadVariant || 'public';
    setVariantPreview({ status: 'loading' });
    const controller = new AbortController();

    const fetchPreview = async () => {
      try {
        const params = new URLSearchParams({ imageId, variant });
        const response = await fetchWithAuth(`/api/assets/images/variant-preview?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal
        });
        const body = (await response.json()) as VariantPreviewResponseBody;
        if (!response.ok || !body.ok || !body.url || typeof body.status !== 'number' || typeof body.latency_ms !== 'number') {
          setVariantPreview({
            status: 'error',
            message: body.message ?? 'No se pudo obtener la previsualización',
            statusCode: body.status,
            latencyMs: body.latency_ms,
            rayId: body.ray_id,
            contentLength: body.content_length
          });
          return;
        }
        setVariantPreview({
          status: 'success',
          url: body.url,
          statusCode: body.status,
          latencyMs: body.latency_ms,
          rayId: body.ray_id ?? null,
          contentLength: body.content_length ?? null
        });
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        setVariantPreview({ status: 'error', message: (error as Error)?.message ?? 'Error inesperado' });
      }
    };

    void fetchPreview();

    return () => {
      controller.abort();
    };
  }, [fetchWithAuth, cfImagesEnabled, selectedImage, uploadVariant]);

  const handleUploadFile = useCallback(
    (file: File) => {
      if (!selectedProduct) {
        setUploadStatus('error');
        setUploadMessage('Selecciona un producto antes de subir imágenes.');
        return;
      }
      if (!cfImagesEnabled) {
        setUploadStatus('error');
        setUploadMessage('Cloudflare Images está deshabilitado.');
        return;
      }

      setUploadStatus('loading');
      setUploadProgress(5);
      setUploadMessage(null);
      setUploadMetrics(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('slugOrId', selectedProduct.slug || selectedProduct.id);
      formData.append('variant', uploadVariant || 'public');

      const xhr = new XMLHttpRequest();
      const uploadUrl = adminApi.withAdminToken('/api/assets/images/upload');
      xhr.open('POST', uploadUrl);
      xhr.responseType = 'json';
      xhr.withCredentials = true;
      adminApi.attachAuthHeadersToXhr(xhr);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 90);
          setUploadProgress(percent);
        } else {
          setUploadProgress((prev) => (prev < 90 ? prev + 5 : prev));
        }
      };

      xhr.onerror = () => {
        setUploadStatus('error');
        setUploadMessage('Error de red al subir la imagen.');
        appendActivity({
          type: 'upload',
          slug: selectedProduct.slug,
          target: file.name,
          status: 'error',
          message: 'network_error'
        });
      };

      xhr.onload = () => {
        const status = xhr.status;
        const body = (xhr.response ?? {}) as UploadResponseBody;
        if (status >= 200 && status < 300 && body.ok) {
          setUploadStatus('success');
          setUploadProgress(100);
          setUploadMessage(`Imagen subida (${body.image_id ?? 'sin id'})`);
          setUploadMetrics({ latency: body.latency_ms, rayId: body.ray_id, size: body.size_bytes });
          appendActivity({
            type: 'upload',
            slug: selectedProduct.slug,
            target: body.image_id ?? file.name,
            status: 'success',
            httpStatus: status,
            latencyMs: body.latency_ms,
            rayId: body.ray_id,
            sizeBytes: body.size_bytes,
            message: body.message ?? undefined
          });
          refreshImages(selectedProduct.slug, selectedProduct.id);
        } else {
          setUploadStatus('error');
          setUploadMessage(body.message ?? 'No se pudo subir la imagen');
          appendActivity({
            type: 'upload',
            slug: selectedProduct.slug,
            target: file.name,
            status: 'error',
            httpStatus: status,
            latencyMs: body.latency_ms,
            rayId: body.ray_id,
            sizeBytes: body.size_bytes,
            message: body.message ?? body.error_code ?? `HTTP ${status}`
          });
        }
      };

      xhr.send(formData);
    },
    [
      appendActivity,
      adminApi,
      cfImagesEnabled,
      refreshImages,
      selectedProduct,
      uploadVariant
    ]
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        handleUploadFile(files[0]);
        event.target.value = '';
      }
    },
    [handleUploadFile]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!cfImagesEnabled) {
        return;
      }
      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleUploadFile(file);
      }
    },
    [cfImagesEnabled, handleUploadFile]
  );

  const handleDeleteImage = useCallback(
    async (image: ResolvedImage) => {
      if (!selectedProduct || !canDeleteFromCloudflare(image) || !image.image_id) {
        return;
      }
      const key = `delete:${image.image_id}`;
      setActionPending(key, true);
      try {
        const response = await fetchWithAuth(`/api/assets/images/${encodeURIComponent(image.image_id)}`, {
          method: 'DELETE'
        });
        const body = (await response.json()) as DeleteResponseBody;
        if (!response.ok || !body.ok) {
          appendActivity({
            type: 'delete',
            slug: selectedProduct.slug,
            target: image.image_id,
            status: 'error',
            httpStatus: response.status,
            latencyMs: body.latency_ms,
            rayId: body.ray_id,
            message: body.message ?? body.error_code ?? `HTTP ${response.status}`
          });
          return;
        }
        appendActivity({
          type: 'delete',
          slug: selectedProduct.slug,
          target: image.image_id,
          status: 'success',
          httpStatus: response.status,
          latencyMs: body.latency_ms,
          rayId: body.ray_id,
          message: body.message ?? undefined
        });
      } catch (error) {
        appendActivity({
          type: 'delete',
          slug: selectedProduct.slug,
          target: image.image_id,
          status: 'error',
          message: (error as Error)?.message
        });
      } finally {
        setActionPending(key, false);
      }
    },
    [appendActivity, fetchWithAuth, selectedProduct, setActionPending]
  );

  const handleValidateUrls = useCallback(async () => {
    if (!selectedProduct) {
      setValidationStatus('error');
      setValidationError('Selecciona un producto antes de validar.');
      return;
    }

    setValidationStatus('loading');
    setValidationError(null);
    setValidationResults(null);

    try {
      const response = await fetchWithAuth('/api/assets/images/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugOrId: selectedProduct.slug ?? selectedProduct.id })
      });
      const body = (await response.json()) as ValidateResponseBody;
      if (!response.ok || !body.ok || !body.results) {
        const message = body.message ?? body.error_code ?? `HTTP ${response.status}`;
        setValidationStatus('error');
        setValidationError(message);
        appendActivity({
          type: 'validate',
          slug: selectedProduct.slug,
          target: selectedProduct.slug ?? selectedProduct.id,
          status: 'error',
          httpStatus: response.status,
          message
        });
        return;
      }

      setValidationStatus('success');
      setValidationResults(body.results);
      body.results.forEach((result) => {
        appendActivity({
          type: 'validate',
          slug: selectedProduct.slug,
          target: result.url,
          status: result.ok ? 'success' : 'error',
          latencyMs: result.latency_ms ?? undefined,
          httpStatus: result.status ?? undefined,
          rayId: result.ray_id ?? undefined,
          message: result.message ?? undefined
        });
      });
    } catch (error) {
      const message = (error as Error)?.message ?? 'Error inesperado';
      setValidationStatus('error');
      setValidationError(message);
      appendActivity({
        type: 'validate',
        slug: selectedProduct.slug,
        target: selectedProduct.slug ?? selectedProduct.id,
        status: 'error',
        message
      });
    }
  }, [appendActivity, fetchWithAuth, selectedProduct]);

  const removeFromProduct = useCallback(
    async (target: string) => {
      if (!selectedProduct) {
        return;
      }
      const key = `remove:${target}`;
      setActionPending(key, true);
      try {
        const response = await fetchWithAuth('/api/assets/images/remove-from-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugOrId: selectedProduct.slug ?? selectedProduct.id, urlOrImageId: target })
        });
        const body = (await response.json()) as RemoveResponseBody;
        if (!response.ok || !body.ok) {
          appendActivity({
            type: 'remove',
            slug: selectedProduct.slug,
            target,
            status: 'error',
            httpStatus: response.status,
            message: body.message ?? body.error_code ?? `HTTP ${response.status}`
          });
          return;
        }
        appendActivity({
          type: 'remove',
          slug: selectedProduct.slug,
          target,
          status: 'success',
          httpStatus: response.status,
          message: body.message ?? undefined
        });
        refreshImages(selectedProduct.slug, selectedProduct.id);
      } catch (error) {
        appendActivity({
          type: 'remove',
          slug: selectedProduct.slug,
          target,
          status: 'error',
          message: (error as Error)?.message
        });
      } finally {
        setActionPending(key, false);
      }
    },
    [appendActivity, fetchWithAuth, refreshImages, selectedProduct, setActionPending]
  );

  const handleRemoveImage = useCallback(
    (image: ResolvedImage) => {
      const target = image.image_id ?? image.url;
      if (!target) {
        return;
      }
      void removeFromProduct(target);
    },
    [removeFromProduct]
  );

  const handleMakePrimary = useCallback(
    async (image: ResolvedImage) => {
      if (!selectedProduct) {
        return;
      }
      const target = image.image_id ?? image.url;
      if (!target) {
        return;
      }
      const key = `make-primary:${target}`;
      setActionPending(key, true);
      try {
        const response = await fetchWithAuth('/api/assets/images/make-primary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugOrId: selectedProduct.slug ?? selectedProduct.id, urlOrImageId: target })
        });
        const body = (await response.json()) as MakePrimaryResponseBody;
        if (!response.ok || !body.ok) {
          appendActivity({
            type: 'make-primary',
            slug: selectedProduct.slug,
            target,
            status: 'error',
            httpStatus: response.status,
            latencyMs: body.duration_ms ?? undefined,
            message: body.message ?? body.error_code ?? `HTTP ${response.status}`
          });
          return;
        }
        appendActivity({
          type: 'make-primary',
          slug: selectedProduct.slug,
          target,
          status: 'success',
          httpStatus: response.status,
          latencyMs: body.duration_ms ?? undefined,
          rayId: body.purge?.ray_ids && body.purge.ray_ids.length > 0 ? body.purge.ray_ids[0] : undefined,
          message:
            body.purge && body.purge.attempted && !body.purge.ok
              ? 'purge_failed'
              : body.message ?? undefined
        });
        setSelectedImageIndex(0);
        refreshImages(selectedProduct.slug, selectedProduct.id);
      } catch (error) {
        appendActivity({
          type: 'make-primary',
          slug: selectedProduct.slug,
          target,
          status: 'error',
          message: (error as Error)?.message
        });
      } finally {
        setActionPending(key, false);
      }
    },
    [appendActivity, fetchWithAuth, refreshImages, selectedProduct, setActionPending]
  );

  const handleRelinkFromUrl = useCallback(
    async (image: ResolvedImage) => {
      if (!selectedProduct || image.source !== 'external') {
        return;
      }
      if (!cfImagesEnabled) {
        appendActivity({
          type: 'relink',
          slug: selectedProduct.slug,
          target: image.url,
          status: 'error',
          message: 'Cloudflare Images deshabilitado'
        });
        return;
      }
      const key = `relink:${image.url}`;
      setActionPending(key, true);
      try {
        const response = await fetchWithAuth('/api/assets/images/relink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugOrId: selectedProduct.slug ?? selectedProduct.id, url: image.url })
        });
        const body = (await response.json()) as RelinkResponseBody;
        if (!response.ok || !body.ok) {
          appendActivity({
            type: 'relink',
            slug: selectedProduct.slug,
            target: image.url,
            status: 'error',
            httpStatus: body.status ?? response.status,
            latencyMs: body.upload_latency_ms ?? undefined,
            rayId: body.upload_ray_id ?? undefined,
            message: body.message ?? body.error_code ?? `HTTP ${response.status}`
          });
          return;
        }
        appendActivity({
          type: 'relink',
          slug: selectedProduct.slug,
          target: image.url,
          status: 'success',
          httpStatus: response.status,
          latencyMs: body.upload_latency_ms ?? undefined,
          rayId: body.upload_ray_id ?? undefined,
          message: body.image?.image_id ?? undefined
        });
        refreshImages(selectedProduct.slug, selectedProduct.id);
      } catch (error) {
        appendActivity({
          type: 'relink',
          slug: selectedProduct.slug,
          target: image.url,
          status: 'error',
          message: (error as Error)?.message
        });
      } finally {
        setActionPending(key, false);
      }
    },
    [appendActivity, cfImagesEnabled, fetchWithAuth, refreshImages, selectedProduct, setActionPending]
  );

  const handleBulkAttachFile = useCallback(
    async (file: File) => {
      if (!cfImagesEnabled) {
        setBulkAttachStatus('error');
        setBulkAttachMessage('Cloudflare Images está deshabilitado.');
        return;
      }
      setBulkAttachStatus('loading');
      setBulkAttachResults([]);
      setBulkAttachMessage(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetchWithAuth('/api/assets/images/bulk-attach', {
          method: 'POST',
          body: formData
        });
        const body = (await response.json()) as BulkAttachResponseBody;
        if (!response.ok || !body.ok || !body.results) {
          const message = body.message ?? body.error_code ?? `HTTP ${response.status}`;
          setBulkAttachStatus('error');
          setBulkAttachMessage(message);
          appendActivity({
            type: 'bulk-attach',
            slug: selectedProduct?.slug ?? null,
            target: file.name,
            status: 'error',
            httpStatus: response.status,
            message
          });
          return;
        }

        setBulkAttachStatus('success');
        setBulkAttachResults(body.results);
        const summaryAttached = body.attached ?? 0;
        const summarySkipped = body.skipped ?? 0;
        const summaryErrors = body.errors ?? 0;
        setBulkAttachMessage(
          `Adjuntadas ${summaryAttached}, omitidas ${summarySkipped}, errores ${summaryErrors}`
        );
        body.results.forEach((result) => {
          appendActivity({
            type: 'bulk-attach',
            slug: result.slug || null,
            target: result.detail ?? result.slug,
            status: result.status === 'error' ? 'error' : 'success',
            httpStatus: response.status,
            message: result.status === 'skipped' ? 'duplicado' : result.detail ?? undefined
          });
        });
        if (
          selectedProduct?.slug &&
          body.results.some((result) => result.slug === selectedProduct.slug && result.status === 'attached')
        ) {
          refreshImages(selectedProduct.slug, selectedProduct.id);
        }
      } catch (error) {
        const message = (error as Error)?.message ?? 'Error inesperado';
        setBulkAttachStatus('error');
        setBulkAttachMessage(message);
        appendActivity({
          type: 'bulk-attach',
          slug: selectedProduct?.slug ?? null,
          target: file.name,
          status: 'error',
          message
        });
      }
    },
    [appendActivity, cfImagesEnabled, fetchWithAuth, refreshImages, selectedProduct]
  );

  const handleBulkAttachInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleBulkAttachFile(file);
        event.target.value = '';
      }
    },
    [handleBulkAttachFile]
  );

  const handlePurgeImage = useCallback(
    async (image: ResolvedImage) => {
      const targetUrl = image.variant_url_public ?? image.url;
      if (!targetUrl) {
        return;
      }
      const key = `purge:${targetUrl}`;
      setActionPending(key, true);
      try {
        const response = await fetchWithAuth('/api/assets/images/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl })
        });
        const body = (await response.json()) as PurgeResponseBody;
        if (!response.ok || !body.ok) {
          appendActivity({
            type: 'purge',
            slug: selectedProduct?.slug ?? null,
            target: targetUrl,
            status: 'error',
            httpStatus: body.status ?? response.status,
            latencyMs: body.latency_ms ?? undefined,
            rayId: body.ray_ids && body.ray_ids.length > 0 ? body.ray_ids[0] : undefined,
            message: body.message ?? body.error_code ?? `HTTP ${response.status}`
          });
          return;
        }
        appendActivity({
          type: 'purge',
          slug: selectedProduct?.slug ?? null,
          target: targetUrl,
          status: 'success',
          httpStatus: response.status,
          latencyMs: body.latency_ms ?? undefined,
          rayId: body.ray_ids && body.ray_ids.length > 0 ? body.ray_ids[0] : undefined,
          message: body.message ?? undefined
        });
      } catch (error) {
        appendActivity({
          type: 'purge',
          slug: selectedProduct?.slug ?? null,
          target: targetUrl,
          status: 'error',
          message: (error as Error)?.message
        });
      } finally {
        setActionPending(key, false);
      }
    },
    [appendActivity, fetchWithAuth, selectedProduct, setActionPending]
  );

  const handleCopyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.warn('No se pudo copiar la URL', error);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Product Picker</h2>
        <p style={{ margin: 0, color: '#475569' }}>Busca por slug o ID y selecciona el producto para gestionar sus imágenes.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Buscar por slug o ID"
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                loadProductFromQuery();
              }
            }}
            style={inputStyle}
            aria-label="Buscar producto"
          />
          {searchStatus === 'loading' && <span style={{ color: '#64748b' }}>Buscando…</span>}
          {searchStatus === 'error' && <span style={{ color: '#dc2626' }}>Error al buscar productos</span>}
          {searchResults.length > 0 && (
            <div style={searchListStyle}>
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  style={{ ...searchItemStyle, borderBottom: '1px solid #e2e8f0' }}
                  onClick={() => handleSelectProduct(result)}
                >
                  <strong>{result.slug}</strong>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{result.title ?? 'Sin título'}</div>
                </div>
              ))}
            </div>
          )}
          {selectedProduct && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <strong>Seleccionado:</strong>
              <span>{selectedProduct.slug}</span>
              {selectedProduct.title && <span style={{ color: '#475569' }}>{selectedProduct.title}</span>}
            </div>
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Upload Image</h2>
        {!cfImagesEnabled && (
          <div style={{ ...chipStyle, background: '#fee2e2', color: '#991b1b' }}>
            Cloudflare Images está deshabilitado por configuración.
          </div>
        )}
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          style={{ ...uploadAreaStyle, opacity: cfImagesEnabled ? 1 : 0.5 }}
        >
          <p style={{ margin: 0, color: '#475569' }}>Arrastra una imagen o elige un archivo</p>
          <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: '#64748b' }}>Formatos: JPG, PNG, WebP — Máximo 10 MB</p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', marginTop: '1rem' }}>
            <label style={cfImagesEnabled ? secondaryButtonStyle : disabledButtonStyle}>
              <span>Seleccionar archivo</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
                disabled={!cfImagesEnabled}
              />
            </label>
            <select
              value={uploadVariant}
              onChange={(event) => setUploadVariant(event.target.value)}
              style={{ ...inputStyle, maxWidth: 200 }}
              disabled={!cfImagesEnabled}
            >
              {variantOptions.map((option) => (
                <option key={option} value={option}>
                  Variant: {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        {uploadStatus === 'loading' && (
          <div style={{ width: '100%' }}>
            <div style={progressBarContainerStyle}>
              <div style={progressBarStyle(uploadProgress)} />
            </div>
            <p style={{ marginTop: '0.5rem', color: '#475569' }}>Subiendo…</p>
          </div>
        )}
        {uploadStatus === 'success' && (
          <div style={{ color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <strong>Upload exitoso</strong>
            {uploadMessage && <span>{uploadMessage}</span>}
            <span>Latencia: {formatLatency(uploadMetrics?.latency ?? null)}</span>
            <span>Ray ID: {uploadMetrics?.rayId ?? '—'}</span>
            <span>Tamaño: {formatBytes(uploadMetrics?.size ?? null)}</span>
          </div>
        )}
        {uploadStatus === 'error' && <div style={{ color: '#dc2626' }}>{uploadMessage ?? 'Error al subir la imagen'}</div>}
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Current Images</h2>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => refreshImages(selectedProduct?.slug ?? null, selectedProduct?.id ?? null)}
            disabled={imagesStatus === 'loading' || !selectedProduct}
          >
            Refrescar
          </button>
        </div>
        {imagesStatus === 'loading' && <p style={{ color: '#64748b' }}>Cargando imágenes…</p>}
        {imagesStatus === 'error' && <p style={{ color: '#dc2626' }}>{imagesError ?? 'Error al cargar imágenes'}</p>}
        {imagesStatus === 'success' && images.length === 0 && <p style={{ color: '#64748b' }}>Sin imágenes.</p>}
        {imagesStatus === 'success' && images.length > 0 && (
          <div style={gridStyle}>
            {images.map((image, index) => {
              const isSelected = selectedImageIndex === index;
              const variantUrl = image.variant_url_public ?? image.url;
              const makePrimaryKey = `make-primary:${image.image_id ?? image.url}`;
              const relinkKey = `relink:${image.url}`;
              const purgeTarget = image.variant_url_public ?? image.url;
              const purgeKey = `purge:${purgeTarget}`;
              return (
                <div
                  key={`${image.url}-${index}`}
                  style={{
                    border: isSelected ? '2px solid #0f172a' : '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    background: '#fff'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedImageIndex(index)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer'
                    }}
                    aria-label={`Seleccionar imagen ${index + 1}`}
                  >
                    <img
                      src={variantUrl}
                      alt={`Imagen ${index + 1}`}
                      style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }}
                      loading="lazy"
                    />
                  </button>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ ...chipStyle, background: image.source === 'cloudflare' ? '#dcfce7' : '#e0f2fe', color: '#0f172a' }}>
                      {image.source === 'cloudflare' ? 'Cloudflare' : 'Externa'}
                    </span>
                    {image.variant && (
                      <span style={{ ...chipStyle, background: '#f1f5f9', color: '#475569' }}>Variant: {image.variant}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                      type="button"
                      style={
                        index === 0 || isActionPending(makePrimaryKey)
                          ? disabledButtonStyle
                          : secondaryButtonStyle
                      }
                      onClick={() => handleMakePrimary(image)}
                      disabled={index === 0 || isActionPending(makePrimaryKey)}
                    >
                      Make Primary
                    </button>
                    <button type="button" style={secondaryButtonStyle} onClick={() => setPreviewImageUrl(image.url)}>
                      Preview
                    </button>
                    <button type="button" style={secondaryButtonStyle} onClick={() => handleCopyUrl(image.url)}>
                      Copy URL
                    </button>
                    {image.source === 'external' && (
                      <button
                        type="button"
                        style={
                          !cfImagesEnabled || isActionPending(relinkKey)
                            ? disabledButtonStyle
                            : secondaryButtonStyle
                        }
                        onClick={() => handleRelinkFromUrl(image)}
                        disabled={!cfImagesEnabled || isActionPending(relinkKey)}
                      >
                        Relink from URL
                      </button>
                    )}
                    {image.source === 'cloudflare' && (
                      <button
                        type="button"
                        style={
                          !cfImagesEnabled || isActionPending(purgeKey)
                            ? disabledButtonStyle
                            : secondaryButtonStyle
                        }
                        onClick={() => handlePurgeImage(image)}
                        disabled={!cfImagesEnabled || isActionPending(purgeKey)}
                      >
                        Purge Image (CDN)
                      </button>
                    )}
                    <button
                      type="button"
                      style={canDeleteFromCloudflare(image)
                        ? !cfImagesEnabled || isActionPending(`delete:${image.image_id}`)
                          ? disabledDangerButtonStyle
                          : dangerButtonStyle
                        : disabledButtonStyle}
                      onClick={() => handleDeleteImage(image)}
                      disabled={
                        !cfImagesEnabled || !canDeleteFromCloudflare(image) || isActionPending(`delete:${image.image_id}`)
                      }
                    >
                      Delete from Cloudflare
                    </button>
                    <button
                      type="button"
                      style={isActionPending(`remove:${image.image_id ?? image.url}`) ? disabledButtonStyle : buttonStyle}
                      onClick={() => handleRemoveImage(image)}
                      disabled={isActionPending(`remove:${image.image_id ?? image.url}`)}
                    >
                      Remove from product
                    </button>
                  </div>
                  <small style={{ color: '#64748b', wordBreak: 'break-all' }}>{image.url}</small>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Quality &amp; Sync Tools</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#0f172a' }}>Validate URLs</h3>
            <p style={{ margin: '0 0 0.75rem 0', color: '#475569' }}>
              Ejecuta una validación rápida para verificar que todas las imágenes respondan correctamente.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={
                  !selectedProduct || validationStatus === 'loading'
                    ? disabledButtonStyle
                    : secondaryButtonStyle
                }
                onClick={() => void handleValidateUrls()}
                disabled={!selectedProduct || validationStatus === 'loading'}
              >
                {validationStatus === 'loading' ? 'Validando…' : 'Validate URLs'}
              </button>
              {!selectedProduct && (
                <span style={{ color: '#64748b' }}>Selecciona un producto para comenzar.</span>
              )}
            </div>
            {validationStatus === 'error' && validationError && (
              <p style={{ color: '#dc2626', marginTop: '0.75rem' }}>{validationError}</p>
            )}
            {validationStatus === 'loading' && (
              <p style={{ color: '#64748b', marginTop: '0.75rem' }}>Validando URLs…</p>
            )}
            {validationStatus === 'success' && validationResults && validationResults.length === 0 && (
              <p style={{ color: '#475569', marginTop: '0.75rem' }}>Sin imágenes para validar.</p>
            )}
            {validationResults && validationResults.length > 0 && (
              <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>URL</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Origen</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Estado</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>HTTP</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Latencia</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Ray ID</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Mensaje</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResults.map((result) => {
                      const isBroken = !result.ok;
                      const removeKey = `remove:${result.url}`;
                      const pendingRemoval = isActionPending(removeKey);
                      return (
                        <tr key={result.url} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.5rem', wordBreak: 'break-all' }}>{result.url}</td>
                          <td style={{ padding: '0.5rem' }}>{result.source === 'cloudflare' ? 'Cloudflare' : 'Externa'}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <span
                              style={{
                                ...chipStyle,
                                background: result.ok ? '#dcfce7' : '#fee2e2',
                                color: result.ok ? '#166534' : '#991b1b'
                              }}
                            >
                              {result.ok ? 'OK' : 'BROKEN'}
                            </span>
                          </td>
                          <td style={{ padding: '0.5rem' }}>{result.status ?? '—'}</td>
                          <td style={{ padding: '0.5rem' }}>{formatLatency(result.latency_ms)}</td>
                          <td style={{ padding: '0.5rem' }}>{result.ray_id ?? '—'}</td>
                          <td style={{ padding: '0.5rem' }}>{result.message ?? '—'}</td>
                          <td style={{ padding: '0.5rem' }}>
                            {isBroken ? (
                              <button
                                type="button"
                                style={pendingRemoval ? disabledButtonStyle : buttonStyle}
                                onClick={() => void removeFromProduct(result.url)}
                                disabled={pendingRemoval}
                              >
                                Remove from product
                              </button>
                            ) : (
                              <span style={{ color: '#64748b' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#0f172a' }}>Bulk Attach (CSV)</h3>
            <p style={{ margin: '0 0 0.75rem 0', color: '#475569' }}>
              Adjunta imágenes de Cloudflare en lote usando un CSV con columnas <code>slug</code> y <code>cf_image_id</code> o
              <code>delivery_url_cf</code>.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label
                style={
                  !cfImagesEnabled || bulkAttachStatus === 'loading'
                    ? disabledButtonStyle
                    : secondaryButtonStyle
                }
              >
                <span>Seleccionar CSV</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleBulkAttachInputChange}
                  style={{ display: 'none' }}
                  disabled={!cfImagesEnabled || bulkAttachStatus === 'loading'}
                />
              </label>
              {bulkAttachStatus === 'loading' && (
                <span style={{ color: '#64748b' }}>Procesando…</span>
              )}
              {!cfImagesEnabled && (
                <span style={{ ...chipStyle, background: '#fee2e2', color: '#991b1b' }}>
                  Cloudflare Images deshabilitado.
                </span>
              )}
            </div>
            {bulkAttachMessage && (
              <p
                style={{
                  color: bulkAttachStatus === 'error' ? '#dc2626' : '#0f172a',
                  marginTop: '0.75rem'
                }}
              >
                {bulkAttachMessage}
              </p>
            )}
            {bulkAttachResults.length > 0 && (
              <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Slug</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Resultado</th>
                      <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkAttachResults.map((result, index) => {
                      const color =
                        result.status === 'error'
                          ? '#dc2626'
                          : result.status === 'skipped'
                            ? '#b45309'
                            : '#0f172a';
                      return (
                        <tr key={`${result.slug}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.5rem' }}>{result.slug || '—'}</td>
                          <td style={{ padding: '0.5rem', color }}>{result.status}</td>
                          <td style={{ padding: '0.5rem', wordBreak: 'break-all' }}>{result.detail ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Variant / Transform Preview</h2>
        {!cfImagesEnabled && (
          <div style={{ ...chipStyle, background: '#fee2e2', color: '#991b1b' }}>
            Previsualización deshabilitada: Cloudflare Images está deshabilitado.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <select
            value={uploadVariant}
            onChange={(event) => setUploadVariant(event.target.value)}
            style={{ ...inputStyle, maxWidth: 220 }}
            disabled={!cfImagesEnabled}
          >
            {variantOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {selectedImage && selectedImage.source === 'cloudflare' && selectedImage.image_id && cfImagesEnabled ? (
            <>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 280px', maxWidth: '100%' }}>
                  <img
                    src={buildDeliveryUrl(cfImagesBaseUrl, selectedImage.image_id, uploadVariant) ?? selectedImage.url}
                    alt="Variant preview"
                    style={{ width: '100%', borderRadius: 12, border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span>Estado: {variantPreview.status === 'success' ? `HTTP ${variantPreview.statusCode}` : variantPreview.status}</span>
                  <span>Latencia: {variantPreview.status === 'success' || variantPreview.status === 'error'
                    ? formatLatency(variantPreview.latencyMs ?? null)
                    : '—'}</span>
                  <span>Ray ID: {variantPreview.status === 'success' || variantPreview.status === 'error'
                    ? variantPreview.rayId ?? '—'
                    : '—'}</span>
                  <span>Tamaño: {variantPreview.status === 'success' || variantPreview.status === 'error'
                    ? formatBytes(variantPreview.contentLength ?? null)
                    : '—'}</span>
                  {variantPreview.status === 'error' && (
                    <span style={{ color: '#dc2626' }}>{variantPreview.message}</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: '#64748b' }}>
              Selecciona una imagen de Cloudflare para previsualizar variantes.
            </p>
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Activity</h2>
          {hasErrors && (
            <button type="button" style={secondaryButtonStyle} onClick={() => downloadCsv(activity.filter((entry) => entry.status === 'error'))}>
              Download CSV (errores)
            </button>
          )}
        </div>
        <ActivityTable entries={activity} />
      </section>

      {previewImageUrl && (
        <div
          role="presentation"
          style={modalBackdropStyle}
          onClick={() => setPreviewImageUrl(null)}
        >
          <div style={modalContentStyle} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              style={{ ...buttonStyle, alignSelf: 'flex-end', background: '#dc2626' }}
              onClick={() => setPreviewImageUrl(null)}
            >
              Cerrar
            </button>
            <img src={previewImageUrl} alt="Preview" style={{ maxWidth: '80vw', maxHeight: '70vh', marginTop: '1rem' }} />
          </div>
        </div>
      )}
    </div>
  );
}
