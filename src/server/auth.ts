import type { AdminContext, Env } from './types';
import { buildSessionCookie, clearSessionCookie, getCookie, HttpError, sessionCookieName } from './http';
import { DUMMY_PASSWORD_HASH, randomToken, sha256Base64Url, verifyPassword } from './crypto';

export async function requireAdmin(request: Request, env: Env): Promise<AdminContext> {
  const token = getCookie(request, sessionCookieName(env));
  if (!token) throw new HttpError(401, 'unauthorized', 'Sessão ausente. Faça login novamente.');

  const tokenHash = await sha256Base64Url(token);
  const now = new Date().toISOString();

  const row = await env.DB.prepare(`
    SELECT
      s.id AS session_id,
      a.id AS admin_id,
      a.tenant_id,
      a.email,
      a.name,
      a.role
    FROM admin_sessions s
    INNER JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND a.is_active = 1
    LIMIT 1
  `).bind(tokenHash, now).first<{
    session_id: string;
    admin_id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: string;
  }>();

  if (!row) throw new HttpError(401, 'unauthorized', 'Sessão expirada ou inválida.');

  await env.DB.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?').bind(now, row.session_id).run();

  return {
    sessionId: row.session_id,
    admin: {
      id: row.admin_id,
      tenant_id: row.tenant_id,
      email: row.email,
      name: row.name,
      role: row.role,
    },
  };
}

export async function loginAdmin(env: Env, email: string, password: string): Promise<{ cookie: string; admin: AdminContext['admin']; expires_at: string }> {
  const admin = await env.DB.prepare(`
    SELECT id, tenant_id, email, name, role, password_hash
    FROM admins
    WHERE lower(email) = lower(?) AND is_active = 1
    LIMIT 1
  `).bind(email).first<{ id: string; tenant_id: string; email: string; name: string; role: string; password_hash: string }>();

  // Sempre executa o PBKDF2 (contra um hash descartável quando o e-mail não
  // existe) para que o tempo de resposta não revele se a conta existe.
  const passwordOk = await verifyPassword(password, admin?.password_hash || DUMMY_PASSWORD_HASH);
  if (!admin || !passwordOk) {
    throw new HttpError(401, 'invalid_credentials', 'E-mail ou senha inválidos.');
  }

  const token = randomToken(32);
  const tokenHash = await sha256Base64Url(token);
  const parsedDays = Number(env.ADMIN_SESSION_DAYS);
  const days = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7;
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(days, 30)) * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO admin_sessions (id, admin_id, token_hash, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sessionId, admin.id, tokenHash, now, now, expiresAt).run();

  await env.DB.prepare('UPDATE admins SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now, now, admin.id).run();

  return {
    cookie: buildSessionCookie(env, token, expiresAt),
    expires_at: expiresAt,
    admin: {
      id: admin.id,
      tenant_id: admin.tenant_id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  };
}

export async function logoutAdmin(request: Request, env: Env): Promise<string> {
  const token = getCookie(request, sessionCookieName(env));
  if (token) {
    const tokenHash = await sha256Base64Url(token);
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  return clearSessionCookie(env);
}
