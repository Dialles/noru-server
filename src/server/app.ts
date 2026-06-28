import type { Env, Tenant } from './types';
import { requireAdmin, loginAdmin, logoutAdmin } from './auth';
import { hashPassword, sha256Base64Url, timingSafeEqualString } from './crypto';
import { handleError, HttpError, json, options, readJsonBody, requireMethod } from './http';
import { allowedStatus, assertEmail, assertSlug, asBoolean, asInteger, asString } from './validators';

const DEFAULT_SETTINGS = {
  review_min_rating: 4,
  google_review_url: '',
  tripadvisor_review_url: '',
  instagram_url: '',
  whatsapp_url: '',
  public_page_url: '',
  stable_qr_url: '',
  public_message: 'Obrigado por compartilhar sua experiência.',
  negative_message: 'Obrigado pelo feedback. A equipe irá analisar com atenção.',
  questions: [
    { id: 'food', label: 'Comida', type: 'rating' },
    { id: 'service', label: 'Atendimento', type: 'rating' },
    { id: 'ambience', label: 'Ambiente', type: 'rating' },
    { id: 'wait_time', label: 'Tempo de espera', type: 'rating' },
  ],
};

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return options(request, env);

  try {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (path === '/health') return await health(request, env);
    if (path === '/feedback/config') return await feedbackConfig(request, env);
    if (path === '/feedback') return await submitFeedback(request, env);
    if (path === '/feedback/click') return await registerReviewClick(request, env);

    if (path === '/admin/setup') return await setupAdmin(request, env);
    if (path === '/admin/auth/login') return await adminLogin(request, env);
    if (path === '/admin/auth/logout') return await adminLogout(request, env);
    if (path === '/admin/me') return await adminMe(request, env);
    if (path === '/admin/dashboard') return await adminDashboard(request, env);
    if (path === '/admin/feedback') return await adminFeedbackList(request, env);
    if (path === '/admin/settings') return await adminSettings(request, env);

    const feedbackMatch = path.match(/^\/admin\/feedback\/([a-zA-Z0-9_-]+)$/);
    if (feedbackMatch) return await adminFeedbackDetail(request, env, feedbackMatch[1]);

    throw new HttpError(404, 'not_found', 'Rota não encontrada.');
  } catch (error) {
    return handleError(error, request, env);
  }
}

function normalizePath(pathname: string): string {
  const path = pathname.replace(/^\/api/, '') || '/';
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

// Parser tolerante para parâmetros numéricos de query string: valores ausentes
// ou inválidos (NaN) caem no default em vez de gerar 500/consulta sem limite.
function intParam(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

async function health(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'GET');

  let database = 'ok';
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
  } catch {
    database = 'error';
  }

  const ok = database === 'ok';
  return json({
    ok,
    service: 'noru-reviews-api',
    runtime: 'cloudflare-workers',
    database,
    timestamp: new Date().toISOString(),
  }, ok ? 200 : 503, request, env);
}

async function feedbackConfig(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'GET');
  const url = new URL(request.url);
  const tenant = await resolveTenant(env, url.searchParams.get('tenant') || undefined);
  const settings = await getSettings(env, tenant.id);

  return json({
    ok: true,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    settings: publicSettings(settings, env),
  }, 200, request, env);
}

