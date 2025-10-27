'use client';

import React, { useCallback, useEffect, useState, useRef, type ChangeEvent, type FormEvent } from 'react';
import TinyMceEditor from './tinymce-editor';
import { buttonStyle, cardStyle, disabledButtonStyle, inputStyle, textareaStyle } from './panel-styles';

const topBarStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '1rem',
  alignItems: 'flex-end'
};

const contentLayoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  flexWrap: 'wrap'
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap'
};

const toggleWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#334155'
};

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

const editorWrapperStyle: React.CSSProperties = {
  ...cardStyle,
  padding: '0',
  overflow: 'hidden',
  flex: '1 1 520px',
  minWidth: 'min(100%, 520px)'
};

const editorHeaderStyle: React.CSSProperties = {
  padding: '1rem 1.5rem',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc'
};

const editorBodyStyle: React.CSSProperties = {
  padding: '1rem 1.5rem'
};

const sidePanelStyle: React.CSSProperties = {
  ...cardStyle,
  position: 'sticky',
  top: '6rem',
  height: 'fit-content',
  flex: '1 1 320px',
  minWidth: 'min(100%, 320px)'
};

const statusBadgeStyle: React.CSSProperties = {
  borderRadius: 9999,
  padding: '0.125rem 0.5rem',
  fontSize: '0.75rem',
  fontWeight: 600
};

const statusBadgeSuccess: React.CSSProperties = {
  ...statusBadgeStyle,
  background: '#dcfce7',
  color: '#14532d'
};

const statusBadgeDanger: React.CSSProperties = {
  ...statusBadgeStyle,
  background: '#fee2e2',
  color: '#991b1b'
};

const disabledSecondaryButton: React.CSSProperties = {
  ...disabledButtonStyle,
  background: '#e2e8f0',
  color: '#475569'
};

interface BlogPostDetail {
  slug: string;
  title: string | null;
  shortSummary: string | null;
  contentHtml: string | null;
  coverImageUrl: string | null;
  categorySlug: string | null;
  productSlugs: string[];
  ctaLeadUrl: string | null;
  ctaAffiliateUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  lastUpdatedAt: string | null;
}

interface BlogPostResponse {
  ok: true;
  post: BlogPostDetail;
}

interface BlogPostErrorResponse {
  ok: false;
  error_code?: string;
  message?: string;
  error_details?: unknown;
}

interface BlogCategoryItem {
  slug: string;
  name: string;
  is_published: boolean;
}

interface BlogCategoryResponse {
  ok: true;
  categories: BlogCategoryItem[];
}

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

type ToastState = { type: 'success' | 'error'; message: string } | null;

interface EditBlogPanelProps {
  initialSlug?: string | null;
}

function normalizeSlugInput(value: string): string {
  return value.trim().toLowerCase();
}

function toDatetimeLocalInput(value: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const tzOffset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocalInput(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function parseProductSlugsInput(value: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item, index, all) => item && all.indexOf(item) === index);
}

function formatProductSlugs(value: string[] | null | undefined): string {
  if (!value || value.length === 0) {
    return '';
  }
  return value.join('\n');
}

