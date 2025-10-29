'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CATEGORY_SLUG_REGEX, slugifyCategoryName } from '@/lib/category-slug';

type CategoryType = 'product' | 'blog';

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

type AdminCategory = {
  id: string;
  type: CategoryType;
  name: string;
  slug: string;
  short_description: string | null;
  long_description: string | null;
  is_published: boolean;
  updated_at: string | null;
};

interface CategoriesPanelProps {
  initialType?: CategoryType;
}

type ModalMode = 'create' | 'edit';

type FormFields = {
  type: CategoryType;
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  isPublished: boolean;
};

type ModalState = {
  mode: ModalMode;
  form: FormFields;
  slugDirty: boolean;
  originalSlug?: string;
  originalType?: CategoryType;
};

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e2e8f0',
  padding: '2rem'
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem'
};

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const controlsGroupStyle: CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap',
  alignItems: 'center'
};

const filterSelectStyle: CSSProperties = {
  padding: '0.45rem 0.75rem',
  borderRadius: 8,
  border: '1px solid #cbd5f5',
  background: '#fff'
};

const buttonStyle: CSSProperties = {
  padding: '0.55rem 1.1rem',
  borderRadius: 8,
  border: '1px solid #cbd5f5',
  background: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
  color: '#0f172a'
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: 'none',
  background: '#2563eb',
  color: '#fff'
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: '#fecaca',
  color: '#dc2626'
};

const tableWrapperStyle: CSSProperties = {
  width: '100%',
  overflowX: 'auto'
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 720
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '0.75rem 0.5rem',
  borderBottom: '1px solid #e2e8f0',
  fontSize: '0.8rem',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#475569'
};

const tdStyle: CSSProperties = {
  padding: '0.75rem 0.5rem',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'top',
  fontSize: '0.95rem',
  color: '#0f172a'
};

const feedbackStyle: CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: 10,
  fontSize: '0.95rem'
};

const errorStyle: CSSProperties = {
  ...feedbackStyle,
  border: '1px solid #fecaca',
  background: '#fee2e2',
  color: '#991b1b'
};

const successStyle: CSSProperties = {
  ...feedbackStyle,
  border: '1px solid #bbf7d0',
  background: '#dcfce7',
  color: '#166534'
};

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  padding: '1rem'
};

const modalStyle: CSSProperties = {
  width: 'min(540px, 100%)',
  background: '#fff',
  borderRadius: 16,
  padding: '2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const modalFieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem'
};

const labelStyle: CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#1e293b'
};

const inputStyle: CSSProperties = {
  padding: '0.55rem 0.65rem',
  borderRadius: 8,
  border: '1px solid #cbd5f5',
  fontSize: '0.95rem'
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: '120px'
};

const modalActionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  flexWrap: 'wrap'
};

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString().slice(0, 10);
}

function sortCategories(list: AdminCategory[]): AdminCategory[] {
  return [...list].sort((a, b) => {
    const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (aTime === bTime) {
      return a.name.localeCompare(b.name);
    }
    return bTime - aTime;
  });
}

function parseResponseCategories(value: unknown): AdminCategory[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value as AdminCategory[];
  }
  const record = value as { categories?: unknown };
  if (Array.isArray(record.categories)) {
    return record.categories as AdminCategory[];
  }
  return [];
}

