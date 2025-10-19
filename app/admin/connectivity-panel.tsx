'use client';

import { useState, type CSSProperties } from 'react';

type TestStatus = 'idle' | 'loading' | 'success' | 'error';

type ErrorCode = string | null;

interface TestResult<T> {
  status: TestStatus;
  timestamp?: number;
  data?: T;
  errorCode?: ErrorCode;
  errorDetails?: unknown;
}

interface TidbSuccess {
  ok: true;
  latency_ms: number;
  published: number;
  lastmod: string | null;
}

interface TidbError {
  ok: false;
  error_code?: string;
  error_details?: unknown;
}

type TidbResponse = TidbSuccess | TidbError;

interface AlgoliaSuccess {
  ok: true;
  latency_ms: number;
  index_exists: boolean;
  index: string;
}

interface AlgoliaError {
  ok: false;
  error_code?: string;
  index_exists?: boolean;
  index?: string;
  error_details?: unknown;
}

type AlgoliaResponse = AlgoliaSuccess | AlgoliaError;

interface RevalidateSuccess {
  ok: true;
}

interface RevalidateError {
  ok: false;
  error_code?: string;
  error_details?: unknown;
}

type RevalidateResponse = RevalidateSuccess | RevalidateError;

const cardStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  background: '#fff'
};

const buttonStyle: CSSProperties = {
  padding: '0.65rem 1.25rem',
  borderRadius: 8,
  background: '#0f172a',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontWeight: 600,
  width: 'fit-content'
};

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  opacity: 0.6,
  cursor: 'not-allowed'
};

function formatLatency(latency?: number): string {
  if (typeof latency !== 'number' || Number.isNaN(latency)) {
    return '—';
  }
  return `${latency} ms`;
}

function formatLastmod(lastmod: string | null | undefined): string {
  if (!lastmod) {
    return '—';
  }
  try {
    const date = new Date(lastmod);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toISOString();
  } catch {
    return '—';
  }
}

function StatusBadge({ status, successLabel }: { status: TestStatus; successLabel: string }) {
  const baseStyle: CSSProperties = {
    padding: '0.25rem 0.65rem',
    borderRadius: 999,
    fontSize: '0.85rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem'
  };

  if (status === 'success') {
    return (
      <span style={{ ...baseStyle, background: '#dcfce7', color: '#14532d' }}>
        ✅ {successLabel}
      </span>
    );
  }

  if (status === 'loading') {
    return (
      <span style={{ ...baseStyle, background: '#e0f2fe', color: '#0c4a6e' }}>
        ⏳ Ejecutando…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c' }}>
        ❌ Down
      </span>
    );
  }

  return (
    <span style={{ ...baseStyle, background: '#e2e8f0', color: '#475569' }}>
      Estado desconocido
    </span>
  );
}

