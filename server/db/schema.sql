-- ============================================================
--  Kingdom Journeys — SQLite schema
--  Idempotent: safe to run on every boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name            TEXT    NOT NULL,
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  must_change_pw  INTEGER NOT NULL DEFAULT 0 CHECK (must_change_pw IN (0, 1)),
  last_login_at   TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT    PRIMARY KEY,
  token_hash   TEXT    NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_agent   TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS destinations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT    NOT NULL UNIQUE,
  name_ar        TEXT    NOT NULL,
  name_en        TEXT    NOT NULL,
  region_ar      TEXT    NOT NULL DEFAULT '',
  region_en      TEXT    NOT NULL DEFAULT '',
  tagline_ar     TEXT    NOT NULL DEFAULT '',
  tagline_en     TEXT    NOT NULL DEFAULT '',
  description_ar TEXT    NOT NULL DEFAULT '',
  description_en TEXT    NOT NULL DEFAULT '',
  image          TEXT    NOT NULL DEFAULT '',
  best_season_ar TEXT    NOT NULL DEFAULT '',
  best_season_en TEXT    NOT NULL DEFAULT '',
  highlights     TEXT    NOT NULL DEFAULT '[]',
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_destinations_active ON destinations (active, sort_order);

CREATE TABLE IF NOT EXISTS packages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT    NOT NULL UNIQUE,
  destination_id INTEGER REFERENCES destinations (id) ON DELETE SET NULL,
  title_ar       TEXT    NOT NULL,
  title_en       TEXT    NOT NULL,
  summary_ar     TEXT    NOT NULL DEFAULT '',
  summary_en     TEXT    NOT NULL DEFAULT '',
  description_ar TEXT    NOT NULL DEFAULT '',
  description_en TEXT    NOT NULL DEFAULT '',
  region_ar      TEXT    NOT NULL DEFAULT '',
  region_en      TEXT    NOT NULL DEFAULT '',
  days           INTEGER NOT NULL DEFAULT 1 CHECK (days BETWEEN 1 AND 60),
  nights         INTEGER NOT NULL DEFAULT 0 CHECK (nights BETWEEN 0 AND 60),
  price_sar      INTEGER NOT NULL DEFAULT 0 CHECK (price_sar >= 0),
  old_price_sar  INTEGER CHECK (old_price_sar IS NULL OR old_price_sar >= 0),
  group_size     INTEGER NOT NULL DEFAULT 12 CHECK (group_size BETWEEN 1 AND 200),
  difficulty     TEXT    NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy', 'moderate', 'active')),
  category       TEXT    NOT NULL DEFAULT 'guided' CHECK (category IN ('guided', 'family', 'adventure', 'luxury', 'honeymoon', 'umrah-plus')),
  rating         REAL    NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  reviews_count  INTEGER NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  image          TEXT    NOT NULL DEFAULT '',
  gallery        TEXT    NOT NULL DEFAULT '[]',
  highlights     TEXT    NOT NULL DEFAULT '{"ar":[],"en":[]}',
  includes       TEXT    NOT NULL DEFAULT '{"ar":[],"en":[]}',
  excludes       TEXT    NOT NULL DEFAULT '{"ar":[],"en":[]}',
  itinerary      TEXT    NOT NULL DEFAULT '[]',
  featured       INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_packages_active ON packages (active, featured, sort_order);
CREATE INDEX IF NOT EXISTS idx_packages_destination ON packages (destination_id);

CREATE TABLE IF NOT EXISTS testimonials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  city_ar     TEXT    NOT NULL DEFAULT '',
  city_en     TEXT    NOT NULL DEFAULT '',
  rating      INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  text_ar     TEXT    NOT NULL DEFAULT '',
  text_en     TEXT    NOT NULL DEFAULT '',
  package_id  INTEGER REFERENCES packages (id) ON DELETE SET NULL,
  trip_date   TEXT    NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_testimonials_active ON testimonials (active, sort_order);

CREATE TABLE IF NOT EXISTS faqs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_ar TEXT    NOT NULL,
  question_en TEXT    NOT NULL,
  answer_ar   TEXT    NOT NULL DEFAULT '',
  answer_en   TEXT    NOT NULL DEFAULT '',
  topic       TEXT    NOT NULL DEFAULT 'general',
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT    NOT NULL UNIQUE,
  package_id        INTEGER REFERENCES packages (id) ON DELETE SET NULL,
  package_snapshot  TEXT    NOT NULL DEFAULT '{}',
  full_name         TEXT    NOT NULL,
  email             TEXT    NOT NULL COLLATE NOCASE,
  phone             TEXT    NOT NULL DEFAULT '',
  country           TEXT    NOT NULL DEFAULT '',
  adults            INTEGER NOT NULL DEFAULT 1 CHECK (adults BETWEEN 1 AND 40),
  children          INTEGER NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 40),
  travelers         INTEGER NOT NULL DEFAULT 1 CHECK (travelers BETWEEN 1 AND 80),
  travel_date       TEXT,
  preferred_contact TEXT    NOT NULL DEFAULT 'email' CHECK (preferred_contact IN ('email', 'phone', 'whatsapp')),
  notes             TEXT    NOT NULL DEFAULT '',
  total_sar         INTEGER NOT NULL DEFAULT 0 CHECK (total_sar >= 0),
  status            TEXT    NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'confirmed', 'cancelled', 'completed')),
  lang              TEXT    NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar', 'en')),
  admin_notes       TEXT    NOT NULL DEFAULT '',
  ip_hash           TEXT    NOT NULL DEFAULT '',
  user_agent        TEXT    NOT NULL DEFAULT '',
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (email);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL COLLATE NOCASE,
  phone      TEXT    NOT NULL DEFAULT '',
  subject    TEXT    NOT NULL DEFAULT '',
  topic      TEXT    NOT NULL DEFAULT 'general',
  body       TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived', 'spam')),
  lang       TEXT    NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar', 'en')),
  ip_hash    TEXT    NOT NULL DEFAULT '',
  user_agent TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages (status, created_at DESC);

CREATE TABLE IF NOT EXISTS subscribers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  lang        TEXT    NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar', 'en')),
  ip_hash     TEXT    NOT NULL DEFAULT '',
  confirmed   INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0, 1)),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   INTEGER,
  actor      TEXT    NOT NULL DEFAULT 'anonymous',
  action     TEXT    NOT NULL,
  entity     TEXT    NOT NULL DEFAULT '',
  entity_id  TEXT    NOT NULL DEFAULT '',
  meta       TEXT    NOT NULL DEFAULT '{}',
  ip_hash    TEXT    NOT NULL DEFAULT '',
  success    INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, action);
