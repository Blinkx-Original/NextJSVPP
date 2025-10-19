'use client';

import { useEffect, useState, type CSSProperties } from 'react';

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

type CloudflareAction = 'test' | 'purge_sitemaps' | 'purge_last_batch' | 'purge_everything';

interface CloudflareStatusResponse {
  ok: boolean;
  configured: boolean;
  zone_id: string | null;
  zone_id_short: string | null;
}

interface CloudflareActionSuccess {
  ok: true;
  latency_ms: number;
  zone_id: string;
  zone_id_short: string;
  zone_name?: string | null;
  message?: string;
  purged?: string[];
  urls_purged?: number;
  base_url?: string;
  ray_id?: string | null;
  ray_ids?: string[];
}

interface CloudflareActionError {
  ok: false;
  error_code?: string;
  error_details?: unknown;
  status?: number | null;
  ray_id?: string | null;
  ray_ids?: string[];
}

type CloudflareActionResponse = CloudflareActionSuccess | CloudflareActionError;

interface CloudflareLogEntry {
  id: string;
  action: CloudflareAction;
  timestamp: number;
  ok: boolean;
  message: string;
  latency?: number;
  rayIds?: string[];
}

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

function formatTimestampLabel(timestamp?: number | null, message?: string | null): string {
  if (!timestamp || !message) {
    return '—';
  }
  const date = new Date(timestamp);
  const iso = Number.isNaN(date.getTime()) ? null : date.toISOString();
  return iso ? `${iso} — ${message}` : message;
}

function labelCloudflareAction(action: CloudflareAction): string {
  switch (action) {
    case 'test':
      return 'Test Cloudflare Connection';
    case 'purge_sitemaps':
      return 'Purge Sitemaps';
    case 'purge_last_batch':
      return 'Purge Last Batch URLs';
    case 'purge_everything':
      return 'Purge Everything';
    default:
      return 'Cloudflare';
  }
}

function describeCloudflareSuccess(action: CloudflareAction, body: CloudflareActionSuccess): string {
  if (body.message) {
    return body.message;
  }
  switch (action) {
    case 'test':
      return 'Conexión verificada';
    case 'purge_sitemaps':
      return body.purged && body.purged.length > 0
        ? `Sitemaps purgados: ${body.purged.join(', ')}`
        : 'Sitemaps purgados';
    case 'purge_last_batch':
      return body.urls_purged
        ? `Último lote purgado (${body.urls_purged} URLs)`
        : 'Último lote purgado';
    case 'purge_everything':
      return 'Cache completa purgada';
    default:
      return 'Operación completada';
  }
}

function describeCloudflareError(action: CloudflareAction, errorCode?: string | null): string {
  const label = labelCloudflareAction(action);
  const suffix = errorCode ? ` (${errorCode})` : '';
  return `${label} falló${suffix}`;
}

function collectRayIds(body: CloudflareActionResponse): string[] | undefined {
  if (body.ok) {
    if (Array.isArray(body.ray_ids) && body.ray_ids.length > 0) {
      return body.ray_ids;
    }
    if (body.ray_id) {
      return [body.ray_id];
    }
    return undefined;
  }
  if (Array.isArray(body.ray_ids) && body.ray_ids.length > 0) {
    return body.ray_ids;
  }
  if (body.ray_id) {
    return [body.ray_id];
  }
  return undefined;
}

