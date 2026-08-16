import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';

/**
 * Moduli di inserimento del gestionale.
 *
 * Sono gli stessi dati che il cliente vede nella sua area riservata: appena il
 * consulente salva una polizza, quella compare al cliente con le sue scadenze.
 * Non c'è nessuna sincronizzazione di mezzo, è la stessa riga di database.
 */

/* ------------------------------------------------------------- Elementi --- */

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  onClose,
  children,
}) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#050c17]/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[rgba(15,23,42,0.08)] sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-[1.05rem] text-[#0f172a]">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-[#f4f0ea] flex items-center justify-center hover:bg-[#e9e3d9]"
            aria-label="Chiudi"
          >
            <X size={18} className="text-[#0a192f]" />
          </button>
        </header>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  textarea?: boolean;
  maxLength?: number;
}

const Field: React.FC<FieldProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  required,
  options,
  textarea,
  maxLength,
}) => {
  const className =
    'w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2.5 text-[0.92rem] focus:border-[#c5a059]';
  return (
    <label className="block mb-3.5">
      <span className="block text-[0.78rem] font-bold text-[#0f172a] mb-1.5">
        {label}
        {required && <span className="text-[#c5a059] ml-0.5">*</span>}
      </span>
      {options ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className={className}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          maxLength={maxLength}
          placeholder={placeholder}
          className={`${className} resize-y`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={className}
        />
      )}
      {hint && <span className="block mt-1.5 text-[0.74rem] text-[#64748b]">{hint}</span>}
    </label>
  );
};

const FormActions: React.FC<{ saving: boolean; onCancel: () => void; label?: string }> = ({
  saving,
  onCancel,
  label = 'Salva',
}) => (
  <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-[rgba(15,23,42,0.08)] mt-1">
    <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">
      Annulla
    </button>
    <button type="submit" disabled={saving} className="btn btn-primary btn-sm disabled:opacity-60">
      {saving ? 'Salvataggio…' : label}
    </button>
  </div>
);