async function submitFeedback(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'POST');
  const body = await readJsonBody(request);
  const tenant = await resolveTenant(env, asString(body.tenant_slug, 'tenant_slug'));
  const settings = await getSettings(env, tenant.id);

  const rating = asInteger(body.rating, 'rating', { required: true, min: 1, max: 5 })!;
  const customerName = asString(body.customer_name, 'customer_name', { max: 120 });
  const customerPhone = asString(body.customer_phone, 'customer_phone', { max: 40 });
  const customerEmail = assertEmail(asString(body.customer_email, 'customer_email', { max: 160 }), 'customer_email');
  const comment = asString(body.comment, 'comment', { max: 2000 });
  const visitDate = asString(body.visit_date, 'visit_date', { max: 32 });
  const tableCode = asString(body.table_code, 'table_code', { max: 64 });
  const contactPermission = asBoolean(body.contact_permission);
  const questionScores = normalizeJsonObject(body.question_scores, 'question_scores');
  const metadata = buildRequestMetadata(request, env);
  const minRating = Number(settings.review_min_rating || env.PUBLIC_REVIEW_MIN_RATING || DEFAULT_SETTINGS.review_min_rating);
  const status = rating >= minRating ? 'promoter' : 'needs_attention';
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO feedbacks (
      id, tenant_id, rating, comment, customer_name, customer_phone, customer_email,
      visit_date, table_code, contact_permission, question_scores_json, metadata_json,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    tenant.id,
    rating,
    comment || null,
    customerName || null,
    customerPhone || null,
    customerEmail || null,
    visitDate || null,
    tableCode || null,
    contactPermission ? 1 : 0,
    JSON.stringify(questionScores || {}),
    JSON.stringify(await metadata),
    status,
    now,
    now,
  ).run();

  return json({
    ok: true,
    feedback_id: id,
    next_action: rating >= minRating ? 'external_review' : 'internal_follow_up',
    message: rating >= minRating ? settings.public_message : settings.negative_message,
    platforms: rating >= minRating ? reviewPlatforms(settings) : [],
  }, 201, request, env);
}

async function registerReviewClick(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'POST');
  const body = await readJsonBody(request);
  const tenant = await resolveTenant(env, asString(body.tenant_slug, 'tenant_slug'));
  const feedbackId = asString(body.feedback_id, 'feedback_id', { max: 64 });
  const platform = asString(body.platform, 'platform', { required: true, max: 40 })!;
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO review_clicks (id, tenant_id, feedback_id, platform, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    tenant.id,
    feedbackId || null,
    platform,
    JSON.stringify(await buildRequestMetadata(request, env)),
    now,
  ).run();

  return json({ ok: true }, 201, request, env);
}

async function setupAdmin(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'POST');
  if (!env.SETUP_TOKEN) throw new HttpError(500, 'setup_token_missing', 'Configure SETUP_TOKEN antes de criar o admin inicial.');

  // Compara sem espaços/quebras nas pontas: o cliente já envia o token com
  // trim(), e segredos colados no painel da Cloudflare costumam vir com um
  // \n/espaço final que, sem isso, gera um 403 "token inválido" enganoso.
  const expectedToken = env.SETUP_TOKEN.trim();
  const body = await readJsonBody(request);
  const providedToken = (request.headers.get('x-setup-token') || asString(body.setup_token, 'setup_token') || '').trim();
  if (!(await timingSafeEqualString(providedToken, expectedToken))) throw new HttpError(403, 'forbidden', 'Token de setup inválido.');

  const count = await adminCount(env);
  if (count > 0) throw new HttpError(409, 'setup_already_done', 'O admin inicial já foi criado.');

  const tenantSlug = assertSlug(asString(body.tenant_slug, 'tenant_slug') || env.PUBLIC_TENANT_SLUG || 'noru');
  const tenantName = asString(body.tenant_name, 'tenant_name', { max: 120 }) || 'Noru Sushi Lounge';
  const email = assertEmail(asString(body.email, 'email', { required: true, max: 160 }), 'email')!;
  const password = asString(body.password, 'password', { required: true, min: 10, max: 160 })!;
  const name = asString(body.name, 'name', { max: 120 }) || 'Administrador';
  const now = new Date().toISOString();
  const tenantId = `tenant_${tenantSlug}`;

  await env.DB.prepare(`
    INSERT OR IGNORE INTO tenants (id, slug, name, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `).bind(tenantId, tenantSlug, tenantName, now, now).run();

  await env.DB.prepare(`
    INSERT INTO admins (id, tenant_id, email, name, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'owner', 1, ?, ?)
  `).bind(crypto.randomUUID(), tenantId, email, name, await hashPassword(password), now, now).run();

  await writeAudit(env, tenantId, null, 'admin.setup', { email });

  return json({ ok: true, tenant: { id: tenantId, slug: tenantSlug, name: tenantName }, admin: { email, name, role: 'owner' } }, 201, request, env);
}

