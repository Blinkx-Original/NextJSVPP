'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buttonStyle, cardStyle, disabledButtonStyle, inputStyle, textareaStyle } from './panel-styles';
import { normalizeProductSlugInput } from '@/lib/product-slug';

interface EditProductPanelProps {
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
  primary_image_url: string | null;
  last_tidb_update_at: string | null;
}

interface AdminProductResponse {
  ok: boolean;
  product?: AdminProduct;
  error_code?: string;
  message?: string;
}

interface ProductFormState {
  slug: string;
  title: string;
  summary: string;
  description: string;
  price: string;
  ctaLead: string;
  ctaAffiliate: string;
  ctaStripe: string;
  ctaPaypal: string;
  imageUrl: string;
  lastUpdatedAt: string | null;
}

const TITLE_MAX_LENGTH = 120;
const SUMMARY_MAX_LENGTH = 200;

const emptyFormState: ProductFormState = {
  slug: '',
  title: '',
  summary: '',
  description: '',
  price: '',
  ctaLead: '',
  ctaAffiliate: '',
  ctaStripe: '',
  ctaPaypal: '',
  imageUrl: '',
  lastUpdatedAt: null
};

const ctaConfig = [
  { field: 'ctaLead' as const, label: 'Request a quote' },
  { field: 'ctaAffiliate' as const, label: 'Buy via Affiliate' },
  { field: 'ctaStripe' as const, label: 'Pay with Stripe' },
  { field: 'ctaPaypal' as const, label: 'Pay with PayPal' }
];

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '1.5rem'
};

const gridStyle = {
  display: 'grid',
  gap: '1.5rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  alignItems: 'start'
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

const previewLayoutStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '2rem',
  alignItems: 'start'
};

const previewMediaStyle = {
  position: 'relative' as const,
  width: '100%',
  paddingBottom: '56.25%',
  borderRadius: 16,
  overflow: 'hidden',
  background: '#0f172a',
  color: '#cbd5f5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1rem'
};

const previewImageStyle = {
  position: 'absolute' as const,
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover' as const
};

const previewTitleStyle = {
  fontSize: '2.25rem',
  margin: '0 0 1rem 0',
  color: '#0f172a'
};

const previewSummaryStyle = {
  fontSize: '1.05rem',
  lineHeight: 1.5,
  color: '#475569',
  margin: '0 0 1.5rem 0'
};

const previewButtonRowStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '0.75rem',
  marginBottom: '1.25rem'
};

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.75rem 1.5rem',
  borderRadius: 999,
  background: '#0f172a',
  color: '#fff',
  fontWeight: 600,
  textDecoration: 'none' as const,
  fontSize: '0.95rem'
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: '#e2e8f0',
  color: '#0f172a'
};

const priceStyle = {
  fontSize: '1.5rem',
  fontWeight: 600,
  color: '#0f172a'
};

const descriptionPreviewStyle = {
  marginTop: '2rem',
  padding: '1.5rem',
  borderRadius: 16,
  background: '#f1f5f9',
  color: '#0f172a',
  lineHeight: 1.6
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'No disponible';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  } catch {
    return value;
  }
}

