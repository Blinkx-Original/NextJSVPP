'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react';
import {
  buttonStyle,
  cardStyle,
  disabledButtonStyle,
  inputStyle,
  textareaStyle
} from './panel-styles';
import TinyMceEditor, { type TinyMceEditorHandle } from './tinymce-editor';
import { normalizeProductSlugInput } from '@/lib/product-slug';

const DESCRIPTION_MAX_LENGTH = 150000;

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

type CategoryOption = { slug: string; name: string };

interface AdminProduct {
  slug: string;
  title_h1: string | null;
  short_summary: string | null;
  desc_html: string | null;
  price: string | null;
  category: string | null;
  cta_lead_url: string | null;
  cta_affiliate_url: string | null;
  cta_stripe_url: string | null;
  cta_paypal_url: string | null;
  cta_lead_label: string | null;
  cta_affiliate_label: string | null;
  cta_stripe_label: string | null;
  cta_paypal_label: string | null;
  images: string[];
  primary_image_url: string | null;
  last_tidb_update_at: string | null;
}

interface AdminProductResponse {
  ok: boolean;
  product?: AdminProduct;
  message?: string;
}

export type EditProductPanelProps = {
  initialSlug?: string | null;
  initialInput?: string | null; // accepted to match page.tsx usage
};

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function measureHtmlContent(html: string) {
  const text = stripHtml(html || '');
  const words = text.length ? text.split(' ').length : 0;
  const characters = text.length;
  return { words, characters };
}

function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '1.25rem' };

const helperTextStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#475569'
};

const errorTextStyle: React.CSSProperties = {
  ...helperTextStyle,
  color: '#dc2626'
};

const successTextStyle: React.CSSProperties = {
  ...helperTextStyle,
  color: '#16a34a'
};