async function adminLogin(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'POST');
  if ((await adminCount(env)) === 0) {
    throw new HttpError(409, 'setup_required', 'Crie o admin inicial usando /api/admin/setup.');
  }

  const body = await readJsonBody(request);
  const email = assertEmail(asString(body.email, 'email', { required: true, max: 160 }), 'email')!;
  const password = asString(body.password, 'password', { required: true, max: 160 })!;
  const result = await loginAdmin(env, email, password);
  const headers = new Headers({ 'set-cookie': result.cookie });

  return json({ ok: true, admin: result.admin, expires_at: result.expires_at }, 200, request, env, headers);
}

async function adminLogout(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'POST');
  const cookie = await logoutAdmin(request, env);
  return json({ ok: true }, 200, request, env, { 'set-cookie': cookie });
}

async function adminMe(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'GET');
  const auth = await requireAdmin(request, env);
  return json({ ok: true, admin: auth.admin }, 200, request, env);
}

async function adminDashboard(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'GET');
  const auth = await requireAdmin(request, env);
  const url = new URL(request.url);
  const days = intParam(url.searchParams.get('days'), 30, 1, 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Usa o mesmo corte configurável (review_min_rating) aplicado na gravação do
  // feedback, para que o dashboard não divirja do status real armazenado.
  const settings = await getSettings(env, auth.admin.tenant_id);
  const minRating = Number(settings.review_min_rating || env.PUBLIC_REVIEW_MIN_RATING || DEFAULT_SETTINGS.review_min_rating);

  const metrics = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      AVG(rating) AS average_rating,
      SUM(CASE WHEN rating >= ? THEN 1 ELSE 0 END) AS promoters,
      SUM(CASE WHEN rating < ? THEN 1 ELSE 0 END) AS needs_attention,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
    FROM feedbacks
    WHERE tenant_id = ? AND created_at >= ?
  `).bind(minRating, minRating, auth.admin.tenant_id, since).first<{
    total: number;
    average_rating: number | null;
    promoters: number | null;
    needs_attention: number | null;
    resolved: number | null;
  }>();

  const distribution = await env.DB.prepare(`
    SELECT rating, COUNT(*) AS total
    FROM feedbacks
    WHERE tenant_id = ? AND created_at >= ?
    GROUP BY rating
    ORDER BY rating ASC
  `).bind(auth.admin.tenant_id, since).all();

  const clicks = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM review_clicks
    WHERE tenant_id = ? AND created_at >= ?
  `).bind(auth.admin.tenant_id, since).first<{ total: number }>();

  const recent = await env.DB.prepare(`
    SELECT id, rating, status, customer_name, table_code, comment, created_at
    FROM feedbacks
    WHERE tenant_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).bind(auth.admin.tenant_id).all();

  return json({
    ok: true,
    period_days: days,
    metrics: normalizeDashboardMetrics(metrics, clicks),
    distribution: distribution.results,
    recent: recent.results,
  }, 200, request, env);
}


function normalizeDashboardMetrics(metrics: { total: number; average_rating: number | null; promoters: number | null; needs_attention: number | null; resolved: number | null } | null, clicks: { total: number } | null): Record<string, number> {
  return {
    total: Number(metrics?.total || 0),
    average_rating: Number(metrics?.average_rating || 0),
    promoters: Number(metrics?.promoters || 0),
    needs_attention: Number(metrics?.needs_attention || 0),
    resolved: Number(metrics?.resolved || 0),
    review_clicks: Number(clicks?.total || 0),
  };
}

async function adminFeedbackList(request: Request, env: Env): Promise<Response> {
  requireMethod(request, 'GET');
  const auth = await requireAdmin(request, env);
  const url = new URL(request.url);
  const limit = intParam(url.searchParams.get('limit'), 30, 1, 100);
  const offset = intParam(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  const status = url.searchParams.get('status');
  const rating = url.searchParams.get('rating');

  const where = ['tenant_id = ?'];
  const binds: unknown[] = [auth.admin.tenant_id];

  if (status) {
    where.push('status = ?');
    binds.push(allowedStatus(status));
  }

  if (rating) {
    where.push('rating = ?');
    binds.push(asInteger(rating, 'rating', { min: 1, max: 5 })!);
  }

  const rows = await env.DB.prepare(`
    SELECT id, rating, status, customer_name, customer_phone, customer_email, comment, visit_date, table_code, created_at, updated_at
    FROM feedbacks
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all();

  const count = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM feedbacks
    WHERE ${where.join(' AND ')}
  `).bind(...binds).first<{ total: number }>();

  return json({ ok: true, limit, offset, total: Number(count?.total || 0), feedbacks: rows.results }, 200, request, env);
}

async function adminFeedbackDetail(request: Request, env: Env, feedbackId: string): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (request.method === 'GET') {
    const feedback = await env.DB.prepare(`
      SELECT * FROM feedbacks WHERE id = ? AND tenant_id = ? LIMIT 1
    `).bind(feedbackId, auth.admin.tenant_id).first();
    if (!feedback) throw new HttpError(404, 'not_found', 'Feedback não encontrado.');
    return json({ ok: true, feedback }, 200, request, env);
  }

  if (request.method === 'PATCH') {
    const body = await readJsonBody(request);
    const status = allowedStatus(asString(body.status, 'status', { required: true })!);
    const internalNote = asString(body.internal_note, 'internal_note', { max: 2000 });
    const now = new Date().toISOString();

    const result = await env.DB.prepare(`
      UPDATE feedbacks
      SET status = ?, internal_note = COALESCE(?, internal_note), updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(status, internalNote || null, now, feedbackId, auth.admin.tenant_id).run();

    if (result.meta.changes === 0) throw new HttpError(404, 'not_found', 'Feedback não encontrado.');
    await writeAudit(env, auth.admin.tenant_id, auth.admin.id, 'feedback.update', { feedback_id: feedbackId, status });
    return json({ ok: true }, 200, request, env);
  }

  throw new HttpError(405, 'method_not_allowed', 'Use GET ou PATCH para esta rota.');
}

