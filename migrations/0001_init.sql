PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO tenants (id, slug, name, is_active, created_at, updated_at)
VALUES ('tenant_noru', 'noru', 'Noru Sushi Lounge', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO settings (tenant_id, key, value_json, created_at, updated_at)
VALUES
  ('tenant_noru', 'review_min_rating', '4', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('tenant_noru', 'google_review_url', '"https://www.google.com/search?q=NORU+Sushi+Lounge+Google+Avalia%C3%A7%C3%A3o"', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('tenant_noru', 'tripadvisor_review_url', '"https://www.tripadvisor.com.br/UserReviewEdit-g303322-d24036991-Noru_Sushi_Noroeste-Brasilia_Federal_District.html"', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('tenant_noru', 'whatsapp_url', '"https://wa.me/5561992760230"', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('tenant_noru', 'public_page_url', '"/client/?tenant=noru"', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('tenant_noru', 'stable_qr_url', '"/client/?tenant=noru"', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('tenant_noru', 'public_message', '"Obrigado por compartilhar sua experiência."', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('tenant_noru', 'negative_message', '"Obrigado pelo feedback. A equipe irá analisar com atenção."', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE IF NOT EXISTS feedbacks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  visit_date TEXT,
  table_code TEXT,
  contact_permission INTEGER NOT NULL DEFAULT 0,
  question_scores_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'needs_attention', 'contacted', 'resolved', 'archived', 'promoter')),
  internal_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_created ON feedbacks(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_status ON feedbacks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_rating ON feedbacks(tenant_id, rating);

CREATE TABLE IF NOT EXISTS review_clicks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  feedback_id TEXT,
  platform TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (feedback_id) REFERENCES feedbacks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_review_clicks_tenant_created ON review_clicks(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_clicks_feedback ON review_clicks(feedback_id);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'viewer')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admins_tenant ON admins(tenant_id);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  admin_id TEXT,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);
