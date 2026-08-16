import React, { useEffect, useState } from 'react';
import {
  Calculator,
  ClipboardCheck,
  Download,
  KeyRound,
  Lock,
  LogOut,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { api, ApiError, type AddressSuggestion, type Profile, type ProfileChange } from '../lib/api';
import { useAuth } from '../lib/auth';
import { derivePassword, PasswordDerivationError, validatePassword } from '../lib/password';
import { Alert, Field, PasswordField } from '../auth/components';
import FiscalCodeCalculator from '../components/FiscalCodeCalculator';
import CopyValueButton from '../components/CopyValueButton';
import AddressAutocomplete from './AddressAutocomplete';
import { ErrorBlock, LoadingBlock, PageHeader, StatusBadge, formatDateTime, useApiResource } from './components';

interface SessionInfo {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  ip: string | null;
  userAgent: string | null;
  authMethod: string;
}

const CardSection: React.FC<{
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, icon, children }) => (
  <section className="card mb-5">
    <header className="flex items-start gap-3 mb-5">
      <span className="w-10 h-10 rounded-lg bg-[#f4ece0] text-[#c5a059] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div>
        <h2 className="font-bold text-[1.02rem] text-[#0f172a]">{title}</h2>
        {description && <p className="text-[0.85rem] text-[#64748b] mt-0.5 leading-relaxed">{description}</p>}
      </div>
    </header>
    {children}
  </section>
);

export const ProfilePage: React.FC = () => {
  const { user, refresh } = useAuth();
  const { data, loading, error, reload } = useApiResource<{ profile: Profile }>('/api/profile');
  const changes = useApiResource<{ changes: ProfileChange[] }>('/api/profile/changes');

  return (
    <div>
      <PageHeader
        title="Profilo e sicurezza"
        description="Aggiorna i tuoi recapiti, gestisci l’accesso e i consensi privacy. I dati che identificano i contratti (codice fiscale e partita IVA) si modificano solo tramite il consulente."
      />

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data ? (
        <LoadingBlock rows={3} />
      ) : (
        data && (
          <>
            <ProfileForm
              profile={data.profile}
              onSaved={() => {
                reload();
                changes.reload();
                refresh();
              }}
            />
            <ProfileChangeHistory
              changes={changes.data?.changes ?? []}
              loading={changes.loading}
              error={changes.error}
              onRetry={changes.reload}
            />
            <SecuritySection hasPassword={data.profile.hasPassword} />
            <PrivacySection profile={data.profile} onChanged={reload} />
            <p className="text-[0.78rem] text-[#94a3b8] text-center mt-6">
              Account creato il {formatDateTime(data.profile.createdAt)} • {user?.email}
            </p>
          </>
        )
      )}
    </div>
  );
};

/* ------------------------------------------------------------- Dati utente */

const PROFILE_LABELS: Record<string, string> = {
  firstName: 'Nome',
  lastName: 'Cognome',
  phone: 'Telefono',
  mobile: 'Cellulare',
  pec: 'PEC',
  fiscalCode: 'Codice fiscale',
  vatNumber: 'Partita IVA',
  birthDate: 'Data di nascita',
  birthPlace: 'Luogo di nascita',
  addressStreet: 'Indirizzo',
  addressLocality: 'Frazione o località',
  addressCity: 'Comune',
  addressZip: 'CAP',
  addressProvince: 'Provincia',
  addressCountry: 'Paese',
};

type ProfileFormData = {
  firstName: string;
  lastName: string;
  phone: string;
  mobile: string;
  pec: string;
  fiscalCode: string;
  vatNumber: string;
  birthDate: string;
  birthPlace: string;
  addressStreet: string;
  addressLocality: string;
  addressCity: string;
  addressZip: string;
  addressProvince: string;
  addressCountry: string;
};

interface PendingProfileChange {
  key: keyof ProfileFormData;
  label: string;
  before: string;
  after: string;
}