export default function EditProductPanel({ initialSlug, initialInput = '' }: EditProductPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<ProductFormState>(emptyFormState);
  const [slugInput, setSlugInput] = useState(initialInput);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug ?? null);
  const [loadStatus, setLoadStatus] = useState<AsyncStatus>('idle');
  const [saveStatus, setSaveStatus] = useState<AsyncStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const lastLoadedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    setSlugInput(initialInput);
  }, [initialInput]);

  const updateUrl = useCallback(
    (slug: string) => {
      const currentProduct = searchParams.get('product');
      const currentTab = searchParams.get('tab');
      if (currentProduct === slug && currentTab === 'edit-product') {
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'edit-product');
      params.set('product', slug);
      router.replace(`/admin?${params.toString()}`);
    },
    [router, searchParams]
  );

  const applyProduct = useCallback((product: AdminProduct) => {
    setForm({
      slug: product.slug,
      title: product.title_h1 ?? '',
      summary: product.short_summary ?? '',
      description: product.desc_html ?? '',
      price: product.price ?? '',
      ctaLead: product.cta_lead_url ?? '',
      ctaAffiliate: product.cta_affiliate_url ?? '',
      ctaStripe: product.cta_stripe_url ?? '',
      ctaPaypal: product.cta_paypal_url ?? '',
      imageUrl: product.primary_image_url ?? '',
      lastUpdatedAt: product.last_tidb_update_at ?? null
    });
    setSelectedSlug(product.slug);
    setSlugInput(product.slug);
    lastLoadedSlugRef.current = product.slug;
  }, []);

  const fetchProduct = useCallback(
    async (slug: string) => {
      setLoadStatus('loading');
      setLoadError(null);
      setSaveSuccess(null);
      try {
        const response = await fetch(`/api/admin/products?slug=${encodeURIComponent(slug)}`, {
          cache: 'no-store'
        });
        const body = (await response.json()) as AdminProductResponse;
        if (!response.ok || !body.ok || !body.product) {
          const message = body.message ?? 'No se pudo cargar el producto.';
          setLoadStatus('error');
          setLoadError(message);
          return;
        }
        applyProduct(body.product);
        setLoadStatus('success');
        updateUrl(body.product.slug);
      } catch (error) {
        setLoadStatus('error');
        setLoadError((error as Error)?.message ?? 'Error desconocido al cargar el producto.');
      }
    },
    [applyProduct, updateUrl]
  );

  useEffect(() => {
    if (initialSlug && initialSlug !== lastLoadedSlugRef.current) {
      fetchProduct(initialSlug);
    }
  }, [initialSlug, fetchProduct]);

  const handleProductSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalized = normalizeProductSlugInput(slugInput);
      if (!normalized) {
        setLoadError('Ingresa un slug o URL válido.');
        setLoadStatus('error');
        return;
      }
      fetchProduct(normalized);
    },
    [fetchProduct, slugInput]
  );

  const handleFieldChange = useCallback(
    (field: keyof ProductFormState) =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
      },
    []
  );

  const handleSave = useCallback(async () => {
    if (!selectedSlug) {
      setSaveError('Carga primero un producto para editarlo.');
      setSaveStatus('error');
      return;
    }

    setSaveStatus('loading');
    setSaveError(null);
    setSaveSuccess(null);

    const payload = {
      slug: selectedSlug,
      title_h1: form.title,
      short_summary: form.summary,
      desc_html: form.description,
      price: form.price,
      cta_lead_url: form.ctaLead,
      cta_affiliate_url: form.ctaAffiliate,
      cta_stripe_url: form.ctaStripe,
      cta_paypal_url: form.ctaPaypal,
      image_url: form.imageUrl
    };

    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as AdminProductResponse;
      if (!response.ok || !body.ok || !body.product) {
        const message = body.message ?? 'No se pudo guardar el producto.';
        setSaveError(message);
        setSaveStatus('error');
        return;
      }
      applyProduct(body.product);
      setSaveStatus('success');
      setSaveSuccess('Producto guardado correctamente.');
    } catch (error) {
      setSaveStatus('error');
      setSaveError((error as Error)?.message ?? 'Error desconocido al guardar.');
    }
  }, [applyProduct, form, selectedSlug]);

  const activeCtas = useMemo(() => {
    return ctaConfig
      .map((item) => ({ ...item, value: form[item.field].trim() }))
      .filter((item) => item.value.length > 0);
  }, [form]);

  const titleCount = form.title.length;
  const summaryCount = form.summary.length;

  return (
    <section style={sectionStyle} aria-label="Product editor">
      <article style={{ ...cardStyle, gap: '1rem' }}>
        <header>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', color: '#0f172a' }}>Buscar producto</h2>
          <p style={helperStyle}>
            Pega un slug, una ruta como <code>/p/slug</code> o una URL completa para cargar los datos.
          </p>
        </header>
        <form onSubmit={handleProductSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
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
        {selectedSlug ? (
          <p style={helperStyle}>Última actualización conocida: {formatTimestamp(form.lastUpdatedAt)}</p>
        ) : null}
      </article>

      {selectedSlug ? (
        <div style={gridStyle}>
          <section style={{ ...cardStyle, gap: '1.5rem' }}>
            <header>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Contenido principal</h2>
            </header>
            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="title">
                <span>Título (H1)</span>
                <span style={{ fontSize: '0.85rem', color: titleCount > TITLE_MAX_LENGTH ? '#ef4444' : '#475569' }}>
                  {titleCount}/{TITLE_MAX_LENGTH}
                </span>
              </label>
              <input
                id="title"
                style={inputStyle}
                type="text"
                maxLength={TITLE_MAX_LENGTH}
                value={form.title}
                onChange={handleFieldChange('title')}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="summary">
                <span>Short summary</span>
                <span style={{ fontSize: '0.85rem', color: summaryCount > SUMMARY_MAX_LENGTH ? '#ef4444' : '#475569' }}>
                  {summaryCount}/{SUMMARY_MAX_LENGTH}
                </span>
              </label>
              <textarea
                id="summary"
                style={{ ...textareaStyle, minHeight: '4rem' }}
                maxLength={SUMMARY_MAX_LENGTH}
                value={form.summary}
                onChange={handleFieldChange('summary')}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle} htmlFor="description">
                <span>Descripción (HTML)</span>
              </label>
              <textarea
                id="description"
                style={{ ...textareaStyle, minHeight: '12rem' }}
                value={form.description}
                onChange={handleFieldChange('description')}
              />
              <p style={helperStyle}>Puedes pegar HTML completo; se mostrará exactamente como lo ingreses.</p>
            </div>

            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="price">
                  <span>Precio (texto)</span>
                </label>
                <input
                  id="price"
                  style={inputStyle}
                  type="text"
                  value={form.price}
                  onChange={handleFieldChange('price')}
                />
                <p style={helperStyle}>Se muestra sólo si contiene texto.</p>
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="image">
                  <span>Imagen principal (URL)</span>
                </label>
                <input
                  id="image"
                  style={inputStyle}
                  type="url"
                  value={form.imageUrl}
                  onChange={handleFieldChange('imageUrl')}
                  placeholder="https://imagedelivery.net/..."
                />
                <p style={helperStyle}>Usa la URL completa de Cloudflare Images u otra imagen.</p>
              </div>
            </div>

            <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Botones (CTA)</h3>
              {ctaConfig.map((cta) => (
                <div key={cta.field} style={fieldGroupStyle}>
                  <label style={labelStyle} htmlFor={cta.field}>
                    <span>{cta.label}</span>
                  </label>
                  <input
                    id={cta.field}
                    style={inputStyle}
                    type="url"
                    value={form[cta.field]}
                    onChange={handleFieldChange(cta.field)}
                    placeholder="https://"
                  />
                  <p style={helperStyle}>El botón aparece sólo si la URL tiene contenido.</p>
                </div>
              ))}
            </section>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                style={saveStatus === 'loading' ? disabledButtonStyle : buttonStyle}
                onClick={handleSave}
                disabled={saveStatus === 'loading'}
              >
                {saveStatus === 'loading' ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {saveError ? <p style={errorStyle}>{saveError}</p> : null}
              {saveStatus === 'success' && saveSuccess ? <p style={successStyle}>{saveSuccess}</p> : null}
            </div>
          </section>

          <section style={{ ...cardStyle, gap: '1.5rem' }}>
            <header>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Vista previa</h2>
              <p style={helperStyle}>Así se verá la cabecera del producto en la página pública.</p>
            </header>
            <div style={previewLayoutStyle}>
              <div style={previewMediaStyle}>
                {form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imageUrl} alt={form.title || form.slug} style={previewImageStyle} />
                ) : (
                  <span>Imagen no configurada</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={previewTitleStyle}>{form.title || form.slug || 'Título pendiente'}</h3>
                {form.summary ? <p style={previewSummaryStyle}>{form.summary}</p> : null}
                {activeCtas.length > 0 ? (
                  <div style={previewButtonRowStyle}>
                    {activeCtas.map((cta, index) => (
                      <a
                        key={cta.field}
                        href={cta.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={index === 0 ? primaryButtonStyle : secondaryButtonStyle}
                      >
                        {cta.label}
                      </a>
                    ))}
                  </div>
                ) : null}
                {form.price ? <div style={priceStyle}>{form.price}</div> : null}
              </div>
            </div>
            {form.description ? (
              <div style={descriptionPreviewStyle}>
                <div dangerouslySetInnerHTML={{ __html: form.description }} />
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <article style={{ ...cardStyle, gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Selecciona un producto</h2>
          <p style={helperStyle}>
            Ingresa un slug o URL y presiona “Cargar producto” para empezar a editar.
          </p>
        </article>
      )}
    </section>
  );
}