const ErrorNote: React.FC<{ message: string | null; fields?: Record<string, string> }> = ({ message, fields }) =>
  message ? (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[0.86rem] font-semibold text-[#991b1b] mb-4">
      <AlertTriangle size={17} className="shrink-0 mt-0.5" />
      <div>
        {message}
        {fields && Object.keys(fields).length > 0 && (
          <ul className="mt-1.5 font-normal list-disc list-inside">
            {Object.entries(fields).map(([key, value]) => (
              <li key={key}>{value}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  ) : null;

/** Stato condiviso da tutti i moduli: invio, errori, chiusura. */
function useSubmit(onSaved: () => void, onClose: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await action();
      onSaved();
      onClose();
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
        if (submitError.fields) setFieldErrors(submitError.fields);
      } else {
        setError('Salvataggio non riuscito.');
      }
    } finally {
      setSaving(false);
    }
  };

  return { saving, error, fieldErrors, submit };
}

const numberOrUndefined = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

/* --------------------------------------------------------------- Polizza -- */

export interface PolicyDraft {
  id?: string;
  companyName?: string;
  policyNumber?: string;
  branch?: string;
  productName?: string | null;
  status?: string;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  renewalType?: string | null;
  paymentFrequency?: string | null;
  premium?: number | null;
  plate?: string | null;
  insuredObject?: string | null;
  notes?: string | null;
}

export const PolicyForm: React.FC<{
  clientId: string;
  policy?: PolicyDraft;
  onClose: () => void;
  onSaved: () => void;
}> = ({ clientId, policy, onClose, onSaved }) => {
  const editing = Boolean(policy?.id);
  const [form, setForm] = useState({
    companyName: policy?.companyName ?? '',
    policyNumber: policy?.policyNumber ?? '',
    branch: policy?.branch ?? 'auto',
    productName: policy?.productName ?? '',
    status: policy?.status ?? 'active',
    effectiveDate: policy?.effectiveDate ?? '',
    expiryDate: policy?.expiryDate ?? '',
    renewalType: policy?.renewalType ?? 'tacito',
    paymentFrequency: policy?.paymentFrequency ?? 'annuale',
    premium: policy?.premium != null ? String(policy.premium) : '',
    plate: policy?.plate ?? '',
    insuredObject: policy?.insuredObject ?? '',
    notes: policy?.notes ?? '',
  });
  // Alla creazione conviene generare anche la scadenza di rinnovo: è il motivo
  // per cui il cliente vede le scadenze senza doverle inserire due volte.
  const [createDeadline, setCreateDeadline] = useState(!editing);
  const { saving, error, fieldErrors, submit } = useSubmit(onSaved, onClose);

  const update = (key: keyof typeof form) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      userId: clientId,
      companyName: form.companyName.trim(),
      policyNumber: form.policyNumber.trim(),
      branch: form.branch.trim(),
      productName: form.productName || undefined,
      status: form.status,
      effectiveDate: form.effectiveDate || undefined,
      expiryDate: form.expiryDate || undefined,
      renewalType: form.renewalType || undefined,
      paymentFrequency: form.paymentFrequency || undefined,
      premium: numberOrUndefined(form.premium),
      plate: form.plate || undefined,
      insuredObject: form.insuredObject || undefined,
      notes: form.notes || undefined,
      createRenewalDeadline: !editing && createDeadline,
    };

    submit(() =>
      editing ? api.patch(`/api/admin/policies/${policy!.id}`, payload) : api.post('/api/admin/policies', payload),
    );
  };

  return (
    <Modal title={editing ? 'Modifica polizza' : 'Nuova polizza'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <ErrorNote message={error} fields={fieldErrors} />

        <div className="grid sm:grid-cols-2 sm:gap-3">
          <Field label="Compagnia" value={form.companyName} onChange={update('companyName')} required placeholder="Generali Italia" />
          <Field label="Numero di polizza" value={form.policyNumber} onChange={update('policyNumber')} required />
          <Field
            label="Ramo"
            value={form.branch}
            onChange={update('branch')}
            required
            options={[
              { value: 'auto', label: 'Auto (RCA)' },
              { value: 'casa', label: 'Casa' },
              { value: 'salute', label: 'Salute' },
              { value: 'vita', label: 'Vita' },
              { value: 'infortuni', label: 'Infortuni' },
              { value: 'rc professionale', label: 'RC professionale' },
              { value: 'impresa', label: 'Impresa' },
              { value: 'altro', label: 'Altro' },
            ]}
          />
          <Field label="Prodotto" value={form.productName} onChange={update('productName')} placeholder="Nome commerciale" />
          <Field label="Decorrenza" type="date" value={form.effectiveDate} onChange={update('effectiveDate')} />
          <Field label="Scadenza" type="date" value={form.expiryDate} onChange={update('expiryDate')} />
          <Field label="Premio (€)" value={form.premium} onChange={update('premium')} placeholder="480,50" />
          <Field
            label="Frazionamento"
            value={form.paymentFrequency}
            onChange={update('paymentFrequency')}
            options={[
              { value: 'annuale', label: 'Annuale' },
              { value: 'semestrale', label: 'Semestrale' },
              { value: 'quadrimestrale', label: 'Quadrimestrale' },
              { value: 'trimestrale', label: 'Trimestrale' },
              { value: 'mensile', label: 'Mensile' },
              { value: 'unica', label: 'Premio unico' },
            ]}
          />
          <Field
            label="Rinnovo"
            value={form.renewalType}
            onChange={update('renewalType')}
            options={[
              { value: 'tacito', label: 'Tacito' },
              { value: 'annuale', label: 'Annuale' },
              { value: 'temporanea', label: 'Temporanea' },
              { value: 'poliennale', label: 'Poliennale' },
            ]}
          />
          <Field
            label="Stato"
            value={form.status}
            onChange={update('status')}
            options={[
              { value: 'active', label: 'Attiva' },
              { value: 'draft', label: 'Bozza' },
              { value: 'suspended', label: 'Sospesa' },
              { value: 'expired', label: 'Scaduta' },
              { value: 'cancelled', label: 'Annullata' },
            ]}
          />
          <Field label="Targa" value={form.plate} onChange={update('plate')} placeholder="AB123CD" maxLength={10} />
          <Field
            label="Oggetto assicurato"
            value={form.insuredObject}
            onChange={update('insuredObject')}
            placeholder="Abitazione, veicolo, persona…"
          />
        </div>

        <Field label="Note" value={form.notes} onChange={update('notes')} textarea maxLength={1000} />

        {!editing && (
          <div className="flex items-start gap-2.5 mb-4 rounded-xl bg-[#f8fafc] px-4 py-3">
            <input
              id="create-deadline"
              type="checkbox"
              checked={createDeadline}
              onChange={(event) => setCreateDeadline(event.target.checked)}
              className="mt-0.5 w-[18px] h-[18px] accent-[#c5a059] shrink-0 cursor-pointer"
            />
            <label htmlFor="create-deadline" className="text-[0.85rem] text-[#334155] cursor-pointer">
              <span className="font-semibold text-[#0f172a] block">Crea anche la scadenza di rinnovo</span>
              Il cliente la vedrà fra le sue scadenze, con importo e data.
            </label>
          </div>
        )}

        <FormActions saving={saving} onCancel={onClose} />
      </form>
    </Modal>
  );
};

/* -------------------------------------------------------------- Scadenza -- */

export interface DeadlineDraft {
  id?: string;
  policyId?: string | null;
  title?: string;
  type?: string;
  dueDate?: string;
  amount?: number | null;
  status?: string;
  notes?: string | null;
}

export const DeadlineForm: React.FC<{
  clientId: string;
  deadline?: DeadlineDraft;
  policies: Array<{ id: string; companyName: string; policyNumber: string }>;
  onClose: () => void;
  onSaved: () => void;
}> = ({ clientId, deadline, policies, onClose, onSaved }) => {
  const editing = Boolean(deadline?.id);
  const [form, setForm] = useState({
    policyId: deadline?.policyId ?? '',
    title: deadline?.title ?? '',
    type: deadline?.type ?? 'rata',
    dueDate: deadline?.dueDate ?? '',
    amount: deadline?.amount != null ? String(deadline.amount) : '',
    status: deadline?.status ?? 'pending',
    notes: deadline?.notes ?? '',
  });
  const { saving, error, fieldErrors, submit } = useSubmit(onSaved, onClose);
  const update = (key: keyof typeof form) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      userId: clientId,
      policyId: form.policyId || undefined,
      title: form.title.trim(),
      type: form.type,
      dueDate: form.dueDate,
      amount: numberOrUndefined(form.amount),
      status: form.status,
      notes: form.notes || undefined,
    };
    submit(() =>
      editing ? api.patch(`/api/admin/deadlines/${deadline!.id}`, payload) : api.post('/api/admin/deadlines', payload),
    );
  };

  return (
    <Modal title={editing ? 'Modifica scadenza' : 'Nuova scadenza'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <ErrorNote message={error} fields={fieldErrors} />

        <Field label="Descrizione" value={form.title} onChange={update('title')} required placeholder="Rata semestrale RC Auto" />

        <div className="grid sm:grid-cols-2 sm:gap-3">
          <Field label="Data di scadenza" type="date" value={form.dueDate} onChange={update('dueDate')} required />
          <Field label="Importo (€)" value={form.amount} onChange={update('amount')} placeholder="240,25" />
          <Field
            label="Tipo"
            value={form.type}
            onChange={update('type')}
            options={[
              { value: 'rata', label: 'Rata' },
              { value: 'rinnovo', label: 'Rinnovo' },
              { value: 'scadenza_polizza', label: 'Scadenza polizza' },
              { value: 'adempimento', label: 'Adempimento' },
              { value: 'altro', label: 'Altro' },
            ]}
          />
          <Field
            label="Stato"
            value={form.status}
            onChange={update('status')}
            options={[
              { value: 'pending', label: 'Da saldare' },
              { value: 'paid', label: 'Pagata' },
              { value: 'renewed', label: 'Rinnovata' },
              { value: 'expired', label: 'Scaduta' },
              { value: 'cancelled', label: 'Annullata' },
            ]}
          />
        </div>

        <Field
          label="Polizza collegata"
          value={form.policyId}
          onChange={update('policyId')}
          options={[
            { value: '', label: 'Nessuna' },
            ...policies.map((policy) => ({
              value: policy.id,
              label: `${policy.companyName} — ${policy.policyNumber}`,
            })),
          ]}
        />

        <Field label="Note" value={form.notes} onChange={update('notes')} textarea maxLength={500} />

        <FormActions saving={saving} onCancel={onClose} />
      </form>
    </Modal>
  );
};

/* ------------------------------------------------------------ Preventivo -- */

export interface QuoteDraft {
  id?: string;
  subject?: string;
  companyName?: string | null;
  branch?: string | null;
  premium?: number | null;
  coverageSummary?: string | null;
  status?: string;
  validUntil?: string | null;
  notes?: string | null;
}

export const QuoteForm: React.FC<{
  clientId: string;
  quote?: QuoteDraft;
  onClose: () => void;
  onSaved: () => void;
}> = ({ clientId, quote, onClose, onSaved }) => {
  const editing = Boolean(quote?.id);
  const [form, setForm] = useState({
    subject: quote?.subject ?? '',
    companyName: quote?.companyName ?? '',
    branch: quote?.branch ?? '',
    premium: quote?.premium != null ? String(quote.premium) : '',
    coverageSummary: quote?.coverageSummary ?? '',
    status: quote?.status ?? 'sent',
    validUntil: quote?.validUntil ?? '',
    notes: quote?.notes ?? '',
  });
  const { saving, error, fieldErrors, submit } = useSubmit(onSaved, onClose);
  const update = (key: keyof typeof form) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      userId: clientId,
      subject: form.subject.trim(),
      companyName: form.companyName || undefined,
      branch: form.branch || undefined,
      premium: numberOrUndefined(form.premium),
      coverageSummary: form.coverageSummary || undefined,
      status: form.status,
      validUntil: form.validUntil || undefined,
      notes: form.notes || undefined,
    };
    submit(() => (editing ? api.patch(`/api/admin/quotes/${quote!.id}`, payload) : api.post('/api/admin/quotes', payload)));
  };

  return (
    <Modal title={editing ? 'Modifica preventivo' : 'Nuovo preventivo'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <ErrorNote message={error} fields={fieldErrors} />

        <Field label="Oggetto" value={form.subject} onChange={update('subject')} required placeholder="RC Auto — confronto tre compagnie" />

        <div className="grid sm:grid-cols-2 sm:gap-3">
          <Field label="Compagnia" value={form.companyName} onChange={update('companyName')} />
          <Field label="Ramo" value={form.branch} onChange={update('branch')} placeholder="auto, casa, salute…" />
          <Field label="Premio (€)" value={form.premium} onChange={update('premium')} />
          <Field label="Valido fino al" type="date" value={form.validUntil} onChange={update('validUntil')} />
        </div>

        <Field
          label="Garanzie principali"
          value={form.coverageSummary}
          onChange={update('coverageSummary')}
          textarea
          maxLength={1500}
          hint="Quello che il cliente legge nella sua area riservata."
        />

        <Field
          label="Stato"
          value={form.status}
          onChange={update('status')}
          options={[
            { value: 'draft', label: 'Bozza (non visibile come proposta)' },
            { value: 'sent', label: 'Inviato al cliente' },
            { value: 'under_review', label: 'In valutazione' },
            { value: 'accepted', label: 'Accettato' },
            { value: 'rejected', label: 'Non accolto' },
            { value: 'expired', label: 'Scaduto' },
          ]}
        />

        <FormActions saving={saving} onCancel={onClose} />
      </form>
    </Modal>
  );
};