export default function EditProductPanel({
  initialSlug = null,
  initialInput: _initialInput = '' // accepted but not required for layout; underscore prevents unused warnings
}: EditProductPanelProps) {
  const [slugInput, setSlugInput] = useState<string>(initialSlug ?? _initialInput ?? '');
  const [loadedSlug, setLoadedSlug] = useState<string>(initialSlug ?? '');

  const [title, setTitle] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [priceText, setPriceText] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [ctaLeadLabel, setCtaLeadLabel] = useState<string>('');
  const [ctaLeadUrl, setCtaLeadUrl] = useState<string>('');
  const [ctaAffiliateLabel, setCtaAffiliateLabel] = useState<string>('');
  const [ctaAffiliateUrl, setCtaAffiliateUrl] = useState<string>('');
  const [ctaStripeLabel, setCtaStripeLabel] = useState<string>('');
  const [ctaStripeUrl, setCtaStripeUrl] = useState<string>('');
  const [ctaPaypalLabel, setCtaPaypalLabel] = useState<string>('');
  const [ctaPaypalUrl, setCtaPaypalUrl] = useState<string>('');

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categorySlug, setCategorySlug] = useState<string>('');

  const [description, setDescription] = useState<string>('');
  const descriptionMetrics = useMemo(() => measureHtmlContent(description), [description]);
  const isDescriptionTooLong = descriptionMetrics.characters > DESCRIPTION_MAX_LENGTH;

  const [loadStatus, setLoadStatus] = useState<AsyncStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [primarySaveStatus, setPrimarySaveStatus] = useState<AsyncStatus>('idle');
  const [primarySaveError, setPrimarySaveError] = useState<string | null>(null);
  const [primarySaveSuccess, setPrimarySaveSuccess] = useState<string | null>(null);

  const [descriptionSaveStatus, setDescriptionSaveStatus] = useState<AsyncStatus>('idle');
  const [descriptionSaveError, setDescriptionSaveError] = useState<string | null>(null);
  const [descriptionSaveSuccess, setDescriptionSaveSuccess] = useState<string | null>(null);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const editorRef = useRef<TinyMceEditorHandle | null>(null);

  const resetForm = useCallback(() => {
    setTitle('');
    setSummary('');
    setPriceText('');
    setImageUrl('');
    setCtaLeadLabel('');
    setCtaLeadUrl('');
    setCtaAffiliateLabel('');
    setCtaAffiliateUrl('');
    setCtaStripeLabel('');
    setCtaStripeUrl('');
    setCtaPaypalLabel('');
    setCtaPaypalUrl('');
    setCategorySlug('');
    setDescription('');
    setLastUpdatedAt(null);
  }, []);

  const resetPrimaryMessages = useCallback(() => {
    setPrimarySaveError(null);
    setPrimarySaveSuccess(null);
  }, []);

  const resetDescriptionMessages = useCallback(() => {
    setDescriptionSaveError(null);
    setDescriptionSaveSuccess(null);
  }, []);

  const applyProductData = useCallback(
    (product: AdminProduct, fallbackSlug?: string) => {
      const resolvedSlug = product.slug || fallbackSlug || '';
      setLoadedSlug(resolvedSlug);
      setSlugInput(resolvedSlug);
      setTitle(product.title_h1 ?? '');
      setSummary(product.short_summary ?? '');
      setPriceText(product.price ?? '');
      const fallbackImage =
        Array.isArray(product.images) && product.images.length > 0 ? product.images[0] ?? '' : '';
      setImageUrl(product.primary_image_url ?? fallbackImage ?? '');
      setCtaLeadLabel(product.cta_lead_label ?? '');
      setCtaLeadUrl(product.cta_lead_url ?? '');
      setCtaAffiliateLabel(product.cta_affiliate_label ?? '');
      setCtaAffiliateUrl(product.cta_affiliate_url ?? '');
      setCtaStripeLabel(product.cta_stripe_label ?? '');
      setCtaStripeUrl(product.cta_stripe_url ?? '');
      setCtaPaypalLabel(product.cta_paypal_label ?? '');
      setCtaPaypalUrl(product.cta_paypal_url ?? '');
      setCategorySlug(product.category ?? '');
      setDescription(product.desc_html ?? '');
      setLastUpdatedAt(product.last_tidb_update_at ?? null);
    },
    []
  );

  const loadProductBySlug = useCallback(
    async (rawSlug: string) => {
      const normalized = normalizeProductSlugInput(rawSlug);
      if (!normalized) {
        setLoadStatus('error');
        setLoadError('Ingresa un slug o URL de producto válido.');
        setLoadedSlug('');
        resetForm();
        return;
      }

      setLoadStatus('loading');
      setLoadError(null);
      resetPrimaryMessages();
      resetDescriptionMessages();

      try {
        const response = await fetch(`/api/admin/products?slug=${encodeURIComponent(normalized)}`, {
          cache: 'no-store'
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'No se pudo cargar el producto.');
        }
        const payload = (await response.json()) as AdminProductResponse;
        if (!payload.ok || !payload.product) {
          throw new Error(payload.message || 'Producto no encontrado.');
        }
        applyProductData(payload.product, normalized);
        editorRef.current?.clearDraft();
        setLoadStatus('success');
      } catch (error) {
        setLoadStatus('error');
        setLoadError((error as Error)?.message ?? 'No se pudo cargar el producto.');
        setLoadedSlug('');
        resetForm();
      }
    },
    [applyProductData, resetDescriptionMessages, resetForm, resetPrimaryMessages]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/categories?type=product', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const items: CategoryOption[] = Array.isArray(data) ? data : data?.items ?? [];
        setCategoryOptions(items);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialSlug) {
      void loadProductBySlug(initialSlug);
    }
  }, [initialSlug, loadProductBySlug]);

  useEffect(() => {
    if (!initialSlug && !_initialInput) {
      setSlugInput('');
      setLoadedSlug('');
      resetForm();
      setLoadStatus('idle');
      setLoadError(null);
    }
  }, [initialSlug, _initialInput, resetForm]);

  const handleSlugChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSlugInput(event.target.value);
      if (loadStatus === 'error') {
        setLoadStatus('idle');
      }
      setLoadError(null);
    },
    [loadStatus]
  );

  const handleSlugSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void loadProductBySlug(slugInput);
    },
    [loadProductBySlug, slugInput]
  );

  const handleTitleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
    resetPrimaryMessages();
  }, [resetPrimaryMessages]);

  const handleSummaryChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setSummary(event.target.value);
    resetPrimaryMessages();
  }, [resetPrimaryMessages]);

  const handlePriceChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPriceText(event.target.value);
    resetPrimaryMessages();
  }, [resetPrimaryMessages]);

  const handleImageChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setImageUrl(event.target.value);
    resetPrimaryMessages();
  }, [resetPrimaryMessages]);

  const handleCategoryChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setCategorySlug(event.target.value);
    resetPrimaryMessages();
  }, [resetPrimaryMessages]);

  const handleCtaInputChange = useCallback(
    (setter: (value: string) => void) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        setter(event.target.value);
        resetPrimaryMessages();
      },
    [resetPrimaryMessages]
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setDescription(value);
      resetDescriptionMessages();
    },
    [resetDescriptionMessages]
  );

  const handleSavePrimary = useCallback(async () => {
    if (!loadedSlug) {
      return;
    }
    setPrimarySaveStatus('loading');
    setPrimarySaveError(null);
    setPrimarySaveSuccess(null);

    try {
      const payload = {
        slug: loadedSlug,
        title_h1: title,
        short_summary: summary,
        desc_html: description,
        price: priceText,
        category: categorySlug || null,
        cta_lead_url: ctaLeadUrl || '',
        cta_affiliate_url: ctaAffiliateUrl || '',
        cta_stripe_url: ctaStripeUrl || '',
        cta_paypal_url: ctaPaypalUrl || '',
        cta_lead_label: ctaLeadLabel || '',
        cta_affiliate_label: ctaAffiliateLabel || '',
        cta_stripe_label: ctaStripeLabel || '',
        cta_paypal_label: ctaPaypalLabel || '',
        image_url: imageUrl
      };
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as AdminProductResponse;
      if (!response.ok || !body.ok || !body.product) {
        throw new Error(body.message || 'No se pudo guardar el producto.');
      }
      applyProductData(body.product, loadedSlug);
      setPrimarySaveStatus('success');
      setPrimarySaveSuccess('Producto actualizado correctamente.');
    } catch (error) {
      setPrimarySaveStatus('error');
      setPrimarySaveError((error as Error)?.message ?? 'No se pudo guardar el producto.');
    }
  }, [
    applyProductData,
    categorySlug,
    ctaAffiliateLabel,
    ctaAffiliateUrl,
    ctaLeadLabel,
    ctaLeadUrl,
    ctaPaypalLabel,
    ctaPaypalUrl,
    ctaStripeLabel,
    ctaStripeUrl,
    description,
    imageUrl,
    loadedSlug,
    priceText,
    summary,
    title
  ]);

  const handleSaveDescription = useCallback(
    async (viewAfter = false) => {
      if (!loadedSlug) {
        return;
      }
      const payload = { slug: loadedSlug, desc_html: description };
      const shouldOpenPreview = viewAfter && typeof window !== 'undefined';
      let previewWindow: Window | null = null;
      if (shouldOpenPreview) previewWindow = window.open('', '_blank');

      setDescriptionSaveStatus('loading');
      setDescriptionSaveError(null);
      setDescriptionSaveSuccess(null);

      try {
        const response = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = (await response.json()) as AdminProductResponse;
        if (!response.ok || !body?.ok || !body.product) {
          throw new Error(body?.message || 'No se pudo guardar la descripción.');
        }
        applyProductData(body.product, loadedSlug);
        setDescriptionSaveStatus('success');
        setDescriptionSaveSuccess('Descripción guardada correctamente.');
        if (shouldOpenPreview) {
          const url = `/p/${encodeURIComponent(loadedSlug)}?v=${Date.now()}`;
          if (previewWindow) {
            previewWindow.location.href = url;
            previewWindow.focus();
          } else {
            window.open(url, '_blank');
          }
        }
      } catch (error) {
        setDescriptionSaveStatus('error');
        setDescriptionSaveError((error as Error)?.message ?? 'No se pudo guardar la descripción.');
        if (previewWindow) previewWindow.close();
      }
    },
    [applyProductData, description, loadedSlug]
  );

  const formattedLastUpdated = useMemo(() => formatTimestamp(lastUpdatedAt), [lastUpdatedAt]);
  const isSavingPrimary = primarySaveStatus === 'loading';
  const isSavingDescription = descriptionSaveStatus === 'loading';

  return (
    <section style={sectionStyle} aria-label="Product editor">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem' }}>
        <section style={{ ...(cardStyle as any), gap: '1rem' }}>
          <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Contenido principal</h2>
          </header>

          <form onSubmit={handleSlugSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Slug del producto</span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  value={slugInput}
                  onChange={handleSlugChange}
                  placeholder="p-ej: shelf-bin-nestable-clear-12"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button type="submit" style={buttonStyle} disabled={slugInput.trim().length === 0}>
                  Cargar
                </button>
              </div>
            </label>
          </form>

          {loadStatus === 'loading' ? (
            <p style={helperTextStyle}>Cargando producto…</p>
          ) : loadStatus === 'error' && loadError ? (
            <p style={errorTextStyle}>{loadError}</p>
          ) : loadedSlug ? (
            <p style={helperTextStyle}>Producto cargado: {loadedSlug}</p>
          ) : (
            <p style={helperTextStyle}>Selecciona un producto con el buscador rápido o ingresa un slug y presiona Cargar.</p>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Título (H1)</span>
              <input
                value={title}
                onChange={handleTitleChange}
                placeholder="Título del producto"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Resumen breve</span>
              <textarea
                value={summary}
                onChange={handleSummaryChange}
                rows={3}
                placeholder="Resumen breve"
                style={{ ...textareaStyle, minHeight: '5rem' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Precio (texto)</span>
              <input
                value={priceText}
                onChange={handlePriceChange}
                placeholder="$ 633 (sólo esta semana)"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Imagen principal (URL)</span>
              <input
                value={imageUrl}
                onChange={handleImageChange}
                placeholder="https://..."
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Categoría</span>
              <select value={categorySlug} onChange={handleCategoryChange} style={inputStyle}>
                <option value="">(sin categoría)</option>
                {categoryOptions.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} · {c.slug}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <h3 style={{ margin: '0.5rem 0 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              Call to actions
            </h3>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>CTA Lead Label</span>
                <input
                  value={ctaLeadLabel}
                  onChange={handleCtaInputChange(setCtaLeadLabel)}
                  placeholder="Hablar con un asesor"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>CTA Lead URL</span>
                <input
                  value={ctaLeadUrl}
                  onChange={handleCtaInputChange(setCtaLeadUrl)}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>CTA Affiliate Label</span>
                <input
                  value={ctaAffiliateLabel}
                  onChange={handleCtaInputChange(setCtaAffiliateLabel)}
                  placeholder="Comprar en Amazon"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>CTA Affiliate URL</span>
                <input
                  value={ctaAffiliateUrl}
                  onChange={handleCtaInputChange(setCtaAffiliateUrl)}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>CTA Stripe Label</span>
                <input
                  value={ctaStripeLabel}
                  onChange={handleCtaInputChange(setCtaStripeLabel)}
                  placeholder="Comprar con tarjeta"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>CTA Stripe URL</span>
                <input
                  value={ctaStripeUrl}
                  onChange={handleCtaInputChange(setCtaStripeUrl)}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>CTA PayPal Label</span>
                <input
                  value={ctaPaypalLabel}
                  onChange={handleCtaInputChange(setCtaPaypalLabel)}
                  placeholder="Comprar con PayPal"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>CTA PayPal URL</span>
                <input
                  value={ctaPaypalUrl}
                  onChange={handleCtaInputChange(setCtaPaypalUrl)}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSavePrimary}
                style={buttonStyle}
                disabled={!loadedSlug || isSavingPrimary}
              >
                {isSavingPrimary ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
            {primarySaveError ? <p style={errorTextStyle}>{primarySaveError}</p> : null}
            {primarySaveSuccess ? <p style={successTextStyle}>{primarySaveSuccess}</p> : null}
            {formattedLastUpdated ? (
              <p style={helperTextStyle}>Última actualización en TiDB: {formattedLastUpdated}</p>
            ) : null}
          </div>
        </section>

        <section style={{ ...(cardStyle as any), gap: '1rem' }}>
          <header>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Vista previa</h2>
            <p style={{ color: '#64748b', marginTop: 4 }}>Así se verá la cabecera del producto.</p>
          </header>

          <div style={{ display: 'grid', gap: 12 }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" style={{ width: '100%', height: 180, objectFit: 'contain', borderRadius: 12 }} />
            ) : (
              <div style={{ width: '100%', height: 180, background: '#f1f5f9', borderRadius: 12 }} />
            )}
            <h1 style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 800, margin: 0 }}>
              {title || 'TÍTULO DEL PRODUCTO'}
            </h1>
            {priceText ? (
              <p style={{ color: '#0f172a', fontWeight: 600, margin: 0 }}>{priceText}</p>
            ) : null}
            <p style={{ color: '#334155', margin: 0 }}>{summary || 'Este es el resumen del producto...'}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {ctaLeadLabel ? (
                <span style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {ctaLeadLabel}
                </span>
              ) : null}
              {ctaAffiliateLabel ? (
                <span style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {ctaAffiliateLabel}
                </span>
              ) : null}
              {ctaStripeLabel ? (
                <span style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {ctaStripeLabel}
                </span>
              ) : null}
              {ctaPaypalLabel ? (
                <span style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {ctaPaypalLabel}
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <section style={{ ...(cardStyle as any), gap: '1.25rem', width: '100%', marginTop: '1.25rem' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Descripción (HTML)</h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {descriptionMetrics.words.toLocaleString()} palabras
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: isDescriptionTooLong ? '#dc2626' : '#64748b' }}>
            {descriptionMetrics.characters.toLocaleString()} / {DESCRIPTION_MAX_LENGTH.toLocaleString()} caracteres
          </span>
        </header>

        <div>
          <TinyMceEditor
            ref={editorRef}
            value={description}
            onChange={handleDescriptionChange}
            slug={loadedSlug}
          />
          {isDescriptionTooLong && (
            <p style={{ color: '#dc2626', marginTop: 8 }}>
              La descripción supera el máximo permitido. Reduce el contenido.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => handleSaveDescription(false)}
            style={buttonStyle}
            disabled={!loadedSlug || isSavingDescription || isDescriptionTooLong}
          >
            {isSavingDescription ? 'Guardando…' : 'Guardar descripción'}
          </button>
          <button
            type="button"
            onClick={() => handleSaveDescription(true)}
            style={disabledButtonStyle}
            disabled={!loadedSlug || isSavingDescription || isDescriptionTooLong}
          >
            {isSavingDescription ? 'Guardando…' : 'Guardar y Ver'}
          </button>
        </div>
        {descriptionSaveError ? <p style={errorTextStyle}>{descriptionSaveError}</p> : null}
        {descriptionSaveSuccess ? <p style={successTextStyle}>{descriptionSaveSuccess}</p> : null}
      </section>
    </section>
  );
}
