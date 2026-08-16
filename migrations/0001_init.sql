-- Migration 0001 - Schema iniziale piattaforma S.F. Consulenze Assicurative
--
-- Convenzioni:
--  * chiavi primarie TEXT (UUID v4 generati dal Worker)
--  * timestamp TEXT in formato ISO-8601 UTC (es. 2026-07-29T10:00:00Z)
--  * importi in centesimi (INTEGER) per evitare errori di arrotondamento
--  * i file NON stanno nel database: in `documents` ci sono solo i metadati,
--    il contenuto e' su R2 (colonna storage_key)

-- =====================================================================
-- UTENTI E AUTENTICAZIONE
-- =====================================================================

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  -- email cosi' come digitata dall'utente (per la visualizzazione)
  email               TEXT NOT NULL,
  -- email normalizzata (lowercase, trim): usata per lookup e unicita'
  email_normalized    TEXT NOT NULL,
  email_verified_at   TEXT,
  -- NULL quando l'utente accede solo con Google
  password_hash       TEXT,
  password_changed_at TEXT,

  role                TEXT NOT NULL DEFAULT 'client'
                        CHECK (role IN ('client', 'advisor', 'admin')),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'deleted')),

  -- anagrafica
  first_name          TEXT,
  last_name           TEXT,
  phone               TEXT,
  mobile              TEXT,
  pec                 TEXT,
  fiscal_code         TEXT,
  vat_number          TEXT,
  birth_date          TEXT,
  birth_place         TEXT,
  address_street      TEXT,
  address_city        TEXT,
  address_zip         TEXT,
  address_province    TEXT,
  address_country     TEXT NOT NULL DEFAULT 'IT',

  -- consulente di riferimento (self-reference: un cliente e' assegnato a un advisor)
  advisor_id          TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- sicurezza accessi
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,
  last_login_at       TEXT,
  last_login_ip       TEXT,

  -- consensi (il dettaglio storico sta in `consents`)
  tos_accepted_at     TEXT,
  privacy_accepted_at TEXT,
  privacy_version     TEXT,
  marketing_consent   INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),

  deleted_at          TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX idx_users_email_normalized ON users (email_normalized);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_advisor ON users (advisor_id);
CREATE INDEX idx_users_fiscal_code ON users (fiscal_code);

-- Identita' federate (Google oggi, eventuali altri provider domani)
CREATE TABLE oauth_identities (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('google')),
  provider_user_id TEXT NOT NULL,
  email            TEXT,
  display_name     TEXT,
  picture_url      TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_used_at     TEXT
);

CREATE UNIQUE INDEX idx_oauth_provider_uid ON oauth_identities (provider, provider_user_id);
CREATE INDEX idx_oauth_user ON oauth_identities (user_id);

-- Token monouso: verifica email, reset password, inviti.
-- In tabella finisce solo l'hash SHA-256 del token, mai il token in chiaro.
CREATE TABLE auth_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('email_verify', 'password_reset', 'invite', 'email_change')),
  token_hash TEXT NOT NULL,
  payload    TEXT,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX idx_auth_tokens_hash ON auth_tokens (token_hash);
CREATE INDEX idx_auth_tokens_user_type ON auth_tokens (user_id, type);
CREATE INDEX idx_auth_tokens_expiry ON auth_tokens (expires_at);

-- Registro sessioni: la verifica veloce avviene su KV, qui resta lo storico
-- per mostrare all'utente i dispositivi collegati e per revocarli.
CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,          -- SHA-256 del token di sessione
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_seen_at    TEXT,
  expires_at      TEXT NOT NULL,
  absolute_expiry TEXT NOT NULL,
  revoked_at      TEXT,
  ip              TEXT,
  user_agent      TEXT,
  auth_method     TEXT NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password', 'google'))
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expiry ON sessions (expires_at);

-- =====================================================================
-- ANAGRAFICHE ASSICURATIVE
-- =====================================================================

