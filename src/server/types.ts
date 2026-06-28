export interface Env {
  DB: D1Database;
  SETUP_TOKEN?: string;
  HASH_SALT?: string;
  PUBLIC_TENANT_SLUG?: string;
  SESSION_COOKIE_NAME?: string;
  ADMIN_SESSION_DAYS?: string;
  PUBLIC_REVIEW_MIN_RATING?: string;
  ALLOWED_ORIGINS?: string;
  COOKIE_SECURE?: string;
}

export type JsonRecord = Record<string, unknown>;

export interface AdminContext {
  sessionId: string;
  admin: {
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: string;
  };
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  is_active: number;
}
