'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buttonStyle, cardStyle, disabledButtonStyle, inputStyle, textareaStyle } from './panel-styles';
import { normalizeProductSlugInput } from '@/lib/product-slug';
import { excerptFromHtml } from '@/lib/seo';

interface SeoPanelProps {
  initialSlug?: string | null;
  initialInput?: string;
}

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

interface AdminProduct {
  slug: string;
  title_h1: string | null;
  short_summary: string | null;
  desc_html: string | null;
  price: string | null;
  cta_lead_url: string | null;
  cta_affiliate_url: string | null;
  cta_stripe_url: string | null;
  cta_paypal_url: string | null;
  cta_lead_label: string | null;
  cta_affiliate_label: string | null;
  cta_stripe_label: string | null;
  cta_paypal_label: string | null;
  brand: string | null;
  model: string | null;
  sku: string | null;
  images: string[];
  primary_image_url: string | null;
  meta_description: string | null;
  schema_json: string | null;
  last_tidb_update_at: string | null;
}

interface AdminProductResponse {
  ok: boolean;
  product?: AdminProduct;
  message?: string;
}

interface SeoResponseBody {
  ok: boolean;
  data?: {
    meta_description: string | null;
    schema_json: unknown;
  };
  message?: string;
}

interface SeoUpdateResponse extends SeoResponseBody {
  rows_affected?: number;
}

const MAX_META_LENGTH = 180;
const META_WARNING_LENGTH = 160;
const MAX_SCHEMA_BYTES = 50 * 1024;

const helperStyle = {
  fontSize: '0.85rem',
  color: '#475569',
  margin: 0
};

const errorStyle = {
  ...helperStyle,
  color: '#ef4444'
};

const successStyle = {
  ...helperStyle,
  color: '#16a34a'
};

const fieldGroupStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.75rem'
};

const labelStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontWeight: 600,
  color: '#0f172a',
  fontSize: '0.95rem'
};

const serpPreviewStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '1rem',
  background: '#f8fafc',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.5rem'
};

const serpTitleStyle = {
  fontSize: '1.1rem',
  color: '#2563eb',
  margin: 0
};

const serpUrlStyle = {
  fontSize: '0.9rem',
  color: '#0f172a',
  margin: 0
};

const serpDescriptionStyle = {
  fontSize: '0.95rem',
  color: '#475569',
  margin: 0
};

const schemaToolbarStyle = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap' as const,
  alignItems: 'center'
};

const stickyFooterStyle = {
  position: 'sticky' as const,
  bottom: 0,
  background: '#fff',
  borderTop: '1px solid #e2e8f0',
  padding: '1rem 1.5rem',
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '0.75rem',
  justifyContent: 'flex-end'
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'N/D';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/D';
  }
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function truncateText(value: string, maxLength = MAX_META_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }
  const slice = value.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > 40) {
    return `${slice.slice(0, lastSpace).trimEnd()}…`;
  }
  return `${slice.trimEnd()}…`;
}

function resolveMetaDescription(product: AdminProduct | null, meta: string): string {
  const trimmed = meta.trim();
  if (trimmed) {
    return truncateText(trimmed);
  }
  const summary = product?.short_summary?.trim() ?? '';
  if (summary) {
    return truncateText(summary);
  }
  return truncateText(excerptFromHtml(product?.desc_html ?? '') || '');
}

function buildAutoSchema(product: AdminProduct, canonical: string, description: string) {
  const images = Array.isArray(product.images) ? product.images.filter(Boolean).slice(0, 3) : [];
  const offerUrl = [
    product.cta_affiliate_url,
    product.cta_stripe_url,
    product.cta_lead_url,
    product.cta_paypal_url,
    canonical
  ].find((value) => (value ?? '').trim().length > 0) as string;

  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title_h1 || product.slug,
    url: canonical,
    offers: {
      '@type': 'Offer',
      url: offerUrl,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock'
    }
  };

  if (product.brand) {
    payload.brand = { '@type': 'Brand', name: product.brand };
  }
  if (product.model) {
    payload.model = product.model;
  }
  if (product.sku) {
    payload.sku = product.sku;
  }
  if (images.length > 0) {
    payload.image = images;
  }
  if (description.trim()) {
    payload.description = description;
  }

  return payload;
}

