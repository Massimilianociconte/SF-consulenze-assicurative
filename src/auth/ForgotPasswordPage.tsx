import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MailCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, AuthShell, Field, SubmitButton, Turnstile } from './components';

export const ForgotPasswordPage: React.FC = () => {
  const { config } = useAuth();
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const handleToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      await api.post('/api/auth/forgot-password', { email, turnstileToken: turnstileToken ?? undefined });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setError('Errore imprevisto. Riprova.');
      }
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Controlla la tua email" subtitle="Se l’indirizzo e’ registrato, riceverai il link per reimpostare la password.">
        <div className="card text-center">
          <span className="inline-flex w-14 h-14 rounded-full bg-[#f4ece0] border border-[rgba(197,160,89,0.35)] items-center justify-center mb-4">
            <MailCheck size={26} className="text-[#c5a059]" />
          </span>
          <p className="text-[0.95rem] leading-relaxed text-[#334155]">
            Il link resta valido <strong>60 minuti</strong> e puo’ essere usato una sola volta. Se non ricevi nulla,
            controlla la cartella spam.
          </p>
        </div>
        <div className="mt-6 text-center">
          <Link to="/accedi" className="text-sm font-semibold text-[#64748b] hover:text-[#0a192f]">
            Torna all’accesso
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Password dimenticata"
      subtitle="Inserisci l’email con cui ti sei registrato: ti invieremo un link per impostarne una nuova."
      footer={
        <p>
          Ti e’ tornata in mente?{' '}
          <Link to="/accedi" className="font-bold text-[#0a192f] underline decoration-[#c5a059] decoration-2 underline-offset-2 hover:text-[#c5a059]">
            Accedi
          </Link>
        </p>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}

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

        <Turnstile siteKey={config?.turnstileSiteKey ?? null} onToken={handleToken} />

        <SubmitButton loading={loading}>Invia link di recupero</SubmitButton>
      </form>
    </AuthShell>
  );
};

export default ForgotPasswordPage;