async function adminSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (request.method === 'GET') {
    const settings = await getSettings(env, auth.admin.tenant_id);
    return json({ ok: true, settings }, 200, request, env);
  }

  if (request.method === 'PATCH') {
    const body = await readJsonBody(request);
    const allowedKeys = new Set(['review_min_rating', 'google_review_url', 'tripadvisor_review_url', 'instagram_url', 'whatsapp_url', 'public_page_url', 'stable_qr_url', 'public_message', 'negative_message', 'questions']);
    const now = new Date().toISOString();

    // Valida tudo antes de gravar e aplica em um único batch, para que uma
    // chave inválida não deixe um conjunto parcial persistido.
    const updates = Object.entries(body).filter(([key]) => allowedKeys.has(key));
    for (const [key, value] of updates) {
      validateSetting(key, value);
    }

    if (updates.length > 0) {
      const stmt = env.DB.prepare(`
        INSERT INTO settings (tenant_id, key, value_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `);
      await env.DB.batch(updates.map(([key, value]) => stmt.bind(auth.admin.tenant_id, key, JSON.stringify(value), now, now)));
    }

    const changed = updates.map(([key]) => key);
    await writeAudit(env, auth.admin.tenant_id, auth.admin.id, 'settings.update', { changed });
    return json({ ok: true, changed, settings: await getSettings(env, auth.admin.tenant_id) }, 200, request, env);
  }

  throw new HttpError(405, 'method_not_allowed', 'Use GET ou PATCH para esta rota.');
}