export default function CategoriesPanel({ initialType }: CategoriesPanelProps): JSX.Element {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState<'all' | CategoryType>(initialType ?? 'all');

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productRes, blogRes] = await Promise.all([
        fetch('/api/admin/categories?type=product&limit=100', { cache: 'no-store' }),
        fetch('/api/admin/categories?type=blog&limit=100', { cache: 'no-store' })
      ]);

      if (!productRes.ok) {
        const message = await productRes.text();
        throw new Error(message || 'Unable to load product categories');
      }
      if (!blogRes.ok) {
        const message = await blogRes.text();
        throw new Error(message || 'Unable to load blog categories');
      }

      const [productPayload, blogPayload] = await Promise.all([productRes.json(), blogRes.json()]);
      const productCategories = parseResponseCategories(productPayload);
      const blogCategories = parseResponseCategories(blogPayload);
      setCategories(sortCategories([...productCategories, ...blogCategories]));
    } catch (err) {
      setError((err as Error)?.message || 'Unable to load categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (!initialType) {
      setFilterType('all');
    } else {
      setFilterType(initialType);
    }
  }, [initialType]);

  const visibleCategories = useMemo(() => {
    if (filterType === 'all') {
      return categories;
    }
    return categories.filter((category) => category.type === filterType);
  }, [categories, filterType]);

  const openCreateModal = useCallback(() => {
    setFeedback(null);
    setFormError(null);
    setModalState({
      mode: 'create',
      form: {
        type: initialType ?? 'product',
        name: '',
        slug: '',
        shortDescription: '',
        longDescription: '',
        isPublished: true
      },
      slugDirty: false
    });
  }, [initialType]);

  const openEditModal = useCallback((category: AdminCategory) => {
    setFeedback(null);
    setFormError(null);
    setModalState({
      mode: 'edit',
      form: {
        type: category.type,
        name: category.name,
        slug: category.slug,
        shortDescription: category.short_description ?? '',
        longDescription: category.long_description ?? '',
        isPublished: category.is_published
      },
      slugDirty: true,
      originalSlug: category.slug,
      originalType: category.type
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalState(null);
    setFormError(null);
    setSubmitting(false);
  }, []);

  const updateModalState = useCallback(
    (updater: (state: ModalState) => ModalState) => {
      setModalState((prev) => {
        if (!prev) {
          return prev;
        }
        return updater(prev);
      });
    },
    []
  );

  const handleNameChange = useCallback(
    (value: string) => {
      updateModalState((state) => {
        const next = { ...state, form: { ...state.form, name: value } };
        if (state.mode === 'create' && !state.slugDirty) {
          next.form.slug = slugifyCategoryName(value);
        }
        return next;
      });
      setFormError(null);
    },
    [updateModalState]
  );

  const handleSlugChange = useCallback(
    (value: string) => {
      updateModalState((state) => ({
        ...state,
        slugDirty: true,
        form: { ...state.form, slug: slugifyCategoryName(value) }
      }));
      setFormError(null);
    },
    [updateModalState]
  );

  const handleShortDescriptionChange = useCallback(
    (value: string) => {
      updateModalState((state) => ({
        ...state,
        form: { ...state.form, shortDescription: value }
      }));
      setFormError(null);
    },
    [updateModalState]
  );

  const handleLongDescriptionChange = useCallback(
    (value: string) => {
      updateModalState((state) => ({
        ...state,
        form: { ...state.form, longDescription: value }
      }));
      setFormError(null);
    },
    [updateModalState]
  );

  const handleTypeChange = useCallback(
    (value: CategoryType) => {
      updateModalState((state) => ({
        ...state,
        form: { ...state.form, type: value }
      }));
      setFormError(null);
    },
    [updateModalState]
  );

  const handlePublishedChange = useCallback(
    (value: boolean) => {
      updateModalState((state) => ({
        ...state,
        form: { ...state.form, isPublished: value }
      }));
      setFormError(null);
    },
    [updateModalState]
  );

  const submitModal = useCallback(async () => {
    if (!modalState) {
      return;
    }

    const { mode, form, originalSlug, originalType } = modalState;
    const trimmedName = form.name.trim();
    const trimmedSlug = form.slug.trim();
    const trimmedShort = form.shortDescription.trim();
    const trimmedLong = form.longDescription.trim();

    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }
    if (!trimmedSlug) {
      setFormError('Slug is required.');
      return;
    }
    if (!CATEGORY_SLUG_REGEX.test(trimmedSlug)) {
      setFormError('Slug must contain lowercase letters, numbers, or hyphens.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      type: form.type,
      name: trimmedName,
      short_description: trimmedShort || null,
      long_description: trimmedLong || null,
      is_published: form.isPublished
    };

    try {
      let successMessage = 'Category saved.';
      if (mode === 'create') {
        const response = await fetch('/api/admin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, slug: trimmedSlug })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data || typeof data !== 'object' || !data.ok) {
          const message = (data as { message?: string; error_code?: string }).message;
          if ((data as { error_code?: string }).error_code === 'duplicate_slug') {
            throw new Error('Slug already exists for this category type.');
          }
          throw new Error(message || 'Unable to create category.');
        }
        successMessage = 'Category created successfully.';
      } else {
        if (!originalSlug) {
          throw new Error('Missing category identifier.');
        }
        const queryType = originalType ?? form.type;
        const response = await fetch(
          `/api/admin/categories/${encodeURIComponent(originalSlug)}?type=${queryType}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data || typeof data !== 'object' || !data.ok) {
          const message = (data as { message?: string; error_code?: string }).message;
          if ((data as { error_code?: string }).error_code === 'duplicate_slug') {
            throw new Error('Slug already exists for this category type.');
          }
          throw new Error(message || 'Unable to update category.');
        }
        successMessage = 'Category updated successfully.';
      }

      await loadCategories();
      closeModal();
      setFeedback({ type: 'success', message: successMessage });
    } catch (error) {
      setFormError((error as Error)?.message || 'Unable to save category.');
    } finally {
      setSubmitting(false);
    }
  }, [closeModal, loadCategories, modalState]);

  const handleDelete = useCallback(
    async (category: AdminCategory) => {
      const confirmed = window.confirm(
        'Are you sure you want to delete this category?\nProducts will remain but without category.'
      );
      if (!confirmed) {
        return;
      }
      setFeedback(null);
      try {
        const response = await fetch(
          `/api/admin/categories/${encodeURIComponent(category.slug)}?type=${category.type}&mode=detach`,
          { method: 'DELETE' }
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = (data as { message?: string }).message;
          throw new Error(message || 'Unable to delete category.');
        }
        setCategories((prev) => prev.filter((item) => item.slug !== category.slug || item.type !== category.type));
        setFeedback({ type: 'success', message: 'Category deleted successfully.' });
      } catch (error) {
        setFeedback({ type: 'error', message: (error as Error)?.message || 'Unable to delete category.' });
      }
    },
    []
  );

  return (
    <section style={panelStyle}>
      <header style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: '1.75rem', color: '#0f172a' }}>Categories</h2>
        <p style={{ margin: 0, color: '#475569' }}>
          Manage product and blog categories, including publication state and descriptions.
        </p>
      </header>

      <div style={actionsRowStyle}>
        <div style={controlsGroupStyle}>
          <label htmlFor="admin-category-filter" style={{ fontWeight: 600, color: '#475569' }}>
            Filter by type
          </label>
          <select
            id="admin-category-filter"
            value={filterType}
            onChange={(event) => setFilterType(event.target.value as 'all' | CategoryType)}
            style={filterSelectStyle}
          >
            <option value="all">All</option>
            <option value="product">Product</option>
            <option value="blog">Blog</option>
          </select>
          <button type="button" style={buttonStyle} onClick={() => void loadCategories()}>
            Refresh
          </button>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={openCreateModal}>
          + New Category
        </button>
      </div>

      {feedback ? <div style={feedback.type === 'error' ? errorStyle : successStyle}>{feedback.message}</div> : null}
      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Slug</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Published</th>
              <th style={thStyle}>Updated</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td style={{ ...tdStyle, textAlign: 'center' }} colSpan={6}>
                  Loading categories…
                </td>
              </tr>
            ) : visibleCategories.length === 0 ? (
              <tr>
                <td style={{ ...tdStyle, textAlign: 'center' }} colSpan={6}>
                  No categories found.
                </td>
              </tr>
            ) : (
              visibleCategories.map((category) => (
                <tr key={`${category.type}-${category.id}`}>
                  <td style={tdStyle}>
                    <strong style={{ display: 'block' }}>{category.name}</strong>
                    {category.short_description ? (
                      <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b' }}>
                        {category.short_description}
                      </span>
                    ) : null}
                  </td>
                  <td style={tdStyle}>{category.slug}</td>
                  <td style={tdStyle}>{category.type === 'product' ? 'Product' : 'Blog'}</td>
                  <td style={tdStyle}>{category.is_published ? '✅' : '❌'}</td>
                  <td style={tdStyle}>{formatDate(category.updated_at)}</td>
                  <td style={{ ...tdStyle, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" style={buttonStyle} onClick={() => openEditModal(category)}>
                      Edit
                    </button>
                    <button type="button" style={dangerButtonStyle} onClick={() => void handleDelete(category)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalState ? (
        <div style={overlayStyle}>
          <div style={modalStyle} role="dialog" aria-modal="true">
            <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>
              {modalState.mode === 'create' ? 'New Category' : 'Edit Category'}
            </h3>

            <div style={modalFieldStyle}>
              <label style={labelStyle} htmlFor="modal-category-type">
                Type
              </label>
              <select
                id="modal-category-type"
                style={inputStyle}
                value={modalState.form.type}
                onChange={(event) => handleTypeChange(event.target.value as CategoryType)}
                disabled={submitting}
              >
                <option value="product">Product</option>
                <option value="blog">Blog</option>
              </select>
            </div>

            <div style={modalFieldStyle}>
              <label style={labelStyle} htmlFor="modal-category-name">
                Name
              </label>
              <input
                id="modal-category-name"
                style={inputStyle}
                value={modalState.form.name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Category name"
                disabled={submitting}
              />
            </div>

            <div style={modalFieldStyle}>
              <label style={labelStyle} htmlFor="modal-category-slug">
                Slug
              </label>
              <input
                id="modal-category-slug"
                style={inputStyle}
                value={modalState.form.slug}
                onChange={(event) => handleSlugChange(event.target.value)}
                placeholder="category-slug"
                disabled={modalState.mode === 'edit' || submitting}
              />
              <small style={{ color: '#64748b' }}>
                Lowercase letters, numbers, and hyphens only.
              </small>
            </div>

            <div style={modalFieldStyle}>
              <label style={labelStyle} htmlFor="modal-category-short">
                Short description
              </label>
              <input
                id="modal-category-short"
                style={inputStyle}
                value={modalState.form.shortDescription}
                onChange={(event) => handleShortDescriptionChange(event.target.value)}
                placeholder="Optional short description"
                maxLength={255}
                disabled={submitting}
              />
            </div>

            <div style={modalFieldStyle}>
              <label style={labelStyle} htmlFor="modal-category-long">
                Long description
              </label>
              <textarea
                id="modal-category-long"
                style={textareaStyle}
                value={modalState.form.longDescription}
                onChange={(event) => handleLongDescriptionChange(event.target.value)}
                placeholder="Optional long description"
                disabled={submitting}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a' }}>
              <input
                type="checkbox"
                checked={modalState.form.isPublished}
                onChange={(event) => handlePublishedChange(event.target.checked)}
                disabled={submitting}
              />
              Published
            </label>

            {formError ? <div style={errorStyle}>{formError}</div> : null}

            <div style={modalActionsStyle}>
              <button type="button" style={buttonStyle} onClick={closeModal} disabled={submitting}>
                Cancel
              </button>
              <button type="button" style={primaryButtonStyle} onClick={() => void submitModal()} disabled={submitting}>
                {modalState.mode === 'create' ? 'Create Category' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
