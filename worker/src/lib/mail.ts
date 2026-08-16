import type { Env } from '../types';

/**
 * Email transazionali (verifica indirizzo, reset password).
 *
 * Cloudflare Email Sending richiede il piano Workers Paid: sul piano gratuito
 * serve un fornitore esterno. Il trasporto e' quindi selezionabile senza
 * toccare il codice, tramite la variabile MAIL_PROVIDER:
 *
 *   auto        (predefinito) binding EMAIL se disponibile, altrimenti HTTP, altrimenti log
 *   cloudflare  binding EMAIL (piano Paid)
 *   brevo       API Brevo   - fornitore francese, 300 email/giorno gratuite, dati in UE
 *   resend      API Resend  - 3.000 email/mese gratuite
 *   log         scrive solo nei log (sviluppo)
 *
 * La chiave del fornitore va caricata come segreto: `wrangler secret put MAIL_API_KEY`.
 * Qualunque fornitore esterno tratta indirizzi email per conto del titolare:
 * va nominato responsabile del trattamento (art. 28 GDPR) e indicato in
 * informativa. Brevo e' l'opzione con dati in UE.
 */

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const NAVY = '#0a192f';
const GOLD = '#c5a059';
const IVORY = '#faf8f5';

const REQUEST_TIMEOUT_MS = 8000;

function layout(env: Env, title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="it">
<body style="margin:0;padding:0;background:${IVORY};font-family:'Helvetica Neue',Arial,sans-serif;color:#334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:${NAVY};padding:24px 28px;border-bottom:2px solid ${GOLD};">
            <div style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.2px;">S.F. Consulenze Assicurative</div>
            <div style="color:${GOLD};font-size:12px;font-weight:600;margin-top:4px;">Simone Facchi &bull; Rho (MI)</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">${title}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;background:#f4f0ea;border-top:1px solid rgba(15,23,42,0.08);font-size:11px;line-height:1.6;color:#64748b;">
            Messaggio automatico inviato da <a href="${env.APP_URL}" style="color:${NAVY};">${env.APP_URL.replace(/^https?:\/\//, '')}</a>.
            Non rispondere a questo indirizzo${env.MAIL_REPLY_TO ? `: per assistenza scrivi a <a href="mailto:${env.MAIL_REPLY_TO}" style="color:${NAVY};">${env.MAIL_REPLY_TO}</a>` : ''}.
            <br />I dati sono trattati secondo l'informativa privacy pubblicata sul sito.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:${GOLD};color:${NAVY};font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px;">${label}</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Se il pulsante non funziona, copia questo indirizzo nel browser:</p>
  <p style="margin:0;font-size:12px;word-break:break-all;color:${NAVY};">${url}</p>`;
}

/* -------------------------------------------------------------------------
 * Trasporti
 * ---------------------------------------------------------------------- */

type Transport = 'cloudflare' | 'brevo' | 'resend' | 'log';

function resolveTransport(env: Env): Transport {
  const configured = (env.MAIL_PROVIDER ?? 'auto').toLowerCase();
  if (configured === 'cloudflare' || configured === 'brevo' || configured === 'resend' || configured === 'log') {
    return configured;
  }
  if (env.EMAIL) return 'cloudflare';
  if (env.MAIL_API_KEY) return 'brevo';
  return 'log';
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    // Senza timeout una API lenta consumerebbe il budget della richiesta.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function sendViaBrevo(env: Env, args: SendArgs): Promise<void> {
  const response = await postJson(
    'https://api.brevo.com/v3/smtp/email',
    { 'api-key': env.MAIL_API_KEY ?? '' },
    {
      sender: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME },
      to: [{ email: args.to }],
      replyTo: env.MAIL_REPLY_TO ? { email: env.MAIL_REPLY_TO } : undefined,
      subject: args.subject,
      htmlContent: args.html,
      textContent: args.text,
    },
  );
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${await response.text()}`);
}

async function sendViaResend(env: Env, args: SendArgs): Promise<void> {
  const response = await postJson(
    'https://api.resend.com/emails',
    { Authorization: `Bearer ${env.MAIL_API_KEY ?? ''}` },
    {
      from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`,
      to: [args.to],
      reply_to: env.MAIL_REPLY_TO,
      subject: args.subject,
      html: args.html,
      text: args.text,
    },
  );
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

async function deliver(env: Env, args: SendArgs, transport: Transport): Promise<void> {
  switch (transport) {
    case 'cloudflare':
      if (!env.EMAIL) throw new Error('Binding EMAIL non configurato');
      await env.EMAIL.send({
        to: args.to,
        from: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME },
        replyTo: env.MAIL_REPLY_TO,
        subject: args.subject,
        html: args.html,
        text: args.text,
      });
      return;
    case 'brevo':
      return sendViaBrevo(env, args);
    case 'resend':
      return sendViaResend(env, args);
    case 'log':
      console.log(`[mail:log] a=${args.to} oggetto="${args.subject}"\n${args.text}`);
      return;
  }
}

/**
 * Invia con un solo tentativo di ripetizione: gli errori temporanei di rete
 * sono la causa piu' frequente di mancato invio. L'esito e' un booleano perche'
 * il fallimento dell'email non deve mai far fallire l'operazione dell'utente:
 * verifica e reset possono sempre essere richiesti di nuovo.
 */
export async function sendMail(env: Env, args: SendArgs): Promise<boolean> {
  const transport = resolveTransport(env);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await deliver(env, args, transport);
      return true;
    } catch (error) {
      const last = attempt === 2;
      console.error(`[mail] invio fallito (${transport}, tentativo ${attempt})`, args.subject, error);
      if (last) return false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return false;
}

/* -------------------------------------------------------------------------
 * Messaggi
 * ---------------------------------------------------------------------- */

export function sendVerificationEmail(env: Env, to: string, name: string | null, url: string) {
  const saluto = name ? `Gentile ${name},` : 'Gentile Cliente,';
  return sendMail(env, {
    to,
    subject: 'Conferma il tuo indirizzo email - S.F. Consulenze Assicurative',
    html: layout(
      env,
      'Conferma il tuo indirizzo email',
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${saluto}</p>
       <p style="margin:0;font-size:15px;line-height:1.6;">per completare l'attivazione della tua area riservata conferma l'indirizzo email cliccando sul pulsante qui sotto.</p>
       ${button(url, 'Conferma indirizzo email')}
       <p style="margin:20px 0 0;font-size:13px;color:#64748b;">Il link resta valido 24 ore. Se non hai richiesto tu la registrazione, ignora questo messaggio.</p>`,
    ),
    text: `${saluto}\n\nConferma il tuo indirizzo email aprendo questo link (valido 24 ore):\n${url}\n\nSe non hai richiesto tu la registrazione, ignora questo messaggio.`,
  });
}

