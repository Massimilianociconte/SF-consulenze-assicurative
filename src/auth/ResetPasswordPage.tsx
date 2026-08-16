import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { derivePassword, PasswordDerivationError, validatePassword } from '../lib/password';
import { Alert, AuthShell, PasswordField, SubmitButton } from './components';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { config } = useAuth();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // L'indirizzo email serve al browser per ricalcolare il salt della
  // derivazione password. Si chiede al server a partire dal token, senza
  // consumarlo: cosi' un link scaduto viene segnalato subito, prima di far
  // digitare la nuova password.
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(token));
  const [tokenValid, setTokenValid] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (!token || checked.current) return;
    checked.current = true;

    (async () => {
      try {
        const result = await api.post<{ email: string }>('/api/auth/reset-token/check', { token });
        setEmail(result.email);
        setTokenValid(true);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Link non valido o scaduto.');
      } finally {
        setChecking(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const passwordProblem = validatePassword(password);
    if (passwordProblem) {
      setFieldErrors({ password: passwordProblem });
      return;
    }
    if (password !== passwordConfirm) {
      setFieldErrors({ passwordConfirm: 'Le due password non coincidono.' });
      return;
    }
    if (!email) {
      setError('Link non valido o scaduto. Richiedine uno nuovo.');
      return;
    }

    setLoading(true);
    try {
      const passwordDerived = await derivePassword(config?.passwordKdf, email, password);
      await api.post('/api/auth/reset-password', { token, passwordDerived });
      navigate('/accedi?reimpostata=1', { replace: true });
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

  if (!token || (!checking && !tokenValid)) {
    return (
      <AuthShell title="Link non valido" subtitle="Il collegamento e’ scaduto, gia’ utilizzato o incompleto.">
        <Alert tone="error">
          {error ?? 'Apri di nuovo il link ricevuto via email, oppure richiedine uno nuovo.'}
        </Alert>
        <Link to="/password-dimenticata" className="btn btn-secondary w-full py-3.5">
          Richiedi un nuovo link
        </Link>
      </AuthShell>
    );
  }

  if (checking) {
    return (
      <AuthShell title="Verifica del link…" subtitle="Un istante: stiamo controllando la validita’ del collegamento.">
        <div className="card flex items-center gap-4">
          <span className="w-9 h-9 rounded-full border-[3px] border-[#c5a059]/30 border-t-[#c5a059] animate-spin shrink-0" />
          <p className="text-[0.95rem] text-[#334155]">Controllo in corso…</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Imposta una nuova password"
      subtitle={
        email
          ? `Stai reimpostando la password di ${email}. Al termine tutte le sessioni aperte verranno chiuse.`
          : 'Scegli una password che non usi su altri servizi.'
      }
      footer={
        <p>
          <Link to="/accedi" className="font-bold text-[#0a192f] underline decoration-[#c5a059] decoration-2 underline-offset-2 hover:text-[#c5a059]">
            Torna all’accesso
          </Link>
        </p>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}

      <form onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="Nuova password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
          showStrength
          hint="Almeno 10 caratteri, con lettere e numeri."
          error={fieldErrors.password}
        />

        <PasswordField
          label="Conferma nuova password"
          name="passwordConfirm"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          autoComplete="new-password"
          required
          error={fieldErrors.passwordConfirm}
        />

        <SubmitButton loading={loading}>
          <KeyRound size={17} />
          Salva nuova password
        </SubmitButton>
      </form>
    </AuthShell>
  );
};

export default ResetPasswordPage;