export default function EditBlogPanel({ initialSlug = null }: EditBlogPanelProps) {
  const [slugInput, setSlugInput] = useState<string>(initialSlug ? normalizeSlugInput(initialSlug) : '');
  const [loadedSlug, setLoadedSlug] = useState<string>(initialSlug ? normalizeSlugInput(initialSlug) : '');
  const [title, setTitle] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [categorySlug, setCategorySlug] = useState<string>('');
  const [publishedAtInput, setPublishedAtInput] = useState<string>('');
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string>('');
  const [ctaLeadUrl, setCtaLeadUrl] = useState<string>('');
  const [ctaAffiliateUrl, setCtaAffiliateUrl] = useState<string>('');
  const [seoTitle, setSeoTitle] = useState<string>('');
  const [seoDescription, setSeoDescription] = useState<string>('');
  const [canonicalUrl, setCanonicalUrl] = useState<string>('');
  const [productSlugsInput, setProductSlugsInput] = useState<string>('');
  const [contentHtml, setContentHtml] = useState<string>('');

  const [loadStatus, setLoadStatus] = useState<AsyncStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<AsyncStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  const [categories, setCategories] = useState<BlogCategoryItem[]>([]);
  const [categoriesStatus, setCategoriesStatus] = useState<AsyncStatus>('idle');
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newCategorySlug, setNewCategorySlug] = useState<string>('');
  const [createCategoryStatus, setCreateCategoryStatus] = useState<AsyncStatus>('idle');
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null);
  const [createCategorySuccess, setCreateCategorySuccess] = useState<string | null>(null);

  const isExistingPost = Boolean(loadedSlug);

  const pendingRequestRef = useRef<AbortController | null>(null);

  const editorSlug = slugInput || 'new-blog-post';

  const resetMessages = useCallback(() => {
    setSaveError(null);
    setSaveSuccess(null);
    setToast(null);
  }, []);

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true);
    resetMessages();
  }, [resetMessages]);

  const applyPostData = useCallback((post: BlogPostDetail) => {
    setLoadedSlug(post.slug);
    setSlugInput(post.slug);
    setTitle(post.title ?? '');
    setSummary(post.shortSummary ?? '');
    setCategorySlug(post.categorySlug ?? '');
    setPublishedAtInput(toDatetimeLocalInput(post.publishedAt));
    setIsPublished(Boolean(post.isPublished));
    setCoverImageUrl(post.coverImageUrl ?? '');
    setCtaLeadUrl(post.ctaLeadUrl ?? '');
    setCtaAffiliateUrl(post.ctaAffiliateUrl ?? '');
    setSeoTitle(post.seoTitle ?? '');
    setSeoDescription(post.seoDescription ?? '');
    setCanonicalUrl(post.canonicalUrl ?? '');
    setProductSlugsInput(formatProductSlugs(post.productSlugs));
    setContentHtml(post.contentHtml ?? '');
    setHasUnsavedChanges(false);
    setSaveStatus('idle');
    setSaveError(null);
    setSaveSuccess(null);
    setToast(null);
  }, []);

  const handleLoadPost = useCallback(
    async (slug: string) => {
      const normalized = normalizeSlugInput(slug);
      if (!normalized) {
        setLoadStatus('error');
        setLoadError('Proporciona un slug válido para cargar el post.');
        return;
      }

      setLoadStatus('loading');
      setLoadError(null);
      try {
        const response = await fetch(`/api/blog/posts/${encodeURIComponent(normalized)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });
        const body = (await response.json().catch(() => null)) as BlogPostResponse | BlogPostErrorResponse | null;
        if (!response.ok || !body || (body as BlogPostResponse).ok !== true) {
          const message = (body as BlogPostErrorResponse)?.message || 'No se pudo cargar el post.';
          throw new Error(message);
        }
        const data = body as BlogPostResponse;
        if (!data.post) {
          throw new Error('Post inválido.');
        }
        applyPostData(data.post);
        setLoadStatus('success');
      } catch (error) {
        setLoadStatus('error');
        setLoadError((error as Error)?.message ?? 'Ocurrió un error inesperado al cargar el post.');
      }
    },
    [applyPostData]
  );

  const fetchCategories = useCallback(async () => {
    setCategoriesStatus('loading');
    setCategoriesError(null);
    try {
      const response = await fetch('/api/blog/categories?type=blog', {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      const body = (await response.json().catch(() => null)) as BlogCategoryResponse | BlogPostErrorResponse | null;
      if (!response.ok || !body || (body as BlogCategoryResponse).ok !== true) {
        const message = (body as BlogPostErrorResponse)?.message || 'No se pudieron cargar las categorías.';
        throw new Error(message);
      }
      const data = body as BlogCategoryResponse;
      if (!Array.isArray(data.categories)) {
        throw new Error('Respuesta inválida de categorías.');
      }
      setCategories(data.categories);
      setCategoriesStatus('success');
    } catch (error) {
      setCategoriesStatus('error');
      setCategoriesError((error as Error)?.message ?? 'Error al cargar categorías.');
    }
  }, []);

  useEffect(() => {
    fetchCategories().catch(() => {
      /* handled */
    });
  }, [fetchCategories]);

  useEffect(() => {
    if (initialSlug) {
      handleLoadPost(initialSlug).catch(() => {
        /* handled */
      });
    }
  }, [initialSlug, handleLoadPost]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const clickHandler = (event: MouseEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) {
        return;
      }
      if (anchor.origin !== window.location.origin) {
        return;
      }
      const confirmed = window.confirm('Tienes cambios sin guardar. ¿Seguro que quieres salir?');
      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    document.addEventListener('click', clickHandler, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      document.removeEventListener('click', clickHandler, true);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    return () => {
      pendingRequestRef.current?.abort();
    };
  }, []);

  const handleNewPost = useCallback(() => {
    pendingRequestRef.current?.abort();
    setLoadedSlug('');
    setSlugInput('');
    setTitle('');
    setSummary('');
    setCategorySlug('');
    setPublishedAtInput('');
    setIsPublished(false);
    setCoverImageUrl('');
    setCtaLeadUrl('');
    setCtaAffiliateUrl('');
    setSeoTitle('');
    setSeoDescription('');
    setCanonicalUrl('');
    setProductSlugsInput('');
    setContentHtml('');
    setHasUnsavedChanges(false);
    setLoadStatus('idle');
    setLoadError(null);
    setSaveStatus('idle');
    setSaveError(null);
    setSaveSuccess(null);
    setToast(null);
  }, []);

  const handleCreateCategory = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!newCategoryName.trim()) {
        setCreateCategoryStatus('error');
        setCreateCategoryError('Ingresa un nombre de categoría.');
        return;
      }
      setCreateCategoryStatus('loading');
      setCreateCategoryError(null);
      setCreateCategorySuccess(null);
      try {
        const response = await fetch('/api/blog/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name: newCategoryName.trim(),
            slug: newCategorySlug.trim() || undefined,
            is_published: true
          })
        });
        const created = (await response.json().catch(() => null)) as BlogCategoryItem | BlogPostErrorResponse | null;
        if (!response.ok) {
          const message = (created as BlogPostErrorResponse)?.message || 'No se pudo crear la categoría.';
          throw new Error(message);
        }
        if (!created || Array.isArray(created) || !(created as BlogCategoryItem).slug) {
          throw new Error('Respuesta inválida al crear la categoría.');
        }
        const newCategory = created as BlogCategoryItem;
        setCategories((prev) => {
          const exists = prev.some((item) => item.slug === newCategory.slug);
          if (exists) {
            return prev;
          }
          return [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name));
        });
        setCategorySlug(newCategory.slug);
        setNewCategoryName('');
        setNewCategorySlug('');
        setCreateCategoryStatus('success');
        setCreateCategorySuccess('Categoría creada.');
        markDirty();
      } catch (error) {
        setCreateCategoryStatus('error');
        setCreateCategoryError((error as Error)?.message ?? 'Error al crear la categoría.');
      }
    },
    [newCategoryName, newCategorySlug, markDirty]
  );

  const handleSave = useCallback(
    async (options?: { openPublicView?: boolean }) => {
      const normalizedSlug = normalizeSlugInput(slugInput);
      if (!normalizedSlug) {
        setSaveStatus('error');
        const message = 'El slug es obligatorio y debe estar en formato kebab-case.';
        setSaveError(message);
        setToast({ type: 'error', message });
        return;
      }
      if (!title.trim()) {
        setSaveStatus('error');
        const message = 'El título es obligatorio.';
        setSaveError(message);
        setToast({ type: 'error', message });
        return;
      }

      setSaveStatus('loading');
      setSaveError(null);
      setSaveSuccess(null);
      setToast(null);

      const payload = {
        slug: normalizedSlug,
        title_h1: title.trim(),
        short_summary: summary.trim() || null,
        content_html: contentHtml,
        cover_image_url: coverImageUrl.trim() || null,
        category_slug: categorySlug.trim() || null,
        product_slugs: parseProductSlugsInput(productSlugsInput),
        cta_lead_url: ctaLeadUrl.trim() || null,
        cta_affiliate_url: ctaAffiliateUrl.trim() || null,
        seo_title: seoTitle.trim() || null,
        seo_description: seoDescription.trim() || null,
        canonical_url: canonicalUrl.trim() || null,
        is_published: isPublished,
        published_at: fromDatetimeLocalInput(publishedAtInput)
      };

      const controller = new AbortController();
      pendingRequestRef.current?.abort();
      pendingRequestRef.current = controller;

      try {
        const endpoint = isExistingPost ? `/api/blog/posts/${encodeURIComponent(loadedSlug || normalizedSlug)}` : '/api/blog/posts';
        const method = isExistingPost ? 'PUT' : 'POST';
        const response = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        const body = (await response.json().catch(() => null)) as BlogPostResponse | BlogPostErrorResponse | null;
        if (!response.ok || !body || (body as BlogPostResponse).ok !== true) {
          const message = (body as BlogPostErrorResponse)?.message || 'No se pudo guardar el post.';
          throw new Error(message);
        }
        const data = body as BlogPostResponse;
        if (!data.post) {
          throw new Error('Respuesta inválida del servidor.');
        }
        applyPostData(data.post);
        setSaveStatus('success');
        const successMessage = 'Post guardado correctamente.';
        setSaveSuccess(successMessage);
        setToast({ type: 'success', message: successMessage });
        if (options?.openPublicView) {
          const viewUrl = `/blog/${data.post.slug}`;
          window.open(viewUrl, '_blank', 'noopener');
        }
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') {
          return;
        }
        const message = (error as Error)?.message ?? 'No se pudo guardar el post.';
        setSaveStatus('error');
        setSaveError(message);
        setToast({ type: 'error', message });
      } finally {
        pendingRequestRef.current = null;
      }
    },
    [slugInput, title, summary, contentHtml, coverImageUrl, categorySlug, productSlugsInput, ctaLeadUrl, ctaAffiliateUrl, seoTitle, seoDescription, canonicalUrl, isPublished, publishedAtInput, isExistingPost, loadedSlug, applyPostData]
  );

  const isSaveDisabled = saveStatus === 'loading';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a' }}>Edit Blog</h2>
            <p style={{ margin: '0.5rem 0 0', color: '#475569', maxWidth: 640 }}>
              Crea o edita publicaciones del blog. Completa los campos requeridos y usa TinyMCE para el contenido principal.
            </p>
          </div>
          <div>
            {saveStatus === 'success' ? (
              <span style={statusBadgeSuccess}>Guardado</span>
            ) : hasUnsavedChanges ? (
              <span style={statusBadgeDanger}>Cambios sin guardar</span>
            ) : null}
          </div>
        </div>

        <div style={topBarStyle}>
          <div>
            <label htmlFor="blog-slug" style={labelStyle}>
              Slug
            </label>
            <input
              id="blog-slug"
              type="text"
              style={inputStyle}
              placeholder="ej. mi-primer-post"
              value={slugInput}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setSlugInput(normalizeSlugInput(event.target.value));
                markDirty();
              }}
              disabled={isPublished || isSaveDisabled}
            />
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={isSaveDisabled ? disabledButtonStyle : buttonStyle}
                disabled={isSaveDisabled}
                onClick={() => handleLoadPost(slugInput)}
              >
                Cargar Post
              </button>
              <button type="button" style={buttonStyle} onClick={handleNewPost}>
                Nuevo Post
              </button>
            </div>
            {loadStatus === 'error' && loadError ? <p style={errorTextStyle}>{loadError}</p> : null}
            {isPublished ? <p style={helperTextStyle}>El slug está bloqueado porque el post está publicado.</p> : null}
          </div>

          <div>
            <label htmlFor="blog-title" style={labelStyle}>
              Título H1
            </label>
            <input
              id="blog-title"
              type="text"
              style={inputStyle}
              placeholder="Título principal del post"
              value={title}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setTitle(event.target.value);
                markDirty();
              }}
            />
          </div>

          <div>
            <label htmlFor="blog-category" style={labelStyle}>
              Categoría
            </label>
            <select
              id="blog-category"
              style={inputStyle}
              value={categorySlug}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setCategorySlug(event.target.value);
                markDirty();
              }}
            >
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
            {categoriesStatus === 'loading' ? <p style={helperTextStyle}>Cargando categorías…</p> : null}
            {categoriesStatus === 'error' && categoriesError ? (
              <p style={errorTextStyle}>{categoriesError}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="blog-published-at" style={labelStyle}>
              Fecha de publicación
            </label>
            <input
              id="blog-published-at"
              type="datetime-local"
              style={inputStyle}
              value={publishedAtInput}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setPublishedAtInput(event.target.value);
                markDirty();
              }}
            />
            <div style={{ marginTop: '0.5rem' }}>
              <label style={toggleWrapperStyle}>
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setIsPublished(event.target.checked);
                    markDirty();
                  }}
                />
                <span>Publicar post</span>
              </label>
              <p style={helperTextStyle}>
                Si el post está publicado, el slug no se podrá editar y se usará la fecha indicada.
              </p>
            </div>
          </div>
        </div>

        <div style={buttonRowStyle}>
          <button
            type="button"
            style={isSaveDisabled ? disabledButtonStyle : buttonStyle}
            disabled={isSaveDisabled}
            onClick={() => handleSave()}
          >
            Guardar
          </button>
          <button
            type="button"
            style={isSaveDisabled ? disabledButtonStyle : buttonStyle}
            disabled={isSaveDisabled || !slugInput}
            onClick={() => handleSave({ openPublicView: true })}
          >
            Guardar y Ver
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() =>
              setToast({ type: 'error', message: 'La purga de Cloudflare estará disponible en una fase posterior.' })
            }
          >
            Purge CF
          </button>
          <button type="button" style={disabledSecondaryButton} disabled>
            Push to Algolia
          </button>
        </div>
        {saveStatus === 'error' && saveError ? <p style={errorTextStyle}>{saveError}</p> : null}
        {saveStatus === 'success' && saveSuccess ? <p style={successTextStyle}>{saveSuccess}</p> : null}
        {toast ? (
          <p style={toast.type === 'error' ? errorTextStyle : successTextStyle}>{toast.message}</p>
        ) : null}
      </header>

      <div style={contentLayoutStyle}>
        <div style={editorWrapperStyle}>
          <div style={editorHeaderStyle}>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>Contenido del Post</h3>
            <p style={{ margin: '0.35rem 0 0', color: '#475569' }}>
              El editor TinyMCE guarda borradores localmente. Usa «Guardar» para persistir los cambios.
            </p>
          </div>
          <div style={editorBodyStyle}>
            <TinyMceEditor
              value={contentHtml}
              onChange={(value) => {
                setContentHtml(value);
                markDirty();
              }}
              slug={editorSlug}
              placeholder="Escribe el contenido del blog aquí..."
            />
          </div>
        </div>

        <aside style={sidePanelStyle}>
          <section>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>Resumen & SEO</h3>
            <label htmlFor="blog-summary" style={{ ...labelStyle, marginTop: '1rem' }}>
              Resumen corto (160 caracteres)
            </label>
            <textarea
              id="blog-summary"
              style={textareaStyle}
              maxLength={160}
              placeholder="Breve resumen para meta description y listados."
              value={summary}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setSummary(event.target.value);
                markDirty();
              }}
            />
            <small style={helperTextStyle}>{summary.length}/160</small>

            <label htmlFor="seo-title" style={{ ...labelStyle, marginTop: '1rem' }}>
              SEO title (60 caracteres)
            </label>
            <input
              id="seo-title"
              type="text"
              style={inputStyle}
              maxLength={60}
              value={seoTitle}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setSeoTitle(event.target.value);
                markDirty();
              }}
            />
            <small style={helperTextStyle}>{seoTitle.length}/60</small>

            <label htmlFor="seo-description" style={{ ...labelStyle, marginTop: '1rem' }}>
              SEO description (160 caracteres)
            </label>
            <textarea
              id="seo-description"
              style={textareaStyle}
              maxLength={160}
              value={seoDescription}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setSeoDescription(event.target.value);
                markDirty();
              }}
            />
            <small style={helperTextStyle}>{seoDescription.length}/160</small>

            <label htmlFor="canonical-url" style={{ ...labelStyle, marginTop: '1rem' }}>
              Canonical URL
            </label>
            <input
              id="canonical-url"
              type="url"
              style={inputStyle}
              placeholder="https://..."
              value={canonicalUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setCanonicalUrl(event.target.value);
                markDirty();
              }}
            />
          </section>

          <section>
            <h3 style={{ margin: '1.5rem 0 0', color: '#0f172a', fontSize: '1rem' }}>CTA & Portada</h3>
            <label htmlFor="cover-image" style={{ ...labelStyle, marginTop: '1rem' }}>
              Cover image URL
            </label>
            <input
              id="cover-image"
              type="url"
              style={inputStyle}
              placeholder="https://..."
              value={coverImageUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setCoverImageUrl(event.target.value);
                markDirty();
              }}
            />

            <label htmlFor="cta-lead" style={{ ...labelStyle, marginTop: '1rem' }}>
              CTA Lead URL
            </label>
            <input
              id="cta-lead"
              type="url"
              style={inputStyle}
              placeholder="https://..."
              value={ctaLeadUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setCtaLeadUrl(event.target.value);
                markDirty();
              }}
            />

            <label htmlFor="cta-affiliate" style={{ ...labelStyle, marginTop: '1rem' }}>
              CTA Affiliate URL
            </label>
            <input
              id="cta-affiliate"
              type="url"
              style={inputStyle}
              placeholder="https://..."
              value={ctaAffiliateUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setCtaAffiliateUrl(event.target.value);
                markDirty();
              }}
            />
          </section>

          <section>
            <h3 style={{ margin: '1.5rem 0 0', color: '#0f172a', fontSize: '1rem' }}>Productos relacionados</h3>
            <textarea
              style={{ ...textareaStyle, minHeight: '6rem' }}
              placeholder="Introduce los slugs de producto, uno por línea."
              value={productSlugsInput}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setProductSlugsInput(event.target.value);
                markDirty();
              }}
            />
            <p style={helperTextStyle}>Se guardarán en formato JSON para relacionar productos destacados.</p>
          </section>

          <section>
            <h3 style={{ margin: '1.5rem 0 0', color: '#0f172a', fontSize: '1rem' }}>Nueva categoría</h3>
            <form onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label htmlFor="new-category-name" style={labelStyle}>
                  Nombre
                </label>
                <input
                  id="new-category-name"
                  type="text"
                  style={inputStyle}
                  value={newCategoryName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setNewCategoryName(event.target.value);
                    setCreateCategoryError(null);
                    setCreateCategorySuccess(null);
                  }}
                />
              </div>
              <div>
                <label htmlFor="new-category-slug" style={labelStyle}>
                  Slug opcional
                </label>
                <input
                  id="new-category-slug"
                  type="text"
                  style={inputStyle}
                  value={newCategorySlug}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setNewCategorySlug(event.target.value);
                    setCreateCategoryError(null);
                    setCreateCategorySuccess(null);
                  }}
                />
              </div>
              <button
                type="submit"
                style={createCategoryStatus === 'loading' ? disabledButtonStyle : buttonStyle}
                disabled={createCategoryStatus === 'loading'}
              >
                Crear categoría
              </button>
            </form>
            {createCategoryStatus === 'error' && createCategoryError ? (
              <p style={errorTextStyle}>{createCategoryError}</p>
            ) : null}
            {createCategoryStatus === 'success' && createCategorySuccess ? (
              <p style={successTextStyle}>{createCategorySuccess}</p>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
