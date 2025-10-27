import type { CSSProperties } from 'react';
import { headers as nextHeaders } from 'next/headers';
import ConnectivityPanel from './connectivity-panel';
import PublishingPanel from './publishing-panel';
import AssetsPanel from './assets-panel';
import EditProductPanel from './edit-product-panel';
import EditBlogPanel from './edit-blog-panel';
import SeoPanel from './seo-panel';
import QuickProductNavigator from './quick-product-navigator';
import { readCloudflareImagesConfig } from '@/lib/cloudflare-images';
import { issueAdminSessionToken } from '@/lib/basic-auth';
import { normalizeProductSlugInput } from '@/lib/product-slug';

export const revalidate = 0;

const containerStyle: CSSProperties = {
  padding: '4rem 2.5rem',
  maxWidth: 1280,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem'
};

const tabListStyle: CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  borderBottom: '1px solid #e2e8f0',
  paddingBottom: '0.5rem'
};

const activeTabStyle: CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  background: '#0f172a',
  color: '#fff',
  fontWeight: 600,
  fontSize: '0.95rem'
};

const inactiveTabStyle: CSSProperties = {
  ...activeTabStyle,
  background: 'transparent',
  color: '#0f172a',
  border: '1px solid #cbd5f5'
};

interface AdminPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

type AdminTab = 'connectivity' | 'publishing' | 'assets' | 'edit-product' | 'edit-blog' | 'seo';
type CategoryPanelType = 'product' | 'blog';

function normalizeTab(input: string | string[] | undefined): AdminTab {
  if (Array.isArray(input)) {
    return normalizeTab(input[0]);
  }
  if (typeof input === 'string') {
    const normalized = input.toLowerCase();
    if (normalized === 'publishing') {
      return 'publishing';
    }
    if (normalized === 'assets') {
      return 'assets';
    }
    if (normalized === 'edit-product' || normalized === 'edit' || normalized === 'product') {
      return 'edit-product';
    }
    if (normalized === 'edit-blog' || normalized === 'blog' || normalized === 'post') {
      return 'edit-blog';
    }
    if (normalized === 'seo') {
      return 'seo';
    }
  }
  return 'connectivity';
}

function deriveInitialCategoryType(input: string | string[] | undefined): CategoryPanelType {
  if (Array.isArray(input)) {
    return deriveInitialCategoryType(input[0]);
  }
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'blog') {
      return 'blog';
    }
    if (normalized === 'product') {
      return 'product';
    }
  }
  return 'product';
}

function coerceSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? coerceSearchParam(value[0]) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export default function AdminPage({ searchParams }: AdminPageProps) {
  const tabParamRaw = searchParams?.tab;
  const initialTab = normalizeTab(tabParamRaw);
  const hasTabParam = Array.isArray(tabParamRaw)
    ? tabParamRaw.length > 0 && typeof tabParamRaw[0] === 'string'
    : typeof tabParamRaw === 'string' && tabParamRaw.length > 0;
  const rawSlugParam = coerceSearchParam(searchParams?.slug);
  const rawProductParamFromQuery = coerceSearchParam(searchParams?.product);
  const resolvedProductParam =
    rawProductParamFromQuery ?? (initialTab === 'edit-blog' ? null : rawSlugParam);
  const normalizedProductSlug = normalizeProductSlugInput(resolvedProductParam);
  const normalizedBlogSlug = rawSlugParam ? rawSlugParam.trim().toLowerCase() : null;
  const activeTab: AdminTab = normalizedProductSlug && !hasTabParam ? 'edit-product' : initialTab;

  const headerList = nextHeaders();
  const authHeader = headerList.get('authorization');

  const cfImagesConfig = readCloudflareImagesConfig();
  const adminToken = issueAdminSessionToken();
  const cfImagesEnabled = Boolean(
    cfImagesConfig.enabled && cfImagesConfig.accountId && cfImagesConfig.token && cfImagesConfig.baseUrl
  );
  const cfImagesBaseUrl = cfImagesConfig.baseUrl ?? null;

  const tabs: Array<{ id: AdminTab; label: string; href: string }> = [
    { id: 'connectivity', label: 'Connectivity', href: '/admin' },
    { id: 'publishing', label: 'Publishing', href: '/admin?tab=publishing' },
    { id: 'edit-product', label: 'Edit Product', href: '/admin?tab=edit-product' },
    { id: 'edit-blog', label: 'Edit Blog', href: '/admin?tab=edit-blog' },
    { id: 'seo', label: 'SEO', href: '/admin?tab=seo' },
    { id: 'assets', label: 'Assets', href: '/admin?tab=assets' }
  ];

  return (
    <section style={containerStyle}>
      <header>
        <h1 style={{ fontSize: '2.5rem', color: '#0f172a', margin: 0 }}>Panel de Administración</h1>
        <p style={{ marginTop: '1rem', color: '#475569', maxWidth: 640 }}>
          Esta sección está protegida con Basic Auth. Usa las pestañas para diagnosticar conectividad y controlar la
          publicación hacia el sitio y Algolia.
        </p>
      </header>

      <nav style={tabListStyle} aria-label="Admin tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          if (isActive) {
            return (
              <span key={tab.id} style={activeTabStyle} aria-current="page">
                {tab.label}
              </span>
            );
          }
          return (
            <a
              key={tab.id}
              href={tab.href}
              style={inactiveTabStyle}
              aria-label={`Cambiar a la pestaña ${tab.label}`}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>

      {activeTab === 'edit-product' ? (
        <QuickProductNavigator initialValue={resolvedProductParam ?? ''} />
      ) : null}

      {activeTab === 'publishing' ? (
        <PublishingPanel />
      ) : activeTab === 'assets' ? (
        <AssetsPanel
          cfImagesEnabled={cfImagesEnabled}
          cfImagesBaseUrl={cfImagesBaseUrl}
          authHeader={authHeader}
          adminToken={adminToken}
        />
      ) : activeTab === 'seo' ? (
        <SeoPanel initialSlug={normalizedProductSlug} initialInput={resolvedProductParam ?? ''} />
      ) : activeTab === 'edit-product' ? (
        <EditProductPanel initialSlug={normalizedProductSlug} initialInput={resolvedProductParam ?? ''} />
      ) : activeTab === 'edit-blog' ? (
        <EditBlogPanel
          initialSlug={normalizedBlogSlug}
          cfImagesEnabled={cfImagesEnabled}
          cfImagesBaseUrl={cfImagesBaseUrl}
          authHeader={authHeader}
          adminToken={adminToken}
        />
      ) : (
        <ConnectivityPanel />
      )}
    </section>
  );
}