export function sendPasswordResetEmail(env: Env, to: string, name: string | null, url: string) {
  const saluto = name ? `Gentile ${name},` : 'Gentile Cliente,';
  return sendMail(env, {
    to,
    subject: 'Reimposta la password - S.F. Consulenze Assicurative',
    html: layout(
      env,
      'Reimposta la tua password',
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${saluto}</p>
       <p style="margin:0;font-size:15px;line-height:1.6;">abbiamo ricevuto una richiesta di reimpostazione della password per la tua area riservata.</p>
       ${button(url, 'Imposta una nuova password')}
       <p style="margin:20px 0 0;font-size:13px;color:#64748b;">Il link resta valido 60 minuti e puo' essere usato una sola volta. Se non hai richiesto tu il cambio, non e' necessario fare nulla: la password attuale resta valida.</p>`,
    ),
    text: `${saluto}\n\nPer reimpostare la password apri questo link (valido 60 minuti, monouso):\n${url}\n\nSe non hai richiesto tu il cambio, ignora il messaggio: la password attuale resta valida.`,
  });
}

/**
 * Inviata quando qualcuno tenta di registrarsi con un'email gia' presente:
 * al richiedente non viene rivelato nulla, il titolare legittimo viene avvisato.
 */
export function sendExistingAccountEmail(env: Env, to: string, resetUrl: string) {
  return sendMail(env, {
    to,
    subject: 'Hai gia’ un account - S.F. Consulenze Assicurative',
    html: layout(
      env,
      'Risulta gia’ un account con questo indirizzo',
      `<p style="margin:0;font-size:15px;line-height:1.6;">Abbiamo ricevuto una richiesta di registrazione con questo indirizzo email, ma un account risulta gia' attivo.</p>
       <p style="margin:12px 0 0;font-size:15px;line-height:1.6;">Se sei stato tu e non ricordi la password, puoi reimpostarla:</p>
       ${button(resetUrl, 'Reimposta la password')}
       <p style="margin:20px 0 0;font-size:13px;color:#64748b;">Se non sei stato tu, ignora questo messaggio: nessuna modifica e' stata apportata al tuo account.</p>`,
    ),
    text: `Abbiamo ricevuto una richiesta di registrazione con questo indirizzo, ma un account risulta gia' attivo.\n\nSe sei stato tu e non ricordi la password, reimpostala qui:\n${resetUrl}\n\nSe non sei stato tu, ignora il messaggio.`,
  });
}

export function sendPasswordChangedEmail(env: Env, to: string) {
  return sendMail(env, {
    to,
    subject: 'Password modificata - S.F. Consulenze Assicurative',
    html: layout(
      env,
      'La password e’ stata modificata',
      `<p style="margin:0;font-size:15px;line-height:1.6;">La password della tua area riservata e' stata modificata poco fa e tutte le altre sessioni attive sono state disconnesse.</p>
       <p style="margin:12px 0 0;font-size:15px;line-height:1.6;"><strong>Non sei stato tu?</strong> Contattaci subito${env.MAIL_REPLY_TO ? ` scrivendo a ${env.MAIL_REPLY_TO}` : ''}.</p>`,
    ),
    text: `La password della tua area riservata e' stata modificata e le altre sessioni attive sono state disconnesse.\n\nNon sei stato tu? Contattaci subito${env.MAIL_REPLY_TO ? ` scrivendo a ${env.MAIL_REPLY_TO}` : ''}.`,
  });
}
