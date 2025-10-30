'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ChangeEvent,
  type FormEvent
} from 'react';
import TinyMceEditor, { type TinyMceEditorHandle } from './tinymce-editor';
import { buttonStyle, cardStyle, disabledButtonStyle, inputStyle, textareaStyle } from './panel-styles';
import { createAdminApiClient } from './admin-api-client';
import { resolveCtaLabel } from '@/lib/product-cta';

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

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem'
};

const primaryLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: '1.25rem',
  alignItems: 'stretch'
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  flexWrap: 'wrap'
};

const previewImageStyle: React.CSSProperties = {
  width: '100%',
  height: 180,
  objectFit: 'cover',
  borderRadius: 12,
  background: '#f1f5f9'
};

const previewPlaceholderStyle: React.CSSProperties = {
  width: '100%',
  height: 180,
  borderRadius: 12,
  background: '#f1f5f9'
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

interface BlogImageUploadSuccess {
  ok: true;
  image_id: string;
  delivery_url: string;
  variant: string;
  latency_ms?: number;
  ray_id?: string | null;
  size_bytes?: number;
}

interface BlogImageUploadError {
  ok: false;
  error_code: string;
  message?: string;
}

type BlogImageUploadResponse = BlogImageUploadSuccess | BlogImageUploadError;

interface BlogPdfUploadSuccess {
  ok: true;
  url: string;
  filename?: string | null;
}

interface BlogPdfUploadError {
  ok: false;
  error_code: string;
  message?: string;
}

type BlogPdfUploadResponse = BlogPdfUploadSuccess | BlogPdfUploadError;

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

type ToastState = { type: 'success' | 'error'; message: string } | null;

interface EditBlogPanelProps {
  initialSlug?: string | null;
  cfImagesEnabled?: boolean;
  cfImagesBaseUrl?: string | null;
  authHeader?: string | null;
  adminToken?: string | null;
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

export default function EditBlogPanel({
  initialSlug = null,
  cfImagesEnabled = false,
  cfImagesBaseUrl = null,
  authHeader = null,
  adminToken = null
}: EditBlogPanelProps) {
  const adminApi = useMemo(
    () => createAdminApiClient({ authHeader, adminToken }),
    [authHeader, adminToken]
  );
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
  const editorRef = useRef<TinyMceEditorHandle | null>(null);

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
    editorRef.current?.clearDraft();
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
        const response = await adminApi.fetchWithAuth(`/api/blog/posts/${encodeURIComponent(normalized)}`, {
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
    [adminApi, applyPostData]
  );

  const fetchCategories = useCallback(async () => {
    setCategoriesStatus('loading');
    setCategoriesError(null);
    try {
      const response = await adminApi.fetchWithAuth('/api/blog/categories?type=blog', {
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
  }, [adminApi]);

  const handleSlugChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = normalizeSlugInput(event.target.value);
      setSlugInput(value);
      if (loadStatus === 'error') {
        setLoadStatus('idle');
      }
      setLoadError(null);
      if (!loadedSlug || value !== loadedSlug) {
        markDirty();
      }
    },
    [loadStatus, loadedSlug, markDirty]
  );

  const handleSlugSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleLoadPost(slugInput);
    },
    [handleLoadPost, slugInput]
  );

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
    editorRef.current?.clearDraft();
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
        const response = await adminApi.fetchWithAuth('/api/blog/categories', {
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
    [adminApi, newCategoryName, newCategorySlug, markDirty]
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
        const response = await adminApi.fetchWithAuth(endpoint, {
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
          const viewUrl = `/b/${data.post.slug}`;
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
    [
      adminApi,
      slugInput,
      title,
      summary,
      contentHtml,
      coverImageUrl,
      categorySlug,
      productSlugsInput,
      ctaLeadUrl,
      ctaAffiliateUrl,
      seoTitle,
      seoDescription,
      canonicalUrl,
      isPublished,
      publishedAtInput,
      isExistingPost,
      loadedSlug,
      applyPostData
    ]
  );

  const [assetUploadStatus, setAssetUploadStatus] = useState<'idle' | 'image' | 'pdf'>('idle');
  const isLoadingPost = loadStatus === 'loading';
  const isSaving = saveStatus === 'loading';
  const isSaveDisabled = isSaving || assetUploadStatus !== 'idle';
  const previewSlug = slugInput || 'nuevo-post';

  const handleEditorImageUpload = useCallback(
    async (file: File) => {
      if (!cfImagesEnabled) {
        const message = 'Cloudflare Images no está habilitado para subir imágenes.';
        setToast({ type: 'error', message });
        return null;
      }

      setAssetUploadStatus('image');
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await adminApi.fetchWithAuth('/api/blog/assets/images/upload', {
          method: 'POST',
          body: formData
        });

        const body = (await response.json().catch(() => null)) as BlogImageUploadResponse | null;
        if (!response.ok || !body || body.ok !== true) {
          const message = (body as BlogImageUploadError)?.message || 'No se pudo subir la imagen.';
          setToast({ type: 'error', message });
          return null;
        }

        const success = body as BlogImageUploadSuccess;
        const deliveryUrl =
          success.delivery_url ||
          (cfImagesBaseUrl
            ? `${cfImagesBaseUrl.replace(/\/$/, '')}/${success.image_id}/${success.variant || 'public'}`
            : null);
        if (!deliveryUrl) {
          const message = 'No se pudo construir la URL de la imagen subida.';
          setToast({ type: 'error', message });
          return null;
        }
        const message = `Imagen subida (${success.image_id})`;
        setToast({ type: 'success', message });
        return { url: deliveryUrl, alt: file.name };
      } catch (error) {
        const message = (error as Error)?.message ?? 'Error subiendo la imagen.';
        setToast({ type: 'error', message });
        return null;
      } finally {
        setAssetUploadStatus('idle');
      }
    },
    [adminApi, cfImagesBaseUrl, cfImagesEnabled]
  );

  const handleEditorPdfUpload = useCallback(
    async (file: File) => {
      setAssetUploadStatus('pdf');
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await adminApi.fetchWithAuth('/api/blog/assets/pdfs/upload', {
          method: 'POST',
          body: formData
        });

        const body = (await response.json().catch(() => null)) as BlogPdfUploadResponse | null;
        if (!response.ok || !body || body.ok !== true || !body.url) {
          const message = (body as BlogPdfUploadError)?.message || 'No se pudo subir el PDF.';
          setToast({ type: 'error', message });
          return null;
        }

        const success = body as BlogPdfUploadSuccess;
        const linkText = (success.filename ?? file.name ?? 'Descargar PDF').trim() || 'Descargar PDF';
        setToast({ type: 'success', message: 'PDF subido correctamente.' });
        return { url: success.url, text: linkText };
      } catch (error) {
        const message = (error as Error)?.message ?? 'Error subiendo el PDF.';
        setToast({ type: 'error', message });
        return null;
      } finally {
        setAssetUploadStatus('idle');
      }
    },
    [adminApi]
  );

  return (
    <section style={sectionStyle} aria-label="Blog editor">
      <div style={primaryLayoutStyle}>
        <section style={{ ...(cardStyle as any), gap: '1rem' }}>
          <header
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Cabecera del blog</h2>
              <p style={{ ...helperTextStyle, marginTop: 4 }}>
                Elige el slug, la imagen y los CTA igual que en la ficha de productos.
              </p>
            </div>
            <div>
              {saveStatus === 'success' ? (
                <span style={statusBadgeSuccess}>Guardado</span>
              ) : hasUnsavedChanges ? (
                <span style={statusBadgeDanger}>Cambios sin guardar</span>
              ) : null}
            </div>
          </header>

          <form onSubmit={handleSlugSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Slug del post</span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={slugInput}
                  onChange={handleSlugChange}
                  placeholder="b-ej: mi-primer-post"
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  disabled={isPublished || isSaveDisabled}
                />
                <button
                  type="submit"
                  style={isSaveDisabled || !slugInput ? disabledButtonStyle : buttonStyle}
                  disabled={isSaveDisabled || !slugInput || isLoadingPost}
                >
                  {isLoadingPost ? 'Cargando…' : 'Cargar'}
                </button>
                <button
                  type="button"
                  style={isSaveDisabled ? disabledButtonStyle : buttonStyle}
                  onClick={handleNewPost}
                  disabled={isSaveDisabled}
                >
                  Nuevo
                </button>
              </div>
            </label>
          </form>

          {loadStatus === 'loading' ? (
            <p style={helperTextStyle}>Cargando post…</p>
          ) : loadStatus === 'error' && loadError ? (
            <p style={errorTextStyle}>{loadError}</p>
          ) : loadedSlug ? (
            <p style={helperTextStyle}>Post cargado: {loadedSlug}</p>
          ) : (
            <p style={helperTextStyle}>Ingresa un slug nuevo para crear el post o carga uno existente.</p>
          )}
          {isPublished ? <p style={helperTextStyle}>El slug está bloqueado porque el post está publicado.</p> : null}

          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Título (H1)</span>
              <input
                value={title}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setTitle(event.target.value);
                  markDirty();
                }}
                placeholder="Título del post"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Resumen breve</span>
              <textarea
                value={summary}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                  setSummary(event.target.value);
                  markDirty();
                }}
                rows={3}
                placeholder="Resumen introductorio para la tarjeta y el lead box."
                style={{ ...textareaStyle, minHeight: '5rem' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Imagen principal (URL)</span>
              <input
                value={coverImageUrl}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setCoverImageUrl(event.target.value);
                  markDirty();
                }}
                placeholder="https://..."
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Categoría</span>
              <select
                value={categorySlug}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setCategorySlug(event.target.value);
                  markDirty();
                }}
                style={inputStyle}
              >
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            {categoriesStatus === 'loading' ? <p style={helperTextStyle}>Cargando categorías…</p> : null}
            {categoriesStatus === 'error' && categoriesError ? <p style={errorTextStyle}>{categoriesError}</p> : null}

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>CTA Lead URL</span>
              <input
                value={ctaLeadUrl}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setCtaLeadUrl(event.target.value);
                  markDirty();
                }}
                placeholder="https://..."
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>CTA Affiliate URL</span>
              <input
                value={ctaAffiliateUrl}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setCtaAffiliateUrl(event.target.value);
                  markDirty();
                }}
                placeholder="https://..."
                style={inputStyle}
              />
            </label>

            <div style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Publicación</span>
              <input
                type="datetime-local"
                value={publishedAtInput}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setPublishedAtInput(event.target.value);
                  markDirty();
                }}
                style={inputStyle}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
              <p style={helperTextStyle}>Al publicar se activará la ruta /b/{loadedSlug || previewSlug}.</p>
            </div>
          </div>

          <div style={actionsRowStyle}>
            <button
              type="button"
              onClick={() => handleSave()}
              style={isSaveDisabled ? disabledButtonStyle : buttonStyle}
              disabled={isSaveDisabled}
            >
              {isSaving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={() => handleSave({ openPublicView: true })}
              style={isSaveDisabled || !slugInput ? disabledButtonStyle : buttonStyle}
              disabled={isSaveDisabled || !slugInput}
            >
              {isSaving ? 'Guardando…' : 'Guardar y ver'}
            </button>
          </div>

          {saveStatus === 'error' && saveError ? <p style={errorTextStyle}>{saveError}</p> : null}
          {saveStatus === 'success' && saveSuccess ? <p style={successTextStyle}>{saveSuccess}</p> : null}
          {toast ? <p style={toast.type === 'error' ? errorTextStyle : successTextStyle}>{toast.message}</p> : null}
        </section>

        <section style={{ ...(cardStyle as any), gap: '1rem' }}>
          <header>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Vista previa</h2>
            <p style={{ ...helperTextStyle, marginTop: 4 }}>Así se verá la hero pública.</p>
          </header>

          <div style={{ display: 'grid', gap: 12 }}>
            {coverPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreviewUrl} alt="" style={previewImageStyle} />
            ) : (
              <div style={previewPlaceholderStyle} aria-hidden="true" />
            )}
            <h1 style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 800, margin: 0 }}>{title || 'TÍTULO DEL POST'}</h1>
            {summaryPreview ? <p style={{ color: '#334155', margin: 0 }}>{summaryPreview}</p> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {previewCtas.map((cta) => {
                const isPrimary = cta.type === primaryCtaType;
                const style: React.CSSProperties = {
                  ...buttonStyle,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isPrimary ? '#0f172a' : '#e2e8f0',
                  color: isPrimary ? '#f8fafc' : '#0f172a'
                };
                return (
                  <span key={cta.type} style={style}>
                    {cta.label}
                  </span>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section style={{ ...(cardStyle as any), gap: '1.25rem', width: '100%' }}>
        <header>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Contenido (HTML)</h2>
        </header>

        <div>
          <TinyMceEditor
            ref={editorRef}
            value={contentHtml}
            onChange={(value) => {
              setContentHtml(value);
              markDirty();
            }}
            slug={editorSlug}
            placeholder="Escribe el contenido del blog aquí..."
            onRequestImageUpload={handleEditorImageUpload}
            onRequestPdfUpload={handleEditorPdfUpload}
          />
          {assetUploadStatus !== 'idle' ? (
            <p style={{ ...helperTextStyle, marginTop: '0.75rem' }}>
              {assetUploadStatus === 'image' ? 'Subiendo imagen a Cloudflare…' : 'Subiendo PDF…'}
            </p>
          ) : null}
        </div>

        <div style={actionsRowStyle}>
          <button
            type="button"
            onClick={() => handleSave()}
            style={isSaveDisabled ? disabledButtonStyle : buttonStyle}
            disabled={isSaveDisabled}
          >
            {isSaving ? 'Guardando…' : 'Guardar contenido'}
          </button>
          <button
            type="button"
            onClick={() => handleSave({ openPublicView: true })}
            style={isSaveDisabled || !slugInput ? disabledButtonStyle : buttonStyle}
            disabled={isSaveDisabled || !slugInput}
          >
            {isSaving ? 'Guardando…' : 'Guardar y ver'}
          </button>
        </div>
      </section>

      <section style={{ ...(cardStyle as any), gap: '1.25rem', width: '100%' }}>
        <header>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>SEO, relacionamiento y categorías</h2>
        </header>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>SEO Title</span>
            <input
              value={seoTitle}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setSeoTitle(event.target.value);
                markDirty();
              }}
              placeholder="Título para buscadores"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>SEO Description</span>
            <textarea
              value={seoDescription}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setSeoDescription(event.target.value);
                markDirty();
              }}
              rows={3}
              placeholder="Descripción corta para Google (160 caracteres)."
              style={{ ...textareaStyle, minHeight: '5rem' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Canonical URL</span>
            <input
              value={canonicalUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setCanonicalUrl(event.target.value);
                markDirty();
              }}
              placeholder="https://..."
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Slugs de productos relacionados</span>
            <textarea
              value={productSlugsInput}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setProductSlugsInput(event.target.value);
                markDirty();
              }}
              style={{ ...textareaStyle, minHeight: '6rem' }}
              placeholder="Ingresa un slug de producto por línea."
            />
            <p style={helperTextStyle}>Se guardarán como JSON para armar listados relacionados.</p>
          </label>
        </div>

        <section style={{ display: 'grid', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>Crear nueva categoría</h3>
          <form
            onSubmit={handleCreateCategory}
            style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
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
            <div style={{ display: 'grid', gap: 4 }}>
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
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="submit"
                style={createCategoryStatus === 'loading' ? disabledButtonStyle : buttonStyle}
                disabled={createCategoryStatus === 'loading'}
              >
                Crear categoría
              </button>
            </div>
          </form>
          {createCategoryStatus === 'error' && createCategoryError ? <p style={errorTextStyle}>{createCategoryError}</p> : null}
          {createCategoryStatus === 'success' && createCategorySuccess ? (
            <p style={successTextStyle}>{createCategorySuccess}</p>
          ) : null}
        </section>
      </section>
    </section>
  );
}
