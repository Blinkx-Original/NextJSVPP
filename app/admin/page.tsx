import type { CSSProperties } from 'react';
import ConnectivityPanel from './connectivity-panel';
import PublishingPanel from './publishing-panel';

export const revalidate = 0;

const containerStyle: CSSProperties = {
  padding: '4rem 1.5rem',
  maxWidth: 960,
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

function normalizeTab(input: string | string[] | undefined): 'connectivity' | 'publishing' {
  if (Array.isArray(input)) {
    return normalizeTab(input[0]);
  }
  if (typeof input === 'string') {
    const normalized = input.toLowerCase();
    if (normalized === 'publishing') {
      return 'publishing';
    }
  }
  return 'connectivity';
}

export default function AdminPage({ searchParams }: AdminPageProps) {
  const activeTab = normalizeTab(searchParams?.tab);

  const tabs: Array<{ id: 'connectivity' | 'publishing'; label: string }> = [
    { id: 'connectivity', label: 'Connectivity' },
    { id: 'publishing', label: 'Publishing' }
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
          const href = tab.id === 'connectivity' ? '/admin' : '/admin?tab=publishing';
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
              href={href}
              style={inactiveTabStyle}
              aria-label={`Cambiar a la pestaña ${tab.label}`}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>

      {activeTab === 'publishing' ? <PublishingPanel /> : <ConnectivityPanel />}
    </section>
  );
}
