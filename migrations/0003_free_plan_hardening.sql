-- Migration 0003 - Adeguamento al piano Cloudflare gratuito
--
-- Workers KV sul piano free consente 1.000 scritture al giorno: troppo poche
-- per contatori di rate limit e sessioni, e con un limite che, una volta
-- raggiunto, impedirebbe anche gli accessi legittimi. D1 diventa quindi
-- l'unica fonte di verita': fortemente consistente (la revoca di una sessione
-- ha effetto immediato) e senza tetto giornaliero di scritture.

-- Contatori di rate limit a finestra fissa.
-- Si scrive solo sugli eventi costosi o falliti (login errato, registrazione,
-- recupero password), non su ogni richiesta autenticata.
CREATE TABLE rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 1,
  reset_at   TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_rate_limits_reset ON rate_limits (reset_at);

-- Stato OAuth: non serve piu' alcuna tabella, viene tenuto in un cookie
-- HttpOnly di durata 10 minuti (il verifier PKCE appartiene al client).

-- Indice usato dalla verifica di sessione a ogni richiesta autenticata.
CREATE INDEX idx_sessions_active ON sessions (id, revoked_at, expires_at);

-- Le sessioni ora vengono lette a ogni richiesta insieme all'utente:
-- questo indice serve alla join.
CREATE INDEX idx_sessions_user_active ON sessions (user_id, revoked_at);
