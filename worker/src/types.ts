/** Tipi condivisi del Worker. */

export interface EmailAddressInput {
  email: string;
  name?: string;
}

export interface EmailSendMessage {
  to: string | string[];
  from: EmailAddressInput | string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

/**
 * Binding Email Sending di Cloudflare (richiede piano Workers Paid).
 * Tipizzato qui in modo minimale per non dipendere dalla versione dei
 * @cloudflare/workers-types installata.
 */
export interface EmailSenderBinding {
  send(message: EmailSendMessage): Promise<{ messageId?: string }>;
}

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DOCS: R2Bucket;
  /** Presente solo con piano Workers Paid; sul piano gratuito si usa MAIL_PROVIDER. */
  EMAIL?: EmailSenderBinding;

  ENVIRONMENT: string;
  APP_URL: string;

  /** 'auto' | 'cloudflare' | 'brevo' | 'resend' | 'log' */
  MAIL_PROVIDER?: string;
  MAIL_API_KEY?: string;
  MAIL_FROM: string;
  MAIL_FROM_NAME: string;
  MAIL_REPLY_TO?: string;
  ADVISOR_EMAIL?: string;

  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;

  /** Chiave per firmare i link temporanei di download dei documenti. */
  DOWNLOAD_SIGNING_KEY?: string;
}

export type Role = 'client' | 'advisor' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  status: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  /** Consulente di riferimento: usato per delimitare cosa puo' vedere un advisor. */
  advisorId: string | null;
}

/** Riga `users` come arriva da D1. */
export interface UserRow {
  id: string;
  email: string;
  email_normalized: string;
  email_verified_at: string | null;
  password_hash: string | null;
  password_changed_at: string | null;
  role: Role;
  status: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  mobile: string | null;
  pec: string | null;
  fiscal_code: string | null;
  vat_number: string | null;
  birth_date: string | null;
  birth_place: string | null;
  address_street: string | null;
  address_locality: string | null;
  address_city: string | null;
  address_zip: string | null;
  address_province: string | null;
  address_country: string | null;
  advisor_id: string | null;
  failed_login_count: number;
  locked_until: string | null;
  last_login_at: string | null;
  tos_accepted_at: string | null;
  privacy_accepted_at: string | null;
  privacy_version: string | null;
  marketing_consent: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: AuthUser | null;
    sessionId: string | null;
    authMethod: 'password' | 'google' | null;
  };
}