export default function SeoPanel({ initialSlug, initialInput }: SeoPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [slugInput, setSlugInput] = useState(initialInput ?? '');
  const [selectedSlug, setSelectedSlug] = useState(initialSlug ?? '');
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [metaDescription, setMetaDescription] = useState('');
  const [schemaText, setSchemaText] = useState('');
  const [initialMeta, setInitialMeta] = useState('');
  const [initialSchemaText, setInitialSchemaText] = useState('');
  const [loadStatus, setLoadStatus] = useState<AsyncStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AsyncStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const canonicalUrl = useMemo(() => {
    if (!selectedSlug) {
      return '';
    }
    if (origin) {
      return `${origin.replace(/\/$/, '')}/p/${selectedSlug}`;
    }
    return `/p/${selectedSlug}`;
  }, [origin, selectedSlug]);

  const metaLength = metaDescription.length;
  const schemaBytes = useMemo(() => new TextEncoder().encode(schemaText).length, [schemaText]);
  const schemaTooLarge = schemaBytes > MAX_SCHEMA_BYTES;

  const resolvedMeta = useMemo(
    () => resolveMetaDescription(product, metaDescription),
    [product, metaDescription]
  );

  const serpTitle = useMemo(() => {
    if (!product) {
      return selectedSlug || 'Producto sin título';
    }
    const title = product.title_h1?.trim() || product.slug || selectedSlug || 'Producto';
    const brand = product.brand?.trim();
    if (brand) {
      return `${title} | ${brand}`;
    }
    return title;
  }, [product, selectedSlug]);

  const serpUrl = canonicalUrl || `/p/${selectedSlug || 'slug'}`;

  const updateUrlParams = useCallback(
    (slug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'seo');
      params.set('product', slug);
      router.push(`/admin?${params.toString()}`);
    },
    [router, searchParams]
  );

  const prettifySchema = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setSchemaText('');
        setValidationMessage(null);
        setValidationError(null);
        return;
      }
      try {
        const parsed = JSON.parse(trimmed);
        setSchemaText(JSON.stringify(parsed, null, 2));
        setValidationMessage('Schema JSON formateado.');
        setValidationError(null);
      } catch (error) {
        setValidationMessage(null);
        setValidationError(`JSON inválido: ${(error as Error)?.message ?? 'error desconocido'}`);
      }
    },
    []
  );

  const loadProductBySlug = useCallback(
    async (slug: string) => {
      const normalized = normalizeProductSlugInput(slug);
      if (!normalized) {
        setLoadError('Ingresa un slug o URL de producto válido.');
        setLoadStatus('error');
        return;
      }
      setLoadError(null);
      setLoadStatus('loading');
      setSaveSuccess(null);
      setSaveError(null);
      setValidationMessage(null);
      setValidationError(null);
      try {
        const productResponse = await fetch(`/api/admin/products?slug=${encodeURIComponent(normalized)}`, {
          cache: 'no-store'
        });
        if (!productResponse.ok) {
          const message = await productResponse.text();
          throw new Error(message || 'No se pudo cargar el producto.');
        }
        const productPayload = (await productResponse.json()) as AdminProductResponse;
        if (!productPayload.ok || !productPayload.product) {
          throw new Error(productPayload.message || 'Producto no encontrado.');
        }
        const seoResponse = await fetch(
          `/api/admin/products/${encodeURIComponent(normalized)}/seo`,
          {
            cache: 'no-store'
          }
        );
        if (!seoResponse.ok) {
          const message = await seoResponse.text();
          throw new Error(message || 'No se pudo cargar el SEO.');
        }
        const seoPayload = (await seoResponse.json()) as SeoResponseBody;
        if (!seoPayload.ok || !seoPayload.data) {
          throw new Error(seoPayload.message || 'SEO no disponible.');
        }

        const schemaData = seoPayload.data.schema_json ?? null;
        let schemaPretty = '';
        if (typeof schemaData === 'string') {
          schemaPretty = schemaData;
        } else if (schemaData && typeof schemaData === 'object') {
          schemaPretty = JSON.stringify(schemaData, null, 2);
        }

        const nextProduct: AdminProduct = {
          ...productPayload.product,
          images: Array.isArray(productPayload.product.images)
            ? productPayload.product.images
            : [],
          meta_description: seoPayload.data.meta_description,
          schema_json: schemaPretty || null
        };

        setProduct(nextProduct);
        setSelectedSlug(normalized);
        setSlugInput(normalized);
        setMetaDescription(seoPayload.data.meta_description ?? '');
        setSchemaText(schemaPretty);
        setInitialMeta(seoPayload.data.meta_description ?? '');
        setInitialSchemaText(schemaPretty);
        setLoadStatus('success');
        updateUrlParams(normalized);
      } catch (error) {
        setLoadStatus('error');
        setProduct(null);
        setSelectedSlug('');
        setMetaDescription('');
        setSchemaText('');
        setInitialMeta('');
        setInitialSchemaText('');
        setLoadError((error as Error)?.message ?? 'No se pudo cargar el producto.');
      }
    },
    [updateUrlParams]
  );

  useEffect(() => {
    if (initialSlug) {
      void loadProductBySlug(initialSlug);
    }
  }, [initialSlug, loadProductBySlug]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void loadProductBySlug(slugInput);
    },
    [loadProductBySlug, slugInput]
  );

  const handleMetaChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setMetaDescription(event.target.value);
    setSaveSuccess(null);
    setSaveError(null);
  }, []);

  const handleSchemaChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setSchemaText(event.target.value);
    setSaveSuccess(null);
    setSaveError(null);
    setValidationMessage(null);
    setValidationError(null);
  }, []);

  const handleValidate = useCallback(() => {
    const trimmed = schemaText.trim();
    if (!trimmed) {
      setValidationMessage('Schema JSON vacío.');
      setValidationError(null);
      return;
    }
    try {
      JSON.parse(trimmed);
      setValidationMessage('Schema JSON válido.');
      setValidationError(null);
    } catch (error) {
      setValidationMessage(null);
      setValidationError(`JSON inválido: ${(error as Error)?.message ?? 'error desconocido'}`);
    }
  }, [schemaText]);

  const handlePrettify = useCallback(() => {
    prettifySchema(schemaText);
  }, [prettifySchema, schemaText]);

  const handleResetAuto = useCallback(() => {
    if (!product || !selectedSlug) {
      return;
    }
    const autoSchema = buildAutoSchema(product, canonicalUrl || `/p/${selectedSlug}`, resolvedMeta);
    setSchemaText(JSON.stringify(autoSchema, null, 2));
    setValidationMessage('Schema regenerado automáticamente.');
    setValidationError(null);
    setSaveSuccess(null);
    setSaveError(null);
  }, [canonicalUrl, product, resolvedMeta, selectedSlug]);

  const handleDiscard = useCallback(() => {
    setMetaDescription(initialMeta);
    setSchemaText(initialSchemaText);
    setValidationMessage(null);
    setValidationError(null);
    setSaveSuccess(null);
    setSaveError(null);
  }, [initialMeta, initialSchemaText]);

  const handleSave = useCallback(
    async (viewAfterSave?: boolean) => {
      if (!selectedSlug) {
        return;
      }
      if (schemaTooLarge) {
        setSaveStatus('error');
        setSaveError('El Schema JSON excede el tamaño máximo permitido.');
        return;
      }
      let parsedSchema: unknown = null;
      const trimmedSchema = schemaText.trim();
      if (trimmedSchema) {
        try {
          parsedSchema = JSON.parse(trimmedSchema);
        } catch (error) {
          setSaveStatus('error');
          setSaveError(`JSON inválido: ${(error as Error)?.message ?? 'error desconocido'}`);
          return;
        }
      }
      const trimmedMeta = metaDescription.trim();

      setSaveStatus('loading');
      setSaveError(null);
      setSaveSuccess(null);
      try {
        const response = await fetch(`/api/admin/products/${encodeURIComponent(selectedSlug)}/seo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meta_description: trimmedMeta || null,
            schema_json: parsedSchema
          })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'No se pudo guardar el SEO.');
        }
        const payload = (await response.json()) as SeoUpdateResponse;
        if (!payload.ok || !payload.data) {
          throw new Error(payload.message || 'Respuesta inválida del servidor.');
        }
        setSaveStatus('success');
        setSaveSuccess('Cambios guardados correctamente.');
        setInitialMeta(trimmedMeta || '');
        const prettySchema = trimmedSchema ? JSON.stringify(parsedSchema, null, 2) : '';
        setInitialSchemaText(prettySchema);
        setSchemaText(prettySchema);
        setMetaDescription(trimmedMeta);
        setValidationMessage(null);
        setValidationError(null);
        setProduct((prev) =>
          prev
            ? {
                ...prev,
                meta_description: payload.data.meta_description,
                schema_json: prettySchema || null
              }
            : prev
        );
        if (viewAfterSave) {
          window.open(`/p/${selectedSlug}`, '_blank', 'noopener,noreferrer');
        }
      } catch (error) {
        setSaveStatus('error');
        setSaveError((error as Error)?.message ?? 'No se pudo guardar el SEO.');
      }
    },
    [metaDescription, schemaText, schemaTooLarge, selectedSlug]
  );

  const hasChanges = useMemo(() => {
    return metaDescription !== initialMeta || schemaText !== initialSchemaText;
  }, [initialMeta, metaDescription, initialSchemaText, schemaText]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <article style={{ ...cardStyle, gap: '1rem' }}>
        <header>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>SEO</h2>
          <p style={helperStyle}>
            Gestiona la meta description y el Schema JSON del producto seleccionado.
          </p>
        </header>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <input
            style={{ ...inputStyle, flex: '1 1 280px', minWidth: 220 }}
            type="text"
            placeholder="Slug o URL"
            value={slugInput}
            onChange={(event) => {
              setSlugInput(event.target.value);
              if (loadError) {
                setLoadError(null);
                setLoadStatus('idle');
              }
            }}
          />
          <button type="submit" style={buttonStyle} disabled={loadStatus === 'loading'}>
            {loadStatus === 'loading' ? 'Cargando…' : 'Cargar producto'}
          </button>
        </form>
        {loadError ? <p style={errorStyle}>{loadError}</p> : null}
        {selectedSlug && product ? (
          <p style={helperStyle}>Última actualización conocida: {formatTimestamp(product.last_tidb_update_at)}</p>
        ) : null}
      </article>

      {selectedSlug && product ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section style={{ ...cardStyle, gap: '1.25rem' }}>
            <header>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Meta description</h3>
              <p style={helperStyle}>
                Máximo recomendado de 180 caracteres. Muestra una vista previa estilo Google.
              </p>
            </header>
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="meta-description">
                <span>Meta description</span>
                <span style={{ fontSize: '0.85rem', color: metaLength > META_WARNING_LENGTH ? '#ef4444' : '#475569' }}>
                  {metaLength}/{MAX_META_LENGTH}
                </span>
              </label>
              <textarea
                id="meta-description"
                style={{ ...textareaStyle, minHeight: '5rem' }}
                maxLength={MAX_META_LENGTH * 2}
                value={metaDescription}
                onChange={handleMetaChange}
                placeholder="Escribe una descripción atractiva para buscadores"
              />
              <p style={metaLength > META_WARNING_LENGTH ? errorStyle : helperStyle}>
                {metaLength > META_WARNING_LENGTH
                  ? 'Supera los 160 caracteres recomendados. Considera acortarla.'
                  : 'Mantén la descripción clara, concisa y con palabras clave relevantes.'}
              </p>
            </div>
            <div style={serpPreviewStyle}>
              <p style={serpTitleStyle}>{serpTitle}</p>
              <p style={serpUrlStyle}>{serpUrl}</p>
              <p style={serpDescriptionStyle}>{resolvedMeta || 'Vista previa no disponible.'}</p>
            </div>
          </section>

          <section style={{ ...cardStyle, gap: '1.25rem' }}>
            <header>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Schema JSON</h3>
              <p style={helperStyle}>
                Pega o edita el Schema JSON. El límite es de 50KB. Puedes validarlo y formatearlo.
              </p>
            </header>
            <textarea
              id="schema-json"
              style={{ ...textareaStyle, fontFamily: `"JetBrains Mono", "Fira Mono", monospace`, minHeight: '14rem' }}
              value={schemaText}
              onChange={handleSchemaChange}
              placeholder={`{
  "@context": "https://schema.org",
  ...
}`}
            />
            <div style={schemaToolbarStyle}>
              <button type="button" style={buttonStyle} onClick={handleValidate}>
                Validar JSON
              </button>
              <button type="button" style={buttonStyle} onClick={handlePrettify}>
                Formatear
              </button>
              <button type="button" style={buttonStyle} onClick={handleResetAuto}>
                Reset a automático
              </button>
              <span style={{ fontSize: '0.85rem', color: schemaTooLarge ? '#ef4444' : '#475569' }}>
                {(schemaBytes / 1024).toFixed(1)} KB / {(MAX_SCHEMA_BYTES / 1024).toFixed(0)} KB
              </span>
            </div>
            {validationMessage ? <p style={successStyle}>{validationMessage}</p> : null}
            {validationError ? <p style={errorStyle}>{validationError}</p> : null}
            {schemaTooLarge ? (
              <p style={errorStyle}>
                El Schema JSON supera el tamaño máximo permitido. Reduce el contenido antes de guardar.
              </p>
            ) : null}
          </section>

          <footer style={stickyFooterStyle}>
            <button
              type="button"
              style={hasChanges ? buttonStyle : disabledButtonStyle}
              onClick={() => handleSave(false)}
              disabled={saveStatus === 'loading' || !hasChanges || schemaTooLarge}
            >
              {saveStatus === 'loading' ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              style={hasChanges ? buttonStyle : disabledButtonStyle}
              onClick={() => handleSave(true)}
              disabled={saveStatus === 'loading' || !hasChanges || schemaTooLarge}
            >
              Guardar y ver
            </button>
            <button
              type="button"
              style={hasChanges ? buttonStyle : disabledButtonStyle}
              onClick={handleDiscard}
              disabled={!hasChanges || saveStatus === 'loading'}
            >
              Descartar cambios
            </button>
            {saveError ? <p style={{ ...errorStyle, marginLeft: 'auto' }}>{saveError}</p> : null}
            {saveStatus === 'success' && saveSuccess ? (
              <p style={{ ...successStyle, marginLeft: 'auto' }}>{saveSuccess}</p>
            ) : null}
          </footer>
        </div>
      ) : (
        <article style={{ ...cardStyle, gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Selecciona un producto</h3>
          <p style={helperStyle}>Carga un slug o URL de producto para configurar su SEO.</p>
        </article>
      )}
    </section>
  );
}