function ErrorBlock({ code, details }: { code?: string | null; details?: unknown }) {
  if (!code) {
    return null;
  }

  return (
    <div style={{ background: '#fef2f2', color: '#7f1d1d', padding: '0.75rem', borderRadius: 8 }}>
      <strong>Error:</strong> {code}
      {details ? (
        <pre
          style={{
            marginTop: '0.5rem',
            fontSize: '0.8rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

async function postJson<T>(url: string): Promise<{ response: Response; body: T }> {
  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store'
  });
  const body = (await response.json()) as T;
  return { response, body };
}

export function ConnectivityPanel() {
  const [tidbResult, setTidbResult] = useState<TestResult<TidbResponse>>({ status: 'idle' });
  const [algoliaResult, setAlgoliaResult] = useState<TestResult<AlgoliaResponse>>({ status: 'idle' });
  const [revalidateResult, setRevalidateResult] = useState<TestResult<RevalidateResponse>>({ status: 'idle' });

  const handleTestTidb = async () => {
    setTidbResult({ status: 'loading' });
    try {
      const { response, body } = await postJson<TidbResponse>('/api/admin/connectivity/tidb');
      if (response.ok && body.ok) {
        setTidbResult({ status: 'success', data: body, timestamp: Date.now() });
      } else {
        setTidbResult({
          status: 'error',
          data: body,
          errorCode: body.error_code ?? null,
          errorDetails: body.error_details,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      setTidbResult({
        status: 'error',
        errorCode: 'network_error',
        errorDetails: { message: (error as Error)?.message }
      });
    }
  };

  const handleTestAlgolia = async () => {
    setAlgoliaResult({ status: 'loading' });
    try {
      const { response, body } = await postJson<AlgoliaResponse>('/api/admin/connectivity/algolia');
      if (response.ok && body.ok) {
        setAlgoliaResult({ status: 'success', data: body, timestamp: Date.now() });
      } else {
        setAlgoliaResult({
          status: 'error',
          data: body,
          errorCode: body.error_code ?? null,
          errorDetails: body.error_details,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      setAlgoliaResult({
        status: 'error',
        errorCode: 'network_error',
        errorDetails: { message: (error as Error)?.message }
      });
    }
  };

  const handleRevalidate = async () => {
    setRevalidateResult({ status: 'loading' });
    try {
      const { response, body } = await postJson<RevalidateResponse>(
        '/api/admin/connectivity/revalidate'
      );
      if (response.ok && body.ok) {
        setRevalidateResult({ status: 'success', data: body, timestamp: Date.now() });
      } else {
        setRevalidateResult({
          status: 'error',
          data: body,
          errorCode: body.error_code ?? null,
          errorDetails: body.error_details,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      setRevalidateResult({
        status: 'error',
        errorCode: 'network_error',
        errorDetails: { message: (error as Error)?.message }
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section style={cardStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>TiDB</h2>
            <p style={{ marginTop: '0.25rem', color: '#475569' }}>
              Ejecuta consultas básicas para verificar la disponibilidad de la base de datos.
            </p>
          </div>
          <StatusBadge status={tidbResult.status} successLabel="Connected" />
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <Metric label="Latencia" value={formatLatency((tidbResult.data as TidbSuccess | undefined)?.latency_ms)} />
          <Metric
            label="Productos publicados"
            value={
              tidbResult.status === 'success'
                ? String((tidbResult.data as TidbSuccess).published)
                : '—'
            }
          />
          <Metric
            label="Último update"
            value={
              tidbResult.status === 'success'
                ? formatLastmod((tidbResult.data as TidbSuccess).lastmod)
                : '—'
            }
          />
        </div>
        <button
          type="button"
          onClick={handleTestTidb}
          style={tidbResult.status === 'loading' ? disabledButtonStyle : buttonStyle}
          disabled={tidbResult.status === 'loading'}
        >
          Test TiDB Connection
        </button>
        <ErrorBlock code={tidbResult.errorCode ?? undefined} details={tidbResult.errorDetails} />
      </section>

      <section style={cardStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>Algolia</h2>
            <p style={{ marginTop: '0.25rem', color: '#475569' }}>
              Comprueba el acceso al índice configurado y la latencia de la API.
            </p>
          </div>
          <StatusBadge status={algoliaResult.status} successLabel="Connected" />
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <Metric
            label="Latencia"
            value={formatLatency((algoliaResult.data as AlgoliaSuccess | undefined)?.latency_ms)}
          />
          <Metric
            label="Índice"
            value={
              algoliaResult.status === 'success'
                ? (algoliaResult.data as AlgoliaSuccess).index
                : (algoliaResult.data as AlgoliaError | undefined)?.index ?? '—'
            }
          />
          <Metric
            label="Existe"
            value={
              algoliaResult.status === 'success'
                ? (algoliaResult.data as AlgoliaSuccess).index_exists
                  ? 'Sí'
                  : 'No'
                : '—'
            }
          />
        </div>
        <button
          type="button"
          onClick={handleTestAlgolia}
          style={algoliaResult.status === 'loading' ? disabledButtonStyle : buttonStyle}
          disabled={algoliaResult.status === 'loading'}
        >
          Test Algolia Connection
        </button>
        <ErrorBlock code={algoliaResult.errorCode ?? undefined} details={algoliaResult.errorDetails} />
      </section>

      <section style={cardStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>Revalidate Sitemap</h2>
            <p style={{ marginTop: '0.25rem', color: '#475569' }}>
              Invoca la ruta de revalidación para limpiar cachés y regenerar sitemaps.
            </p>
          </div>
          <StatusBadge status={revalidateResult.status} successLabel="Ok" />
        </header>
        <Metric
          label="Último resultado"
          value={
            revalidateResult.status === 'success'
              ? 'OK'
              : revalidateResult.status === 'error'
                ? revalidateResult.errorCode ?? 'Error'
                : '—'
          }
        />
        <button
          type="button"
          onClick={handleRevalidate}
          style={revalidateResult.status === 'loading' ? disabledButtonStyle : buttonStyle}
          disabled={revalidateResult.status === 'loading'}
        >
          Revalidate Sitemap
        </button>
        <ErrorBlock code={revalidateResult.errorCode ?? undefined} details={revalidateResult.errorDetails} />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a' }}>{value}</span>
    </div>
  );
}

export default ConnectivityPanel;