async function resolveTenant(env: Env, slug?: string): Promise<Tenant> {
  const targetSlug = assertSlug(slug || env.PUBLIC_TENANT_SLUG || 'noru');
  const tenant = await env.DB.prepare('SELECT id, slug, name, is_active FROM tenants WHERE slug = ? AND is_active = 1 LIMIT 1').bind(targetSlug).first<Tenant>();
  if (!tenant) throw new HttpError(404, 'tenant_not_found', 'Tenant não encontrado.');
  return tenant;
}

async function getSettings(env: Env, tenantId: string): Promise<Record<string, unknown>> {
  const rows = await env.DB.prepare('SELECT key, value_json FROM settings WHERE tenant_id = ?').bind(tenantId).all<{ key: string; value_json: string }>();
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  for (const row of rows.results || []) {
    try {
      settings[row.key] = JSON.parse(row.value_json);
    } catch {
      settings[row.key] = row.value_json;
    }
  }

  if (!settings.review_min_rating && env.PUBLIC_REVIEW_MIN_RATING) {
    settings.review_min_rating = Number(env.PUBLIC_REVIEW_MIN_RATING);
  }

  return settings;
}

function publicSettings(settings: Record<string, unknown>, env: Env): Record<string, unknown> {
  return {
    review_min_rating: Number(settings.review_min_rating || env.PUBLIC_REVIEW_MIN_RATING || DEFAULT_SETTINGS.review_min_rating),
    public_message: settings.public_message,
    negative_message: settings.negative_message,
    questions: settings.questions,
    whatsapp_url: String(settings.whatsapp_url || ''),
    public_page_url: String(settings.public_page_url || ''),
    stable_qr_url: String(settings.stable_qr_url || ''),
    platforms: reviewPlatforms(settings),
  };
}

function reviewPlatforms(settings: Record<string, unknown>): Array<{ id: string; label: string; url: string }> {
  const platforms = [
    { id: 'google', label: 'Google', url: String(settings.google_review_url || '') },
    { id: 'tripadvisor', label: 'Tripadvisor', url: String(settings.tripadvisor_review_url || '') },
    { id: 'instagram', label: 'Instagram', url: String(settings.instagram_url || '') },
  ];
  return platforms.filter((platform) => platform.url.length > 0);
}

function normalizeJsonObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'validation_error', `Campo inválido: ${field}`);
  return value as Record<string, unknown>;
}

async function buildRequestMetadata(request: Request, env: Env): Promise<Record<string, unknown>> {
  const userAgent = request.headers.get('user-agent') || '';
  const country = request.headers.get('cf-ipcountry') || '';
  const ip = request.headers.get('cf-connecting-ip') || '';
  const salt = env.HASH_SALT || env.SETUP_TOKEN || 'noru-reviews';

  return {
    ip_hash: ip ? await sha256Base64Url(`${salt}:${ip}`) : null,
    country,
    user_agent: userAgent.slice(0, 300),
  };
}

async function adminCount(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM admins').first<{ total: number }>();
  return Number(row?.total || 0);
}

function validateSetting(key: string, value: unknown): void {
  if (key === 'review_min_rating') {
    asInteger(value, key, { min: 1, max: 5 });
  }

  if (['google_review_url', 'tripadvisor_review_url', 'instagram_url', 'whatsapp_url', 'public_page_url', 'stable_qr_url'].includes(key) && value !== '') {
    const raw = asString(value, key, { max: 500 });
    if (raw && !/^https?:\/\//.test(raw)) throw new HttpError(400, 'validation_error', `${key} deve começar com http:// ou https://`);
  }

  if (['public_message', 'negative_message'].includes(key)) {
    asString(value, key, { max: 500 });
  }

  if (key === 'questions' && !Array.isArray(value)) {
    throw new HttpError(400, 'validation_error', 'questions deve ser uma lista.');
  }
}

async function writeAudit(env: Env, tenantId: string, adminId: string | null, action: string, payload: Record<string, unknown>): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, tenant_id, admin_id, action, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), tenantId, adminId, action, JSON.stringify(payload), new Date().toISOString()).run();
}
