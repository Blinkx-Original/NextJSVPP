'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buttonStyle, cardStyle, disabledButtonStyle, inputStyle } from './panel-styles';

interface OverviewResponse {
  ok: boolean;
  site: {
    published: number;
    unpublished: number;
  };
  algolia: {
    configured: boolean;
    indexName: string | null;
    indexCount: number | null;
    errorCode?: string | null;
  };
}

interface OverviewState {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: OverviewResponse;
  errorCode?: string | null;
  errorDetails?: unknown;
}

interface BatchResponse {
  ok: boolean;
  requested: number;
  processed: number;
  success: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  finished_at: string;
  message?: string | null;
  slugs?: string[];
  activity_id?: string;
  error_code?: string | null;
  error_details?: unknown;
  cloudflare?: {
    configured: boolean;
    ok: boolean;
    error_code?: string | null;
    urls_purged?: number;
    purged?: string[];
  };
  candidate_count?: number;
}

interface BatchState {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: BatchResponse;
  errorCode?: string | null;
  errorDetails?: unknown;
  timestamp?: number;
}

interface ActivityEntry {
  id: string;
  type: 'sitemap' | 'algolia';
  requested: number;
  processed: number;
  success: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  finished_at: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ActivityResponse {
  ok: boolean;
  entries: ActivityEntry[];
}

interface ActivityState {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: ActivityEntry[];
  errorCode?: string | null;
  errorDetails?: unknown;
}

interface NumericMetricProps {
  label: string;
  value: number | null | undefined;
}

interface StatusBadgeProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  successLabel?: string;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('es-AR').format(value);
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${value} ms`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString();
  } catch {
    return '—';
  }
}

function NumericMetric({ label, value }: NumericMetricProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <strong style={{ fontSize: '1.5rem', color: '#0f172a' }}>{formatNumber(value)}</strong>
    </div>
  );
}

function StatusBadge({ status, successLabel = 'Listo' }: StatusBadgeProps) {
  const background =
    status === 'success'
      ? '#10b981'
      : status === 'error'
        ? '#ef4444'
        : status === 'loading'
          ? '#f97316'
          : '#cbd5f5';
  const textColor = status === 'idle' ? '#0f172a' : '#fff';
  const label =
    status === 'success' ? successLabel : status === 'error' ? 'Error' : status === 'loading' ? 'Ejecutando' : 'Inactivo';
  return (
    <span
      style={{
        alignSelf: 'flex-start',
        padding: '0.25rem 0.65rem',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 600,
        background,
        color: textColor,
        textTransform: 'uppercase',
        letterSpacing: 0.5
      }}
    >
      {label}
    </span>
  );
}

async function getJson<T>(input: RequestInfo, init?: RequestInit): Promise<{ response: Response; body: T }> {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { response, body };
}

export default function PublishingPanel() {
  const [overview, setOverview] = useState<OverviewState>({ status: 'idle' });
  const [sitemapBatchSize, setSitemapBatchSize] = useState('2000');
  const [algoliaBatchSize, setAlgoliaBatchSize] = useState('2000');
  const [sitemapResult, setSitemapResult] = useState<BatchState>({ status: 'idle' });
  const [algoliaResult, setAlgoliaResult] = useState<BatchState>({ status: 'idle' });
  const [activity, setActivity] = useState<ActivityState>({ status: 'idle', data: [] });

  const refreshOverview = useCallback(async () => {
    setOverview((prev) => ({ ...prev, status: 'loading' }));
    try {
      const { response, body } = await getJson<OverviewResponse>('/api/admin/publishing/overview', { method: 'GET' });
      if (!response.ok || !body.ok) {
        setOverview({
          status: 'error',
          data: body,
          errorCode: (body as any)?.error_code ?? `http_${response.status}`,
          errorDetails: body
        });
        return;
      }
      setOverview({ status: 'success', data: body });
    } catch (error) {
      setOverview({
        status: 'error',
        errorCode: 'network_error',
        errorDetails: { message: (error as Error)?.message }
      });
    }
  }, []);

  const refreshActivity = useCallback(async () => {
    setActivity((prev) => ({ ...prev, status: 'loading' }));
    try {
      const { response, body } = await getJson<ActivityResponse>('/api/admin/publishing/activity', { method: 'GET' });
      if (!response.ok || !body.ok) {
        setActivity({
          status: 'error',
          data: body.entries ?? [],
          errorCode: (body as any)?.error_code ?? `http_${response.status}`,
          errorDetails: body
        });
        return;
      }
      setActivity({ status: 'success', data: body.entries });
    } catch (error) {
      setActivity({
        status: 'error',
        data: [],
        errorCode: 'network_error',
        errorDetails: { message: (error as Error)?.message }
      });
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
    void refreshActivity();
  }, [refreshOverview, refreshActivity]);

  const parseBatchSize = useCallback((value: string): number | null => {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }, []);

  const handleRunSitemap = useCallback(async () => {
    const batchSize = parseBatchSize(sitemapBatchSize);
    if (!batchSize) {
      setSitemapResult({
        status: 'error',
        errorCode: 'invalid_batch_size',
        errorDetails: { value: sitemapBatchSize }
      });
      return;
    }
    setSitemapResult({ status: 'loading' });
    try {
      const { response, body } = await getJson<BatchResponse>('/api/admin/publishing/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize })
      });
      if (!response.ok || !body.ok) {
        setSitemapResult({
          status: 'error',
          data: body,
          errorCode: body.error_code ?? `http_${response.status}`,
          errorDetails: body.error_details,
          timestamp: Date.now()
        });
      } else {
        setSitemapResult({ status: 'success', data: body, timestamp: Date.now() });
        void refreshOverview();
        void refreshActivity();
      }
    } catch (error) {
      setSitemapResult({
        status: 'error',
        errorCode: 'network_error',
        errorDetails: { message: (error as Error)?.message }
      });
    }
  }, [parseBatchSize, refreshActivity, refreshOverview, sitemapBatchSize]);

  const handleRunAlgolia = useCallback(async () => {
    const batchSize = parseBatchSize(algoliaBatchSize);
    if (!batchSize) {
      setAlgoliaResult({
        status: 'error',
        errorCode: 'invalid_batch_size',
        errorDetails: { value: algoliaBatchSize }
      });
      return;
    }
    setAlgoliaResult({ status: 'loading' });
    try {
      const { response, body } = await getJson<BatchResponse>('/api/admin/publishing/algolia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize })
      });
      if (!response.ok || !body.ok) {
        setAlgoliaResult({
          status: 'error',
          data: body,
          errorCode: body.error_code ?? `http_${response.status}`,
          errorDetails: body.error_details,
          timestamp: Date.now()
        });
      } else {
        setAlgoliaResult({ status: 'success', data: body, timestamp: Date.now() });
        void refreshOverview();
        void refreshActivity();
      }
    } catch (error) {
      setAlgoliaResult({
        status: 'error',
        errorCode: 'network_error',
        errorDetails: { message: (error as Error)?.message }
      });
    }
  }, [algoliaBatchSize, parseBatchSize, refreshActivity, refreshOverview]);

  const overviewSite = overview.data?.site;
  const overviewAlgolia = overview.data?.algolia;

  const activityEntries = useMemo(() => activity.data ?? [], [activity.data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section style={cardStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>Overview</h2>
            <p style={{ marginTop: '0.25rem', color: '#475569' }}>
              Resumen de elementos publicados en TiDB y sincronización con Algolia.
            </p>
          </div>
          <StatusBadge status={overview.status} successLabel="Actualizado" />
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <NumericMetric label="Publicado (Site)" value={overviewSite?.published} />
          <NumericMetric label="Pendiente (Site)" value={overviewSite?.unpublished} />
          <NumericMetric label="Index Algolia" value={overviewAlgolia?.indexCount ?? null} />
        </div>
        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
          <p style={{ margin: 0 }}>
            Índice Algolia:{' '}
            {overviewAlgolia?.configured
              ? overviewAlgolia.indexName ?? '—'
              : 'configuración faltante (variables ALGOLIA_*)'}
          </p>
          {overviewAlgolia?.errorCode ? (
            <p style={{ margin: '0.25rem 0 0' }}>Error: {overviewAlgolia.errorCode}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            void refreshOverview();
            void refreshActivity();
          }}
          style={overview.status === 'loading' ? disabledButtonStyle : buttonStyle}
          disabled={overview.status === 'loading'}
        >
          Refrescar
        </button>
      </section>

      <section style={cardStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>Publish to Sitemap</h2>
            <p style={{ marginTop: '0.25rem', color: '#475569' }}>
              Actualiza <code>is_published</code> en TiDB y revalida los sitemaps.
            </p>
          </div>
          <StatusBadge status={sitemapResult.status} successLabel="Batch ok" />
        </header>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.9rem', flex: '1 1 200px' }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>Batch size</span>
            <input
              type="number"
              min={1}
              value={sitemapBatchSize}
              onChange={(event) => setSitemapBatchSize(event.target.value)}
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                void handleRunSitemap();
              }}
              style={sitemapResult.status === 'loading' ? disabledButtonStyle : buttonStyle}
              disabled={sitemapResult.status === 'loading'}
            >
              Run Batch (Sitemap)
            </button>
          </div>
        </div>
        {sitemapResult.data ? (
          <div style={{
            borderTop: '1px solid #e2e8f0',
            paddingTop: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem'
          }}>
            <NumericMetric label="Requested" value={sitemapResult.data.requested} />
            <NumericMetric label="Processed" value={sitemapResult.data.processed} />
            <NumericMetric label="Success" value={sitemapResult.data.success} />
            <NumericMetric label="Skipped" value={sitemapResult.data.skipped} />
            <NumericMetric label="Errors" value={sitemapResult.data.errors} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Duración
              </span>
              <strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>
                {formatDuration(sitemapResult.data.duration_ms)}
              </strong>
            </div>
          </div>
        ) : null}
        {sitemapResult.data?.message ? (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a' }}>{sitemapResult.data.message}</p>
        ) : null}
        {sitemapResult.errorCode ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#dc2626' }}>
            Error: {sitemapResult.errorCode}
          </p>
        ) : null}
      </section>

      <section style={cardStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>Publish to Algolia</h2>
            <p style={{ marginTop: '0.25rem', color: '#475569' }}>
              Empuja productos publicados en TiDB que aún no existen en el índice.
            </p>
          </div>
          <StatusBadge status={algoliaResult.status} successLabel="Batch ok" />
        </header>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.9rem', flex: '1 1 200px' }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>Batch size</span>
            <input
              type="number"
              min={1}
              value={algoliaBatchSize}
              onChange={(event) => setAlgoliaBatchSize(event.target.value)}
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                void handleRunAlgolia();
              }}
              style={algoliaResult.status === 'loading' ? disabledButtonStyle : buttonStyle}
              disabled={algoliaResult.status === 'loading'}
            >
              Run Batch (Algolia)
            </button>
          </div>
        </div>
        {algoliaResult.data ? (
          <div style={{
            borderTop: '1px solid #e2e8f0',
            paddingTop: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem'
          }}>
            <NumericMetric label="Requested" value={algoliaResult.data.requested} />
            <NumericMetric label="Processed" value={algoliaResult.data.processed} />
            <NumericMetric label="Success" value={algoliaResult.data.success} />
            <NumericMetric label="Skipped" value={algoliaResult.data.skipped} />
            <NumericMetric label="Errors" value={algoliaResult.data.errors} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Duración
              </span>
              <strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>
                {formatDuration(algoliaResult.data.duration_ms)}
              </strong>
            </div>
          </div>
        ) : null}
        {typeof algoliaResult.data?.candidate_count === 'number' ? (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
            Candidatos revisados: {formatNumber(algoliaResult.data.candidate_count)}
          </p>
        ) : null}
        {algoliaResult.data?.message ? (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a' }}>{algoliaResult.data.message}</p>
        ) : null}
        {algoliaResult.errorCode ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#dc2626' }}>
            Error: {algoliaResult.errorCode}
          </p>
        ) : null}
      </section>

      <section style={cardStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#0f172a' }}>Activity</h2>
            <p style={{ marginTop: '0.25rem', color: '#475569' }}>
              Últimas ejecuciones (memoria local, se reinicia al redeploy).
            </p>
          </div>
          <StatusBadge status={activity.status} successLabel="Actualizado" />
        </header>
        {activityEntries.length === 0 ? (
          <p style={{ margin: 0, color: '#475569' }}>Sin ejecuciones registradas todavía.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activityEntries.map((entry) => (
              <article
                key={entry.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                  background: '#f8fafc'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '1rem', color: '#0f172a' }}>
                    {entry.type === 'sitemap' ? 'Sitemap batch' : 'Algolia batch'}
                  </strong>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Finalizado: {formatDateTime(entry.finished_at)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                  <NumericMetric label="Requested" value={entry.requested} />
                  <NumericMetric label="Processed" value={entry.processed} />
                  <NumericMetric label="Success" value={entry.success} />
                  <NumericMetric label="Skipped" value={entry.skipped} />
                  <NumericMetric label="Errors" value={entry.errors} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Duración
                    </span>
                    <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>
                      {formatDuration(entry.duration_ms)}
                    </strong>
                  </div>
                </div>
                {entry.message ? (
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a' }}>{entry.message}</p>
                ) : null}
                {entry.metadata ? (
                  <pre
                    style={{
                      margin: 0,
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '0.75rem',
                      fontSize: '0.8rem',
                      overflowX: 'auto'
                    }}
                  >
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                ) : null}
                {entry.errors > 0 ? (
                  <a
                    href={`/api/admin/publishing/activity/${entry.id}/errors.csv`}
                    style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600 }}
                  >
                    Download errors (CSV)
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
