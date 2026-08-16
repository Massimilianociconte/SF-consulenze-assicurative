import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, MailCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, AuthShell, Field, SubmitButton } from './components';

type Status = 'idle' | 'verifying' | 'success' | 'error';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        await api.post('/api/auth/verify-email', { token });
        await refresh();
        setStatus('success');
        // Piccola pausa: l'utente vede la conferma prima di entrare.
        setTimeout(() => navigate('/area-riservata', { replace: true }), 1600);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Verifica non riuscita. Riprova.');
        setStatus('error');
      }
    })();
  }, [token, refresh, navigate]);

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault();
    setResending(true);
    setError(null);
    try {
      await api.post('/api/auth/resend-verification', { email });
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invio non riuscito. Riprova.');
    } finally {
      setResending(false);
    }
  };

  if (status === 'verifying') {
    return (
      <AuthShell title="Verifica in corso…" subtitle="Un istante: stiamo confermando il tuo indirizzo email.">
        <div className="card flex items-center gap-4">
          <span className="w-9 h-9 rounded-full border-[3px] border-[#c5a059]/30 border-t-[#c5a059] animate-spin shrink-0" />
          <p className="text-[0.95rem] text-[#334155]">Controllo del link in corso…</p>
        </div>
      </AuthShell>
    );
  }

  if (status === 'success') {
    return (
      <AuthShell title="Indirizzo confermato" subtitle="Grazie: il tuo account e’ attivo.">
        <div className="card text-center">
          <span className="inline-flex w-14 h-14 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] items-center justify-center mb-4">
            <MailCheck size={26} className="text-[#16a34a]" />
          </span>
          <p className="text-[0.95rem] leading-relaxed text-[#334155]">
            Ti stiamo portando nella tua area riservata…
          </p>
          <Link to="/area-riservata" className="btn btn-primary mt-5 w-full py-3.5">
            Vai all’area riservata
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Conferma il tuo indirizzo email"
      subtitle="Inserisci la tua email per ricevere un nuovo link di conferma."
      footer={
        <p>
          <Link to="/accedi" className="font-bold text-[#0a192f] underline decoration-[#c5a059] decoration-2 underline-offset-2 hover:text-[#c5a059]">
            Torna all’accesso
          </Link>
        </p>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {resent && (
        <Alert tone="success">
          Se l’indirizzo risulta registrato e non ancora confermato, riceverai a breve una nuova email.
        </Alert>
      )}

      <form onSubmit={handleResend} noValidate>
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
        />
        <SubmitButton loading={resending}>Invia nuovo link</SubmitButton>
      </form>
    </AuthShell>
  );
};

export default VerifyEmailPage;
