'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonStyle, cardStyle, disabledButtonStyle } from './panel-styles';
import TinyMceEditor from './tinymce-editor';

// Minimal safe limit
const DESCRIPTION_MAX_LENGTH = 150000;

// Very small helper to compute character/word counts from HTML
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

type CategoryOption = { slug: string; name: string };

type EditProductPanelProps = {
  initialSlug?: string | null;
  initialInput?: string | null;
};

export default function EditProductPanel({ initialSlug = null, initialInput = '' }: EditProductPanelProps) {
  const router = useRouter();

  // Basic form state (keep keys generic and harmless for build)
  const [slug, setSlug] = useState<string>(initialSlug ?? '');
  const [title, setTitle] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [priceText, setPriceText] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [ctaLabel1, setCtaLabel1] = useState<string>('');
  const [ctaUrl1, setCtaUrl1] = useState<string>('');

  // Category
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categorySlug, setCategorySlug] = useState<string>('');

  // Description (TinyMCE)
  const [description, setDescription] = useState<string>('');
  const descriptionMetrics = useMemo(() => measureHtmlContent(description), [description]);
  const isDescriptionTooLong = descriptionMetrics.characters > DESCRIPTION_MAX_LENGTH;

  // Load categories for dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/categories?type=product', { cache: 'no-store' });
        if (!res.ok) return;
        const list: any = await res.json();
        const items: CategoryOption[] = Array.isArray(list) ? list : (list?.items ?? []);
        if (!cancelled) setCategoryOptions(items);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Save Desc (and optionally open preview in new tab with cache-buster)
  const handleSaveDescription = useCallback(async (viewAfter = false) => {
    if (!slug) return;
    const payload = { slug, desc_html: description };
    const shouldOpenPreview = viewAfter && typeof window !== 'undefined';
    let previewWindow: Window | null = null;
    if (shouldOpenPreview) previewWindow = window.open('', '_blank');

    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) {
        if (previewWindow) previewWindow.close();
        return;
      }
      if (shouldOpenPreview) {
        const url = `/p/${encodeURIComponent(slug)}?v=${Date.now()}`;
        if (previewWindow) {
          previewWindow.location.href = url;
          previewWindow.focus();
        } else {
          window.open(url, '_blank');
        }
      }
    } catch (e) {
      if (previewWindow) previewWindow.close();
    }
  }, [slug, description]);

  // ----------- UI -----------
  const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '1.25rem' };

  return (
    <section style={sectionStyle} aria-label="Product editor">
      {/* === Top area: 2-column grid (Main Content | Preview) === */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Main content card */}
        <section style={{ ...(cardStyle as any), gap: '1rem' }}>
          <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Contenido principal</h2>
          </header>

          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Slug del producto</div>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="p-ej: shelf-bin-nestable-clear-12"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </label>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Título (H1)</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título del producto"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </label>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Short summary</div>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="Resumen breve"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </label>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Precio (texto)</div>
              <input
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder="$ 633 (sólo esta semana)"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </label>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Imagen principal (URL)</div>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>CTA Label</div>
                <input
                  value={ctaLabel1}
                  onChange={(e) => setCtaLabel1(e.target.value)}
                  placeholder="Ver más"
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </label>
              <label>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>CTA URL</div>
                <input
                  value={ctaUrl1}
                  onChange={(e) => setCtaUrl1(e.target.value)}
                  placeholder="https://..."
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </label>
            </div>

            <label>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Category</div>
              <select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              >
                <option value="">(sin categoría)</option>
                {categoryOptions.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} · {c.slug}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Preview card */}
        <section style={{ ...(cardStyle as any), gap: '1rem' }}>
          <header>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Vista previa</h2>
            <p style={{ color: '#64748b', marginTop: 4 }}>Así se verá la cabecera del producto en la página pública.</p>
          </header>

          <div style={{ display: 'grid', gap: 12 }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" style={{ width: '100%', height: 180, objectFit: 'contain', borderRadius: 12 }} />
            ) : (
              <div style={{ width: '100%', height: 180, background: '#f1f5f9', borderRadius: 12 }} />
            )}
            <h1 style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 800 }}>{title || 'TÍTULO DEL PRODUCTO'}</h1>
            <p style={{ color: '#334155' }}>{summary || 'Este es el resumen del producto...'}</p>
          </div>
        </section>
      </div>

      {/* === Full-width editor below === */}
      <section style={{ ...(cardStyle as any), gap: '1.25rem', width: '100%', marginTop: '1.25rem' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Descripción (HTML)</h2>
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
            initialHtml={description}
            onChange={(html: string) => setDescription(html)}
          />
          {isDescriptionTooLong && (
            <p style={{ color: '#dc2626', marginTop: 8 }}>
              La descripción supera el máximo permitido. Reduce el contenido.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => handleSaveDescription(false)}
            style={buttonStyle as any}
          >
            Guardar
          </button>
          <button
            onClick={() => handleSaveDescription(true)}
            style={disabledButtonStyle as any}
          >
            Guardar y Ver
          </button>
        </div>
      </section>
    </section>
  );
}