function profileToForm(profile: Profile): ProfileFormData {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    phone: profile.phone ?? '',
    mobile: profile.mobile ?? '',
    pec: profile.pec ?? '',
    fiscalCode: profile.fiscalCode ?? '',
    vatNumber: profile.vatNumber ?? '',
    birthDate: profile.birthDate ?? '',
    birthPlace: profile.birthPlace ?? '',
    addressStreet: profile.addressStreet ?? '',
    addressLocality: profile.addressLocality ?? '',
    addressCity: profile.addressCity ?? '',
    addressZip: profile.addressZip ?? '',
    addressProvince: profile.addressProvince ?? '',
    addressCountry: profile.addressCountry ?? 'IT',
  };
}

const ProfileForm: React.FC<{ profile: Profile; onSaved: () => void }> = ({ profile, onSaved }) => {
  const initialForm = profileToForm(profile);
  const [form, setForm] = useState<ProfileFormData>(initialForm);
  const [baseline, setBaseline] = useState<ProfileFormData>(initialForm);
  const [addressSuggestionId, setAddressSuggestionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [calculating, setCalculating] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingProfileChange[] | null>(null);

  useEffect(() => {
    const next = profileToForm(profile);
    setForm(next);
    setBaseline(next);
    setAddressSuggestionId(null);
  }, [profile.updatedAt]);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setSavedMessage(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const changes = (Object.keys(form) as Array<keyof ProfileFormData>)
      .filter((key) => form[key].trim() !== baseline[key].trim())
      .map((key) => ({
        key,
        label: PROFILE_LABELS[key] ?? key,
        before: baseline[key],
        after: form[key],
      }));

    setError(null);
    setFieldErrors({});
    setSavedMessage(null);
    if (changes.length === 0) {
      setError('Non ci sono modifiche da salvare.');
      return;
    }
    setPendingChanges(changes);
  };

  const confirmSave = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await api.patch<{
        changeRequest: { id: string; status: string; message: string } | null;
      }>('/api/profile', {
        ...form,
        addressSuggestionId: addressSuggestionId ?? '',
        confirmed: true,
      });
      setSavedMessage(
        result.changeRequest?.message ??
          'Nessuna variazione rilevata. I dati già presenti non sono stati modificati.',
      );
      setBaseline(form);
      setAddressSuggestionId(null);
      setPendingChanges(null);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setError('Salvataggio non riuscito.');
      }
    } finally {
      setSaving(false);
    }
  };

  const applyAddress = (suggestion: AddressSuggestion) => {
    setForm((previous) => ({
      ...previous,
      addressStreet: suggestion.street,
      addressLocality: suggestion.locality ?? '',
      addressCity: suggestion.city,
      addressProvince: suggestion.province,
      addressCountry: suggestion.country,
      // ANNCSU non contiene il CAP. Quando disponibile viene proposto il
      // riferimento comunale IPA, mantenendo sempre il campo modificabile.
      addressZip: suggestion.postalCode ?? previous.addressZip,
    }));
    setAddressSuggestionId(suggestion.id);
    setSavedMessage(null);
  };

  return (
    <CardSection
      title="Dati personali e recapiti"
      description="Tieni aggiornati telefono e indirizzo: servono al consulente per contattarti sulle pratiche urgenti."
      icon={<UserCog size={19} />}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {savedMessage && !error && <Alert tone="success">{savedMessage}</Alert>}

      <form onSubmit={submit} noValidate>
        <div className="grid sm:grid-cols-2 sm:gap-3">
          <Field label="Nome" value={form.firstName} onChange={update('firstName')} autoComplete="given-name" error={fieldErrors.firstName} />
          <Field label="Cognome" value={form.lastName} onChange={update('lastName')} autoComplete="family-name" error={fieldErrors.lastName} />
          <Field label="Telefono" type="tel" value={form.phone} onChange={update('phone')} autoComplete="tel" error={fieldErrors.phone} />
          <Field label="Cellulare" type="tel" value={form.mobile} onChange={update('mobile')} autoComplete="tel" error={fieldErrors.mobile} />
        </div>

        <Field label="PEC" type="email" value={form.pec} onChange={update('pec')} hint="Facoltativa: utile per le comunicazioni formali." error={fieldErrors.pec} />

        <div className="grid sm:grid-cols-2 sm:gap-3">
          <div>
            <Field
              label="Codice fiscale"
              value={form.fiscalCode}
              onChange={update('fiscalCode')}
              disabled={Boolean(profile.fiscalCode)}
              hint={
                profile.fiscalCode
                  ? 'Modificabile solo tramite il consulente.'
                  : 'Serve per emettere le polizze. Non ce l’hai sottomano?'
              }
              error={fieldErrors.fiscalCode}
            />
            {!profile.fiscalCode && (
              <button
                type="button"
                onClick={() => setCalculating(true)}
                className="-mt-2 mb-4 inline-flex items-center gap-1.5 text-[0.82rem] font-bold text-[#c5a059] hover:text-[#b38e46]"
              >
                <Calculator size={14} />
                Calcolalo dai tuoi dati anagrafici
              </button>
            )}
            {form.fiscalCode && (
              <CopyValueButton
                value={form.fiscalCode}
                label="Copia codice fiscale"
                compact
                className="-mt-2 mb-4"
              />
            )}
          </div>
          <Field
            label="Partita IVA"
            value={form.vatNumber}
            onChange={update('vatNumber')}
            disabled={Boolean(profile.vatNumber)}
            hint={profile.vatNumber ? 'Modificabile solo tramite il consulente.' : 'Solo per professionisti e imprese.'}
            error={fieldErrors.vatNumber}
          />
          <Field label="Data di nascita" type="date" value={form.birthDate} onChange={update('birthDate')} error={fieldErrors.birthDate} />
          <Field label="Luogo di nascita" value={form.birthPlace} onChange={update('birthPlace')} error={fieldErrors.birthPlace} />
        </div>

        <AddressAutocomplete
          value={form.addressStreet}
          error={fieldErrors.addressStreet}
          onChange={(value) => {
            setForm((previous) => ({ ...previous, addressStreet: value }));
            setSavedMessage(null);
          }}
          onSelect={applyAddress}
        />

        <div className="grid sm:grid-cols-2 sm:gap-3">
          <Field
            label="Frazione o località"
            value={form.addressLocality}
            onChange={update('addressLocality')}
            autoComplete="address-level3"
            error={fieldErrors.addressLocality}
          />
          <Field label="Comune" value={form.addressCity} onChange={update('addressCity')} autoComplete="address-level2" error={fieldErrors.addressCity} />
        </div>
        <div className="grid grid-cols-[1fr_100px_90px] gap-3">
          <Field label="CAP" value={form.addressZip} onChange={update('addressZip')} inputMode="numeric" maxLength={5} error={fieldErrors.addressZip} />
          <Field label="Prov." value={form.addressProvince} onChange={update('addressProvince')} maxLength={2} error={fieldErrors.addressProvince} />
          <Field
            label="Paese"
            value={form.addressCountry}
            onChange={update('addressCountry')}
            autoComplete="country"
            maxLength={2}
            error={fieldErrors.addressCountry}
          />
        </div>
        <p className="-mt-2 mb-4 text-[0.75rem] text-[#64748b] leading-relaxed">
          Il CAP non è contenuto in ANNCSU. Se disponibile viene proposto dal riferimento comunale IPA, ma
          resta sempre modificabile e va verificato prima dell’invio.
        </p>

        <button type="submit" disabled={saving} className="btn btn-primary mt-2 disabled:opacity-60">
          <Save size={16} />
          {saving ? 'Salvataggio…' : 'Salva modifiche'}
        </button>
      </form>

      {calculating && (
        <FiscalCodeCalculator
          initial={{
            firstName: form.firstName,
            lastName: form.lastName,
            birthDate: form.birthDate || undefined,
          }}
          onClose={() => setCalculating(false)}
          onConfirm={(code, data) => {
            // Il codice viene solo proposto nel campo: diventa definitivo con
            // il salvataggio, dopo che l'utente lo ha verificato.
            setForm((previous) => ({
              ...previous,
              firstName: data.firstName,
              lastName: data.lastName,
              fiscalCode: code,
              birthDate: data.birthDate,
              birthPlace: data.birthPlace,
            }));
            setCalculating(false);
            setSavedMessage(null);
          }}
        />
      )}

      {pendingChanges && (
        <div
          className="fixed inset-0 z-50 bg-[#050c17]/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-change-title"
          onClick={() => !saving && setPendingChanges(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[rgba(15,23,42,0.08)]">
              <div>
                <h2 id="profile-change-title" className="font-bold text-[1.05rem] text-[#0f172a]">
                  Conferma le modifiche
                </h2>
                <p className="text-[0.78rem] text-[#64748b] mt-0.5">
                  Controlla il confronto: nulla viene inviato finché non confermi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingChanges(null)}
                disabled={saving}
                aria-label="Chiudi riepilogo"
                className="w-9 h-9 rounded-lg bg-[#f4f0ea] flex items-center justify-center disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </header>

            <div className="p-5">
              {error && <Alert tone="error">{error}</Alert>}
              <div className="overflow-x-auto rounded-xl border border-[rgba(15,23,42,0.1)]">
                <table className="w-full text-left text-[0.82rem]">
                  <thead className="bg-[#f8fafc] text-[#64748b]">
                    <tr>
                      <th className="px-3.5 py-2.5 font-bold">Campo</th>
                      <th className="px-3.5 py-2.5 font-bold">Prima</th>
                      <th className="px-3.5 py-2.5 font-bold">Dopo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingChanges.map((change) => (
                      <tr key={change.key} className="border-t border-[rgba(15,23,42,0.07)] align-top">
                        <th className="px-3.5 py-2.5 font-bold text-[#0f172a]">{change.label}</th>
                        <td className="px-3.5 py-2.5 text-[#64748b] break-words">{change.before || '—'}</td>
                        <td className="px-3.5 py-2.5 font-semibold text-[#0f172a] break-words">{change.after || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] px-4 py-3 mt-4 text-[0.8rem] text-[#78350f] leading-relaxed">
                La conferma salva i nuovi dati nell’area riservata e apre una variazione “Ricevuta” nel gestionale.
                Non significa che il consulente li abbia già verificati o che sistemi esterni siano stati aggiornati.
              </div>

              <div className="flex flex-wrap justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setPendingChanges(null)}
                  disabled={saving}
                  className="btn btn-outline disabled:opacity-50"
                >
                  Torna al modulo
                </button>
                <button
                  type="button"
                  onClick={confirmSave}
                  disabled={saving}
                  className="btn btn-primary disabled:opacity-60"
                >
                  <ClipboardCheck size={16} />
                  {saving ? 'Invio in corso…' : 'Conferma e invia'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </CardSection>
  );
};

const ProfileChangeHistory: React.FC<{
  changes: ProfileChange[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}> = ({ changes, loading, error, onRetry }) => (
  <CardSection
    title="Stato delle variazioni"
    description="Qui distingui ciò che hai inviato da ciò che il consulente ha già verificato."
    icon={<ClipboardCheck size={19} />}
  >
    {error ? (
      <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3">
        <p className="text-[0.84rem] font-semibold text-[#991b1b]">{error}</p>
        <button type="button" onClick={onRetry} className="btn btn-outline btn-sm mt-2">
          Riprova
        </button>
      </div>
    ) : loading ? (
      <p className="text-[0.85rem] text-[#64748b]">Caricamento delle variazioni…</p>
    ) : changes.length === 0 ? (
      <p className="text-[0.85rem] text-[#64748b]">Non hai ancora inviato variazioni dal profilo.</p>
    ) : (
      <ul className="space-y-3">
        {changes.slice(0, 8).map((change) => (
          <li key={change.id} className="rounded-xl border border-[rgba(15,23,42,0.09)] px-4 py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-bold text-[0.88rem] text-[#0f172a]">
                  {change.changedFields.map((field) => PROFILE_LABELS[field] ?? field).join(', ')}
                </p>
                <p className="text-[0.73rem] text-[#94a3b8]">
                  Inviata il {formatDateTime(change.requestedAt)} · origine area riservata
                  {change.source !== 'manual' ? ' con compilazione assistita' : ''}
                </p>
              </div>
              <StatusBadge status={change.status} />
            </div>
            <dl className="space-y-1">
              {change.changedFields.map((field) => (
                <div key={field} className="grid sm:grid-cols-[140px_1fr_20px_1fr] gap-1 sm:gap-2 text-[0.78rem]">
                  <dt className="font-semibold text-[#64748b]">{PROFILE_LABELS[field] ?? field}</dt>
                  <dd className="text-[#94a3b8] break-words">{change.before[field] || '—'}</dd>
                  <span aria-hidden className="hidden sm:block text-[#c5a059]">→</span>
                  <dd className="font-semibold text-[#0f172a] break-words">{change.after[field] || '—'}</dd>
                </div>
              ))}
            </dl>
            {change.reviewNote && (
              <p className="mt-2.5 rounded-lg bg-[#f8fafc] px-3 py-2 text-[0.77rem] text-[#334155]">
                Nota del consulente: {change.reviewNote}
              </p>
            )}
            {change.status === 'received' && (
              <p className="mt-2 text-[0.74rem] text-[#92400e]">
                Salvata e visibile nel gestionale; verifica del consulente non ancora eseguita.
              </p>
            )}
          </li>
        ))}
      </ul>
    )}
  </CardSection>
);

/* --------------------------------------------------------------- Sicurezza */

const SecuritySection: React.FC<{ hasPassword: boolean }> = ({ hasPassword }) => {
  const { user, config } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      const result = await api.get<{ sessions: SessionInfo[] }>('/api/auth/sessions');
      setSessions(result.sessions);
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : 'Caricamento dispositivi non riuscito.');
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const passwordProblem = validatePassword(newPassword);
    if (passwordProblem) {
      setError(passwordProblem);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Le due password non coincidono.');
      return;
    }
    if (!user) {
      setError('Sessione scaduta: effettua di nuovo l’accesso.');
      return;
    }

    setSaving(true);
    try {
      // Anche qui la password non lascia il browser: si inviano i due valori
      // derivati (quello attuale serve come conferma di identita').
      const result = await api.post<{ message: string }>('/api/auth/change-password', {
        currentPasswordDerived: hasPassword
          ? await derivePassword(config?.passwordKdf, user.email, currentPassword)
          : undefined,
        newPasswordDerived: await derivePassword(config?.passwordKdf, user.email, newPassword),
      });
      setMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      loadSessions();
    } catch (err) {
      if (err instanceof PasswordDerivationError) {
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Modifica non riuscita.');
      }
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api.delete(`/api/auth/sessions/${id}`);
      loadSessions();
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : 'Disconnessione non riuscita.');
    }
  };

  return (
    <CardSection
      title="Sicurezza dell’accesso"
      description={
        hasPassword
          ? 'Cambia la password e controlla i dispositivi collegati al tuo account.'
          : 'Accedi con Google. Puoi impostare anche una password per entrare senza dipendere dall’account Google.'
      }
      icon={<Lock size={19} />}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {message && !error && <Alert tone="success">{message}</Alert>}

      <form onSubmit={changePassword} noValidate className="mb-6">
        {hasPassword && (
          <PasswordField
            label="Password attuale"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        )}
        <div className="grid sm:grid-cols-2 sm:gap-3">
          <PasswordField
            label={hasPassword ? 'Nuova password' : 'Password'}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            showStrength
            hint="Almeno 10 caratteri, con lettere e numeri."
          />
          <PasswordField
            label="Conferma password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button type="submit" disabled={saving} className="btn btn-secondary disabled:opacity-60">
          <KeyRound size={16} />
          {saving ? 'Aggiornamento…' : hasPassword ? 'Aggiorna password' : 'Imposta password'}
        </button>
      </form>

      <div className="border-t border-[rgba(15,23,42,0.08)] pt-5">
        <h3 className="font-bold text-[0.92rem] text-[#0f172a] mb-3">Dispositivi collegati</h3>
        {sessionsError && <p className="text-[0.85rem] font-semibold text-[#b91c1c] mb-2">{sessionsError}</p>}
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(15,23,42,0.08)] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[0.85rem] font-bold text-[#0f172a]">
                  {session.current ? 'Questo dispositivo' : 'Altro dispositivo'}
                  <span className="ml-2 text-[0.72rem] font-semibold text-[#94a3b8] uppercase">
                    accesso {session.authMethod === 'google' ? 'Google' : 'password'}
                  </span>
                </p>
                <p className="text-[0.76rem] text-[#64748b] truncate max-w-[420px]">
                  {session.ip ?? 'IP non disponibile'} • ultimo utilizzo {formatDateTime(session.lastSeenAt)}
                </p>
              </div>
              {!session.current && (
                <button onClick={() => revoke(session.id)} className="btn btn-outline btn-sm">
                  <LogOut size={14} />
                  Disconnetti
                </button>
              )}
            </li>
          ))}
          {sessions.length === 0 && !sessionsError && (
            <li className="text-[0.85rem] text-[#64748b]">Nessun dispositivo attivo da mostrare.</li>
          )}
        </ul>
      </div>
    </CardSection>
  );
};

/* ------------------------------------------------------- Consensi e privacy */

const PrivacySection: React.FC<{ profile: Profile; onChanged: () => void }> = ({ profile, onChanged }) => {
  const [marketing, setMarketing] = useState(profile.marketingConsent);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmErasure, setConfirmErasure] = useState(false);

  const toggleMarketing = async (value: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/api/profile/consents', { marketingConsent: value });
      setMarketing(value);
      setMessage(value ? 'Consenso registrato.' : 'Consenso revocato.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Aggiornamento non riuscito.');
    } finally {
      setBusy(false);
    }
  };

  const requestErasure = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<{ message: string }>('/api/profile/gdpr-request', {
        type: 'erasure',
        detail: 'Richiesta di cancellazione inviata dall’area riservata.',
      });
      setMessage(result.message);
      setConfirmErasure(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Richiesta non inviata.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <CardSection
      title="Consensi e dati personali"
      description="Gestisci i consensi facoltativi ed esercita i tuoi diritti previsti dal GDPR."
      icon={<ShieldCheck size={19} />}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {message && !error && <Alert tone="success">{message}</Alert>}

      <div className="flex items-start gap-3 rounded-xl border border-[rgba(15,23,42,0.08)] px-4 py-3.5 mb-4">
        <input
          id="marketing"
          type="checkbox"
          checked={marketing}
          disabled={busy}
          onChange={(event) => toggleMarketing(event.target.checked)}
          className="mt-0.5 w-[18px] h-[18px] accent-[#c5a059] shrink-0 cursor-pointer"
        />
        <label htmlFor="marketing" className="text-[0.85rem] leading-relaxed text-[#334155] cursor-pointer">
          <span className="font-bold text-[#0f172a] block mb-0.5">Comunicazioni commerciali</span>
          Ricevi avvisi su scadenze, novita’ assicurative e iniziative dedicate. Consenso facoltativo, revocabile in
          qualsiasi momento.
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <a href="/api/profile/export" className="btn btn-outline justify-start !py-3" download>
          <Download size={16} />
          Scarica i miei dati
        </a>

        {confirmErasure ? (
          <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3">
            <p className="text-[0.82rem] text-[#7f1d1d] leading-relaxed mb-2.5">
              La cancellazione viene valutata nel rispetto degli obblighi di conservazione previsti per la
              documentazione assicurativa. Confermi l’invio della richiesta?
            </p>
            <div className="flex gap-2">
              <button onClick={requestErasure} disabled={busy} className="btn btn-sm bg-[#b91c1c] text-white disabled:opacity-60">
                Conferma
              </button>
              <button onClick={() => setConfirmErasure(false)} className="btn btn-outline btn-sm">
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmErasure(true)} className="btn btn-outline justify-start !py-3 !border-[#fca5a5] !text-[#b91c1c]">
            <Trash2 size={16} />
            Richiedi la cancellazione
          </button>
        )}
      </div>
    </CardSection>
  );
};

export default ProfilePage;
