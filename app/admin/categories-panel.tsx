'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { slugifyCategoryName } from '@/lib/category-slug';

interface AdminCategory {
  id: string;
  type: 'product' | 'blog';
  name: string;
  slug: string;
  short_description: string | null;
  long_description: string | null;
  hero_image_url: string | null;
  is_published: boolean;
  products_count: number;
  updated_at: string | null;
}

type CategoryType = 'product' | 'blog';

type FormMode = 'create' | 'edit';

type DeleteMode = 'block' | 'reassign' | 'detach';

interface FormState {
  mode: FormMode;
  type: CategoryType;
  fields: {
    name: string;
    slug: string;
    shortDescription: string;
    longDescription: string;
    heroImageUrl: string;
    isPublished: boolean;
  };
  slugTouched: boolean;
  originalSlug?: string;
}

interface DeleteDialogState {
  category: AdminCategory;
  mode: DeleteMode;
  targetSlug: string;
  busy: boolean;
  error: string | null;
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  padding: '2rem'
};

const tabsContainerStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem'
};

const tabStyle: CSSProperties = {
  padding: '0.4rem 0.8rem',
  borderRadius: 999,
  border: '1px solid #cbd5f5',
  background: '#fff',
  color: '#0f172a',
  cursor: 'pointer',
  fontWeight: 600
};

const activeTabStyle: CSSProperties = {
  ...tabStyle,
  background: '#0f172a',
  color: '#fff'
};

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '1rem'
};

const newButtonStyle: CSSProperties = {
  padding: '0.6rem 1.2rem',
  borderRadius: 8,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer'
};

const refreshButtonStyle: CSSProperties = {
  padding: '0.5rem 0.9rem',
  borderRadius: 8,
  border: '1px solid #cbd5f5',
  background: '#fff',
  cursor: 'pointer'
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.95rem'
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #e2e8f0',
  padding: '0.75rem 0.5rem',
  color: '#475569',
  fontSize: '0.8rem',
  letterSpacing: '0.03em',
  textTransform: 'uppercase'
};

const tdStyle: CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
  padding: '0.75rem 0.5rem',
  verticalAlign: 'top'
};

const actionButtonStyle: CSSProperties = {
  padding: '0.25rem 0.5rem',
  borderRadius: 6,
  border: '1px solid #cbd5f5',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '0.8rem'
};

const dangerButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  borderColor: '#fecaca',
  color: '#dc2626'
};

const formCardStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '1.5rem',
  background: '#f8fafc',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const fieldGroupStyle: CSSProperties = {
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
  padding: '0.5rem 0.6rem',
  borderRadius: 8,
  border: '1px solid #cbd5f5',
  fontSize: '0.95rem'
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: '120px'
};

const formActionsStyle: CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap'
};

const submitButtonStyle: CSSProperties = {
  padding: '0.6rem 1.2rem',
  borderRadius: 8,
  border: 'none',
  background: '#0f172a',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer'
};

const cancelButtonStyle: CSSProperties = {
  padding: '0.6rem 1.2rem',
  borderRadius: 8,
  border: '1px solid #cbd5f5',
  background: '#fff',
  cursor: 'pointer'
};

const feedbackStyle: CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: 8,
  fontSize: '0.9rem'
};

const errorStyle: CSSProperties = {
  ...feedbackStyle,
  background: '#fee2e2',
  color: '#991b1b',
  border: '1px solid #fecaca'
};

const successStyle: CSSProperties = {
  ...feedbackStyle,
  background: '#dcfce7',
  color: '#166534',
  border: '1px solid #bbf7d0'
};

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50
};

const dialogStyle: CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '2rem',
  width: 'min(480px, 90vw)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem'
};

const dialogActionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  flexWrap: 'wrap'
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function createEmptyForm(type: CategoryType): FormState {
  return {
    mode: 'create',
    type,
    fields: {
      name: '',
      slug: '',
      shortDescription: '',
      longDescription: '',
      heroImageUrl: '',
      isPublished: true
    },
    slugTouched: false
  };
}

