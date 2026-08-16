-- Migration 0005 - Dati ufficiali assistiti e variazioni del profilo
--
-- I dataset voluminosi non vengono inviati al browser. Le sole porzioni
-- revisionate di ANNCSU sono importate in D1 e interrogate dal Worker con FTS5.
-- La provenienza resta visibile in `reference_datasets`.

ALTER TABLE users ADD COLUMN address_locality TEXT;

CREATE TABLE reference_datasets (
  id                TEXT PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('address', 'municipality', 'other')),
  name              TEXT NOT NULL,
  publisher         TEXT NOT NULL,
  source_url        TEXT NOT NULL,
  license_name      TEXT NOT NULL,
  license_url       TEXT NOT NULL,
  version           TEXT NOT NULL,
  source_updated_at TEXT,
  imported_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  update_frequency  TEXT NOT NULL,
  coverage          TEXT NOT NULL,
  limitations       TEXT NOT NULL,
  content_sha256    TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'stale', 'disabled'))
);

CREATE TABLE address_reference (
  id                    TEXT PRIMARY KEY,
  dataset_id            TEXT NOT NULL REFERENCES reference_datasets(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN ('street', 'access')),
  municipality_code     TEXT NOT NULL,
  istat_code            TEXT NOT NULL,
  city                  TEXT NOT NULL,
  province              TEXT NOT NULL,
  country               TEXT NOT NULL DEFAULT 'IT',
  street_national_id    TEXT NOT NULL,
  street                TEXT NOT NULL,
  locality              TEXT,
  access_national_id    TEXT,
  civic                 TEXT,
  civic_extension       TEXT,
  civic_specificity     TEXT,
  metric                TEXT,
  snc_progressive       TEXT,
  display_street        TEXT NOT NULL,
  search_text           TEXT NOT NULL
);

CREATE INDEX idx_address_reference_dataset
  ON address_reference (dataset_id, municipality_code);
CREATE INDEX idx_address_reference_street
  ON address_reference (municipality_code, street, kind);
CREATE UNIQUE INDEX idx_address_reference_source_key
  ON address_reference (dataset_id, kind, municipality_code, street_national_id, COALESCE(access_national_id, ''));

-- FTS5 evita scansioni dell'intera tabella quando in futuro si estendera' la
-- copertura. I trigger tengono l'indice allineato anche durante gli aggiornamenti
-- mensili effettuati con lo script di importazione.
CREATE VIRTUAL TABLE address_reference_fts USING fts5(
  search_text,
  content = 'address_reference',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER address_reference_ai AFTER INSERT ON address_reference BEGIN
  INSERT INTO address_reference_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
END;

CREATE TRIGGER address_reference_ad AFTER DELETE ON address_reference BEGIN
  INSERT INTO address_reference_fts(address_reference_fts, rowid, search_text)
  VALUES ('delete', old.rowid, old.search_text);
END;

CREATE TRIGGER address_reference_au AFTER UPDATE ON address_reference BEGIN
  INSERT INTO address_reference_fts(address_reference_fts, rowid, search_text)
  VALUES ('delete', old.rowid, old.search_text);
  INSERT INTO address_reference_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
END;

CREATE TABLE profile_change_requests (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'received'
                          CHECK (status IN ('received', 'in_review', 'verified', 'rejected', 'failed')),
  changed_fields        TEXT NOT NULL,
  before_values         TEXT NOT NULL,
  after_values          TEXT NOT NULL,
  origin                TEXT NOT NULL DEFAULT 'reserved_area'
                          CHECK (origin IN ('reserved_area', 'advisor', 'system')),
  source                TEXT NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'assisted', 'assisted_corrected')),
  source_reference_id   TEXT REFERENCES address_reference(id) ON DELETE SET NULL,
  requested_at          TEXT NOT NULL,
  applied_at            TEXT,
  reviewed_at           TEXT,
  reviewed_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_note           TEXT
);

CREATE INDEX idx_profile_changes_user
  ON profile_change_requests (user_id, requested_at);
CREATE INDEX idx_profile_changes_status
  ON profile_change_requests (status, requested_at);