CREATE TABLE insurance_companies (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  short_name TEXT,
  claims_phone TEXT,
  claims_email TEXT,
  website    TEXT,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX idx_companies_name ON insurance_companies (name);

-- Polizze e contratti
CREATE TABLE policies (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id        TEXT REFERENCES insurance_companies(id) ON DELETE SET NULL,
  company_name      TEXT NOT NULL,
  policy_number     TEXT NOT NULL,
  branch            TEXT NOT NULL,              -- ramo: auto, casa, salute, vita, rc professionale...
  product_name      TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('draft', 'active', 'suspended', 'expired', 'cancelled')),

  effective_date    TEXT,                       -- decorrenza
  expiry_date       TEXT,                       -- scadenza
  renewal_type      TEXT CHECK (renewal_type IN ('tacito', 'annuale', 'temporanea', 'poliennale')),
  payment_frequency TEXT CHECK (payment_frequency IN ('annuale', 'semestrale', 'quadrimestrale', 'trimestrale', 'mensile', 'unica')),
  premium_cents     INTEGER,                    -- premio in centesimi di euro

  -- oggetto assicurato (targa, immobile, persona...)
  insured_object    TEXT,
  plate             TEXT,
  vehicle_make      TEXT,
  vehicle_model     TEXT,
  insured_address   TEXT,

  notes             TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_policies_user ON policies (user_id);
CREATE INDEX idx_policies_expiry ON policies (expiry_date);
CREATE INDEX idx_policies_plate ON policies (plate);
CREATE UNIQUE INDEX idx_policies_number_company ON policies (company_name, policy_number);

-- Scadenze (rate, rinnovi, adempimenti). Separate dalle polizze perche' una
-- polizza frazionata genera piu' scadenze e perche' esistono scadenze
-- non legate a una polizza (es. revisione, appuntamento documentale).
CREATE TABLE deadlines (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_id     TEXT REFERENCES policies(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'rata'
                  CHECK (type IN ('rata', 'rinnovo', 'scadenza_polizza', 'adempimento', 'altro')),
  due_date      TEXT NOT NULL,
  amount_cents  INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'renewed', 'expired', 'cancelled')),
  notes         TEXT,
  reminder_sent_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_deadlines_user_due ON deadlines (user_id, due_date);
CREATE INDEX idx_deadlines_status ON deadlines (status);

-- Preventivi
CREATE TABLE quotes (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id    TEXT REFERENCES insurance_companies(id) ON DELETE SET NULL,
  company_name  TEXT,
  subject       TEXT NOT NULL,
  branch        TEXT,
  premium_cents INTEGER,
  coverage_summary TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'under_review', 'accepted', 'rejected', 'expired')),
  valid_until   TEXT,
  notes         TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_quotes_user ON quotes (user_id, status);

-- Trattative in corso
CREATE TABLE negotiations (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  stage          TEXT NOT NULL DEFAULT 'analisi'
                   CHECK (stage IN ('analisi', 'preventivazione', 'confronto', 'in_firma', 'conclusa', 'abbandonata')),
  expected_close TEXT,
  value_cents    INTEGER,
  quote_id       TEXT REFERENCES quotes(id) ON DELETE SET NULL,
  last_update    TEXT,
  notes          TEXT,
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_negotiations_user ON negotiations (user_id, stage);

-- =====================================================================
-- SINISTRI
-- =====================================================================

CREATE TABLE claims (
  id                  TEXT PRIMARY KEY,
  reference           TEXT NOT NULL,             -- protocollo interno leggibile, es. SIN-2026-0001
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_id           TEXT REFERENCES policies(id) ON DELETE SET NULL,
  company_name        TEXT,
  company_claim_number TEXT,                     -- numero sinistro assegnato dalla compagnia

  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'submitted', 'in_review', 'waiting_documents',
                                          'sent_to_company', 'in_progress', 'settled', 'closed', 'rejected')),
  claim_type          TEXT NOT NULL DEFAULT 'rca'
                        CHECK (claim_type IN ('rca', 'kasko', 'furto_incendio', 'casa', 'infortuni',
                                              'salute', 'rc_generale', 'altro')),

  occurred_at         TEXT,                      -- data e ora del sinistro
  place_address       TEXT,
  place_city          TEXT,
  place_province      TEXT,
  place_country       TEXT DEFAULT 'IT',
  latitude            REAL,
  longitude           REAL,

  dynamics            TEXT,                      -- dinamica dichiarata
  injuries            INTEGER NOT NULL DEFAULT 0 CHECK (injuries IN (0, 1)),
  injuries_detail     TEXT,
  authorities_involved INTEGER NOT NULL DEFAULT 0 CHECK (authorities_involved IN (0, 1)),
  authority_type      TEXT,                      -- polizia locale, carabinieri, polizia stradale...
  report_number       TEXT,                      -- numero verbale
  cai_signed          TEXT CHECK (cai_signed IN ('congiunto', 'singolo', 'non_compilato')),
  estimated_damage_cents INTEGER,

  -- dati grezzi del modulo guidato (risposte step-by-step), utili per riprendere
  -- una bozza e per la precompilazione automatica
  wizard_data         TEXT,

  submitted_at        TEXT,
  closed_at           TEXT,
  assigned_to         TEXT REFERENCES users(id) ON DELETE SET NULL,
  advisor_notes       TEXT,                      -- note interne, non visibili al cliente
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX idx_claims_reference ON claims (reference);
CREATE INDEX idx_claims_user_status ON claims (user_id, status);
CREATE INDEX idx_claims_assigned ON claims (assigned_to, status);
CREATE INDEX idx_claims_occurred ON claims (occurred_at);

