import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { AGENCY_INFO } from '../data/content';

/* -------------------------------------------------------------------------
 * Struttura pagina
 * ---------------------------------------------------------------------- */

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Elenco mostrato nel pannello laterale scuro (solo desktop). */
  highlights?: string[];
}

const DEFAULT_HIGHLIGHTS = [
  'Polizze, scadenze e contratti sempre consultabili',
  'Apertura guidata delle pratiche di sinistro',
  'Documenti al sicuro e condivisi con il tuo consulente',
  'Stato di avanzamento delle richieste in tempo reale',
];

export const AuthShell: React.FC<AuthShellProps> = ({
  title,
  subtitle,
  children,
  footer,
  highlights = DEFAULT_HIGHLIGHTS,
}) => (
  <div className="min-h-screen grid lg:grid-cols-[1.02fr_1fr] bg-[#faf8f5]">
    {/* Pannello identitario (desktop) */}
    <aside className="hidden lg:flex flex-col justify-between relative overflow-hidden bg-[#0a192f] text-white p-12">
      <div
        aria-hidden
        className="absolute -top-28 -left-20 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #c5a059 0%, transparent 68%)' }}
      />
      <div
        aria-hidden
        className="absolute bottom-[-160px] right-[-120px] w-[380px] h-[380px] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #c5a059 0%, transparent 70%)' }}
      />

      <div className="relative">
        <Link to="/" className="inline-flex items-center gap-3 group">
          <span className="w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] p-[2px] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <img src={logoImg} alt="" className="w-full h-full object-contain rounded-full" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-extrabold tracking-tight">S.F. Consulenze Assicurative</span>
            <span className="text-[#c5a059] text-xs font-semibold">Simone Facchi • Rho (MI)</span>
          </span>
        </Link>
      </div>

      <div className="relative max-w-md">
        <span className="badge-pill badge-gold mb-5">
          <Sparkles size={13} />
          Area riservata clienti
        </span>
        <h2 className="text-[2rem] leading-[1.15] font-extrabold tracking-tight mb-4">
          La tua posizione assicurativa, sempre a portata di mano.
        </h2>
        <ul className="space-y-3 mt-6">
          {highlights.map((item) => (
            <li key={item} className="flex items-start gap-3 text-slate-200 text-[0.95rem]">
              <CheckCircle2 size={19} className="text-[#c5a059] shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative text-[11px] leading-relaxed text-slate-400 border-t border-white/10 pt-5">
        <p className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
          <ShieldCheck size={14} className="text-[#c5a059]" />
          Dati protetti e trattati secondo il GDPR
        </p>
        <p>
          {AGENCY_INFO.name} di {AGENCY_INFO.referent} — {AGENCY_INFO.fullAddress}
        </p>
      </div>
    </aside>

    {/* Colonna form */}
    <main className="flex flex-col min-h-screen">
      <header className="lg:hidden flex items-center justify-between gap-3 px-5 py-4 bg-[#0a192f]">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] p-[2px] flex items-center justify-center">
            <img src={logoImg} alt="" className="w-full h-full object-contain rounded-full" />
          </span>
          <span className="text-white font-bold text-sm leading-tight">S.F. Consulenze</span>
        </Link>
        <Link
          to="/"
          className="text-[#c5a059] text-xs font-bold inline-flex items-center gap-1 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Torna al sito
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-5 py-8 sm:px-8 sm:py-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-7">
            <h1 className="text-[1.75rem] sm:text-[2rem] font-extrabold tracking-tight text-[#0f172a] leading-tight">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-[0.95rem] text-[#64748b] leading-relaxed">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="mt-7 text-sm text-[#64748b]">{footer}</div>}
        </div>
      </div>

      <footer className="px-5 py-5 sm:px-8 text-[11px] text-[#94a3b8] border-t border-[rgba(15,23,42,0.06)] text-center lg:text-left">
        <Link to="/" className="hidden lg:inline-flex items-center gap-1 font-semibold text-[#64748b] hover:text-[#0a192f] mb-2">
          <ArrowLeft size={13} />
          Torna al sito
        </Link>
        <p>
          Intermediario iscritto al RUI IVASS. I dati sono trattati secondo l’informativa privacy pubblicata sul sito.
        </p>
      </footer>
    </main>
  </div>
);

/* -------------------------------------------------------------------------
 * Messaggi
 * ---------------------------------------------------------------------- */

export const Alert: React.FC<{ tone: 'error' | 'success' | 'info'; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const styles = {
    error: 'bg-[#fef2f2] border-[#fecaca] text-[#991b1b]',
    success: 'bg-[#f0fdf4] border-[#bbf7d0] text-[#166534]',
    info: 'bg-[#f4ece0] border-[rgba(197,160,89,0.35)] text-[#0a192f]',
  }[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium mb-5 ${styles}`}
    >
      {tone === 'error' ? (
        <AlertCircle size={18} className="shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
      )}
      <span>{children}</span>
    </div>
  );
};

/* -------------------------------------------------------------------------
 * Campi di form
 * ---------------------------------------------------------------------- */

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, error, hint, icon, id, ...props }) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="mb-4">
      <label htmlFor={fieldId} className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">
        {label}
        {props.required && <span className="text-[#c5a059] ml-0.5">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-[0.95rem] text-[#0f172a] placeholder:text-[#94a3b8] transition-colors ${
            icon ? 'pl-11' : ''
          } ${
            error
              ? 'border-[#fca5a5] focus:border-[#ef4444]'
              : 'border-[rgba(15,23,42,0.12)] focus:border-[#c5a059]'
          }`}
          {...props}
        />
      </div>
      {hint && !error && (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-[0.75rem] text-[#64748b]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="mt-1.5 text-[0.78rem] font-semibold text-[#b91c1c]">
          {error}
        </p>
      )}
    </div>
  );
};

interface PasswordFieldProps extends FieldProps {
  showStrength?: boolean;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({ showStrength, value, ...props }) => {
  const [visible, setVisible] = useState(false);
  const strength = typeof value === 'string' ? passwordStrength(value) : null;

  return (
    <div className="relative">
      <Field
        {...props}
        value={value}
        type={visible ? 'text' : 'password'}
        icon={<Lock size={17} />}
        autoComplete={props.autoComplete ?? 'current-password'}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-[2.05rem] text-[#64748b] hover:text-[#0a192f] p-1.5 rounded-lg"
        aria-label={visible ? 'Nascondi password' : 'Mostra password'}
        title={visible ? 'Nascondi password' : 'Mostra password'}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>

      {showStrength && strength && typeof value === 'string' && value.length > 0 && (
        <div className="-mt-2 mb-4" aria-live="polite">
          <div className="flex gap-1.5 mb-1">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index < strength.score ? strength.color : 'bg-[#e2e8f0]'
                }`}
              />
            ))}
          </div>
          <p className="text-[0.72rem] font-semibold text-[#64748b]">Sicurezza password: {strength.label}</p>
        </div>
      )}
    </div>
  );
};

export function passwordStrength(value: string): { score: number; label: string; color: string } {
  let score = 0;
  if (value.length >= 10) score++;
  if (value.length >= 14) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;

  const map = [
    { label: 'debole', color: 'bg-[#ef4444]' },
    { label: 'debole', color: 'bg-[#ef4444]' },
    { label: 'discreta', color: 'bg-[#f59e0b]' },
    { label: 'buona', color: 'bg-[#c5a059]' },
    { label: 'ottima', color: 'bg-[#16a34a]' },
  ];
  return { score, ...map[score] };
}

export const Checkbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  children: React.ReactNode;
}> = ({ checked, onChange, error, children }) => {
  const id = useId();
  return (
    <div className="mb-4">
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={Boolean(error)}
          className="mt-0.5 w-[18px] h-[18px] rounded border-[rgba(15,23,42,0.25)] accent-[#c5a059] shrink-0 cursor-pointer"
        />
        <label htmlFor={id} className="text-[0.82rem] leading-relaxed text-[#334155] cursor-pointer">
          {children}
        </label>
      </div>
      {error && <p className="mt-1.5 ml-7 text-[0.78rem] font-semibold text-[#b91c1c]">{error}</p>}
    </div>
  );
};

export const SubmitButton: React.FC<{ loading: boolean; children: React.ReactNode; disabled?: boolean }> = ({
  loading,
  children,
  disabled,
}) => (
  <button type="submit" disabled={loading || disabled} className="btn btn-primary w-full py-3.5 disabled:opacity-60 disabled:cursor-not-allowed">
    {loading && (
      <span className="w-4 h-4 rounded-full border-2 border-[#07111e]/30 border-t-[#07111e] animate-spin" aria-hidden />
    )}
    {children}
  </button>
);

/* -------------------------------------------------------------------------
 * Accesso con Google
 * ---------------------------------------------------------------------- */

export const GoogleButton: React.FC<{ redirect?: string; label?: string }> = ({
  redirect = '/area-riservata',
  label = 'Continua con Google',
}) => (
  <a
    href={`/api/auth/google/start?redirect=${encodeURIComponent(redirect)}`}
    className="w-full inline-flex items-center justify-center gap-3 rounded-[14px] border border-[rgba(15,23,42,0.14)] bg-white px-5 py-3.5 text-[0.95rem] font-bold text-[#0f172a] hover:bg-[#f8fafc] hover:border-[rgba(15,23,42,0.24)] transition-colors"
  >
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
    {label}
  </a>
);

export const Divider: React.FC<{ label?: string }> = ({ label = 'oppure' }) => (
  <div className="flex items-center gap-3 my-5">
    <span className="h-px flex-1 bg-[rgba(15,23,42,0.1)]" />
    <span className="text-[0.72rem] font-bold uppercase tracking-wider text-[#94a3b8]">{label}</span>
    <span className="h-px flex-1 bg-[rgba(15,23,42,0.1)]" />
  </div>
);

/* -------------------------------------------------------------------------
 * Turnstile (protezione bot, attiva solo se configurata lato server)
 * ---------------------------------------------------------------------- */

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
    onTurnstileReady?: () => void;
  }
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const Turnstile: React.FC<{ siteKey: string | null; onToken: (token: string | null) => void }> = ({
  siteKey,
  onToken,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !window.turnstile || !containerRef.current || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'light',
        language: 'it',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else if (!document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', renderWidget);
      document.head.appendChild(script);
    } else {
      const interval = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(interval);
          renderWidget();
        }
      }, 200);
      return () => window.clearInterval(interval);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="mb-4 flex justify-center" />;
};