function mapCategoryToForm(category: AdminCategory): FormState {
  return {
    mode: 'edit',
    type: category.type,
    fields: {
      name: category.name,
      slug: category.slug,
      shortDescription: category.short_description ?? '',
      longDescription: category.long_description ?? '',
      heroImageUrl: category.hero_image_url ?? '',
      isPublished: category.is_published
    },
    slugTouched: true,
    originalSlug: category.slug
  };
}

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const message = await res
      .json()
      .catch(() => ({ message: res.statusText })) as { message?: string };
    throw new Error(message.message || 'Request failed');
  }
  return (await res.json()) as T;
}

export default function CategoriesPanel(): JSX.Element {
  const [activeType, setActiveType] = useState<CategoryType>('product');
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);

  const loadCategories = useCallback(async (type: CategoryType) => {
    setLoading(true);
    setError(null);
    try {
      const data = await jsonFetch<{
        ok: boolean;
        categories: AdminCategory[];
      }>(`/api/admin/categories?type=${type}&limit=100`);
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch (err) {
      setError((err as Error).message || 'Unable to load categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories(activeType);
  }, [activeType, loadCategories]);

  const startCreate = useCallback(() => {
    setFeedback(null);
    setFormState(createEmptyForm(activeType));
  }, [activeType]);

  const startEdit = useCallback((category: AdminCategory) => {
    setFeedback(null);
    setFormState(mapCategoryToForm(category));
  }, []);

  const cancelForm = useCallback(() => {
    setFormState(null);
    setSubmitting(false);
  }, []);

  const handleTypeChange = useCallback((type: CategoryType) => {
    setActiveType(type);
    setFormState(null);
    setFeedback(null);
  }, []);

  const handleFieldChange = useCallback(
    (field: keyof FormState['fields'], value: string | boolean) => {
      setFormState((prev) => {
        if (!prev) return prev;
        const updated: FormState = {
          ...prev,
          fields: {
            ...prev.fields,
            [field]: value
          }
        };
        if (field === 'name' && prev.mode === 'create' && !prev.slugTouched) {
          updated.fields.slug = slugifyCategoryName(String(value));
        }
        return updated;
      });
    },
    []
  );

  const handleSlugChange = useCallback((value: string) => {
    setFormState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        slugTouched: true,
        fields: {
          ...prev.fields,
          slug: value.toLowerCase()
        }
      };
    });
  }, []);

  const submitForm = useCallback(async () => {
    if (!formState) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const payload = {
        type: formState.type,
        name: formState.fields.name.trim(),
        slug: formState.fields.slug.trim(),
        short_description: formState.fields.shortDescription.trim() || null,
        long_description: formState.fields.longDescription.trim() || null,
        hero_image_url: formState.fields.heroImageUrl.trim() || null,
        is_published: formState.fields.isPublished
      };

      if (formState.mode === 'create') {
        const response = await jsonFetch<{ ok: true; category: AdminCategory }>(
          '/api/admin/categories',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        setFeedback({ type: 'success', message: 'Category created successfully.' });
        setCategories((prev) => [response.category, ...prev]);
      } else if (formState.originalSlug) {
        const response = await jsonFetch<{ ok: true; category: AdminCategory }>(
          `/api/admin/categories/${formState.originalSlug}?type=${formState.type}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: payload.name,
              short_description: payload.short_description,
              long_description: payload.long_description,
              hero_image_url: payload.hero_image_url,
              is_published: payload.is_published
            })
          }
        );
        setFeedback({ type: 'success', message: 'Category updated successfully.' });
        setCategories((prev) =>
          prev.map((item) => (item.slug === formState.originalSlug ? response.category : item))
        );
      }
      setFormState(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'Unable to save category'
      });
    } finally {
      setSubmitting(false);
    }
  }, [formState]);

  const togglePublish = useCallback(
    async (category: AdminCategory) => {
      setFeedback(null);
      try {
        const response = await jsonFetch<{ ok: true; category: AdminCategory }>(
          `/api/admin/categories/${category.slug}?type=${category.type}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_published: !category.is_published })
          }
        );
        setCategories((prev) =>
          prev.map((item) => (item.slug === category.slug ? response.category : item))
        );
        setFeedback({
          type: 'success',
          message: !category.is_published ? 'Category published.' : 'Category unpublished.'
        });
      } catch (err) {
        setFeedback({
          type: 'error',
          message: (err as Error).message || 'Unable to update publication status'
        });
      }
    },
    []
  );

  const openDeleteDialog = useCallback((category: AdminCategory) => {
    setDeleteDialog({
      category,
      mode: category.products_count > 0 ? 'reassign' : 'block',
      targetSlug: '',
      busy: false,
      error: null
    });
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialog(null);
  }, []);

  const deleteTargets = useMemo(() => {
    if (!deleteDialog) return [];
    return categories.filter(
      (item) => item.slug !== deleteDialog.category.slug && item.type === deleteDialog.category.type
    );
  }, [categories, deleteDialog]);

  const confirmDelete = useCallback(async () => {
    if (!deleteDialog) return;
    const { category, mode, targetSlug } = deleteDialog;
    setDeleteDialog((prev) => (prev ? { ...prev, busy: true, error: null } : prev));
    try {
      const search = new URLSearchParams({ type: category.type, mode });
      if (mode === 'reassign') {
        if (!targetSlug) {
          throw new Error('Select a destination category to reassign.');
        }
        search.set('to', targetSlug);
      }
      await jsonFetch<{ ok: true }>(`/api/admin/categories/${category.slug}?${search.toString()}`, {
        method: 'DELETE'
      });
      setCategories((prev) => prev.filter((item) => item.slug !== category.slug));
      setFeedback({ type: 'success', message: 'Category deleted successfully.' });
      setDeleteDialog(null);
    } catch (err) {
      setDeleteDialog((prev) => (prev ? { ...prev, busy: false, error: (err as Error).message } : prev));
    }
  }, [deleteDialog]);

  return (
    <section style={panelStyle}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.75rem', color: '#0f172a' }}>Categories</h2>
        <p style={{ margin: 0, color: '#475569' }}>
          Manage product and blog categories, including publication state, descriptions, and hero images.
        </p>
      </header>

      <div style={tabsContainerStyle}>
        {(['product', 'blog'] as CategoryType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => handleTypeChange(type)}
            style={type === activeType ? activeTabStyle : tabStyle}
          >
            {type === 'product' ? 'Product Categories' : 'Blog Categories'}
          </button>
        ))}
      </div>

      <div style={actionsRowStyle}>
        <div>
          <button type="button" style={refreshButtonStyle} onClick={() => void loadCategories(activeType)}>
            Refresh
          </button>
        </div>
        <button type="button" style={newButtonStyle} onClick={startCreate}>
          New Category
        </button>
      </div>

      {feedback && (
        <div style={feedback.type === 'error' ? errorStyle : successStyle}>{feedback.message}</div>
      )}
      {error && <div style={errorStyle}>{error}</div>}

      {formState && (
        <div style={formCardStyle}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
            {formState.mode === 'create' ? 'New Category' : 'Edit Category'}
          </h3>
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="category-name">
              Name
            </label>
            <input
              id="category-name"
              style={inputStyle}
              value={formState.fields.name}
              onChange={(event) => handleFieldChange('name', event.target.value)}
              placeholder="Category name"
            />
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="category-slug">
              Slug
            </label>
            <input
              id="category-slug"
              style={inputStyle}
              value={formState.fields.slug}
              onChange={(event) => handleSlugChange(event.target.value)}
              disabled={formState.mode === 'edit'}
              placeholder="category-slug"
            />
            <small style={{ color: '#64748b' }}>
              Lowercase letters, numbers and hyphens only. Autogenerated from the name for new categories.
            </small>
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="category-short">
              Short description
            </label>
            <textarea
              id="category-short"
              style={textareaStyle}
              maxLength={255}
              value={formState.fields.shortDescription}
              onChange={(event) => handleFieldChange('shortDescription', event.target.value)}
            />
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="category-long">
              Long description
            </label>
            <textarea
              id="category-long"
              style={textareaStyle}
              value={formState.fields.longDescription}
              onChange={(event) => handleFieldChange('longDescription', event.target.value)}
            />
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle} htmlFor="category-hero">
              Hero image URL
            </label>
            <input
              id="category-hero"
              style={inputStyle}
              value={formState.fields.heroImageUrl}
              onChange={(event) => handleFieldChange('heroImageUrl', event.target.value)}
              placeholder="https://..."
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a' }}>
            <input
              type="checkbox"
              checked={formState.fields.isPublished}
              onChange={(event) => handleFieldChange('isPublished', event.target.checked)}
            />
            Published
          </label>
          <div style={formActionsStyle}>
            <button
              type="button"
              style={submitButtonStyle}
              onClick={submitForm}
              disabled={submitting}
            >
              {formState.mode === 'create' ? 'Create Category' : 'Save Changes'}
            </button>
            <button type="button" style={cancelButtonStyle} onClick={cancelForm} disabled={submitting}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Slug</th>
              <th style={thStyle}>Published</th>
              <th style={thStyle}>{activeType === 'product' ? 'Products' : 'Posts'}</th>
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
            ) : categories.length === 0 ? (
              <tr>
                <td style={{ ...tdStyle, textAlign: 'center' }} colSpan={6}>
                  No categories found.
                </td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr key={category.id}>
                  <td style={tdStyle}>
                    <strong style={{ display: 'block', color: '#0f172a' }}>{category.name}</strong>
                    {category.short_description ? (
                      <span style={{ display: 'block', color: '#64748b', fontSize: '0.85rem' }}>
                        {category.short_description}
                      </span>
                    ) : null}
                  </td>
                  <td style={tdStyle}>/{category.slug}</td>
                  <td style={tdStyle}>{category.is_published ? 'Yes' : 'No'}</td>
                  <td style={tdStyle}>{category.products_count}</td>
                  <td style={tdStyle}>{formatDate(category.updated_at)}</td>
                  <td style={{ ...tdStyle, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" style={actionButtonStyle} onClick={() => startEdit(category)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      style={actionButtonStyle}
                      onClick={() => togglePublish(category)}
                    >
                      {category.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      style={dangerButtonStyle}
                      onClick={() => openDeleteDialog(category)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteDialog && (
        <div style={overlayStyle}>
          <div style={dialogStyle}>
            <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Delete category</h3>
            <p style={{ margin: 0, color: '#475569' }}>
              {deleteDialog.category.products_count > 0
                ? 'This category is assigned to published content. Choose how to handle the existing items.'
                : 'This category has no attached content. Are you sure you want to delete it?'}
            </p>
            {deleteDialog.category.products_count > 0 && (
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="delete-mode">
                  Action
                </label>
                <select
                  id="delete-mode"
                  style={inputStyle}
                  value={deleteDialog.mode}
                  onChange={(event) =>
                    setDeleteDialog((prev) =>
                      prev ? { ...prev, mode: event.target.value as DeleteMode } : prev
                    )
                  }
                >
                  <option value="reassign">Reassign to another category</option>
                  <option value="detach">Detach from products/posts</option>
                  <option value="block">Cancel deletion</option>
                </select>
              </div>
            )}
            {deleteDialog.mode === 'reassign' && deleteDialog.category.products_count > 0 && (
              <div style={fieldGroupStyle}>
                <label style={labelStyle} htmlFor="reassign-target">
                  Destination category
                </label>
                <select
                  id="reassign-target"
                  style={inputStyle}
                  value={deleteDialog.targetSlug}
                  onChange={(event) =>
                    setDeleteDialog((prev) =>
                      prev ? { ...prev, targetSlug: event.target.value } : prev
                    )
                  }
                >
                  <option value="">Select category</option>
                  {deleteTargets.map((target) => (
                    <option key={target.slug} value={target.slug}>
                      {target.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {deleteDialog.error && <div style={errorStyle}>{deleteDialog.error}</div>}
            <div style={dialogActionsStyle}>
              <button
                type="button"
                style={cancelButtonStyle}
                onClick={closeDeleteDialog}
                disabled={deleteDialog.busy}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{ ...dangerButtonStyle, padding: '0.6rem 1.2rem' }}
                onClick={confirmDelete}
                disabled={deleteDialog.busy}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
