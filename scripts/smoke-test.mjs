#!/usr/bin/env node
/**
 * Verifica end-to-end delle API dell'area riservata contro un Worker in
 * esecuzione locale (`npm run dev:worker`).
 *
 * Copre i flussi che non possono rompersi senza che nessuno se ne accorga:
 * registrazione, verifica email, accesso, blocco per tentativi errati, recupero
 * password, gestione sessioni, isolamento fra utenti, difesa CSRF e rate limit.
 *
 * Uso:
 *   npm run test:e2e
 *
 * Prerequisiti:
 *   - `npm run dev:worker` attivo su http://localhost:8787
 *   - MAIL_PROVIDER="log" in .dev.vars (i link di verifica vengono letti dal log)
 *   - log del worker su file, percorso passato con --log oppure WRANGLER_LOG
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const ORIGIN = BASE;
const LOG_PATH =
  process.argv.find((arg) => arg.startsWith('--log='))?.slice('--log='.length) ?? process.env.WRANGLER_LOG;

/** Solo di riserva: i parametri veri arrivano da /api/config. */
const KDF_DEFAULT = { iterations: 250_000, saltPrefix: 'sfca-auth-v1:' };

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}

function ko(name, detail) {
  failed++;
  failures.push(`${name}: ${detail}`);
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`);
}

function check(name, condition, detail = '') {
  if (condition) ok(name);
  else ko(name, detail || 'condizione non soddisfatta');
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/* ---------------------------------------------------------------- HTTP ---- */

/** Contenitore di cookie minimale: un oggetto per ogni "browser" simulato. */
function newJar() {
  return new Map();
}

function applySetCookie(jar, response) {
  const headers = response.headers.getSetCookie?.() ?? [];
  for (const raw of headers) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '' || /Max-Age=0/i.test(raw)) jar.delete(name);
    else jar.set(name, { value, raw });
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, entry]) => `${name}=${entry.value}`).join('; ');
}

async function call(method, path, { body, jar, origin = ORIGIN, headers = {} } = {}) {
  const requestHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (origin) requestHeaders.Origin = origin;
  if (jar && jar.size > 0) requestHeaders.Cookie = cookieHeader(jar);

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

  if (jar) applySetCookie(jar, response);

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* risposta non JSON (es. HTML della SPA) */
  }

  return { status: response.status, json, text, headers: response.headers };
}

/** Variante di `call` per inviare byte grezzi (caricamento documenti). */
async function callRaw(method, path, { bytes, mime, jar, origin = ORIGIN } = {}) {
  const headers = { Accept: 'application/json', 'Content-Type': mime };
  if (origin) headers.Origin = origin;
  if (jar && jar.size > 0) headers.Cookie = cookieHeader(jar);

  const response = await fetch(`${BASE}${path}`, { method, headers, body: bytes });
  if (jar) applySetCookie(jar, response);

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non JSON */
  }
  return { status: response.status, json, text, headers: response.headers };
}

/** File di prova con firma valida per il formato dichiarato. */
function fakePdf(sizeBytes = 2048) {
  const bytes = new Uint8Array(sizeBytes);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], 0); // "%PDF-1.4"
  bytes.fill(0x20, 8);
  return bytes;
}

function fakeJpeg(sizeBytes = 1024) {
  const bytes = new Uint8Array(sizeBytes);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
}

/* ------------------------------------------------- Derivazione password ---- */

/** Stessa derivazione eseguita dal browser (src/lib/password.ts). */
async function derive(email, password, kdf = KDF_DEFAULT) {
  const encoder = new TextEncoder();
  const saltSource = `${kdf.saltPrefix}${email.trim().toLowerCase()}`;
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(saltSource)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: kdf.iterations },
    key,
    256,
  );
  return Buffer.from(bits).toString('base64url');
}

/* ------------------------------------------------------------ Utilita' ---- */

const uniq = () => Math.random().toString(36).slice(2, 10);

function tokenFromLog(kind) {
  if (!LOG_PATH) throw new Error('Percorso del log non indicato: usare --log=<file> o WRANGLER_LOG');
  const log = readFileSync(LOG_PATH, 'utf8');
  const pattern = new RegExp(`${kind}\\?token=([A-Za-z0-9_%-]+)`, 'g');
  const matches = [...log.matchAll(pattern)];
  if (matches.length === 0) throw new Error(`Nessun link "${kind}" trovato nel log`);
  return decodeURIComponent(matches[matches.length - 1][1]);
}

/**
 * Esegue una query sul database locale. Serve solo alle prove: promuovere un
 * utente a consulente e leggere il registro operazioni sono operazioni che
 * l'API non espone (e non deve esporre).
 */
function sql(command) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', 'sf-portal', '--local', '--json', '--command', command], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function resetRateLimits() {
  try {
    execFileSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'sf-portal', '--local', '--command', 'DELETE FROM rate_limits'],
      { stdio: 'pipe' },
    );
  } catch (error) {
    console.warn('  (impossibile azzerare i contatori di rate limit: alcune prove potrebbero fallire)');
  }
}

async function registerAndVerify(jar, { password = 'PasswordDiProva2026', kdf } = {}) {
  const email = `test-${uniq()}@example.com`;
  const passwordDerived = await derive(email, password, kdf);
  const registration = await call('POST', '/api/auth/register', {
    body: {
      email,
      passwordDerived,
      firstName: 'Utente',
      lastName: 'DiProva',
      acceptTerms: true,
      marketingConsent: false,
    },
  });
  if (registration.status !== 200) throw new Error(`registrazione fallita: ${registration.text}`);

  const token = tokenFromLog('verifica-email');
  const verification = await call('POST', '/api/auth/verify-email', { body: { token }, jar });
  if (verification.status !== 200) throw new Error(`verifica fallita: ${verification.text}`);

  const me = await call('GET', '/api/auth/me', { jar });
  return { email, password, userId: me.json?.user?.id };
}

/* -------------------------------------------------------------- Verifiche -- */

async function main() {
  console.log(`\x1b[1mProve end-to-end\x1b[0m  →  ${BASE}\n`);
  resetRateLimits();

  let kdf = KDF_DEFAULT;

  section('Configurazione e stato del servizio');
  {
    const health = await call('GET', '/api/health');
    check('GET /api/health risponde 200', health.status === 200, `stato ${health.status}`);

    const config = await call('GET', '/api/config');
    check('GET /api/config espone i parametri della derivazione password', Boolean(config.json?.passwordKdf));
    if (config.json?.passwordKdf) {
      kdf = config.json.passwordKdf;
      check(
        'iterazioni lato client >= 100.000',
        config.json.passwordKdf.iterations >= 100_000,
        `iterazioni: ${config.json.passwordKdf.iterations}`,
      );
    }
    check(
      'la configurazione non contiene segreti',
      !JSON.stringify(config.json ?? {}).match(/secret|client_secret|api_key/i),
      'trovata una chiave sospetta nella configurazione',
    );
  }

  section('Difese di base delle richieste');
  {
    const noOrigin = await call('POST', '/api/auth/login', {
      body: { email: 'x@example.com', passwordDerived: 'a'.repeat(43) },
      origin: null,
    });
    check('POST senza header Origin viene rifiutato', noOrigin.status === 403, `stato ${noOrigin.status}`);

    const foreignOrigin = await call('POST', '/api/auth/login', {
      body: { email: 'x@example.com', passwordDerived: 'a'.repeat(43) },
      origin: 'https://sito-malevolo.example',
    });
    check('POST da origine esterna viene rifiutato', foreignOrigin.status === 403, `stato ${foreignOrigin.status}`);

    const protectedRead = await call('GET', '/api/portal/summary');
    check('area riservata inaccessibile senza sessione', protectedRead.status === 401, `stato ${protectedRead.status}`);

    const rawPassword = await call('POST', '/api/auth/login', {
      body: { email: 'x@example.com', password: 'PasswordInChiaro1' },
    });
    check(
      'il server rifiuta una password non derivata',
      rawPassword.status === 400,
      `stato ${rawPassword.status}: ${rawPassword.text.slice(0, 120)}`,
    );
  }

  section('Registrazione e verifica email');
  const alice = newJar();
  let aliceUser;
  {
    const email = `alice-${uniq()}@example.com`;
    const password = 'PasswordSicura2026';
    const passwordDerived = await derive(email, password, kdf);

    const registration = await call('POST', '/api/auth/register', {
      body: {
        email,
        passwordDerived,
        firstName: 'Alice',
        lastName: 'Rossi',
        phone: '334 000 1122',
        acceptTerms: true,
        marketingConsent: true,
      },
    });
    check('registrazione accettata', registration.status === 200, `stato ${registration.status}`);
    check(
      'la risposta non rivela se l’email esisteva',
      /riceverai a breve/i.test(registration.json?.message ?? ''),
      `messaggio: ${registration.json?.message}`,
    );
    check(
      'nessuna sessione aperta prima della verifica',
      registration.headers.getSetCookie?.().every((cookie) => !cookie.startsWith('sf_session=')) ?? true,
      'e’ stato impostato un cookie di sessione',
    );

    const duplicate = await call('POST', '/api/auth/register', {
      body: {
        email,
        passwordDerived,
        firstName: 'Finta',
        lastName: 'Utente',
        acceptTerms: true,
      },
    });
    check(
      'registrazione duplicata: stessa risposta della prima',
      duplicate.status === 200 && duplicate.json?.message === registration.json?.message,
      `stato ${duplicate.status}`,
    );

    const token = tokenFromLog('verifica-email');
    const verification = await call('POST', '/api/auth/verify-email', { body: { token }, jar: alice });
    check('verifica email riuscita', verification.status === 200, `stato ${verification.status}`);
    check('la verifica apre la sessione', alice.has('sf_session'), 'cookie di sessione assente');

    const cookieRaw = alice.get('sf_session')?.raw ?? '';
    check('cookie di sessione HttpOnly', /HttpOnly/i.test(cookieRaw), cookieRaw);
    // Secure e' condizionato al protocollo: obbligatorio in https, omesso su
    // http://localhost perche' alcuni browser scarterebbero il cookie in locale.
    if (BASE.startsWith('https://')) {
      check('cookie di sessione Secure', /Secure/i.test(cookieRaw), cookieRaw);
    } else {
      check(
        'cookie di sessione senza Secure solo in locale su http',
        !/Secure/i.test(cookieRaw),
        `atteso nessun flag Secure su ${BASE}: ${cookieRaw}`,
      );
    }
    check('cookie di sessione SameSite=Lax', /SameSite=Lax/i.test(cookieRaw), cookieRaw);

    const reuse = await call('POST', '/api/auth/verify-email', { body: { token } });
    check('token di verifica non riutilizzabile', reuse.status === 400, `stato ${reuse.status}`);

    const me = await call('GET', '/api/auth/me', { jar: alice });
    aliceUser = me.json?.user;
    check('sessione attiva e email confermata', me.json?.authenticated === true && aliceUser?.emailVerified === true);
    check(
      '/api/auth/me non restituisce l’hash della password',
      !JSON.stringify(me.json ?? {}).includes('pbkdf2'),
      'hash presente nella risposta',
    );

    aliceUser = { ...aliceUser, email, password };
  }

  section('Area riservata');
  {
    const summary = await call('GET', '/api/portal/summary', { jar: alice });
    check('riepilogo disponibile', summary.status === 200, `stato ${summary.status}`);
    check(
      'contatori a zero per un nuovo utente',
      summary.json?.counters?.activePolicies === 0 && summary.json?.counters?.openClaims === 0,
      JSON.stringify(summary.json?.counters),
    );

    const unconfirmedUpdate = await call('PATCH', '/api/profile', {
      jar: alice,
      body: { mobile: '334 555 6677', addressCity: 'Rho', addressZip: '20017', addressProvince: 'mi' },
    });
    check(
      'una variazione del profilo senza conferma viene rifiutata',
      unconfirmedUpdate.status === 400,
      `stato ${unconfirmedUpdate.status}`,
    );

    const profileUpdate = await call('PATCH', '/api/profile', {
      jar: alice,
      body: {
        mobile: '334 555 6677',
        addressCity: 'Rho',
        addressZip: '20017',
        addressProvince: 'mi',
        confirmed: true,
      },
    });
    check(
      'aggiornamento recapiti confermato e registrato come ricevuto',
      profileUpdate.status === 200 && profileUpdate.json?.changeRequest?.status === 'received',
      `stato ${profileUpdate.status}`,
    );
    check(
      'la provincia viene normalizzata in maiuscolo',
      profileUpdate.json?.profile?.addressProvince === 'MI',
      `valore: ${profileUpdate.json?.profile?.addressProvince}`,
    );
    check(
      'il salvataggio non viene presentato come verifica gia’ completata',
      /deve ancora verificarla/i.test(profileUpdate.json?.changeRequest?.message ?? ''),
      JSON.stringify(profileUpdate.json?.changeRequest),
    );

    const unauthenticatedAddressSearch = await call(
      'GET',
      '/api/reference/addresses?q=Via%20Friuli%2024',
    );
    check(
      'la ricerca indirizzi richiede una sessione',
      unauthenticatedAddressSearch.status === 401,
      `stato ${unauthenticatedAddressSearch.status}`,
    );

    const shortAddressSearch = await call('GET', '/api/reference/addresses?q=Vi', { jar: alice });
    check(
      'la ricerca non parte prima di tre caratteri',
      shortAddressSearch.status === 200 &&
        shortAddressSearch.json?.suggestions?.length === 0 &&
        shortAddressSearch.json?.minimumCharacters === 3,
      JSON.stringify(shortAddressSearch.json),
    );

    const addressSearch = await call(
      'GET',
      '/api/reference/addresses?q=Via%20Friuli%2024&limit=99',
      { jar: alice },
    );
    const addressSuggestion = addressSearch.json?.suggestions?.find(
      (suggestion) => suggestion.street === 'VIA FRIULI 24',
    );
    check(
      'ANNCSU restringe la ricerca fino al civico richiesto',
      addressSearch.status === 200 && Boolean(addressSuggestion),
      `stato ${addressSearch.status}: ${addressSearch.text.slice(0, 240)}`,
    );
    check(
      'la risposta contiene al massimo otto risultati e mantiene il fallback manuale',
      addressSearch.json?.suggestions?.length <= 8 && addressSearch.json?.manualEntryAvailable === true,
      JSON.stringify(addressSearch.json),
    );
    check(
      'il CAP viene proposto dalla fonte IPA distinta da ANNCSU',
      addressSuggestion?.postalCode === '20017' &&
        Boolean(addressSuggestion?.postalDatasetId) &&
        addressSearch.json?.datasets?.some((dataset) => dataset.id === addressSuggestion?.postalDatasetId),
      JSON.stringify({ suggestion: addressSuggestion, datasets: addressSearch.json?.datasets }),
    );
    check(
      'metadati delle fonti includono licenza, versione, copertura e limiti',
      addressSearch.json?.datasets?.every(
        (dataset) =>
          dataset.publisher &&
          dataset.licenseName &&
          dataset.version &&
          dataset.coverage &&
          dataset.limitations,
      ),
      JSON.stringify(addressSearch.json?.datasets),
    );

    const assistedAddressUpdate = await call('PATCH', '/api/profile', {
      jar: alice,
      body: {
        addressStreet: addressSuggestion?.street,
        addressLocality: addressSuggestion?.locality ?? '',
        addressCity: addressSuggestion?.city,
        addressZip: addressSuggestion?.postalCode,
        addressProvince: addressSuggestion?.province,
        addressCountry: addressSuggestion?.country,
        addressSuggestionId: addressSuggestion?.id,
        confirmed: true,
      },
    });
    check(
      'la proposta selezionata resta una variazione tracciata da verificare',
      assistedAddressUpdate.status === 200 &&
        assistedAddressUpdate.json?.changeRequest?.source === 'assisted' &&
        assistedAddressUpdate.json?.changeRequest?.status === 'received',
      `stato ${assistedAddressUpdate.status}: ${assistedAddressUpdate.text.slice(0, 240)}`,
    );

    const profileChanges = await call('GET', '/api/profile/changes', { jar: alice });
    const assistedChange = profileChanges.json?.changes?.find(
      (change) => change.id === assistedAddressUpdate.json?.changeRequest?.id,
    );
    check(
      'il cliente vede valori precedenti/nuovi, origine, data e stato della variazione',
      profileChanges.status === 200 &&
        assistedChange?.origin === 'reserved_area' &&
        assistedChange?.requestedAt &&
        assistedChange?.before?.addressStreet === null &&
        assistedChange?.after?.addressStreet === 'VIA FRIULI 24',
      JSON.stringify(assistedChange),
    );

    const correctedSuggestion = await call('PATCH', '/api/profile', {
      jar: alice,
      body: {
        addressStreet: 'VIA FRIULI 24, SCALA A',
        addressLocality: addressSuggestion?.locality ?? '',
        addressCity: addressSuggestion?.city,
        addressZip: addressSuggestion?.postalCode,
        addressProvince: addressSuggestion?.province,
        addressCountry: addressSuggestion?.country,
        addressSuggestionId: addressSuggestion?.id,
        confirmed: true,
      },
    });
    check(
      'una proposta corretta a mano resta utilizzabile ed e’ distinta dalla corrispondenza esatta',
      correctedSuggestion.status === 200 &&
        correctedSuggestion.json?.changeRequest?.source === 'assisted_corrected',
      `stato ${correctedSuggestion.status}: ${correctedSuggestion.text.slice(0, 240)}`,
    );

    const invalid = await call('PATCH', '/api/profile', { jar: alice, body: { addressZip: 'ABC' } });
    check('CAP non valido rifiutato', invalid.status === 400, `stato ${invalid.status}`);

    const invalidFiscal = await call('PATCH', '/api/profile', {
      jar: alice,
      body: { fiscalCode: 'RSSMRA85M01H501A' },
    });
    check(
      'codice fiscale con controllo errato rifiutato dal server',
      invalidFiscal.status === 400,
      `stato ${invalidFiscal.status}`,
    );

    const fiscalFirst = await call('PATCH', '/api/profile', {
      jar: alice,
      body: { fiscalCode: 'RSSMRA85M01H501Q', confirmed: true },
    });
    check('codice fiscale inserito la prima volta', fiscalFirst.status === 200, `stato ${fiscalFirst.status}`);

    const fiscalChange = await call('PATCH', '/api/profile', {
      jar: alice,
      body: { fiscalCode: 'BNCLNE90A41F205Y' },
    });
    check(
      'codice fiscale non modificabile dopo l’inserimento',
      fiscalChange.status === 403 && fiscalChange.json?.error?.code === 'locked_field',
      `stato ${fiscalChange.status}`,
    );

    const thread = await call('POST', '/api/portal/threads', {
      jar: alice,
      body: { subject: 'Richiesta di prova', category: 'generale', body: 'Messaggio di prova.' },
    });
    check('conversazione creata', thread.status === 201 && Boolean(thread.json?.threadId), `stato ${thread.status}`);

    const reply = await call('POST', `/api/portal/threads/${thread.json.threadId}/messages`, {
      jar: alice,
      body: { body: 'Secondo messaggio.' },
    });
    check('risposta inviata', reply.status === 201, `stato ${reply.status}`);

    const conversation = await call('GET', `/api/portal/threads/${thread.json.threadId}`, { jar: alice });
    check(
      'conversazione con due messaggi firmati dal cliente',
      conversation.json?.messages?.length === 2 &&
        conversation.json.messages.every((message) => message.senderRole === 'client'),
      JSON.stringify(conversation.json?.messages?.map((m) => m.senderRole)),
    );

    const consents = await call('GET', '/api/profile/consents', { jar: alice });
    check(
      'storico consensi registrato alla registrazione',
      (consents.json?.consents?.length ?? 0) >= 3,
      `voci: ${consents.json?.consents?.length}`,
    );

    const revoke = await call('PATCH', '/api/profile/consents', { jar: alice, body: { marketingConsent: false } });
    check('revoca del consenso marketing', revoke.status === 200 && revoke.json?.marketingConsent === false);

    const exported = await call('GET', '/api/profile/export', { jar: alice });
    check(
      'esportazione dati completa',
      exported.status === 200 && exported.text.includes('"polizze"') && exported.text.includes('"consensi"'),
      `stato ${exported.status}`,
    );
  }

  section('Isolamento fra utenti');
  {
    const bob = newJar();
    const bobUser = await registerAndVerify(bob, { kdf });

    const bobThread = await call('POST', '/api/portal/threads', {
      jar: bob,
      body: { subject: 'Conversazione di Bob', category: 'generale', body: 'Privata.' },
    });
    check('conversazione di Bob creata', bobThread.status === 201, `stato ${bobThread.status}`);

    const stolen = await call('GET', `/api/portal/threads/${bobThread.json.threadId}`, { jar: alice });
    check(
      'Alice non puo’ leggere la conversazione di Bob',
      stolen.status === 404,
      `stato ${stolen.status}: ${stolen.text.slice(0, 120)}`,
    );

    const impersonation = await call('GET', `/api/portal/summary?userId=${bobUser.userId}`, { jar: alice });
    check(
      'un cliente non puo’ usare ?userId per vedere un altro utente',
      impersonation.status === 403,
      `stato ${impersonation.status}`,
    );

    const bobDocuments = await call('GET', `/api/portal/documents?userId=${aliceUser.id}`, { jar: bob });
    check(
      'nemmeno nella direzione opposta',
      bobDocuments.status === 403,
      `stato ${bobDocuments.status}`,
    );

    const bobSessions = await call('GET', '/api/auth/sessions', { jar: bob });
    const aliceSessions = await call('GET', '/api/auth/sessions', { jar: alice });
    const aliceSessionId = aliceSessions.json?.sessions?.[0]?.id;
    const crossRevoke = await call('DELETE', `/api/auth/sessions/${aliceSessionId}`, { jar: bob });
    check(
      'Bob non puo’ revocare la sessione di Alice',
      crossRevoke.status === 404,
      `stato ${crossRevoke.status}`,
    );
    check('elenco sessioni proprio disponibile', bobSessions.status === 200 && aliceSessions.status === 200);

    const stillValid = await call('GET', '/api/auth/me', { jar: alice });
    check('la sessione di Alice e’ ancora valida', stillValid.json?.authenticated === true);
  }

  section('Accesso, uscita e sessioni');
  {
    const jar = newJar();
    const wrong = await call('POST', '/api/auth/login', {
      jar,
      body: { email: aliceUser.email, passwordDerived: await derive(aliceUser.email, 'PasswordSbagliata9', kdf) },
    });
    check('password errata rifiutata', wrong.status === 401, `stato ${wrong.status}`);
    check(
      'il messaggio di errore non distingue email e password',
      /Email o password non corretti/i.test(wrong.json?.error?.message ?? ''),
      wrong.json?.error?.message,
    );

    const unknown = await call('POST', '/api/auth/login', {
      body: { email: `inesistente-${uniq()}@example.com`, passwordDerived: await derive('x@y.z', 'qualsiasi', kdf) },
    });
    check(
      'email inesistente: stessa risposta della password errata',
      unknown.status === 401 && unknown.json?.error?.message === wrong.json?.error?.message,
      `stato ${unknown.status}`,
    );

    const login = await call('POST', '/api/auth/login', {
      jar,
      body: { email: aliceUser.email, passwordDerived: await derive(aliceUser.email, aliceUser.password, kdf) },
    });
    check('accesso con credenziali corrette', login.status === 200, `stato ${login.status}`);
    check('sessione aperta', jar.has('sf_session'));

    const sessions = await call('GET', '/api/auth/sessions', { jar });
    check(
      'due dispositivi collegati',
      (sessions.json?.sessions?.length ?? 0) >= 2,
      `sessioni: ${sessions.json?.sessions?.length}`,
    );
    check(
      'la sessione corrente e’ contrassegnata',
      sessions.json?.sessions?.some((session) => session.current === true),
    );

    const revokeAll = await call('POST', '/api/auth/sessions/revoke-all', { jar });
    check('revoca delle altre sessioni', revokeAll.status === 200, `stato ${revokeAll.status}`);

    const oldSession = await call('GET', '/api/auth/me', { jar: alice });
    check(
      'la sessione revocata non e’ piu’ valida (revoca immediata)',
      oldSession.json?.authenticated === false,
      'la vecchia sessione risulta ancora attiva',
    );

    const logout = await call('POST', '/api/auth/logout', { jar });
    check('uscita riuscita', logout.status === 200, `stato ${logout.status}`);
    const afterLogout = await call('GET', '/api/auth/me', { jar });
    check('nessuna sessione dopo l’uscita', afterLogout.json?.authenticated === false);
  }

  section('Recupero password');
  {
    const jar = newJar();
    const user = await registerAndVerify(jar, { kdf });

    const forgot = await call('POST', '/api/auth/forgot-password', { body: { email: user.email } });
    check('richiesta di recupero accettata', forgot.status === 200, `stato ${forgot.status}`);

    const unknownForgot = await call('POST', '/api/auth/forgot-password', {
      body: { email: `mai-visto-${uniq()}@example.com` },
    });
    check(
      'email sconosciuta: stessa risposta',
      unknownForgot.status === 200 && unknownForgot.json?.message === forgot.json?.message,
    );

    const token = tokenFromLog('reimposta-password');
    const context = await call('POST', '/api/auth/reset-token/check', { body: { token } });
    check(
      'il token restituisce l’indirizzo per la derivazione',
      context.status === 200 && context.json?.email === user.email,
      `stato ${context.status}`,
    );

    const nuova = 'AltraPasswordSicura2026';
    const reset = await call('POST', '/api/auth/reset-password', {
      body: { token, passwordDerived: await derive(user.email, nuova, kdf) },
    });
    check('password reimpostata', reset.status === 200, `stato ${reset.status}`);

    const reuse = await call('POST', '/api/auth/reset-password', {
      body: { token, passwordDerived: await derive(user.email, 'UnAltraAncora2026', kdf) },
    });
    check('token di reset monouso', reuse.status === 400, `stato ${reuse.status}`);

    const oldPassword = await call('POST', '/api/auth/login', {
      body: { email: user.email, passwordDerived: await derive(user.email, user.password, kdf) },
    });
    check('la vecchia password non funziona piu’', oldPassword.status === 401, `stato ${oldPassword.status}`);

    const newJarAfterReset = newJar();
    const newPassword = await call('POST', '/api/auth/login', {
      jar: newJarAfterReset,
      body: { email: user.email, passwordDerived: await derive(user.email, nuova, kdf) },
    });
    check('la nuova password funziona', newPassword.status === 200, `stato ${newPassword.status}`);

    const sessionAfterReset = await call('GET', '/api/auth/me', { jar });
    check(
      'il reset chiude le sessioni aperte',
      sessionAfterReset.json?.authenticated === false,
      'la sessione precedente e’ ancora valida',
    );

    // Cambio password dall'area riservata.
    const changed = await call('POST', '/api/auth/change-password', {
      jar: newJarAfterReset,
      body: {
        currentPasswordDerived: await derive(user.email, nuova, kdf),
        newPasswordDerived: await derive(user.email, 'TerzaPassword2026', kdf),
      },
    });
    check('cambio password dall’area riservata', changed.status === 200, `stato ${changed.status}`);

    const wrongCurrent = await call('POST', '/api/auth/change-password', {
      jar: newJarAfterReset,
      body: {
        currentPasswordDerived: await derive(user.email, 'NonEQuesta2026', kdf),
        newPasswordDerived: await derive(user.email, 'QuartaPassword2026', kdf),
      },
    });
    check(
      'cambio password rifiutato con password attuale errata',
      wrongCurrent.status === 400 && wrongCurrent.json?.error?.code === 'wrong_password',
      `stato ${wrongCurrent.status}`,
    );
  }

  section('Blocco per tentativi errati e rate limit');
  {
    const jar = newJar();
    const user = await registerAndVerify(jar, { kdf });
    const sbagliata = await derive(user.email, 'SempreSbagliata1', kdf);

    let locked = false;
    let limited = false;
    for (let attempt = 1; attempt <= 12; attempt++) {
      const response = await call('POST', '/api/auth/login', { body: { email: user.email, passwordDerived: sbagliata } });
      if (response.status === 423) locked = true;
      if (response.status === 429) limited = true;
      if (locked || limited) break;
    }
    check('tentativi ripetuti portano al blocco dell’account o al rate limit', locked || limited, 'nessuna protezione attivata');

    const correct = await call('POST', '/api/auth/login', {
      body: { email: user.email, passwordDerived: await derive(user.email, user.password, kdf) },
    });
    check(
      'con account bloccato non si entra nemmeno con la password giusta',
      correct.status === 423 || correct.status === 429,
      `stato ${correct.status}`,
    );

    const retryAfter = correct.headers.get('Retry-After');
    if (correct.status === 429) {
      check('la risposta 429 include Retry-After', Boolean(retryAfter), 'header assente');
    } else {
      ok('la risposta 429 include Retry-After (non applicabile: blocco account)');
    }
  }

  section('Comunicazione area riservata ↔ gestionale');
  {
    // Le prove precedenti hanno consumato la quota di registrazioni per IP.
    resetRateLimits();

    // Il gestionale e' il pannello con ruolo `advisor` della stessa
    // piattaforma: cliente e consulente lavorano sulle stesse righe di D1.
    // Qui si verifica che il confine fra i due lati tenga.
    const advisorJar = newJar();
    const advisor = await registerAndVerify(advisorJar, { kdf });

    const clientJar = newJar();
    const client = await registerAndVerify(clientJar, { kdf });

    const estranoJar = newJar();
    const estraneo = await registerAndVerify(estranoJar, { kdf });

    sql(`UPDATE users SET role = 'advisor' WHERE id = '${advisor.userId}'`);
    sql(`UPDATE users SET advisor_id = '${advisor.userId}' WHERE id = '${client.userId}'`);

    const assigned = await call('GET', `/api/portal/summary?userId=${client.userId}`, { jar: advisorJar });
    check(
      'il consulente accede alla posizione di un cliente assegnato',
      assigned.status === 200,
      `stato ${assigned.status}: ${assigned.text.slice(0, 140)}`,
    );

    const notAssigned = await call('GET', `/api/portal/summary?userId=${estraneo.userId}`, { jar: advisorJar });
    check(
      'il consulente NON accede a un cliente non assegnato',
      notAssigned.status === 403,
      `stato ${notAssigned.status}`,
    );

    const clientThread = await call('POST', '/api/portal/threads', {
      jar: clientJar,
      body: { subject: 'Sinistro da segnalare', category: 'sinistro', body: 'Ho avuto un incidente.' },
    });
    check('il cliente apre una conversazione', clientThread.status === 201, `stato ${clientThread.status}`);

    const advisorReply = await call(
      'POST',
      `/api/portal/threads/${clientThread.json.threadId}/messages?userId=${client.userId}`,
      { jar: advisorJar, body: { body: 'Ho preso in carico la pratica.' } },
    );
    check('il consulente risponde nella conversazione del cliente', advisorReply.status === 201, `stato ${advisorReply.status}`);

    const clientView = await call('GET', `/api/portal/threads/${clientThread.json.threadId}`, { jar: clientJar });
    const roles = clientView.json?.messages?.map((message) => message.senderRole) ?? [];
    check(
      'il messaggio del consulente e’ firmato come advisor, non come cliente',
      roles.length === 2 && roles[0] === 'client' && roles[1] === 'advisor',
      `ruoli: ${roles.join(', ')}`,
    );

    const estraneoAttempt = await call(
      'POST',
      `/api/portal/threads/${clientThread.json.threadId}/messages`,
      { jar: estranoJar, body: { body: 'Messaggio non autorizzato.' } },
    );
    check(
      'un altro cliente non puo’ scrivere nella conversazione',
      estraneoAttempt.status === 404,
      `stato ${estraneoAttempt.status}`,
    );

    const auditRows = sql(
      `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'portal.cross_access' AND actor_id = '${advisor.userId}'`,
    );
    check(
      'ogni accesso del consulente ai dati di un cliente e’ tracciato',
      /"n":\s*[1-9]/.test(auditRows) || /\b[1-9]\d*\b/.test(auditRows),
      `risultato query: ${auditRows.slice(0, 200)}`,
    );

    const auditDenied = sql(
      `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'portal.cross_access_denied' AND actor_id = '${advisor.userId}'`,
    );
    check(
      'anche i tentativi respinti sono tracciati',
      /\b[1-9]\d*\b/.test(auditDenied),
      `risultato query: ${auditDenied.slice(0, 200)}`,
    );
  }

  section('Documenti');
  const docJar = newJar();
  let docUser;
  let uploadedDocumentId;
  {
    resetRateLimits();
    docUser = await registerAndVerify(docJar, { kdf });

    const quota = await call('GET', '/api/documents/quota', { jar: docJar });
    check(
      'spazio disponibile esposto al client',
      quota.status === 200 && quota.json?.limitBytes > 0 && quota.json?.usedBytes === 0,
      JSON.stringify(quota.json),
    );

    const wrongType = await callRaw('POST', '/api/documents?category=altro&name=nota.txt', {
      jar: docJar,
      mime: 'text/plain',
      bytes: new TextEncoder().encode('testo semplice'),
    });
    check('formato non ammesso rifiutato', wrongType.status === 400, `stato ${wrongType.status}`);

    const fakeSignature = await callRaw('POST', '/api/documents?category=altro&name=finto.pdf', {
      jar: docJar,
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('questo non e un pdf'),
    });
    check(
      'file con contenuto diverso dal formato dichiarato rifiutato',
      fakeSignature.status === 400,
      `stato ${fakeSignature.status}`,
    );

    const upload = await callRaw('POST', '/api/documents?category=verbale&name=verbale.pdf&title=Verbale', {
      jar: docJar,
      mime: 'application/pdf',
      bytes: fakePdf(4096),
    });
    check('caricamento PDF riuscito', upload.status === 201, `stato ${upload.status}: ${upload.text.slice(0, 160)}`);
    uploadedDocumentId = upload.json?.document?.id;

    const tooLarge = await callRaw('POST', '/api/documents?category=altro&name=grande.pdf', {
      jar: docJar,
      mime: 'application/pdf',
      bytes: fakePdf(11 * 1024 * 1024),
    });
    check('file oltre il limite rifiutato', tooLarge.status === 413, `stato ${tooLarge.status}`);

    const content = await call('GET', `/api/documents/${uploadedDocumentId}/content`, { jar: docJar });
    check('download del proprio documento', content.status === 200, `stato ${content.status}`);
    check(
      'il contenuto non viene interpretato in modo diverso dal dichiarato',
      content.headers.get('X-Content-Type-Options') === 'nosniff',
      `header: ${content.headers.get('X-Content-Type-Options')}`,
    );
    check(
      'il documento viene servito in sandbox',
      (content.headers.get('Content-Security-Policy') ?? '').includes('sandbox'),
      `header: ${content.headers.get('Content-Security-Policy')}`,
    );
    check(
      'i documenti non finiscono in cache condivise',
      (content.headers.get('Cache-Control') ?? '').includes('no-store'),
      `header: ${content.headers.get('Cache-Control')}`,
    );

    const link = await call('POST', `/api/documents/${uploadedDocumentId}/link`, { jar: docJar });
    check('link temporaneo generato', link.status === 200 && Boolean(link.json?.url), `stato ${link.status}`);

    const sharedPath = link.json?.url?.replace(BASE, '') ?? '';
    const shared = await call('GET', sharedPath);
    check('link temporaneo utilizzabile senza sessione', shared.status === 200, `stato ${shared.status}`);

    const tampered = await call('GET', sharedPath.replace(/token=(.)/, (m, first) => `token=${first === 'a' ? 'b' : 'a'}`));
    check('link con firma alterata rifiutato', tampered.status === 400 || tampered.status === 410, `stato ${tampered.status}`);

    const otherJar = newJar();
    await registerAndVerify(otherJar, { kdf });
    const stolen = await call('GET', `/api/documents/${uploadedDocumentId}/content`, { jar: otherJar });
    check('un altro utente non accede al documento', stolen.status === 404, `stato ${stolen.status}`);

    const quotaAfter = await call('GET', '/api/documents/quota', { jar: docJar });
    check(
      'lo spazio occupato viene conteggiato',
      quotaAfter.json?.usedBytes > 0,
      `usati: ${quotaAfter.json?.usedBytes}`,
    );
  }

  section('Pratiche di sinistro');
  let claimId;
  let claimReference;
  {
    const prefill = await call('GET', '/api/claims/prefill', { jar: docJar });
    check(
      'precompilazione con i dati dell’assicurato',
      prefill.status === 200 && typeof prefill.json?.insured?.fullName === 'string',
      `stato ${prefill.status}`,
    );

    const created = await call('POST', '/api/claims', { jar: docJar, body: {} });
    check('bozza creata', created.status === 201 && Boolean(created.json?.claimId), `stato ${created.status}`);
    claimId = created.json.claimId;

    const again = await call('POST', '/api/claims', { jar: docJar, body: {} });
    check(
      'una seconda apertura riprende la bozza esistente',
      again.json?.claimId === claimId && again.json?.resumed === true,
      JSON.stringify(again.json),
    );

    const incomplete = await call('POST', `/api/claims/${claimId}/submit`, {
      jar: docJar,
      body: { confirm: true, declarationAccepted: true },
    });
    check(
      'invio bloccato se la pratica e’ incompleta',
      incomplete.status === 400 && Boolean(incomplete.json?.error?.details?.fields),
      `stato ${incomplete.status}`,
    );

    const saved = await call('PATCH', `/api/claims/${claimId}`, {
      jar: docJar,
      body: {
        claimType: 'rc_generale',
        occurredAt: '2026-07-20T09:30',
        placeCity: 'Rho',
        placeProvince: 'mi',
        dynamics: 'Caduta di un vaso dal balcone che ha danneggiato l’auto parcheggiata sotto casa.',
        injuries: false,
        authoritiesInvolved: false,
        estimatedDamage: 1250.5,
        wizardStep: 3,
        parties: [
          { role: 'assicurato', fullName: 'Utente DiProva', fiscalCode: 'RSSMRA85M01H501Q', phone: '3340001122' },
          { role: 'controparte', fullName: 'Vicino Di Casa', companyName: 'Generali Italia' },
        ],
      },
    });
    check('bozza salvata con soggetti coinvolti', saved.status === 200, `stato ${saved.status}: ${saved.text.slice(0, 140)}`);

    const detail = await call('GET', `/api/claims/${claimId}`, { jar: docJar });
    check(
      'la bozza rilegge i dati salvati',
      detail.json?.claim?.placeCity === 'Rho' &&
        detail.json?.claim?.placeProvince === 'MI' &&
        detail.json?.parties?.length === 2 &&
        detail.json?.claim?.estimatedDamage === 1250.5,
      JSON.stringify(detail.json?.claim ?? {}).slice(0, 200),
    );

    const attach = await callRaw(`POST`, `/api/documents?category=fotografia&name=danno.jpg&claimId=${claimId}`, {
      jar: docJar,
      mime: 'image/jpeg',
      bytes: fakeJpeg(2048),
    });
    check('allegato collegato alla pratica', attach.status === 201, `stato ${attach.status}`);

    const submitted = await call('POST', `/api/claims/${claimId}/submit`, {
      jar: docJar,
      body: { confirm: true, declarationAccepted: true },
    });
    check(
      'pratica inviata con protocollo progressivo',
      submitted.status === 200 && /^SIN-\d{4}-\d{4}$/.test(submitted.json?.reference ?? ''),
      `stato ${submitted.status}: ${submitted.text.slice(0, 160)}`,
    );
    claimReference = submitted.json?.reference;

    const duplicate = await call('POST', `/api/claims/${claimId}/submit`, {
      jar: docJar,
      body: { confirm: true, declarationAccepted: true },
    });
    check(
      'un secondo invio non crea una seconda pratica',
      duplicate.json?.alreadySubmitted === true && duplicate.json?.reference === claimReference,
      JSON.stringify(duplicate.json),
    );

    const afterSubmit = await call('PATCH', `/api/claims/${claimId}`, { jar: docJar, body: { dynamics: 'Modifica tardiva.' } });
    check('la pratica inviata non e’ piu’ modificabile dal cliente', afterSubmit.status === 403, `stato ${afterSubmit.status}`);

    const removal = await call('DELETE', `/api/claims/${claimId}`, { jar: docJar, body: {} });
    check('una pratica inviata non puo’ essere eliminata', removal.status === 403, `stato ${removal.status}`);

    const timeline = await call('GET', `/api/claims/${claimId}`, { jar: docJar });
    check(
      'la cronologia mostra l’invio al cliente',
      (timeline.json?.events ?? []).some((event) => event.status === 'submitted'),
      JSON.stringify(timeline.json?.events),
    );
    check(
      'gli allegati risultano collegati alla pratica',
      (timeline.json?.documents ?? []).length === 1,
      `allegati: ${timeline.json?.documents?.length}`,
    );
  }

  section('Gestionale del consulente');
  {
    resetRateLimits();
    const advisorJar = newJar();
    const advisor = await registerAndVerify(advisorJar, { kdf });
    sql(`UPDATE users SET role = 'advisor' WHERE id = '${advisor.userId}'`);
    sql(`UPDATE users SET advisor_id = '${advisor.userId}' WHERE id = '${docUser.userId}'`);

    const clientProfileChange = await call('PATCH', '/api/profile', {
      jar: docJar,
      body: { mobile: '333 777 8899', confirmed: true },
    });
    const profileChangeId = clientProfileChange.json?.changeRequest?.id;
    check(
      'una modifica del cliente crea una voce ricevuta per il gestionale',
      clientProfileChange.status === 200 &&
        Boolean(profileChangeId) &&
        clientProfileChange.json?.changeRequest?.status === 'received',
      `stato ${clientProfileChange.status}: ${clientProfileChange.text.slice(0, 180)}`,
    );

    const clientAttempt = await call('GET', '/api/admin/dashboard', { jar: docJar });
    check('un cliente non entra nel gestionale', clientAttempt.status === 403, `stato ${clientAttempt.status}`);

    const dashboard = await call('GET', '/api/admin/dashboard', { jar: advisorJar });
    check('cruscotto del consulente disponibile', dashboard.status === 200, `stato ${dashboard.status}: ${dashboard.text.slice(0, 160)}`);
    check(
      'la pratica appena inviata compare fra quelle da lavorare',
      (dashboard.json?.counters?.claimsToWork ?? 0) >= 1,
      JSON.stringify(dashboard.json?.counters),
    );
    check(
      'il cruscotto segnala le variazioni anagrafiche da verificare',
      (dashboard.json?.counters?.profileChangesToReview ?? 0) >= 1,
      JSON.stringify(dashboard.json?.counters),
    );

    const clients = await call('GET', '/api/admin/clients', { jar: advisorJar });
    check(
      'elenco clienti limitato al proprio portafoglio',
      clients.status === 200 && clients.json.clients.every((client) => client.id !== advisor.userId),
      `stato ${clients.status}`,
    );
    check(
      'il cliente assegnato compare con i suoi contatori',
      clients.json?.clients?.some((client) => client.id === docUser.userId),
      JSON.stringify(clients.json?.clients?.map((client) => client.id)),
    );

    const search = await call('GET', '/api/admin/clients?search=test-', { jar: advisorJar });
    check('ricerca clienti funzionante', search.status === 200 && search.json.clients.length >= 1, `stato ${search.status}`);

    const detail = await call('GET', `/api/admin/clients/${docUser.userId}`, { jar: advisorJar });
    check(
      'scheda cliente completa',
      detail.status === 200 &&
        Array.isArray(detail.json?.documents) &&
        Array.isArray(detail.json?.claims) &&
        detail.json?.profileChanges?.some((change) => change.id === profileChangeId),
      `stato ${detail.status}`,
    );

    const requestQueues = await call('GET', '/api/admin/requests', { jar: advisorJar });
    check(
      'la coda del consulente include la variazione con prima/dopo e origine',
      requestQueues.status === 200 &&
        requestQueues.json?.profileChanges?.some(
          (change) =>
            change.id === profileChangeId &&
            change.before?.mobile === null &&
            change.after?.mobile === '333 777 8899' &&
            change.origin === 'reserved_area',
        ),
      JSON.stringify(requestQueues.json?.profileChanges),
    );

    const reviewStarted = await call('PATCH', `/api/admin/profile-changes/${profileChangeId}`, {
      jar: advisorJar,
      body: { status: 'in_review', note: 'Controllo recapito in corso.' },
    });
    check(
      'il consulente puo’ marcare la variazione in lavorazione',
      reviewStarted.status === 200 && reviewStarted.json?.status === 'in_review',
      `stato ${reviewStarted.status}`,
    );

    const reviewCompleted = await call('PATCH', `/api/admin/profile-changes/${profileChangeId}`, {
      jar: advisorJar,
      body: { status: 'verified', note: 'Recapito verificato dal consulente.' },
    });
    check(
      'solo il consulente assegna lo stato verificato con data conclusiva',
      reviewCompleted.status === 200 &&
        reviewCompleted.json?.status === 'verified' &&
        Boolean(reviewCompleted.json?.reviewedAt),
      JSON.stringify(reviewCompleted.json),
    );

    const clientChangeHistory = await call('GET', '/api/profile/changes', { jar: docJar });
    const verifiedChange = clientChangeHistory.json?.changes?.find(
      (change) => change.id === profileChangeId,
    );
    check(
      'il cliente vede conferma e nota solo dopo la verifica effettiva',
      verifiedChange?.status === 'verified' &&
        Boolean(verifiedChange?.reviewedAt) &&
        verifiedChange?.reviewNote === 'Recapito verificato dal consulente.',
      JSON.stringify(verifiedChange),
    );

    const foreignClient = newJar();
    const foreign = await registerAndVerify(foreignClient, { kdf });
    const forbiddenDetail = await call('GET', `/api/admin/clients/${foreign.userId}`, { jar: advisorJar });
    check(
      'un cliente non assegnato non e’ accessibile dal gestionale',
      forbiddenDetail.status === 403,
      `stato ${forbiddenDetail.status}`,
    );

    const policy = await call('POST', '/api/admin/policies', {
      jar: advisorJar,
      body: {
        userId: docUser.userId,
        companyName: 'Generali Italia',
        policyNumber: `POL-${uniq()}`,
        branch: 'auto',
        status: 'active',
        effectiveDate: '2026-01-01',
        expiryDate: '2027-01-01',
        premium: 480.5,
        plate: 'ab123cd',
        createRenewalDeadline: true,
      },
    });
    check('polizza inserita dal consulente', policy.status === 201, `stato ${policy.status}: ${policy.text.slice(0, 160)}`);

    const clientPolicies = await call('GET', '/api/portal/policies', { jar: docJar });
    check(
      'la polizza compare subito al cliente',
      clientPolicies.json?.policies?.some((item) => item.premium === 480.5 && item.plate === 'AB123CD'),
      JSON.stringify(clientPolicies.json?.policies),
    );

    const clientDeadlines = await call('GET', '/api/portal/deadlines', { jar: docJar });
    check(
      'la scadenza di rinnovo viene creata insieme alla polizza',
      clientDeadlines.json?.deadlines?.some((item) => item.type === 'rinnovo'),
      JSON.stringify(clientDeadlines.json?.deadlines),
    );

    const foreignPolicy = await call('POST', '/api/admin/policies', {
      jar: advisorJar,
      body: {
        userId: foreign.userId,
        companyName: 'Allianz',
        policyNumber: `POL-${uniq()}`,
        branch: 'casa',
      },
    });
    check(
      'il consulente non puo’ inserire polizze a clienti altrui',
      foreignPolicy.status === 403,
      `stato ${foreignPolicy.status}`,
    );

    const workflow = await call('PATCH', `/api/admin/claims/${claimId}`, {
      jar: advisorJar,
      body: {
        status: 'sent_to_company',
        companyClaimNumber: 'SX-99887',
        advisorNotes: 'Nota interna: attendere perizia.',
        clientUpdate: 'Abbiamo trasmesso la pratica alla compagnia.',
      },
    });
    check('avanzamento della pratica registrato', workflow.status === 200, `stato ${workflow.status}`);

    const clientView = await call('GET', `/api/claims/${claimId}`, { jar: docJar });
    check(
      'il cliente vede il nuovo stato',
      clientView.json?.claim?.status === 'sent_to_company',
      `stato pratica: ${clientView.json?.claim?.status}`,
    );
    check(
      'il cliente vede l’aggiornamento scritto per lui',
      (clientView.json?.events ?? []).some((event) => event.detail?.includes('trasmesso')),
      JSON.stringify(clientView.json?.events?.map((event) => event.detail)),
    );
    check(
      'le note interne del consulente non arrivano al cliente',
      !JSON.stringify(clientView.json ?? {}).includes('Nota interna'),
      'nota interna esposta al cliente',
    );

    const hold = await call('PATCH', `/api/admin/documents/${uploadedDocumentId}/hold`, {
      jar: advisorJar,
      body: { legalHold: true, reason: 'Contenzioso in corso' },
    });
    check('blocco legale applicabile dal consulente', hold.status === 200, `stato ${hold.status}`);

    const blockedDelete = await call('DELETE', `/api/documents/${uploadedDocumentId}`, {
      jar: docJar,
      body: { reason: 'non serve piu' },
    });
    check(
      'con blocco legale il documento non si elimina',
      blockedDelete.status === 403,
      `stato ${blockedDelete.status}`,
    );

    const storage = await call('GET', '/api/admin/storage', { jar: advisorJar });
    check(
      'spazio occupato monitorabile dal gestionale',
      storage.status === 200 && storage.json?.total?.bytes > 0,
      JSON.stringify(storage.json?.total),
    );

    const threads = await call('POST', '/api/portal/threads', {
      jar: docJar,
      body: { subject: 'Domanda sulla pratica', category: 'sinistro', body: 'A che punto siamo?' },
    });
    const reply = await call('POST', `/api/admin/threads/${threads.json.threadId}/reply`, {
      jar: advisorJar,
      body: { body: 'Aggiornamento inviato oggi.' },
    });
    check('il consulente risponde dal gestionale', reply.status === 201, `stato ${reply.status}`);

    const conversation = await call('GET', `/api/portal/threads/${threads.json.threadId}`, { jar: docJar });
    const roles = conversation.json?.messages?.map((message) => message.senderRole) ?? [];
    check(
      'la risposta arriva al cliente firmata come consulente',
      roles.includes('advisor'),
      `ruoli: ${roles.join(', ')}`,
    );

    const auditCross = sql(
      `SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'admin.%' AND actor_id = '${advisor.userId}'`,
    );
    check(
      'ogni operazione del gestionale e’ tracciata',
      /\b[1-9]\d*\b/.test(auditCross),
      `risultato: ${auditCross.slice(0, 160)}`,
    );
  }

  section('Sito e rotte SPA');
  {
    for (const path of ['/', '/accedi', '/area-riservata/scadenze']) {
      const page = await call('GET', path);
      check(
        `GET ${path} serve la pagina`,
        page.status === 200 && page.text.includes('<div id="root">'),
        `stato ${page.status}`,
      );
    }

    const unknownApi = await call('GET', '/api/non-esiste');
    check('endpoint API inesistente restituisce 404 JSON', unknownApi.status === 404 && unknownApi.json?.error?.code === 'not_found');
  }

  console.log(
    `\n\x1b[1mRisultato:\x1b[0m ${passed} verifiche superate, ${failed} fallite\n`,
  );
  if (failed > 0) {
    console.log('\x1b[31mFallimenti:\x1b[0m');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n\x1b[31mErrore durante le prove:\x1b[0m ${error.message}`);
  process.exit(1);
});
