'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Tree, type NodeRendererProps, type TreeItem } from 'react-arborist';
import type { CategoryProductSummary } from '@/lib/categories';
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
  products_count: number;
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

type CategoryProductsResponse =
  | {
      ok: true;
      products: CategoryProductSummary[];
      totalCount: number;
      limit: number;
      offset: number;
    }
  | { ok: false; error_code: string; message?: string };

type CategoryTreeNodeData =
  | { kind: 'root'; type: CategoryType; label: string }
  | { kind: 'category'; type: CategoryType; label: string; category: AdminCategory };

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

const searchInputStyle: CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  border: '1px solid #cbd5f5',
  minWidth: '220px'
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

const contentLayoutStyle: CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  flexWrap: 'wrap'
};

const treePanelStyle: CSSProperties = {
  flex: '1 1 280px',
  minWidth: '260px',
  maxWidth: '360px',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '1rem',
  background: '#f8fafc',
  maxHeight: '540px',
  overflowY: 'auto'
};

const detailsPanelStyle: CSSProperties = {
  flex: '2 1 420px',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '1.25rem',
  minHeight: '360px'
};

const treeNodeBaseStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  marginBottom: '0.25rem',
  transition: 'background 0.2s ease'
};

const productsHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.5rem'
};

const productsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '1rem',
  marginTop: '1rem'
};

const productCardStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '0.75rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  background: '#fff',
  minHeight: '200px'
};

const productImageWrapperStyle: CSSProperties = {
  width: '100%',
  paddingTop: '56.25%',
  position: 'relative',
  borderRadius: 8,
  overflow: 'hidden',
  background: '#f1f5f9'
};

const productImageStyle: CSSProperties = {
  position: 'absolute' as const,
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover'
};

