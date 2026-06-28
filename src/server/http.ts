import type { Env, JsonRecord } from './types';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json(data: unknown, status = 200, request?: Request, env?: Env, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  setSecurityHeaders(headers);
  setCorsHeaders(headers, request, env);
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

export function empty(status = 204, request?: Request, env?: Env, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  setSecurityHeaders(headers);
  setCorsHeaders(headers, request, env);
  return new Response(null, { status, headers });
}

export function options(request: Request, env: Env): Response {
  const headers = new Headers();
  setSecurityHeaders(headers);
  setCorsHeaders(headers, request, env);
  headers.set('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, authorization, x-setup-token');
  headers.set('access-control-max-age', '86400');
  return new Response(null, { status: 204, headers });
}

export function handleError(error: unknown, request: Request, env: Env): Response {
  if (error instanceof HttpError) {
    return json({ ok: false, error: { code: error.code, message: error.message, details: error.details } }, error.status, request, env);
  }

  console.error(error);
  return json({ ok: false, error: { code: 'internal_error', message: 'Erro interno no servidor.' } }, 500, request, env);
}

export async function readJsonBody<T extends JsonRecord = JsonRecord>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Envie o corpo da requisição em JSON.');
  }

  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON inválido.');
  }
}

export function requireMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new HttpError(405, 'method_not_allowed', `Use ${method} para esta rota.`);
  }
}

export function getCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get('cookie');
  if (!cookie) return undefined;

  for (const item of cookie.split(';')) {
    const [rawName, ...rawValue] = item.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }

  return undefined;
}

export function sessionCookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME || 'noru_admin_session';
}

export function buildSessionCookie(env: Env, token: string, expiresAt: string): string {
  const name = sessionCookieName(env);
  const expires = new Date(expiresAt).toUTCString();
  const secure = env.COOKIE_SECURE === 'false' ? '' : '; Secure';
  return `${name}=${encodeURIComponent(token)}; Expires=${expires}; Path=/; HttpOnly${secure}; SameSite=Lax`;
}

export function clearSessionCookie(env: Env): string {
  const name = sessionCookieName(env);
  const secure = env.COOKIE_SECURE === 'false' ? '' : '; Secure';
  return `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly${secure}; SameSite=Lax`;
}

function setSecurityHeaders(headers: Headers): void {
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

function setCorsHeaders(headers: Headers, request?: Request, env?: Env): void {
  const origin = request?.headers.get('origin');
  if (!origin || !env?.ALLOWED_ORIGINS) return;

  const allowed = env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean);
  if (allowed.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
    headers.append('vary', 'Origin');
  }
}
