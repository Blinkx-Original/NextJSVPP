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
  isPublished: boolean;
}

interface NewCategoryFormState {
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  isPublished: boolean;
}

type CategoryFetchStatus = 'idle' | 'loading' | 'success' | 'error';

const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORY_FETCH_DEBOUNCE_MS = 250;

function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

interface ProductFormState {
  slug: string;
  title: string;
  summary: string;
  description: string;
  price: string;
  categoryInput: string;
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
  categoryInput: '',
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
  const [categorySelectionSlug, setCategorySelectionSlug] = useState<string | null>(null);
  const [categorySelection, setCategorySelection] = useState<CategoryOption | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categoryFetchStatus, setCategoryFetchStatus] = useState<CategoryFetchStatus>('idle');
  const [categoryFetchError, setCategoryFetchError] = useState<string | null>(null);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<NewCategoryFormState>(emptyCategoryForm);
  const [categoryModalStatus, setCategoryModalStatus] = useState<AsyncStatus>('idle');
  const [categoryModalError, setCategoryModalError] = useState<string | null>(null);
  const [categorySlugManuallyEdited, setCategorySlugManuallyEdited] = useState(false);
  const descriptionEditorRef = useRef<TinyMceEditorHandle | null>(null);
  const lastLoadedSlugRef = useRef<string | null>(null);
  const categoryFetchAbortRef = useRef<AbortController | null>(null);
  const categoryDropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryInputRef = useRef<HTMLInputElement | null>(null);

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
    const trimmed = form.categoryInput.trim();
    if (categoryFetchTimeoutRef.current) {
      clearTimeout(categoryFetchTimeoutRef.current);
      categoryFetchTimeoutRef.current = null;
    }
    if (categoryFetchAbortRef.current) {
      categoryFetchAbortRef.current.abort();
      categoryFetchAbortRef.current = null;
    }

    const controller = new AbortController();
    categoryFetchAbortRef.current = controller;
    setCategoryFetchStatus('loading');
    setCategoryFetchError(null);

    categoryFetchTimeoutRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: 'product', limit: '20' });
        if (trimmed) {
          params.set('query', trimmed);
        }
        const response = await fetch(`/api/admin/categories?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        const body = (await response.json()) as Array<{
          slug?: string;
          name?: string;
          is_published?: boolean;
          isPublished?: boolean;
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
                name: typeof item.name === 'string' ? item.name : '',
                isPublished: Boolean(
                  typeof item.isPublished !== 'undefined' ? item.isPublished : item.is_published
                )
              }))
              .filter((item) => item.slug && item.name)
          : [];

        setCategoryOptions(normalized);
        setCategoryFetchStatus('success');

        if (categorySelectionSlug) {
          const match = normalized.find((item) => item.slug === categorySelectionSlug);
          if (match) {
            setCategorySelection(match);
            setForm((prev) => {
              const currentTrimmed = prev.categoryInput.trim();
              if (currentTrimmed === categorySelectionSlug && match.name && match.name !== prev.categoryInput) {
                return { ...prev, categoryInput: match.name };
              }
              return prev;
            });
          } else {
            setCategorySelection((prev) => (prev && prev.slug === categorySelectionSlug ? prev : null));
          }
        } else {
          setCategorySelection(null);
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        setCategoryFetchStatus('error');
        setCategoryFetchError((error as Error)?.message ?? 'No se pudieron cargar las categorías.');
      } finally {
        if (categoryFetchAbortRef.current === controller) {
          categoryFetchAbortRef.current = null;
        }
      }
    }, CATEGORY_FETCH_DEBOUNCE_MS);

    return () => {
      if (categoryFetchTimeoutRef.current) {
        clearTimeout(categoryFetchTimeoutRef.current);
        categoryFetchTimeoutRef.current = null;
      }
      controller.abort();
      if (categoryFetchAbortRef.current === controller) {
        categoryFetchAbortRef.current = null;
      }
    };
  }, [form.categoryInput, categorySelectionSlug, setForm]);

  useEffect(() => {
    if (!isCategoryModalOpen || categorySlugManuallyEdited) {
      return;
    }
    setCategoryForm((prev) => {
      const generated = slugifyCategoryName(prev.name);
      if (generated === prev.slug) {
        return prev;
      }
      return { ...prev, slug: generated };
    });
  }, [isCategoryModalOpen, categorySlugManuallyEdited, categoryForm.name]);

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
      categoryInput: product.category ?? '',
      ctaLead: product.cta_lead_url ?? '',
      ctaAffiliate: product.cta_affiliate_url ?? '',
      ctaStripe: product.cta_stripe_url ?? '',
      ctaPaypal: product.cta_paypal_url ?? '',
      ctaLeadLabel: product.cta_lead_label ?? '',
      ctaAffiliateLabel: product.cta_affiliate_label ?? '',
      ctaStripeLabel: product.cta_stripe_label ?? '',
      ctaPaypalLabel: product.cta_paypal_label ?? '',
      imageUrl: product.primary_image_url ?? '',
      lastUpdatedAt: product.last_tidb_update_at ?? null
    });
    setSelectedSlug(product.slug);
    setSlugInput(product.slug);
    lastLoadedSlugRef.current = product.slug;
    const normalizedCategory = product.category?.trim() ?? '';
    if (normalizedCategory) {
      setCategorySelectionSlug(normalizedCategory);
    } else {
      setCategorySelectionSlug(null);
    }
    setCategorySelection(null);
  }, []);

  const fetchProduct = useCallback(
    async (slug: string) => {
      setLoadStatus('loading');
      setLoadError(null);
      setSaveSuccess(null);
      setDescriptionSaveStatus('idle');
      setDescriptionSaveError(null);
      setDescriptionSaveSuccess(null);
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

  const clearCategoryDropdownTimeout = useCallback(() => {
    if (categoryDropdownTimeoutRef.current) {
      clearTimeout(categoryDropdownTimeoutRef.current);
      categoryDropdownTimeoutRef.current = null;
    }
  }, []);

  const scheduleCategoryDropdownClose = useCallback(() => {
    clearCategoryDropdownTimeout();
    categoryDropdownTimeoutRef.current = setTimeout(() => {
      setIsCategoryDropdownOpen(false);
    }, 120);
  }, [clearCategoryDropdownTimeout]);

  const handleCategoryInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, categoryInput: value }));
      if (categorySelectionSlug) {
        setCategorySelectionSlug(null);
      }
      setCategorySelection(null);
    },
    [categorySelectionSlug]
  );

  const handleCategoryInputFocus = useCallback(() => {
    clearCategoryDropdownTimeout();
    setIsCategoryDropdownOpen(true);
  }, [clearCategoryDropdownTimeout]);

  const handleCategoryInputBlur = useCallback(() => {
    scheduleCategoryDropdownClose();
  }, [scheduleCategoryDropdownClose]);

  const handleCategoryDropdownMouseEnter = useCallback(() => {
    clearCategoryDropdownTimeout();
  }, [clearCategoryDropdownTimeout]);

  const handleCategoryDropdownMouseLeave = useCallback(() => {
    scheduleCategoryDropdownClose();
  }, [scheduleCategoryDropdownClose]);

  const handleCategorySelect = useCallback(
    (option: CategoryOption) => {
      clearCategoryDropdownTimeout();
      setCategorySelection(option);
      setCategorySelectionSlug(option.slug);
      setForm((prev) => ({ ...prev, categoryInput: option.name }));
      setIsCategoryDropdownOpen(false);
    },
    [clearCategoryDropdownTimeout]
  );

  const handleOpenCategoryModal = useCallback(() => {
    const baseName = form.categoryInput.trim();
    const initialName = baseName.length > 0 ? baseName : '';
    const initialSlug = initialName ? slugifyCategoryName(initialName) : '';
    setCategoryForm({
      name: initialName,
      slug: initialSlug,
      shortDescription: '',
      longDescription: '',
      isPublished: true
    });
    setCategorySlugManuallyEdited(false);
    setCategoryModalStatus('idle');
    setCategoryModalError(null);
    setIsCategoryModalOpen(true);
  }, [form.categoryInput]);

  const handleCloseCategoryModal = useCallback(() => {
    setIsCategoryModalOpen(false);
    setCategoryModalStatus('idle');
    setCategoryModalError(null);
  }, []);

  useEffect(() => {
    if (!isCategoryModalOpen) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCloseCategoryModal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [isCategoryModalOpen, handleCloseCategoryModal]);

  const handleCategoryNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setCategoryForm((prev) => ({ ...prev, name: value }));
  }, []);

  const handleCategorySlugChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    setCategorySlugManuallyEdited(true);
    setCategoryForm((prev) => ({ ...prev, slug: normalized }));
  }, []);

  const handleCategoryShortChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCategoryForm((prev) => ({ ...prev, shortDescription: event.target.value }));
  }, []);

  const handleCategoryLongChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setCategoryForm((prev) => ({ ...prev, longDescription: event.target.value }));
  }, []);

  const handleCategoryPublishedChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCategoryForm((prev) => ({ ...prev, isPublished: event.target.checked }));
  }, []);

  const handleCreateCategory = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (categoryModalStatus === 'loading') {
        return;
      }

      const name = categoryForm.name.trim();
      const slug = categoryForm.slug.trim();
      const shortDescription = categoryForm.shortDescription.trim();
      const longDescription = categoryForm.longDescription.trim();

      if (name.length < 2 || name.length > 120) {
        setCategoryModalStatus('error');
        setCategoryModalError('El nombre debe tener entre 2 y 120 caracteres.');
        return;
      }

      if (!slug || slug.length > 80 || !CATEGORY_SLUG_PATTERN.test(slug)) {
        setCategoryModalStatus('error');
        setCategoryModalError('El slug debe usar letras minúsculas, números y guiones.');
        return;
      }

      if (shortDescription.length > 255) {
        setCategoryModalStatus('error');
        setCategoryModalError('La descripción corta supera el límite de 255 caracteres.');
        return;
      }

      if (longDescription.length > 4000) {
        setCategoryModalStatus('error');
        setCategoryModalError('La descripción larga supera el límite de 4000 caracteres.');
        return;
      }

      setCategoryModalStatus('loading');
      setCategoryModalError(null);

      try {
        const response = await fetch('/api/admin/categories', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'product',
            name,
            slug,
            short_description: shortDescription || undefined,
            long_description: longDescription || undefined,
            is_published: categoryForm.isPublished
          })
        });

        const rawBody = (await response.json()) as
          | { slug?: string; name?: string; is_published?: boolean; isPublished?: boolean }
          | { ok: false; message?: string; error_code?: string };

        if (!response.ok || ('ok' in rawBody && rawBody.ok === false)) {
          const message = 'message' in rawBody && rawBody.message ? rawBody.message : 'No se pudo crear la categoría.';
          throw new Error(message);
        }

        const body = rawBody as {
          slug?: string;
          name?: string;
          is_published?: boolean;
          isPublished?: boolean;
        };

        const created: CategoryOption = {
          slug: typeof body.slug === 'string' ? body.slug : slug,
          name: typeof body.name === 'string' ? body.name : name,
          isPublished: Boolean(
            typeof body.isPublished !== 'undefined' ? body.isPublished : body.is_published ?? true
          )
        };

        setCategoryModalStatus('success');
        setCategorySelection(created);
        setCategorySelectionSlug(created.slug);
        setForm((prev) => ({ ...prev, categoryInput: created.name }));
        setCategoryOptions((prev) => {
          const filtered = prev.filter((item) => item.slug !== created.slug);
          return [created, ...filtered].slice(0, 20);
        });
        setIsCategoryModalOpen(false);
        setTimeout(() => {
          categoryInputRef.current?.focus();
        }, 160);
      } catch (error) {
        setCategoryModalStatus('error');
        setCategoryModalError((error as Error)?.message ?? 'No se pudo crear la categoría.');
      }
    },
    [categoryForm, categoryModalStatus]
  );

  const trimmedCategoryInput = useMemo(() => form.categoryInput.trim(), [form.categoryInput]);

  const handleSave = useCallback(async (viewAfter = false) => {
    if (!selectedSlug) {
      setSaveError('Carga primero un producto para editarlo.');
      setSaveStatus('error');
      return;
    }

    const currentDescription = syncDescriptionFromEditor();
    const descriptionMetrics = measureHtmlContent(currentDescription);
    if (descriptionMetrics.characters > DESCRIPTION_MAX_LENGTH) {
      setSaveStatus('error');
      setSaveError(
        `La descripción supera el máximo de ${DESCRIPTION_MAX_LENGTH.toLocaleString()} caracteres permitidos. Reduce el contenido e inténtalo nuevamente.`
      );
      return;
    }

    setSaveStatus('loading');
    setSaveError(null);
    setSaveSuccess(null);
    setDescriptionSaveStatus('idle');
    setDescriptionSaveError(null);
    setDescriptionSaveSuccess(null);

    const shouldOpenPreview = viewAfter && typeof window !== 'undefined';
    let previewWindow: Window | null = null;
    if (shouldOpenPreview) {
      previewWindow = window.open('', '_blank');
    }

    const categoryValue = categorySelectionSlug ?? (trimmedCategoryInput ? trimmedCategoryInput : null);

    const payload = {
      slug: selectedSlug,
      title_h1: form.title,
      short_summary: form.summary,
      desc_html: currentDescription,
      price: form.price,
      category: categoryValue,
      cta_lead_url: form.ctaLead,
      cta_affiliate_url: form.ctaAffiliate,
      cta_stripe_url: form.ctaStripe,
      cta_paypal_url: form.ctaPaypal,
      cta_lead_label: form.ctaLeadLabel,
      cta_affiliate_label: form.ctaAffiliateLabel,
      cta_stripe_label: form.ctaStripeLabel,
      cta_paypal_label: form.ctaPaypalLabel,
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
        if (previewWindow) {
          previewWindow.close();
        }
        return;
      }
      const savedProduct = body.product;
      applyProduct(savedProduct);
      descriptionEditorRef.current?.clearDraft();
      setSaveStatus('success');
      setSaveSuccess(viewAfter ? 'Producto guardado. Abriendo vista previa…' : 'Producto guardado correctamente.');
      setDescriptionSaveStatus('idle');
      setDescriptionSaveError(null);
      setDescriptionSaveSuccess(null);
      if (shouldOpenPreview) {
        const slugToView = savedProduct?.slug ?? selectedSlug;
        if (slugToView) {
          const url = `/p/${encodeURIComponent(slugToView)}?v=${Date.now()}`;
          if (previewWindow) {
            previewWindow.location.href = url;
            previewWindow.focus();
          } else {
            window.open(url, '_blank');
          }
        } else if (previewWindow) {
          previewWindow.close();
        }
      }
    } catch (error) {
      setSaveStatus('error');
      setSaveError((error as Error)?.message ?? 'Error desconocido al guardar.');
      if (previewWindow) {
        previewWindow.close();
      }
    }
  }, [
    applyProduct,
    form,
    selectedSlug,
    syncDescriptionFromEditor,
    categorySelectionSlug,
    trimmedCategoryInput
  ]);

  const descriptionMetrics = useMemo(() => measureHtmlContent(form.description), [form.description]);
  const isDescriptionTooLong = descriptionMetrics.characters > DESCRIPTION_MAX_LENGTH;
  const hasUnmanagedCategory = useMemo(
    () => trimmedCategoryInput.length > 0 && !categorySelectionSlug,
    [trimmedCategoryInput, categorySelectionSlug]
  );
  const managedCategoryLabel = useMemo(() => {
    if (categorySelection) {
      return `${categorySelection.name} · ${categorySelection.slug}`;
    }
    if (categorySelectionSlug && trimmedCategoryInput === categorySelectionSlug) {
      return categorySelectionSlug;
    }
    return null;
  }, [categorySelection, categorySelectionSlug, trimmedCategoryInput]);

  const handleSaveDescription = useCallback(async (viewAfter = false) => {
    if (!selectedSlug) {
      setDescriptionSaveError('Carga primero un producto para editarlo.');
      setDescriptionSaveStatus('error');
      return;
    }

    const currentDescription = syncDescriptionFromEditor();
    const descriptionMetricsLocal = measureHtmlContent(currentDescription);
    if (descriptionMetricsLocal.characters > DESCRIPTION_MAX_LENGTH) {
      setDescriptionSaveStatus('error');
      setDescriptionSaveError(
        `La descripción supera el máximo de ${DESCRIPTION_MAX_LENGTH.toLocaleString()} caracteres permitidos. Reduce el contenido e inténtalo nuevamente.`
      );
      return;
    }

    setDescriptionSaveStatus('loading');
    setDescriptionSaveError(null);
    setDescriptionSaveSuccess(null);

    const shouldOpenPreview = viewAfter && typeof window !== 'undefined';
    let previewWindow: Window | null = null;
    if (shouldOpenPreview) {
      previewWindow = window.open('', '_blank');
    }

    const payload = {
      slug: selectedSlug,
      desc_html: currentDescription
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
        const message = body.message ?? 'No se pudo guardar la descripción.';
        setDescriptionSaveStatus('error');
        setDescriptionSaveError(message);
        if (previewWindow) {
          previewWindow.close();
        }
        return;
      }
      const savedProduct = body.product;
      applyProduct(savedProduct);
      descriptionEditorRef.current?.clearDraft();
      setDescriptionSaveStatus('success');
      setDescriptionSaveSuccess(
        viewAfter ? 'Descripción guardada. Abriendo vista previa…' : 'Descripción guardada correctamente.'
      );
      setSaveStatus('idle');
      setSaveError(null);
      setSaveSuccess(null);
      if (shouldOpenPreview) {
        const slugToView = savedProduct?.slug ?? selectedSlug;
        if (slugToView) {
          const url = `/p/${encodeURIComponent(slugToView)}?v=${Date.now()}`;
          if (previewWindow) {
            previewWindow.location.href = url;
            previewWindow.focus();
          } else {
            window.open(url, '_blank');
          }
        } else if (previewWindow) {
          previewWindow.close();
        }
      }
    } catch (error) {
      setDescriptionSaveStatus('error');
      setDescriptionSaveError((error as Error)?.message ?? 'Error desconocido al guardar la descripción.');
      if (previewWindow) {
        previewWindow.close();
      }
    }
  }, [applyProduct, selectedSlug, syncDescriptionFromEditor]);

  const activeCtas = useMemo(() => {
    return CTA_FIELDS.map((item) => {
      const url = form[item.urlField].trim();
      const labelValue = form[item.labelField].trim();
      return {
        key: item.key,
        url,
        label: resolveCtaLabel(item.key, labelValue)
      };
    }).filter((item) => item.url.length > 0);
  }, [form]);

  const titleCount = form.title.length;
  const summaryCount = form.summary.length;

  return (
    <section style={sectionStyle} aria-label="Product editor">
      {isCategoryModalOpen ? (
        <div
          style={modalOverlayStyle}
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget && categoryModalStatus !== 'loading') {
              handleCloseCategoryModal();
            }
          }}
        >
          <form style={modalCardStyle} onSubmit={handleCreateCategory}>
            <div style={modalHeaderStyle}>
              <h2 style={modalTitleStyle}>Nueva categoría de producto</h2>
              <p style={helperStyle}>Crea y publica una categoría sin salir del editor.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="new-category-name">
                  <span>Nombre</span>
                </label>
                <input
                  id="new-category-name"
                  style={inputStyle}
                  type="text"
                  value={categoryForm.name}
                  onChange={handleCategoryNameChange}
                  placeholder="Storage Bins"
                  minLength={2}
                  maxLength={120}
                  autoFocus
                  required
                />
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="new-category-slug">
                  <span>Slug</span>
                </label>
                <input
                  id="new-category-slug"
                  style={inputStyle}
                  type="text"
                  value={categoryForm.slug}
                  onChange={handleCategorySlugChange}
                  placeholder="storage-bins"
                  maxLength={80}
                  required
                />
                <p style={helperStyle}>Usa minúsculas, números y guiones.</p>
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="new-category-short">
                  <span>Descripción corta</span>
                  <span style={helperStyle}>{categoryForm.shortDescription.length}/255</span>
                </label>
                <input
                  id="new-category-short"
                  style={inputStyle}
                  type="text"
                  value={categoryForm.shortDescription}
                  onChange={handleCategoryShortChange}
                  placeholder="Resumen opcional"
                  maxLength={255}
                />
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="new-category-long">
                  <span>Descripción larga</span>
                  <span style={helperStyle}>{categoryForm.longDescription.length}/4000</span>
                </label>
                <textarea
                  id="new-category-long"
                  style={{ ...textareaStyle, minHeight: 140 }}
                  value={categoryForm.longDescription}
                  onChange={handleCategoryLongChange}
                  placeholder="Describe la categoría con más detalle (opcional)"
                  maxLength={4000}
                />
              </div>
              <label
                style={{
                  ...labelStyle,
                  justifyContent: 'flex-start',
                  gap: '0.5rem',
                  alignItems: 'center'
                }}
                htmlFor="new-category-published"
              >
                <input
                  id="new-category-published"
                  type="checkbox"
                  checked={categoryForm.isPublished}
                  onChange={handleCategoryPublishedChange}
                />
                <span>Publicar inmediatamente</span>
              </label>
              {categoryModalError ? <p style={errorStyle}>{categoryModalError}</p> : null}
            </div>
            <div style={modalActionsStyle}>
              <button
                type="button"
                style={buttonStyle}
                onClick={handleCloseCategoryModal}
                disabled={categoryModalStatus === 'loading'}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={categoryModalStatus === 'loading' ? disabledButtonStyle : buttonStyle}
                disabled={categoryModalStatus === 'loading'}
              >
                {categoryModalStatus === 'loading' ? 'Creando…' : 'Crear categoría'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                    <p style={helperStyle}>
                      Si lo dejas vacío se mostrará “{cta.title}”.
                    </p>
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
              <div style={{ flex: '1 1 260px', minWidth: 260 }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Long description (HTML)</h2>
                <p style={helperStyle}>
                  Usa el modo Visual para editar con formato o cambia a Código HTML para pegar contenido avanzado.
                </p>
              </div>
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: isDescriptionTooLong ? '#ef4444' : '#475569'
                }}
              >
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={labelStyle} htmlFor="product-category">
                <span>Categoría</span>
                {managedCategoryLabel ? (
                  <span style={categoryBadgeStyle}>
                    {managedCategoryLabel}
                    {categorySelection && !categorySelection.isPublished ? (
                      <span style={{ fontSize: '0.75rem', color: '#b45309' }}> · No publicada</span>
                    ) : null}
                  </span>
                ) : null}
              </label>
              <div style={categoryFieldContainerStyle}>
                <input
                  id="product-category"
                  ref={categoryInputRef}
                  type="text"
                  style={{ ...inputStyle, paddingRight: '2.5rem' }}
                  placeholder="Busca o escribe una categoría…"
                  value={form.categoryInput}
                  onChange={handleCategoryInputChange}
                  onFocus={handleCategoryInputFocus}
                  onBlur={handleCategoryInputBlur}
                  autoComplete="off"
                />
                {isCategoryDropdownOpen ? (
                  <div
                    style={categorySuggestionListStyle}
                    onMouseEnter={handleCategoryDropdownMouseEnter}
                    onMouseLeave={handleCategoryDropdownMouseLeave}
                  >
                    {categoryFetchStatus === 'loading' ? (
                      <div style={categorySuggestionItemStyle}>
                        <span style={{ fontSize: '0.85rem', color: '#475569' }}>Buscando categorías…</span>
                      </div>
                    ) : categoryFetchStatus === 'error' ? (
                      <div style={categorySuggestionItemStyle}>
                        <span style={{ fontSize: '0.85rem', color: '#ef4444' }}>
                          {categoryFetchError ?? 'No se pudieron cargar las categorías.'}
                        </span>
                      </div>
                    ) : categoryOptions.length > 0 ? (
                      categoryOptions.map((option) => {
                        const isActive = option.slug === categorySelectionSlug;
                        return (
                          <div
                            key={option.slug}
                            role="button"
                            tabIndex={-1}
                            style={isActive ? categorySuggestionActiveStyle : categorySuggestionItemStyle}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleCategorySelect(option);
                            }}
                          >
                            <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{option.name}</strong>
                            <span style={{ fontSize: '0.8rem', color: '#475569' }}>{option.slug}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div style={categorySuggestionItemStyle}>
                        <span style={{ fontSize: '0.85rem', color: '#475569' }}>No se encontraron categorías.</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap' as const
                }}
              >
                <button type="button" style={buttonStyle} onClick={handleOpenCategoryModal}>
                  + Nueva categoría
                </button>
                {categoryFetchStatus === 'loading' && !isCategoryDropdownOpen ? (
                  <p style={helperStyle}>Buscando categorías…</p>
                ) : null}
                {categoryFetchStatus === 'error' && categoryFetchError ? (
                  <p style={errorStyle}>{categoryFetchError}</p>
                ) : null}
              </div>
              {hasUnmanagedCategory ? (
                <p style={warningStyle}>
                  Esta categoría no está gestionada; no aparecerá en el catálogo hasta crearla y publicarla en Categories.
                </p>
              ) : null}
            </div>
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
              {descriptionSaveStatus === 'success' && descriptionSaveSuccess ? (
                <p style={successStyle}>{descriptionSaveSuccess}</p>
              ) : null}
            </div>
            <p style={helperStyle}>
              El contenido se guarda en TiDB como HTML limpio. El editor incluye tablas, listas, enlaces, imágenes y carga automática.
            </p>
            {isDescriptionTooLong ? (
              <p style={errorStyle}>
                La descripción supera el máximo recomendado. Reduce el contenido antes de guardar.
              </p>
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

