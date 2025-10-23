/* eslint-disable @next/next/no-img-element */
'use client';

import type { ChangeEvent, CSSProperties, DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buttonStyle, cardStyle, disabledButtonStyle, inputStyle } from './panel-styles';

interface AssetsPanelProps {
  cfImagesEnabled: boolean;
  cfImagesBaseUrl?: string | null;
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

interface ActivityEntry {
  id: string;
  type: 'upload' | 'delete' | 'remove' | 'preview';
  slug: string | null;
  target: string;
  status: 'success' | 'error';
  latencyMs?: number | null;
  rayId?: string | null;
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
  const header = 'timestamp,type,slug,target,status,latency_ms,ray_id,message\n';
  const rows = entries
    .map((entry) => {
      const fields = [
        new Date(entry.timestamp).toISOString(),
        entry.type,
        entry.slug ?? '',
        entry.target,
        entry.status,
        entry.latencyMs != null ? String(entry.latencyMs) : '',
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

export default function AssetsPanel({ cfImagesEnabled, cfImagesBaseUrl }: AssetsPanelProps) {
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
      return next.slice(0, 25);
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
        const response = await fetch(`/api/assets/images/resolve?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store'
        });
        const body = (await response.json()) as ResolveResponseBody;
        if (!response.ok || !body.ok || !body.product) {
          setImagesStatus('error');
          setImagesError(body.message ?? 'No se pudo obtener las imágenes');
          return;
        }
        setSelectedProduct({ id: body.product.id, slug: body.product.slug, title: body.product.title });
        setImages(body.images ?? []);
        setImagesFormat(body.images_json_format ?? 'strings');
        setImagesStatus('success');
        setSelectedImageIndex((prev) => {
          if (prev == null) {
            return body.images && body.images.length > 0 ? 0 : null;
          }
          if (!body.images || prev >= body.images.length) {
            return body.images.length > 0 ? body.images.length - 1 : null;
          }
          return prev;
        });
      } catch (error) {
        setImagesStatus('error');
        setImagesError((error as Error)?.message ?? 'Error desconocido');
      }
    },
    []
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
    const query = productQuery.trim();
    if (!query) {
      return;
    }
    const candidate = searchResults.find((item) => item.slug === query) ?? searchResults[0] ?? null;
    if (candidate) {
      handleSelectProduct(candidate);
      return;
    }
    refreshImages(query, query);
  }, [handleSelectProduct, productQuery, refreshImages, searchResults]);

  useEffect(() => {
    if (!productQuery || productQuery.trim().length < 2) {
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
        const response = await fetch(`/api/assets/images/search?query=${encodeURIComponent(productQuery.trim())}`, {
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
  }, [productQuery]);

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
        const response = await fetch(`/api/assets/images/variant-preview?${params.toString()}`, {
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
  }, [cfImagesEnabled, selectedImage, uploadVariant]);

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
      xhr.open('POST', '/api/assets/images/upload');
      xhr.responseType = 'json';

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
            latencyMs: body.latency_ms,
            rayId: body.ray_id,
            sizeBytes: body.size_bytes,
            message: body.message ?? body.error_code ?? `HTTP ${status}`
          });
        }
      };

      xhr.send(formData);
    },
    [appendActivity, cfImagesEnabled, refreshImages, selectedProduct, uploadVariant]
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
        const response = await fetch(`/api/assets/images/${encodeURIComponent(image.image_id)}`, {
          method: 'DELETE'
        });
        const body = (await response.json()) as DeleteResponseBody;
        if (!response.ok || !body.ok) {
          appendActivity({
            type: 'delete',
            slug: selectedProduct.slug,
            target: image.image_id,
            status: 'error',
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
    [appendActivity, selectedProduct, setActionPending]
  );

  const handleRemoveImage = useCallback(
    async (image: ResolvedImage) => {
      if (!selectedProduct) {
        return;
      }
      const target = image.image_id ?? image.url;
      const key = `remove:${target}`;
      setActionPending(key, true);
      try {
        const response = await fetch('/api/assets/images/remove-from-product', {
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
            message: body.message ?? body.error_code ?? `HTTP ${response.status}`
          });
          return;
        }
        appendActivity({
          type: 'remove',
          slug: selectedProduct.slug,
          target,
          status: 'success',
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
    [appendActivity, refreshImages, selectedProduct, setActionPending]
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
                    <button type="button" style={secondaryButtonStyle} onClick={() => setPreviewImageUrl(image.url)}>
                      Preview
                    </button>
                    <button type="button" style={secondaryButtonStyle} onClick={() => handleCopyUrl(image.url)}>
                      Copy URL
                    </button>
                    <button
                      type="button"
                      style={canDeleteFromCloudflare(image)
                        ? isActionPending(`delete:${image.image_id}`)
                          ? disabledDangerButtonStyle
                          : dangerButtonStyle
                        : disabledButtonStyle}
                      onClick={() => handleDeleteImage(image)}
                      disabled={!canDeleteFromCloudflare(image) || isActionPending(`delete:${image.image_id}`)}
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
