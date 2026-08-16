import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { api, ApiError, type SessionUser } from '../lib/api';
import { useAuth } from '../lib/auth';
import { derivePassword, PasswordDerivationError } from '../lib/password';
import { Alert, AuthShell, Divider, Field, GoogleButton, PasswordField, SubmitButton, Turnstile } from './components';

const GOOGLE_ERRORS: Record<string, string> = {
  google_annullato: 'Accesso con Google annullato.',
  google_stato_non_valido: 'Sessione di accesso non valida. Riprova.',
  google_sessione_scaduta: 'La richiesta di accesso e’ scaduta. Riprova.',
  google_email_non_verificata: 'L’indirizzo Google collegato non risulta verificato.',
  google_non_configurato: 'Accesso con Google non ancora attivo.',
  account_sospeso: 'Account sospeso. Contatta il consulente.',
};

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { config, setUser } = useAuth();

  const redirect = searchParams.get('redirect') ?? '/area-riservata';
  const googleError = searchParams.get('errore');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const initialNotice = useMemo(() => {
    if (searchParams.get('reimpostata')) return 'Password aggiornata. Ora puoi accedere con le nuove credenziali.';
    if (searchParams.get('disconnesso')) return 'Sessione chiusa correttamente.';
    return null;
  }, [searchParams]);

  const handleToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      // La password non lascia il browser: viene inviato solo il valore
      // derivato con PBKDF2 (vedi lib/password.ts).
      const passwordDerived = await derivePassword(config?.passwordKdf, email, password);

      const result = await api.post<{ ok: boolean; user: SessionUser }>('/api/auth/login', {
        email,
        passwordDerived,
        turnstileToken: turnstileToken ?? undefined,
      });
      setUser(result.user);
      navigate(redirect.startsWith('/') ? redirect : '/area-riservata', { replace: true });
    } catch (err) {
      if (err instanceof PasswordDerivationError) {
        setError(err.message);
      } else if (err instanceof ApiError) {
        setError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setError('Errore imprevisto. Riprova.');
      }
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Accedi all’area riservata"
      subtitle="Consulta polizze, scadenze, documenti e pratiche di sinistro in un unico posto."
      footer={
        <p>
          Non hai ancora un account?{' '}
          <Link to="/registrati" className="font-bold text-[#0a192f] underline decoration-[#c5a059] decoration-2 underline-offset-2 hover:text-[#c5a059]">
            Registrati
          </Link>
        </p>
      }
    >
      {googleError && <Alert tone="error">{GOOGLE_ERRORS[googleError] ?? 'Accesso con Google non riuscito. Riprova.'}</Alert>}
      {initialNotice && !error && <Alert tone="success">{initialNotice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {config?.googleEnabled && (
        <>
          <GoogleButton redirect={redirect} />
          <Divider />
        </>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Indirizzo email"
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nome@esempio.it"
          autoComplete="username"
          inputMode="email"
          required
          icon={<Mail size={17} />}
          error={fieldErrors.email}
        />

        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="La tua password"
          autoComplete="current-password"
          required
          error={fieldErrors.password}
        />

        <div className="flex justify-end -mt-1 mb-5">
          <Link to="/password-dimenticata" className="text-[0.82rem] font-semibold text-[#64748b] hover:text-[#0a192f]">
            Password dimenticata?
          </Link>
        </div>

        <Turnstile siteKey={config?.turnstileSiteKey ?? null} onToken={handleToken} />

        <SubmitButton loading={loading}>Accedi</SubmitButton>
      </form>
    </AuthShell>
  );
};

export default LoginPage;