-- Soggetti coinvolti: assicurato, conducente, controparti, testimoni, autorita'
CREATE TABLE claim_parties (
  id             TEXT PRIMARY KEY,
  claim_id       TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('assicurato', 'conducente', 'proprietario',
                                               'controparte', 'testimone', 'autorita', 'danneggiato')),
  full_name      TEXT,
  fiscal_code    TEXT,
  birth_date     TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  driving_licence TEXT,
  company_name   TEXT,                            -- compagnia della controparte
  policy_number  TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_claim_parties_claim ON claim_parties (claim_id, role);

-- Veicoli coinvolti
CREATE TABLE claim_vehicles (
  id              TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  party_id        TEXT REFERENCES claim_parties(id) ON DELETE SET NULL,
  side            TEXT NOT NULL DEFAULT 'assicurato' CHECK (side IN ('assicurato', 'controparte')),
  plate           TEXT,
  country         TEXT DEFAULT 'IT',
  make            TEXT,
  model           TEXT,
  vehicle_type    TEXT,
  owner_name      TEXT,
  driver_name     TEXT,
  company_name    TEXT,
  policy_number   TEXT,
  damage_description TEXT,
  impact_points   TEXT,
  drivable        INTEGER CHECK (drivable IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_claim_vehicles_claim ON claim_vehicles (claim_id);
CREATE INDEX idx_claim_vehicles_plate ON claim_vehicles (plate);

-- Cronologia lavorazione sinistro (visibile al cliente = stato avanzamento)
CREATE TABLE claim_events (
  id          TEXT PRIMARY KEY,
  claim_id    TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  title       TEXT NOT NULL,
  detail      TEXT,
  visible_to_client INTEGER NOT NULL DEFAULT 1 CHECK (visible_to_client IN (0, 1)),
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_claim_events_claim ON claim_events (claim_id, created_at);

-- =====================================================================
-- DOCUMENTI (solo metadati: i file stanno su R2)
-- =====================================================================

CREATE TABLE documents (
  id                TEXT PRIMARY KEY,
  owner_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- associazioni facoltative
  claim_id          TEXT REFERENCES claims(id) ON DELETE SET NULL,
  policy_id         TEXT REFERENCES policies(id) ON DELETE SET NULL,
  quote_id          TEXT REFERENCES quotes(id) ON DELETE SET NULL,
  request_id        TEXT,

  category          TEXT NOT NULL DEFAULT 'altro'
                      CHECK (category IN ('documento_identita', 'codice_fiscale', 'patente', 'libretto',
                                          'polizza', 'quietanza', 'preventivo', 'fattura', 'verbale',
                                          'cai', 'fotografia', 'dichiarazione', 'perizia', 'referto',
                                          'corrispondenza', 'altro')),
  title             TEXT,
  original_name     TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  stored_size_bytes INTEGER NOT NULL,
  compression       TEXT NOT NULL DEFAULT 'none' CHECK (compression IN ('none', 'gzip')),
  checksum_sha256   TEXT NOT NULL,
  storage_key       TEXT NOT NULL,               -- percorso oggetto su R2
  storage_bucket    TEXT NOT NULL DEFAULT 'sf-documenti',

  status            TEXT NOT NULL DEFAULT 'uploaded'
                      CHECK (status IN ('pending_scan', 'uploaded', 'archived_by_advisor', 'deleted')),
  scan_result       TEXT,                        -- esito controlli su tipo/dimensione/contenuto
  -- dati estratti automaticamente (OCR/parsing), in attesa di conferma
  extracted_data    TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'none'
                      CHECK (extraction_status IN ('none', 'pending', 'done', 'confirmed', 'failed')),

  -- conservazione e cancellazione controllata
  retention_until   TEXT,
  legal_hold        INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0, 1)),
  downloaded_by_advisor_at TEXT,
  deleted_at        TEXT,
  deleted_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  deletion_reason   TEXT,

  uploaded_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX idx_documents_storage_key ON documents (storage_key);
CREATE INDEX idx_documents_owner ON documents (owner_user_id, status);
CREATE INDEX idx_documents_claim ON documents (claim_id);
CREATE INDEX idx_documents_policy ON documents (policy_id);
CREATE INDEX idx_documents_retention ON documents (retention_until);
CREATE INDEX idx_documents_checksum ON documents (checksum_sha256);

-- Politiche di conservazione differenziate per tipologia documento
CREATE TABLE retention_policies (
  category        TEXT PRIMARY KEY,
  months          INTEGER NOT NULL,
  legal_basis     TEXT,
  description     TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- =====================================================================
-- COMUNICAZIONI E RICHIESTE
-- =====================================================================

CREATE TABLE message_threads (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'generale'
                CHECK (category IN ('generale', 'polizza', 'sinistro', 'preventivo', 'documenti', 'amministrativo')),
  claim_id    TEXT REFERENCES claims(id) ON DELETE SET NULL,
  policy_id   TEXT REFERENCES policies(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_threads_user ON message_threads (user_id, status, last_message_at);

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'advisor', 'system')),
  body        TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_messages_thread ON messages (thread_id, created_at);
CREATE INDEX idx_messages_unread ON messages (thread_id, read_at);

-- Richieste del cliente con relativo stato di avanzamento
CREATE TABLE service_requests (
  id          TEXT PRIMARY KEY,
  reference   TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'altro'
                CHECK (type IN ('preventivo', 'modifica_polizza', 'disdetta', 'documento', 'sinistro', 'appuntamento', 'altro')),
  subject     TEXT NOT NULL,
  detail      TEXT,
  status      TEXT NOT NULL DEFAULT 'received'
                CHECK (status IN ('received', 'in_progress', 'waiting_client', 'waiting_company', 'completed', 'cancelled')),
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  claim_id    TEXT REFERENCES claims(id) ON DELETE SET NULL,
  policy_id   TEXT REFERENCES policies(id) ON DELETE SET NULL,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date    TEXT,
  closed_at   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX idx_requests_reference ON service_requests (reference);
CREATE INDEX idx_requests_user ON service_requests (user_id, status);

CREATE TABLE request_events (
  id          TEXT PRIMARY KEY,
  request_id  TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  note        TEXT,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  visible_to_client INTEGER NOT NULL DEFAULT 1 CHECK (visible_to_client IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_request_events_request ON request_events (request_id, created_at);

-- =====================================================================
-- GDPR: CONSENSI, AUDIT, RICHIESTE INTERESSATO
-- =====================================================================

CREATE TABLE consents (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('privacy', 'termini', 'marketing', 'profilazione', 'cookie')),
  granted     INTEGER NOT NULL CHECK (granted IN (0, 1)),
  version     TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_consents_user_kind ON consents (user_id, kind, created_at);

CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  outcome      TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure')),
  ip           TEXT,
  user_agent   TEXT,
  metadata     TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_audit_actor ON audit_log (actor_id, created_at);
CREATE INDEX idx_audit_action ON audit_log (action, created_at);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);

-- Richieste dell'interessato (accesso, portabilita', cancellazione)
CREATE TABLE gdpr_requests (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('export', 'erasure', 'rectification', 'restriction')),
  status       TEXT NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received', 'in_progress', 'completed', 'rejected')),
  detail       TEXT,
  result_key   TEXT,                              -- eventuale archivio export su R2
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  completed_at TEXT,
  handled_by   TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_gdpr_user ON gdpr_requests (user_id, status);
