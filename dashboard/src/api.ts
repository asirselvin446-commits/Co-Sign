// Minimal API client for the security console. The access token lives only in memory; the refresh
// token is an httpOnly, SameSite=Strict cookie scoped to /v1/admin/auth.

export interface ApiErrorBody {
  code: string;
  cause: string;
  next: string;
  params?: Record<string, string | number>;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.cause);
  }
}

export interface AdminProfile {
  id: string;
  handle: string;
  displayName: string;
  role: 'admin' | 'analyst';
}

export interface AdminSession {
  accessToken: string;
  accessTokenExpiresIn: number;
  admin: AdminProfile;
}

let accessToken: string | null = null;
let refreshing: Promise<AdminSession | null> | null = null;
let onSessionChange: (s: AdminSession | null) => void = () => {};

export function setSessionListener(fn: (s: AdminSession | null) => void): void {
  onSessionChange = fn;
}

export function currentToken(): string | null {
  return accessToken;
}

export function applySession(s: AdminSession | null): void {
  accessToken = s?.accessToken ?? null;
  onSessionChange(s);
}

const baseHeaders = { 'x-requested-with': 'cosign-dashboard' } as const;

async function raw(method: string, path: string, body?: unknown, token?: string | null): Promise<Response> {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...baseHeaders,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? { code: 'INTERNAL_ERROR', cause: 'Unexpected response.', next: 'Try again.' });
  }
  return data as T;
}

/** Restore or extend the session from the refresh cookie. Concurrent callers share one request. */
export function refreshSession(): Promise<AdminSession | null> {
  if (!refreshing) {
    refreshing = raw('POST', '/v1/admin/auth/refresh')
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as AdminSession;
      })
      .catch(() => null)
      .then((s) => {
        applySession(s);
        return s;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await raw(method, path, body, accessToken);
  if (res.status === 401 && !path.startsWith('/v1/admin/auth/')) {
    const s = await refreshSession();
    if (s) res = await raw(method, path, body, s.accessToken);
  }
  return parse<T>(res);
}

export async function apiText(path: string): Promise<string> {
  let res = await raw('GET', path, undefined, accessToken);
  if (res.status === 401) {
    const s = await refreshSession();
    if (s) res = await raw('GET', path, undefined, s.accessToken);
  }
  if (!res.ok) await parse(res);
  return res.text();
}

export async function publicApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  return parse<T>(await raw(method, path, body));
}
