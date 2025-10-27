export interface AdminApiClientOptions {
  authHeader?: string | null;
  adminToken?: string | null;
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return String(input);
}

function resolveUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === 'string') {
      if (typeof window !== 'undefined') {
        return new URL(input, window.location.origin);
      }
      return new URL(input, 'http://localhost');
    }
    if (input instanceof URL) {
      return new URL(input.toString());
    }
    return null;
  } catch {
    return null;
  }
}

export interface AdminApiClient {
  authHeader: string | null;
  adminToken: string | null;
  applyAuthHeaders: (additional?: HeadersInit) => Headers;
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  withAdminToken: (input: RequestInfo | URL) => string;
  attachAuthHeadersToXhr: (xhr: XMLHttpRequest) => void;
}

export function createAdminApiClient(options: AdminApiClientOptions): AdminApiClient {
  const authHeaderValue = options.authHeader?.trim() || null;
  const adminTokenValue = options.adminToken?.trim() || null;

  const applyAuthHeaders = (additional?: HeadersInit) => {
    const headers = new Headers();

    if (additional) {
      const additionalHeaders = new Headers(additional);
      additionalHeaders.forEach((value, key) => {
        headers.set(key, value);
      });
    }

    if (authHeaderValue) {
      headers.set('Authorization', authHeaderValue);
    }

    if (adminTokenValue) {
      headers.set('X-Admin-Token', adminTokenValue);
    }

    return headers;
  };

  const withAdminToken = (input: RequestInfo | URL) => {
    if (!adminTokenValue) {
      return toUrlString(input);
    }

    const url = resolveUrl(input);
    if (!url) {
      return toUrlString(input);
    }

    url.searchParams.set('adminToken', adminTokenValue);
    return url.toString();
  };

  const fetchWithAuth = (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = applyAuthHeaders(init?.headers);
    const finalInput = withAdminToken(input);

    return fetch(finalInput, {
      ...init,
      headers,
      credentials: 'include',
      mode: 'same-origin'
    });
  };

  const attachAuthHeadersToXhr = (xhr: XMLHttpRequest) => {
    if (authHeaderValue) {
      xhr.setRequestHeader('Authorization', authHeaderValue);
    }
    if (adminTokenValue) {
      xhr.setRequestHeader('X-Admin-Token', adminTokenValue);
    }
  };

  return {
    authHeader: authHeaderValue,
    adminToken: adminTokenValue,
    applyAuthHeaders,
    fetchWithAuth,
    withAdminToken,
    attachAuthHeadersToXhr
  };
}
