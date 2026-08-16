-- Migration 0004 - Documenti su R2, pratiche di sinistro, gestionale
--
-- Aggiunge cio' che serve al caricamento dei file, al modulo guidato di
-- apertura sinistro e alla lavorazione lato consulente.

-- Contatori atomici per i numeri di protocollo (SIN-2026-0001, RIC-2026-0001).
-- L'incremento avviene con UPDATE ... RETURNING: due richieste contemporanee
-- non possono ottenere lo stesso numero.
CREATE TABLE counters (
  name       TEXT PRIMARY KEY,
  value      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Metadati aggiuntivi dei documenti.
-- checksum_sha256 contiene l'impronta calcolata dal browser (utile per
-- riconoscere i duplicati e mostrare l'integrita' all'utente); `etag` e' quello
-- restituito da R2 al termine della scrittura, calcolato lato infrastruttura.
ALTER TABLE documents ADD COLUMN etag TEXT;
ALTER TABLE documents ADD COLUMN uploaded_ip TEXT;
ALTER TABLE documents ADD COLUMN width INTEGER;
ALTER TABLE documents ADD COLUMN height INTEGER;
ALTER TABLE documents ADD COLUMN optimization TEXT;   -- es. 'exif-stripped', 'png-reencoded'
ALTER TABLE documents ADD COLUMN original_size_bytes INTEGER;

CREATE INDEX idx_documents_owner_uploaded ON documents (owner_user_id, uploaded_at);
CREATE INDEX idx_documents_status ON documents (status, retention_until);

-- Sinistri: campi di servizio per bozza e lavorazione.
ALTER TABLE claims ADD COLUMN last_saved_at TEXT;
ALTER TABLE claims ADD COLUMN wizard_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE claims ADD COLUMN submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN extraction_summary TEXT;   -- campi riconosciuti automaticamente

CREATE INDEX idx_claims_user_created ON claims (user_id, created_at);
CREATE INDEX idx_claims_status_updated ON claims (status, updated_at);

-- Indici per le viste del gestionale (elenchi filtrati e ordinati).
CREATE INDEX idx_users_advisor_role ON users (advisor_id, role, status);
CREATE INDEX idx_policies_user_status ON policies (user_id, status);
CREATE INDEX idx_deadlines_due_status ON deadlines (due_date, status);
CREATE INDEX idx_requests_status_updated ON service_requests (status, updated_at);
CREATE INDEX idx_threads_last_message ON message_threads (status, last_message_at);

-- Note interne del consulente sul cliente (mai visibili al cliente).
CREATE TABLE client_notes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_client_notes_user ON client_notes (user_id, created_at);

INSERT INTO counters (name, value) VALUES ('claim_reference', 0), ('request_reference', 0);