const productEmptyStateStyle: CSSProperties = {
  border: '1px dashed #cbd5f5',
  borderRadius: 12,
  padding: '1.5rem',
  textAlign: 'center',
  color: '#64748b'
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

function getRootNodeId(type: CategoryType): string {
  return `root:${type}`;
}

function getCategoryNodeId(type: CategoryType, slug: string): string {
  return `category:${type}:${slug}`;
}

function buildTreeData(
  categories: AdminCategory[],
  filterType: 'all' | CategoryType
): Array<TreeItem<CategoryTreeNodeData>> {
  const roots: Array<TreeItem<CategoryTreeNodeData>> = [];
  const includeProduct = filterType === 'all' || filterType === 'product';
  const includeBlog = filterType === 'all' || filterType === 'blog';

  if (includeProduct) {
    roots.push({
      id: getRootNodeId('product'),
      data: { kind: 'root', type: 'product', label: 'Product Categories' },
      children: categories
        .filter((category) => category.type === 'product')
        .map((category) => ({
          id: getCategoryNodeId(category.type, category.slug),
          data: { kind: 'category', type: 'product', label: category.name, category }
        }))
    });
  }

  if (includeBlog) {
    roots.push({
      id: getRootNodeId('blog'),
      data: { kind: 'root', type: 'blog', label: 'Blog Categories' },
      children: categories
        .filter((category) => category.type === 'blog')
        .map((category) => ({
          id: getCategoryNodeId(category.type, category.slug),
          data: { kind: 'category', type: 'blog', label: category.name, category }
        }))
    });
  }

  return roots;
}

function collectNodeIds(nodes: Array<TreeItem<CategoryTreeNodeData>>, target: Set<string>): void {
  for (const node of nodes) {
    target.add(String(node.id));
    if (node.children && node.children.length > 0) {
      collectNodeIds(node.children, target);
    }
  }
}

function findTreeNode(
  nodes: Array<TreeItem<CategoryTreeNodeData>>,
  id: string | null
): TreeItem<CategoryTreeNodeData> | null {
  if (!id) {
    return null;
  }
  for (const node of nodes) {
    if (String(node.id) === id) {
      return node;
    }
    if (node.children) {
      const found = findTreeNode(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<CategoryProductSummary[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);

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

  const filteredCategories = useMemo(() => {
    const value = searchTerm.trim().toLowerCase();
    return categories.filter((category) => {
      if (filterType !== 'all' && category.type !== filterType) {
        return false;
      }
      if (!value) {
        return true;
      }
      const haystack = [
        category.name,
        category.slug,
        category.short_description ?? '',
        category.long_description ?? ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(value);
    });
  }, [categories, filterType, searchTerm]);

  const treeData = useMemo(
    () => buildTreeData(filteredCategories, filterType),
    [filteredCategories, filterType]
  );

  useEffect(() => {
    const idSet = new Set<string>();
    collectNodeIds(treeData, idSet);
    if (idSet.size === 0) {
      setSelectedNodeId(null);
      return;
    }
    if (selectedNodeId && idSet.has(selectedNodeId)) {
      return;
    }
    if (filterType === 'product') {
      const productRoot = getRootNodeId('product');
      if (idSet.has(productRoot)) {
        setSelectedNodeId(productRoot);
        return;
      }
    }
    if (filterType === 'blog') {
      const blogRoot = getRootNodeId('blog');
      if (idSet.has(blogRoot)) {
        setSelectedNodeId(blogRoot);
        return;
      }
    }
    const firstId = idSet.values().next().value ?? null;
    setSelectedNodeId(firstId);
  }, [treeData, selectedNodeId, filterType]);

  const selectedTreeNode = useMemo(
    () => findTreeNode(treeData, selectedNodeId),
    [treeData, selectedNodeId]
  );

  const selectedCategory =
    selectedTreeNode && selectedTreeNode.data.kind === 'category' ? selectedTreeNode.data.category : null;
  const selectedRootType =
    selectedTreeNode && selectedTreeNode.data.kind === 'root' ? selectedTreeNode.data.type : null;

  useEffect(() => {
    if (!selectedCategory) {
      setCategoryProducts([]);
      setProductsTotal(0);
      setProductsError(null);
      setProductsLoading(false);
      return;
    }

    const controller = new AbortController();
    setProductsLoading(true);
    setProductsError(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/admin/categories/${encodeURIComponent(selectedCategory.slug)}/products?type=${selectedCategory.type}`,
          { signal: controller.signal }
        );
        const data = (await response.json().catch(() => ({}))) as CategoryProductsResponse;
        if (!response.ok || !data || data.ok !== true) {
          const message = (data as { message?: string }).message;
          throw new Error(message || 'Unable to load products for category.');
        }
        if (!controller.signal.aborted) {
          setCategoryProducts(data.products);
          setProductsTotal(data.totalCount);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          return;
        }
        if (!controller.signal.aborted) {
          setProductsError((err as Error)?.message || 'Unable to load products for this category.');
          setCategoryProducts([]);
          setProductsTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) {
          setProductsLoading(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [selectedCategory]);

  const openCreateModal = useCallback(
    (typeOverride?: CategoryType) => {
      setFeedback(null);
      setFormError(null);
      const effectiveType = typeOverride ?? initialType ?? 'product';
      setModalState({
        mode: 'create',
        form: {
          type: effectiveType,
          name: '',
          slug: '',
          shortDescription: '',
          longDescription: '',
          isPublished: true
        },
        slugDirty: false
      });
    },
    [initialType]
  );

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
      setSelectedNodeId(getCategoryNodeId(form.type, trimmedSlug));
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
        await loadCategories();
        setSelectedNodeId(getRootNodeId(category.type));
        setFeedback({ type: 'success', message: 'Category deleted successfully.' });
      } catch (err) {
        setFeedback({ type: 'error', message: (err as Error)?.message || 'Unable to delete category.' });
      }
    },
    [loadCategories]
  );

  const renderTreeNode = useCallback(
    ({ node, style }: NodeRendererProps<CategoryTreeNodeData>) => {
      const isSelected = node.isSelected;
      const background = isSelected ? '#e0e7ff' : 'transparent';
      const border = isSelected ? '1px solid #c7d2fe' : '1px solid transparent';
      const data = node.data;
      return (
        <div
          style={{
            ...treeNodeBaseStyle,
            ...style,
            background,
            border,
            color: '#0f172a'
          }}
        >
          <span style={{ fontWeight: 600 }}>{data.label}</span>
          {data.kind === 'category' ? (
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {data.category.slug} · {data.category.is_published ? 'Published' : 'Draft'} ·{' '}
              {data.category.products_count} products
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {data.type === 'product' ? 'Product categories' : 'Blog categories'}
            </span>
          )}
        </div>
      );
    },
    []
  );

  const defaultCreateType: CategoryType = useMemo(() => {
    if (selectedCategory) {
      return selectedCategory.type;
    }
    if (selectedRootType) {
      return selectedRootType;
    }
    if (filterType !== 'all') {
      return filterType;
    }
    return initialType ?? 'product';
  }, [filterType, initialType, selectedCategory, selectedRootType]);

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
          <input
            type="search"
            placeholder="Search categories"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            style={searchInputStyle}
          />
          <button type="button" style={buttonStyle} onClick={() => void loadCategories()}>
            Refresh
          </button>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={() => openCreateModal(defaultCreateType)}>
          + New Category
        </button>
      </div>

      {feedback ? <div style={feedback.type === 'error' ? errorStyle : successStyle}>{feedback.message}</div> : null}
      {error ? <div style={errorStyle}>{error}</div> : null}

      <div style={contentLayoutStyle}>
        <aside style={treePanelStyle}>
          {loading ? (
            <p style={{ margin: 0, color: '#475569' }}>Loading categories…</p>
          ) : treeData.length === 0 ? (
            <p style={{ margin: 0, color: '#64748b' }}>No categories found.</p>
          ) : (
            <Tree
              data={treeData}
              renderNode={renderTreeNode}
              selection={selectedNodeId ? [selectedNodeId] : []}
              onSelect={(ids) => {
                const [id] = ids;
                setSelectedNodeId(id ? String(id) : null);
              }}
            />
          )}
        </aside>

        <div style={detailsPanelStyle}>
          {selectedCategory ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>{selectedCategory.name}</h3>
                  <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>
                    Slug: <code>{selectedCategory.slug}</code>
                  </p>
                  <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>
                    Type: {selectedCategory.type === 'product' ? 'Product' : 'Blog'} ·{' '}
                    {selectedCategory.is_published ? 'Published' : 'Draft'}
                  </p>
                  <p style={{ margin: '0.25rem 0 0', color: '#94a3b8' }}>
                    Last updated: {formatDate(selectedCategory.updated_at)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" style={buttonStyle} onClick={() => openEditModal(selectedCategory)}>
                    Edit
                  </button>
                  <button type="button" style={dangerButtonStyle} onClick={() => void handleDelete(selectedCategory)}>
                    Delete
                  </button>
                </div>
              </div>

              {selectedCategory.short_description ? (
                <p style={{ margin: 0, color: '#475569' }}>{selectedCategory.short_description}</p>
              ) : null}
              {selectedCategory.long_description ? (
                <p style={{ margin: 0, color: '#475569' }}>{selectedCategory.long_description}</p>
              ) : null}

              <div style={productsHeaderStyle}>
                <h4 style={{ margin: 0, color: '#0f172a' }}>Products</h4>
                <span style={{ color: '#64748b' }}>
                  {productsLoading ? 'Loading…' : `${productsTotal} product${productsTotal === 1 ? '' : 's'}`}
                </span>
              </div>

              {productsError ? <div style={errorStyle}>{productsError}</div> : null}

              {productsLoading ? (
                <p style={{ margin: 0, color: '#475569' }}>Fetching products for this category…</p>
              ) : categoryProducts.length === 0 ? (
                <div style={productEmptyStateStyle}>No products found in this category.</div>
              ) : (
                <div style={productsGridStyle}>
                  {categoryProducts.map((product) => (
                    <article key={String(product.id)} style={productCardStyle}>
                      <div style={productImageWrapperStyle}>
                        {product.primaryImage ? (
                          <Image
                            src={product.primaryImage}
                            alt={product.title}
                            fill
                            sizes="(max-width: 768px) 100vw, 240px"
                            style={productImageStyle}
                          />
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <h5 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>{product.title}</h5>
                        {product.shortSummary ? (
                          <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>{product.shortSummary}</p>
                        ) : null}
                        {product.price ? (
                          <p style={{ margin: 0, color: '#2563eb', fontWeight: 600 }}>{product.price}</p>
                        ) : null}
                        <a
                          href={`/p/${product.slug}`}
                          style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                        >
                          View product
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : selectedRootType ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>
                {selectedRootType === 'product' ? 'Product categories' : 'Blog categories'}
              </h3>
              <p style={{ margin: 0, color: '#475569' }}>
                Select an existing category to view its details, or create a new one for the
                {selectedRootType === 'product' ? ' product catalog.' : ' blog.'}
              </p>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={() => openCreateModal(selectedRootType)}
              >
                Create {selectedRootType === 'product' ? 'product' : 'blog'} category
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, color: '#64748b' }}>Select a category from the tree to view details.</p>
          )}
        </div>
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