function formatRayIds(rayIds?: string[]): string | null {
  if (!rayIds || rayIds.length === 0) {
    return null;
  }
  const label = rayIds.length > 1 ? 'Ray IDs' : 'Ray ID';
  return `${label}: ${rayIds.join(', ')}`;
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
  const [cloudflareStatus, setCloudflareStatus] = useState<TestStatus>('idle');
  const [cloudflareZoneIdShort, setCloudflareZoneIdShort] = useState<string | null>(null);
  const [cloudflareLastMessage, setCloudflareLastMessage] = useState<string | null>(null);
  const [cloudflareLastTimestamp, setCloudflareLastTimestamp] = useState<number | null>(null);
  const [cloudflareErrorCode, setCloudflareErrorCode] = useState<ErrorCode>(null);
  const [cloudflareErrorDetails, setCloudflareErrorDetails] = useState<unknown>(null);
  const [cloudflareLogs, setCloudflareLogs] = useState<CloudflareLogEntry[]>([]);
  const [cloudflareLoadingAction, setCloudflareLoadingAction] = useState<CloudflareAction | null>(null);
  const [cloudflareConfigured, setCloudflareConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/admin/connectivity/cloudflare/status', {
          method: 'GET',
          cache: 'no-store'
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as CloudflareStatusResponse;
        if (cancelled) {
          return;
        }
        setCloudflareConfigured(data.configured);
        setCloudflareZoneIdShort(data.zone_id_short);
      } catch (error) {
        if (!cancelled) {
          console.warn('[cloudflare][status] unable to load status', error);
        }
      }
    };
    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const appendCloudflareLog = (entry: CloudflareLogEntry) => {
    setCloudflareLogs((prev) => {
      const next = [entry, ...prev];
      return next.slice(0, 10);
    });
  };

  const cloudflareEndpoints: Record<CloudflareAction, string> = {
    test: '/api/admin/connectivity/cloudflare/test',
    purge_sitemaps: '/api/admin/connectivity/cloudflare/purge-sitemaps',
    purge_last_batch: '/api/admin/connectivity/cloudflare/purge-last-batch',
    purge_everything: '/api/admin/connectivity/cloudflare/purge-everything'
  };

  const handleCloudflareAction = async (action: CloudflareAction) => {
    if (cloudflareLoadingAction) {
      return;
    }
    const endpoint = cloudflareEndpoints[action];
    setCloudflareLoadingAction(action);
    setCloudflareErrorCode(null);
    setCloudflareErrorDetails(null);
    try {
      const { response, body } = await postJson<CloudflareActionResponse>(endpoint);
      const timestamp = Date.now();
      const rayIds = collectRayIds(body);
      if (body.ok) {
        setCloudflareStatus('success');
        setCloudflareConfigured(true);
        setCloudflareZoneIdShort(body.zone_id_short ?? null);
        const message = describeCloudflareSuccess(action, body);
        setCloudflareLastMessage(message);
        setCloudflareLastTimestamp(timestamp);
        appendCloudflareLog({
          id: `${timestamp}-${action}`,
          action,
          timestamp,
          ok: true,
          message,
          latency: body.latency_ms,
          rayIds
        });
      } else {
        setCloudflareStatus('error');
        const errorCode = body.error_code ?? (response.ok ? 'api_error' : `http_${response.status}`);
        setCloudflareErrorCode(errorCode);
        setCloudflareErrorDetails(body.error_details);
        if (errorCode === 'missing_env') {
          setCloudflareConfigured(false);
        }
        const message = describeCloudflareError(action, errorCode);
        setCloudflareLastMessage(message);
        setCloudflareLastTimestamp(timestamp);
        appendCloudflareLog({
          id: `${timestamp}-${action}-error`,
          action,
          timestamp,
          ok: false,
          message,
          latency: undefined,
          rayIds
        });
      }
    } catch (error) {
      const timestamp = Date.now();
      setCloudflareStatus('error');
      setCloudflareErrorCode('network_error');
      setCloudflareErrorDetails({ message: (error as Error)?.message });
      const message = describeCloudflareError(action, 'network_error');
      setCloudflareLastMessage(message);
      setCloudflareLastTimestamp(timestamp);
      appendCloudflareLog({
        id: `${timestamp}-${action}-network`,
        action,
        timestamp,
        ok: false,
        message,
        latency: undefined
      });
    } finally {
      setCloudflareLoadingAction(null);
    }
  };

  const handleTestTidb = async () => {
    setTidbResult({ status: 'loading' });
    try {
      const { response, body } = await postJson<TidbResponse>('/api/admin/connectivity/tidb');
      if (!body.ok) {
        setTidbResult({
          status: 'error',
          data: body,
          errorCode: body.error_code ?? null,
          errorDetails: body.error_details,
          timestamp: Date.now()
        });
      } else if (response.ok) {
        setTidbResult({ status: 'success', data: body, timestamp: Date.now() });
      } else {
        setTidbResult({
          status: 'error',
          data: body,
          errorCode: `http_${response.status}`,
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
      if (!body.ok) {
        setAlgoliaResult({
          status: 'error',
          data: body,
          errorCode: body.error_code ?? null,
          errorDetails: body.error_details,
          timestamp: Date.now()
        });
      } else if (response.ok) {
        setAlgoliaResult({ status: 'success', data: body, timestamp: Date.now() });
      } else {
        setAlgoliaResult({
          status: 'error',
          data: body,
          errorCode: `http_${response.status}`,
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
      if (!body.ok) {
        setRevalidateResult({
          status: 'error',
          data: body,
          errorCode: body.error_code ?? null,
          errorDetails: body.error_details,
          timestamp: Date.now()
        });
      } else if (response.ok) {
        setRevalidateResult({ status: 'success', data: body, timestamp: Date.now() });
      } else {
        setRevalidateResult({
          status: 'error',
          data: body,
          errorCode: `http_${response.status}`,
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
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>Cloudflare</h2>
            <p style={{ marginTop: '0.25rem', color: '#475569' }}>
              Prueba la conectividad con la API de Cloudflare y ejecuta purgas manuales de caché.
            </p>
          </div>
          <StatusBadge status={cloudflareStatus} successLabel="Connected" />
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <Metric label="Zone ID" value={cloudflareZoneIdShort ?? '—'} />
          <Metric
            label="Último resultado"
            value={formatTimestampLabel(cloudflareLastTimestamp, cloudflareLastMessage)}
          />
        </div>
        {cloudflareConfigured === false ? (
          <div
            style={{
              background: '#f1f5f9',
              color: '#475569',
              padding: '0.75rem',
              borderRadius: 8,
              fontSize: '0.9rem'
            }}
          >
            Configura <code>CLOUDFLARE_ZONE_ID</code> y <code>CLOUDFLARE_API_TOKEN</code> para habilitar las acciones.
          </div>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {([
            { action: 'test' as CloudflareAction, label: 'Test Cloudflare Connection' },
            { action: 'purge_sitemaps' as CloudflareAction, label: 'Purge Sitemaps' },
            { action: 'purge_last_batch' as CloudflareAction, label: 'Purge Last Batch URLs' },
            { action: 'purge_everything' as CloudflareAction, label: 'Purge Everything' }
          ]).map(({ action, label }) => {
            const loading = cloudflareLoadingAction === action;
            const disabled = loading || cloudflareConfigured === false;
            const style = disabled ? disabledButtonStyle : buttonStyle;
            return (
              <button
                key={action}
                type="button"
                onClick={() => handleCloudflareAction(action)}
                style={style}
                disabled={disabled}
              >
                {loading ? 'Ejecutando…' : label}
              </button>
            );
          })}
        </div>
        {cloudflareLogs.length > 0 ? (
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Actividad reciente</h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {cloudflareLogs.map((entry) => {
                const date = new Date(entry.timestamp);
                const iso = Number.isNaN(date.getTime()) ? '' : date.toISOString();
                const rayLabel = formatRayIds(entry.rayIds);
                return (
                  <li key={entry.id} style={{ background: '#f8fafc', borderRadius: 8, padding: '0.75rem' }}>
                    <div style={{ fontWeight: 600, color: entry.ok ? '#14532d' : '#b91c1c' }}>
                      {entry.ok ? '✅' : '❌'} {labelCloudflareAction(entry.action)}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                      {iso ? `${iso} — ${entry.message}` : entry.message}
                    </div>
                    {entry.latency ? (
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Latencia: {entry.latency} ms</div>
                    ) : null}
                    {rayLabel ? (
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{rayLabel}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <ErrorBlock code={cloudflareErrorCode ?? undefined} details={cloudflareErrorDetails} />
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
