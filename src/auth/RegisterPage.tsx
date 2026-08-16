import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MailCheck, Phone, User } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { derivePassword, PasswordDerivationError, validatePassword } from '../lib/password';
import {
  Alert,
  AuthShell,
  Checkbox,
  Divider,
  Field,
  GoogleButton,
  PasswordField,
  SubmitButton,
  Turnstile,
} from './components';

export const RegisterPage: React.FC = () => {
  const { config } = useAuth();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    passwordConfirm: '',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    // I requisiti della password si verificano qui: il server riceve solo il
    // valore derivato e non puo' piu' esaminare il testo.
    const passwordProblem = validatePassword(form.password);
    if (passwordProblem) {
      setFieldErrors({ password: passwordProblem });
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setFieldErrors({ passwordConfirm: 'Le due password non coincidono.' });
      return;
    }
    if (!acceptTerms) {
      setFieldErrors({ acceptTerms: 'Per proseguire e’ necessario accettare informativa e condizioni.' });
      return;
    }

    setLoading(true);
    try {
      const passwordDerived = await derivePassword(config?.passwordKdf, form.email, form.password);

      await api.post('/api/auth/register', {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        passwordDerived,
        acceptTerms: true,
        marketingConsent,
        turnstileToken: turnstileToken ?? undefined,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof PasswordDerivationError) {
        setError(err.message);
        setLoading(false);
        return;
      }
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setError('Errore imprevisto. Riprova.');
      }
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="Controlla la tua email"
        subtitle="Abbiamo inviato un link di conferma all’indirizzo indicato."
      >
        <div className="card text-center">
          <span className="inline-flex w-14 h-14 rounded-full bg-[#f4ece0] border border-[rgba(197,160,89,0.35)] items-center justify-center mb-4">
            <MailCheck size={26} className="text-[#c5a059]" />
          </span>
          <p className="text-[0.95rem] leading-relaxed text-[#334155]">
            Apri il messaggio e clicca <strong>Conferma indirizzo email</strong>: da li’ entrerai direttamente nella
            tua area riservata. Il link resta valido 24 ore.
          </p>
          <p className="mt-4 text-[0.82rem] text-[#64748b]">
            Non lo trovi? Controlla la cartella spam oppure{' '}
            <Link to="/verifica-email" className="font-bold text-[#0a192f] underline decoration-[#c5a059] decoration-2 underline-offset-2">
              richiedi un nuovo invio
            </Link>
            .
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
      title="Crea il tuo account"
      subtitle="Bastano pochi dati: potrai completare il profilo in un secondo momento."
      footer={
        <p>
          Hai gia’ un account?{' '}
          <Link to="/accedi" className="font-bold text-[#0a192f] underline decoration-[#c5a059] decoration-2 underline-offset-2 hover:text-[#c5a059]">
            Accedi
          </Link>
        </p>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}

      {config?.googleEnabled && (
        <>
          <GoogleButton label="Registrati con Google" />
          <Divider />
        </>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid sm:grid-cols-2 sm:gap-3">
          <Field
            label="Nome"
            name="firstName"
            value={form.firstName}
            onChange={update('firstName')}
            autoComplete="given-name"
            required
            icon={<User size={17} />}
            error={fieldErrors.firstName}
          />
          <Field
            label="Cognome"
            name="lastName"
            value={form.lastName}
            onChange={update('lastName')}
            autoComplete="family-name"
            required
            error={fieldErrors.lastName}
          />
        </div>

        <Field
          label="Indirizzo email"
          type="email"
          name="email"
          value={form.email}
          onChange={update('email')}
          placeholder="nome@esempio.it"
          autoComplete="email"
          inputMode="email"
          required
          icon={<Mail size={17} />}
          error={fieldErrors.email}
        />

        <Field
          label="Telefono"
          type="tel"
          name="phone"
          value={form.phone}
          onChange={update('phone')}
          placeholder="334 000 0000"
          autoComplete="tel"
          icon={<Phone size={17} />}
          hint="Facoltativo: serve al consulente per contattarti sulle pratiche urgenti."
          error={fieldErrors.phone}
        />

        <PasswordField
          label="Password"
          name="password"
          value={form.password}
          onChange={update('password')}
          autoComplete="new-password"
          required
          showStrength
          hint="Almeno 10 caratteri, con lettere e numeri."
          error={fieldErrors.password}
        />

        <PasswordField
          label="Conferma password"
          name="passwordConfirm"
          value={form.passwordConfirm}
          onChange={update('passwordConfirm')}
          autoComplete="new-password"
          required
          error={fieldErrors.passwordConfirm}
        />

        <div className="mt-5 pt-5 border-t border-[rgba(15,23,42,0.08)]">
          <Checkbox checked={acceptTerms} onChange={setAcceptTerms} error={fieldErrors.acceptTerms}>
            Ho letto e accetto l’
            <Link to="/?legale=privacy" className="font-bold text-[#0a192f] underline decoration-[#c5a059] underline-offset-2">
              informativa privacy
            </Link>{' '}
            e le condizioni di utilizzo dell’area riservata.
          </Checkbox>

          <Checkbox checked={marketingConsent} onChange={setMarketingConsent}>
            Acconsento a ricevere comunicazioni su scadenze, novita’ assicurative e promozioni. Facoltativo,
            revocabile in qualsiasi momento dal profilo.
          </Checkbox>
        </div>

        <Turnstile siteKey={config?.turnstileSiteKey ?? null} onToken={handleToken} />

        <SubmitButton loading={loading}>Crea account</SubmitButton>
      </form>
    </AuthShell>
  );
};

export default RegisterPage;