/* ------------------------------------------------------------- Trattativa - */

export interface NegotiationDraft {
  id?: string;
  title?: string;
  stage?: string;
  expectedClose?: string | null;
  value?: number | null;
  notes?: string | null;
}

export const NegotiationForm: React.FC<{
  clientId: string;
  negotiation?: NegotiationDraft;
  onClose: () => void;
  onSaved: () => void;
}> = ({ clientId, negotiation, onClose, onSaved }) => {
  const editing = Boolean(negotiation?.id);
  const [form, setForm] = useState({
    title: negotiation?.title ?? '',
    stage: negotiation?.stage ?? 'analisi',
    expectedClose: negotiation?.expectedClose ?? '',
    value: negotiation?.value != null ? String(negotiation.value) : '',
    notes: negotiation?.notes ?? '',
  });
  const { saving, error, fieldErrors, submit } = useSubmit(onSaved, onClose);
  const update = (key: keyof typeof form) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      userId: clientId,
      title: form.title.trim(),
      stage: form.stage,
      expectedClose: form.expectedClose || undefined,
      value: numberOrUndefined(form.value),
      notes: form.notes || undefined,
    };
    submit(() =>
      editing
        ? api.patch(`/api/admin/negotiations/${negotiation!.id}`, payload)
        : api.post('/api/admin/negotiations', payload),
    );
  };

  return (
    <Modal title={editing ? 'Modifica trattativa' : 'Nuova trattativa'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <ErrorNote message={error} fields={fieldErrors} />

        <Field label="Titolo" value={form.title} onChange={update('title')} required placeholder="Passaggio RC Auto + Casa" />

        <div className="grid sm:grid-cols-2 sm:gap-3">
          <Field
            label="Fase"
            value={form.stage}
            onChange={update('stage')}
            options={[
              { value: 'analisi', label: 'Analisi esigenze' },
              { value: 'preventivazione', label: 'Preventivazione' },
              { value: 'confronto', label: 'Confronto soluzioni' },
              { value: 'in_firma', label: 'In firma' },
              { value: 'conclusa', label: 'Conclusa' },
              { value: 'abbandonata', label: 'Non proseguita' },
            ]}
          />
          <Field label="Chiusura prevista" type="date" value={form.expectedClose} onChange={update('expectedClose')} />
          <Field label="Valore stimato (€)" value={form.value} onChange={update('value')} />
        </div>

        <Field
          label="Note"
          value={form.notes}
          onChange={update('notes')}
          textarea
          maxLength={1000}
          hint="Visibili anche al cliente nella sezione Trattative."
        />

        <FormActions saving={saving} onCancel={onClose} />
      </form>
    </Modal>
  );
};
