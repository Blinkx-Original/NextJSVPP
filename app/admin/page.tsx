import type { CSSProperties } from 'react';
import ConnectivityPanel from './connectivity-panel';

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

export default function AdminPage() {
  return (
    <section style={containerStyle}>
      <header>
        <h1 style={{ fontSize: '2.5rem', color: '#0f172a', margin: 0 }}>Panel de Administración</h1>
        <p style={{ marginTop: '1rem', color: '#475569', maxWidth: 640 }}>
          Esta sección está protegida con Basic Auth. La pestaña de conectividad permite ejecutar pruebas rápidas para
          diagnosticar problemas de acceso a servicios externos.
        </p>
      </header>

      <nav style={tabListStyle} aria-label="Admin tabs">
        <span style={activeTabStyle}>Connectivity</span>
      </nav>

      <ConnectivityPanel />
    </section>
  );
}
