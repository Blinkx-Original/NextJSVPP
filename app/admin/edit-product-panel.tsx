'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buttonStyle, cardStyle, disabledButtonStyle, inputStyle, textareaStyle } from './panel-styles';
import TinyMceEditor, { TinyMceEditorHandle } from './tinymce-editor';
import { DESCRIPTION_MAX_LENGTH, measureHtmlContent } from '@/lib/sanitize-html';
import { CTA_DEFAULT_LABELS, resolveCtaLabel } from '@/lib/product-cta';
import { normalizeProductSlugInput } from '@/lib/product-slug';

interface EditProductPanelProps {
  initialSlug?: string | null;
  initialInput?: string;
}

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

// Deprecated: retained to satisfy historical references during build time.
type NewCategoryFormState = {
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  isPublished: boolean;
};

interface AdminProduct {
  slug: string;
  title_h1: string | null;
  short_summary: string | null;
  desc_html: string | null;
  category: string | null;
  price: string | null;
  cta_lead_url: string | null;
  cta_affiliate_url: string | null;
  cta_stripe_url: string | null;
  cta_paypal_url: string | null;
  cta_lead_label: string | null;
  cta_affiliate_label: string | null;
  cta_stripe_label: string | null;
  cta_paypal_label: string | null;
  primary_image_url: string | null;
  last_tidb_update_at: string | null;
}

interface AdminProductResponse {
  ok: boolean;
  product?: AdminProduct;
  error_code?: string;
  message?: string;
}

interface CategoryOption {
  slug: string;
  name: string;
}

interface ProductFormState {
  slug: string;
  title: string;
  summary: string;
  description: string;
  price: string;
  categorySlug: string;
  ctaLead: string;
  ctaAffiliate: string;
  ctaStripe: string;
  ctaPaypal: string;
  ctaLeadLabel: string;
  ctaAffiliateLabel: string;
  ctaStripeLabel: string;
  ctaPaypalLabel: string;
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
  categorySlug: '',
  ctaLead: '',
  ctaAffiliate: '',
  ctaStripe: '',
  ctaPaypal: '',
  ctaLeadLabel: '',
  ctaAffiliateLabel: '',
  ctaStripeLabel: '',
  ctaPaypalLabel: '',
  imageUrl: '',
  lastUpdatedAt: null
};

const emptyCategoryForm: NewCategoryFormState = {
  name: '',
  slug: '',
  shortDescription: '',
  longDescription: '',
  isPublished: true
};

const CTA_FIELDS = [
  {
    key: 'lead' as const,
    urlField: 'ctaLead' as const,
    labelField: 'ctaLeadLabel' as const,
    title: CTA_DEFAULT_LABELS.lead
  },
  {
    key: 'affiliate' as const,
    urlField: 'ctaAffiliate' as const,
    labelField: 'ctaAffiliateLabel' as const,
    title: CTA_DEFAULT_LABELS.affiliate
  },
  {
    key: 'stripe' as const,
    urlField: 'ctaStripe' as const,
    labelField: 'ctaStripeLabel' as const,
    title: CTA_DEFAULT_LABELS.stripe
  },
  {
    key: 'paypal' as const,
    urlField: 'ctaPaypal' as const,
    labelField: 'ctaPaypalLabel' as const,
    title: CTA_DEFAULT_LABELS.paypal
  }
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

const warningStyle = {
  ...helperStyle,
  color: '#b45309'
};

const categoryFieldContainerStyle = {
  position: 'relative' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.5rem'
};

const categorySuggestionListStyle = {
  position: 'absolute' as const,
  top: '100%',
  left: 0,
  right: 0,
  background: '#fff',
  border: '1px solid #cbd5f5',
  borderRadius: 12,
  marginTop: '0.25rem',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.15)',
  maxHeight: 240,
  overflowY: 'auto' as const,
  zIndex: 20
};

const categorySuggestionItemStyle = {
  padding: '0.65rem 0.85rem',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.25rem',
  cursor: 'pointer' as const
};

const categorySuggestionActiveStyle = {
  ...categorySuggestionItemStyle,
  background: '#eef2ff'
};

const categoryBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.8rem',
  fontWeight: 500,
  color: '#334155',
  background: '#e2e8f0',
  borderRadius: 999,
  padding: '0.25rem 0.6rem'
};

const modalOverlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  zIndex: 1000
};

const modalCardStyle = {
  background: '#fff',
  borderRadius: 20,
  padding: '2rem',
  width: 'min(520px, 100%)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '1rem',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)'
};

const modalHeaderStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.35rem'
};

const modalTitleStyle = {
  margin: 0,
  fontSize: '1.5rem',
  color: '#0f172a'
};

const modalActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  flexWrap: 'wrap' as const
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
  const [descriptionSaveStatus, setDescriptionSaveStatus] = useState<AsyncStatus>('idle');
  const [descriptionSaveError, setDescriptionSaveError] = useState<string | null>(null);
  const [descriptionSaveSuccess, setDescriptionSaveSuccess] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categoryFetchStatus, setCategoryFetchStatus] = useState<AsyncStatus>('idle');
  const [categoryFetchError, setCategoryFetchError] = useState<string | null>(null);
  const descriptionEditorRef = useRef<TinyMceEditorHandle | null>(null);
  const lastLoadedSlugRef = useRef<string | null>(null);
  const categoryFetchAbortRef = useRef<AbortController | null>(null);
  const categoryDropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryInputRef = useRef<HTMLInputElement | null>(null);
  // State controlling the visibility of the category creation modal (placeholder only).
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const syncDescriptionFromEditor = useCallback(() => {
    const editorContent = descriptionEditorRef.current?.getContent?.();
    if (typeof editorContent === 'string') {
      if (editorContent !== form.description) {
        setForm((prev) => ({ ...prev, description: editorContent }));
      }
      return editorContent;
    }
    return form.description;
  }, [form.description]);

  useEffect(() => {
    setSlugInput(initialInput);
  }, [initialInput]);

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      setCategoryFetchStatus('loading');
      setCategoryFetchError(null);
      try {
        const params = new URLSearchParams({ type: 'product', limit: '60' });
        const response = await fetch(`/api/admin/categories?${params.toString()}`, {
          cache: 'no-store'
        });
        const body = (await response.json()) as Array<{
          slug?: string;
          name?: string;
        }>;
        if (!response.ok) {
          const message = Array.isArray(body)
            ? 'No se pudieron cargar las categorías.'
            : (body as { message?: string })?.message ?? 'No se pudieron cargar las categorías.';
          throw new Error(message);
        }

        const normalized: CategoryOption[] = Array.isArray(body)
          ? body
              .map((item) => ({
                slug: typeof item.slug === 'string' ? item.slug : '',
                name: typeof item.name === 'string' ? item.name : ''
              }))
              .filter((item) => item.slug && item.name)
              .sort((a, b) => a.name.localeCompare(b.name))
          : [];

        if (!cancelled) {
          setCategoryOptions(normalized);
          setCategoryFetchStatus('success');
        }
      } catch (error) {
        if (!cancelled) {
          setCategoryFetchStatus('error');
          setCategoryFetchError((error as Error)?.message ?? 'No se pudieron cargar las categorías.');
        }
      }
    };

    loadCategories();
  return (
    <section style={sectionStyle} aria-label="Product editor">
      {/* Search bar */}
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
        {selectedSlug ? <p style={helperStyle}>Última actualización conocida: {formatTimestamp(form.lastUpdatedAt)}</p> : null}
      </article>

      {selectedSlug ? (
        <>
          {/* Two-column layout for main content and preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={gridStyle}>
              {/* Main content card */}
              <section style={{ ...cardStyle, gap: '1.5rem' }}>
                <header>
                  <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Contenido principal</h2>
                </header>
                {/* Title */}
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

                {/* Short summary */}
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

                {/* Price & Image URL */}
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

                {/* Category selection */}
                <div style={fieldGroupStyle}>
                  <label style={labelStyle} htmlFor="product-category">
                    <span>Categoría</span>
                    {categorySelection ? (
                      <span style={{ fontSize: '0.85rem', color: '#2563eb' }}>
                        Asignada: {categorySelection.name} · {categorySelection.slug}
                      </span>
                    ) : categorySelectionSlug.length > 0 ? (
                      <span style={{ fontSize: '0.85rem', color: '#f97316' }}>
                        Slug asignado: {categorySelectionSlug}
                      </span>
                    ) : null}
                  </label>
                  <select
                    id="product-category"
                    style={inputStyle}
                    value={form.categorySlug}
                    onChange={handleCategoryChange}
                  >
                    <option value="">Sin categoría</option>
                    {categoryOptions.map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  {categoryFetchStatus === 'loading' ? <p style={helperStyle}>Cargando categorías…</p> : null}
                  {categoryFetchStatus === 'error' && categoryFetchError ? (
                    <p style={errorStyle}>{categoryFetchError}</p>
                  ) : null}
                  {categoryFetchStatus === 'success' && categoryOptions.length === 0 ? (
                    <p style={helperStyle}>No hay categorías publicadas todavía.</p>
                  ) : null}
                  {hasUnmanagedCategorySelection ? (
                    <p style={helperStyle}>
                      Esta categoría no está gestionada; no aparecerá en el catálogo hasta crearla y publicarla en Categories.
                      {categorySelectionSlug ? ` (Slug: ${categorySelectionSlug})` : null}
                    </p>
                  ) : null}
                </div>

                {/* CTA fields */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Botones (CTA)</h3>
                  {CTA_FIELDS.map((cta) => (
                    <div key={cta.key} style={{ display: 'grid', gap: '0.75rem' }}>
                      <div style={fieldGroupStyle}>
                        <label style={labelStyle} htmlFor={`${cta.key}-label`}>
                          <span>Label (opcional)</span>
                        </label>
                        <input
                          id={`${cta.key}-label`}
                          style={inputStyle}
                          type="text"
                          value={form[cta.labelField]}
                          onChange={handleFieldChange(cta.labelField)}
                          placeholder={cta.title}
                          maxLength={80}
                        />
                        <p style={helperStyle}>Si lo dejas vacío se mostrará “{cta.title}”.</p>
                      </div>
                      <div style={fieldGroupStyle}>
                        <label style={labelStyle} htmlFor={`${cta.key}-url`}>
                          <span>URL</span>
                        </label>
                        <input
                          id={`${cta.key}-url`}
                          style={inputStyle}
                          type="url"
                          value={form[cta.urlField]}
                          onChange={handleFieldChange(cta.urlField)}
                          placeholder="https://"
                        />
                        <p style={helperStyle}>El botón aparece sólo si la URL tiene contenido.</p>
                      </div>
                    </div>
                  ))}
                </section>

                {/* Save buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    style={saveStatus === 'loading' ? disabledButtonStyle : buttonStyle}
                    onClick={() => handleSave()}
                    disabled={saveStatus === 'loading'}
                  >
                    {saveStatus === 'loading' ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    style={saveStatus === 'loading' ? disabledButtonStyle : buttonStyle}
                    onClick={() => handleSave(true)}
                    disabled={saveStatus === 'loading'}
                  >
                    {saveStatus === 'loading' ? 'Guardando…' : 'Guardar y Ver'}
                  </button>
                  {saveError ? <p style={errorStyle}>{saveError}</p> : null}
                  {saveStatus === 'success' && saveSuccess ? <p style={successStyle}>{saveSuccess}</p> : null}
                </div>
              </section>

              {/* Preview card */}
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
                            key={cta.key}
                            href={cta.url}
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
              </section>
            </div>

            {/* Full-width description editor below */}
            <section style={{ ...cardStyle, gap: '1.25rem', width: '100%' }}>
              <header
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}
              >
                <span>
                  {descriptionMetrics.characters.toLocaleString()} / {DESCRIPTION_MAX_LENGTH.toLocaleString()} caracteres ·{' '}
                  {descriptionMetrics.words.toLocaleString()} palabras
                </span>
              </header>
              <TinyMceEditor
                ref={descriptionEditorRef}
                value={form.description}
                onChange={(html) => {
                  setForm((prev) => ({ ...prev, description: html }));
                }}
                slug={selectedSlug}
                placeholder="Escribe la descripción detallada, inserta tablas, imágenes o enlaces…"
                id="description"
              />
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  style={descriptionSaveStatus === 'loading' ? disabledButtonStyle : buttonStyle}
                  onClick={() => handleSaveDescription()}
                  disabled={descriptionSaveStatus === 'loading'}
                >
                  {descriptionSaveStatus === 'loading' ? 'Guardando descripción…' : 'Guardar descripción'}
                </button>
                <button
                  type="button"
                  style={descriptionSaveStatus === 'loading' ? disabledButtonStyle : buttonStyle}
                  onClick={() => handleSaveDescription(true)}
                  disabled={descriptionSaveStatus === 'loading'}
                >
                  {descriptionSaveStatus === 'loading' ? 'Guardando descripción…' : 'Guardar y Ver'}
                </button>
                {descriptionSaveError ? <p style={errorStyle}>{descriptionSaveError}</p> : null}
                {descriptionSaveStatus === 'success' && descriptionSaveSuccess ? <p style={successStyle}>{descriptionSaveSuccess}</p> : null}
              </div>
            </section>
          </div>
        </>
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