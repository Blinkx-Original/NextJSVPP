interface AxiosRequestConfig {
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

interface AxiosResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

function buildUrl(url: string, params: AxiosRequestConfig['params']): string {
  if (!params || Object.keys(params).length === 0) {
    return url;
  }
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  if (!query) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${query}`;
}

async function get<T>(url: string, config: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
  const requestUrl = buildUrl(url, config.params);
  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: config.headers,
    signal: config.signal
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : ({} as unknown);
  } catch {
    data = text as unknown;
  }
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    throw error;
  }
  return {
    data: data as T,
    status: response.status,
    statusText: response.statusText,
    headers
  };
}

const axios = { get };

export type { AxiosRequestConfig, AxiosResponse };
export default axios;
