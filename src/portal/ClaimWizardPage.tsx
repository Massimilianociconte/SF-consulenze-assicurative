import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calculator,
  Car,
  CheckCircle2,
  FileText,
  MapPin,
  ScanLine,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { extractFromFile, type ExtractedField, type ExtractionResult } from '../lib/extraction';
import { releaseOcr } from '../lib/ocr';
import { DocumentUploader } from './DocumentsPage';
import FiscalCodeCalculator from '../components/FiscalCodeCalculator';
import CopyValueButton from '../components/CopyValueButton';
import { PageHeader, formatBytes } from './components';

/* -------------------------------------------------------------------------
 * Modello del modulo
 * ---------------------------------------------------------------------- */

interface Party {
  role: string;
  fullName?: string;
  fiscalCode?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  drivingLicence?: string;
  companyName?: string;
  policyNumber?: string;
  notes?: string;
}

interface Vehicle {
  side: 'assicurato' | 'controparte';
  plate?: string;
  make?: string;
  model?: string;
  ownerName?: string;
  driverName?: string;
  companyName?: string;
  policyNumber?: string;
  damageDescription?: string;
  drivable?: boolean;
}

interface ClaimForm {
  claimType: string;
  policyId: string;
  companyName: string;
  occurredAt: string;
  placeAddress: string;
  placeCity: string;
  placeProvince: string;
  dynamics: string;
  injuries: boolean;
  injuriesDetail: string;
  authoritiesInvolved: boolean;
  authorityType: string;
  reportNumber: string;
  caiSigned: string;
  estimatedDamage: string;
  parties: Party[];
  vehicles: Vehicle[];
}

interface PrefillData {
  insured: {
    firstName: string;
    lastName: string;
    fullName: string;
    fiscalCode: string;
    birthDate: string;
    phone: string;
    email: string;
    address: string;
  };
  policies: Array<{
    id: string;
    companyName: string;
    policyNumber: string;
    branch: string;
    plate: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    insuredObject: string | null;
  }>;
  suggestedType: string;
}

const CLAIM_TYPES = [
  { value: 'rca', label: 'Incidente stradale (RC Auto)', hint: 'Collisione, urto, danni da circolazione' },
  { value: 'kasko', label: 'Danno al proprio veicolo', hint: 'Kasko, collisione, atti vandalici' },
  { value: 'furto_incendio', label: 'Furto o incendio', hint: 'Veicolo o beni sottratti o danneggiati' },
  { value: 'casa', label: 'Casa e famiglia', hint: 'Danni all’abitazione o causati a terzi' },
  { value: 'infortuni', label: 'Infortunio', hint: 'Lesioni personali' },
  { value: 'salute', label: 'Spese mediche', hint: 'Rimborso di prestazioni sanitarie' },
  { value: 'rc_generale', label: 'Responsabilità civile', hint: 'Danni causati a terzi in altri contesti' },
  { value: 'altro', label: 'Altro', hint: 'Descrivilo nella dinamica' },
];

const STEPS = [
  { title: 'Tipo di sinistro', icon: ShieldAlert },
  { title: 'Quando e dove', icon: MapPin },
  { title: 'Com’è successo', icon: FileText },
  { title: 'Chi era coinvolto', icon: Users },
  { title: 'Documenti', icon: Wand2 },
  { title: 'Riepilogo e invio', icon: Send },
];

/** Campi che hanno una destinazione nel modulo: gli altri restano informativi. */
const APPLICABLE_FIELDS = new Set([
  'fullName',
  'fiscalCode',
  'birthDate',
  'phone',
  'plate',
  'policyNumber',
  'company',
  'amount',
]);

const emptyForm: ClaimForm = {
  claimType: '',
  policyId: '',
  companyName: '',
  occurredAt: '',
  placeAddress: '',
  placeCity: '',
  placeProvince: '',
  dynamics: '',
  injuries: false,
  injuriesDetail: '',
  authoritiesInvolved: false,
  authorityType: '',
  reportNumber: '',
  caiSigned: '',
  estimatedDamage: '',
  parties: [],
  vehicles: [],
};

/* -------------------------------------------------------------------------
 * Campi riutilizzabili
 * ---------------------------------------------------------------------- */

const Text: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  error?: string;
  maxLength?: number;
}> = ({ label, value, onChange, placeholder, hint, type = 'text', error, maxLength }) => (
  <label className="block mb-4">
    <span className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">{label}</span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-xl border bg-white px-4 py-3 text-[0.95rem] focus:border-[#c5a059] ${
        error ? 'border-[#fca5a5]' : 'border-[rgba(15,23,42,0.12)]'
      }`}
    />
    {hint && !error && <span className="block mt-1.5 text-[0.75rem] text-[#64748b]">{hint}</span>}
    {error && <span className="block mt-1.5 text-[0.78rem] font-semibold text-[#b91c1c]">{error}</span>}
  </label>
);

const Toggle: React.FC<{ label: string; value: boolean; onChange: (value: boolean) => void; hint?: string }> = ({
  label,
  value,
  onChange,
  hint,
}) => (
  <div className="flex items-start gap-2.5 mb-4">
    <input
      type="checkbox"
      checked={value}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-0.5 w-[18px] h-[18px] accent-[#c5a059] shrink-0 cursor-pointer"
      id={`toggle-${label}`}
    />
    <label htmlFor={`toggle-${label}`} className="text-[0.88rem] text-[#334155] cursor-pointer">
      <span className="font-semibold text-[#0f172a] block">{label}</span>
      {hint && <span className="text-[0.8rem] text-[#64748b]">{hint}</span>}
    </label>
  </div>
);

/* -------------------------------------------------------------------------
 * Pagina
 * ---------------------------------------------------------------------- */

export const ClaimWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [claimId, setClaimId] = useState<string | null>(null);
  const [form, setForm] = useState<ClaimForm>(emptyForm);
  const [prefill, setPrefill] = useState<PrefillData | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; size: number }>>([]);
  const [extraction, setExtraction] = useState<
    (ExtractionResult & { fileName: string }) | null
  >(null);
  const [extracting, setExtracting] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ percent: number; stage: string } | null>(null);
  /** File in attesa: l'OCR parte solo se l'utente lo chiede espressamente. */
  const [pendingOcrFile, setPendingOcrFile] = useState<File | null>(null);
  const [declaration, setDeclaration] = useState(false);
  /** Indice del soggetto per cui è aperto il calcolo del codice fiscale. */
  const [calculatorFor, setCalculatorFor] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<{ reference: string } | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const extractionRef = useRef<Record<string, unknown> | null>(null);

  // Apertura (o ripresa) della bozza e caricamento dei dati per la precompilazione.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [created, prefillData] = await Promise.all([
          api.post<{ claimId: string; resumed: boolean }>('/api/claims', {}),
          api.get<PrefillData>('/api/claims/prefill'),
        ]);
        if (!active) return;

        setClaimId(created.claimId);
        setPrefill(prefillData);

        const detail = await api.get<any>(`/api/claims/${created.claimId}`);
        if (!active) return;

        const claim = detail.claim;
        setForm({
          claimType: claim.claimType && claim.claimType !== 'altro' ? claim.claimType : '',
          policyId: claim.policyId ?? '',
          companyName: claim.companyName ?? '',
          occurredAt: claim.occurredAt ? String(claim.occurredAt).slice(0, 16).replace(' ', 'T') : '',
          placeAddress: claim.placeAddress ?? '',
          placeCity: claim.placeCity ?? '',
          placeProvince: claim.placeProvince ?? '',
          dynamics: claim.dynamics ?? '',
          injuries: Boolean(claim.injuries),
          injuriesDetail: claim.injuriesDetail ?? '',
          authoritiesInvolved: Boolean(claim.authoritiesInvolved),
          authorityType: claim.authorityType ?? '',
          reportNumber: claim.reportNumber ?? '',
          caiSigned: claim.caiSigned ?? '',
          estimatedDamage: claim.estimatedDamage != null ? String(claim.estimatedDamage) : '',
          // Se non ci sono ancora soggetti, si parte con l'assicurato già compilato.
          parties:
            detail.parties?.length > 0
              ? detail.parties
              : [
                  {
                    role: 'assicurato',
                    fullName: prefillData.insured.fullName,
                    fiscalCode: prefillData.insured.fiscalCode,
                    birthDate: prefillData.insured.birthDate,
                    phone: prefillData.insured.phone,
                    email: prefillData.insured.email,
                    address: prefillData.insured.address,
                  },
                ],
          vehicles: detail.vehicles ?? [],
        });
        setAttachments(
          (detail.documents ?? []).map((document: any) => ({
            id: document.id,
            name: document.title,
            size: document.sizeBytes,
          })),
        );
        setStep(claim.wizardStep ?? 0);
      } catch (loadError) {
        if (active) setError(loadError instanceof ApiError ? loadError.message : 'Apertura non riuscita.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof ClaimForm>(key: K, value: ClaimForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const save = useCallback(
    async (nextStep?: number) => {
      if (!claimId) return true;
      setSaving(true);
      setError(null);
      const current = formRef.current;

      try {
        const result = await api.patch<{ savedAt: string }>(`/api/claims/${claimId}`, {
          claimType: current.claimType || undefined,
          policyId: current.policyId || undefined,
          companyName: current.companyName || undefined,
          occurredAt: current.occurredAt || undefined,
          placeAddress: current.placeAddress || undefined,
          placeCity: current.placeCity || undefined,
          placeProvince: current.placeProvince || undefined,
          dynamics: current.dynamics || undefined,
          injuries: current.injuries,
          injuriesDetail: current.injuriesDetail || undefined,
          authoritiesInvolved: current.authoritiesInvolved,
          authorityType: current.authorityType || undefined,
          reportNumber: current.reportNumber || undefined,
          caiSigned: current.caiSigned || undefined,
          estimatedDamage: current.estimatedDamage ? Number(current.estimatedDamage.replace(',', '.')) : undefined,
          parties: current.parties.filter((party) => party.fullName || party.fiscalCode),
          vehicles: current.vehicles.filter((vehicle) => vehicle.plate || vehicle.make),
          wizardStep: nextStep ?? step,
          // Cosa ha riconosciuto la lettura automatica: il consulente lo vede
          // nella pratica e sa da dove arrivano i dati precompilati.
          extractionSummary: extractionRef.current ?? undefined,
        });
        setSavedAt(result.savedAt);
        return true;
      } catch (saveError) {
        if (saveError instanceof ApiError) {
          setError(saveError.message);
          if (saveError.fields) setFieldErrors(saveError.fields);
        } else {
          setError('Salvataggio non riuscito.');
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [claimId, step],
  );

  /** Controlli locali: gli stessi che rifarà il server all'invio. */
  const validateStep = (index: number): Record<string, string> => {
    const problems: Record<string, string> = {};
    if (index === 0 && !form.claimType) problems.claimType = 'Scegli il tipo di sinistro.';
    if (index === 1) {
      if (!form.occurredAt) problems.occurredAt = 'Indica data e ora.';
      else if (Date.parse(form.occurredAt) > Date.now() + 3600_000) {
        problems.occurredAt = 'La data non può essere nel futuro.';
      }
      if (!form.placeCity) problems.placeCity = 'Indica il comune.';
    }
    if (index === 2) {
      if (form.dynamics.trim().length < 20) problems.dynamics = 'Descrivi la dinamica in almeno 20 caratteri.';
      if (form.injuries && !form.injuriesDetail.trim()) problems.injuriesDetail = 'Descrivi brevemente le lesioni.';
      if (form.authoritiesInvolved && !form.authorityType.trim()) {
        problems.authorityType = 'Indica quale autorità è intervenuta.';
      }
    }
    if (index === 3) {
      if (!form.parties.some((party) => party.role === 'assicurato' && party.fullName?.trim())) {
        problems.parties = 'Inserisci i dati dell’assicurato.';
      }
      if (form.claimType === 'rca') {
        if (!form.vehicles.some((vehicle) => vehicle.side === 'assicurato' && vehicle.plate?.trim())) {
          problems.vehicles = 'Per un sinistro RC Auto serve la targa del veicolo assicurato.';
        }
        if (!form.policyId) problems.policyId = 'Torna al primo passaggio e seleziona la polizza.';
      }
    }
    return problems;
  };

  const goNext = async () => {
    const problems = validateStep(step);
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const next = Math.min(step + 1, STEPS.length - 1);
    if (await save(next)) setStep(next);
  };

  const goBack = () => {
    setFieldErrors({});
    setStep((previous) => Math.max(0, previous - 1));
  };

  /* --------------------------------------------------------------------
   * Lettura automatica dei documenti
   * ------------------------------------------------------------------ */
  /** Dati del cliente usati per agganciare le letture a valori gia' noti. */
  const extractionContext = useMemo(
    () => ({
      knownPolicyNumbers: prefill?.policies.map((policy) => policy.policyNumber) ?? [],
      knownPlates: (prefill?.policies.map((policy) => policy.plate).filter(Boolean) as string[]) ?? [],
      knownFiscalCode: form.parties.find((party) => party.role === 'assicurato')?.fiscalCode ?? null,
    }),
    [prefill, form.parties],
  );

  const runExtraction = async (file: File, allowOcr: boolean) => {
    setExtracting(true);
    setOcrProgress(null);
    try {
      const result = await extractFromFile(file, {
        context: extractionContext,
        allowOcr,
        onProgress: (progress) => setOcrProgress(progress),
      });
      setExtraction({ ...result, fileName: file.name });
      if (result.fields.length > 0) {
        extractionRef.current = {
          file: file.name,
          origine: result.source,
          qualita: result.ocrConfidence ? Math.round(result.ocrConfidence) : null,
          campi: result.fields.map((field) => ({
            campo: field.label,
            valore: field.value,
            affidabilita: field.confidence,
            corretto_da: field.correctedFrom ?? null,
          })),
        };
      }
      // Se non c'e' testo da leggere, si propone il riconoscimento ottico.
      setPendingOcrFile(result.source === 'nessuno' ? file : null);
    } catch {
      setExtraction(null);
      setPendingOcrFile(null);
    } finally {
      setExtracting(false);
      setOcrProgress(null);
    }
  };

  const handleUploaded = async (document: { id: string }, file: File) => {
    setAttachments((previous) => [...previous, { id: document.id, name: file.name, size: file.size }]);
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) return;
    // Primo passaggio senza OCR: sui PDF nativi e' immediato e non scarica nulla.
    await runExtraction(file, false);
  };

  // Il motore OCR occupa memoria: si libera uscendo dal modulo.
  useEffect(() => () => { void releaseOcr(); }, []);

  /** Applica un campo riconosciuto al punto giusto del modulo. */
  const applyField = (field: ExtractedField) => {
    setForm((previous) => {
      const next = { ...previous };
      switch (field.key) {
        case 'fiscalCode':
        case 'fullName': {
          const parties = [...previous.parties];
          const index = parties.findIndex((party) => party.role === 'assicurato');
          const target = index >= 0 ? { ...parties[index] } : { role: 'assicurato' };
          if (field.key === 'fiscalCode') target.fiscalCode = field.value.toUpperCase();
          else target.fullName = field.value;
          if (index >= 0) parties[index] = target;
          else parties.push(target);
          next.parties = parties;
          break;
        }
        case 'birthDate': {
          const parties = [...previous.parties];
          const index = parties.findIndex((party) => party.role === 'assicurato');
          if (index >= 0) parties[index] = { ...parties[index], birthDate: field.value };
          next.parties = parties;
          break;
        }
        case 'phone': {
          const parties = [...previous.parties];
          const index = parties.findIndex((party) => party.role === 'assicurato');
          if (index >= 0 && !parties[index].phone) {
            parties[index] = { ...parties[index], phone: field.value };
            next.parties = parties;
          }
          break;
        }
        case 'plate': {
          const vehicles = [...previous.vehicles];
          const index = vehicles.findIndex((vehicle) => vehicle.side === 'assicurato');
          const target = index >= 0 ? { ...vehicles[index] } : { side: 'assicurato' as const };
          target.plate = field.value.toUpperCase();
          if (index >= 0) vehicles[index] = target;
          else vehicles.push(target);
          next.vehicles = vehicles;
          break;
        }
        case 'policyNumber': {
          const match = prefill?.policies.find(
            (policy) => policy.policyNumber.replace(/\s/g, '') === field.value.replace(/\s/g, ''),
          );
          if (match) {
            next.policyId = match.id;
            next.companyName = match.companyName;
          }
          break;
        }
        case 'company':
          next.companyName = field.value;
          break;
        case 'amount':
          next.estimatedDamage = field.value.replace(/\./g, '').replace(',', '.');
          break;
        default:
          break;
      }
      return next;
    });

    setExtraction((previous) =>
      previous ? { ...previous, fields: previous.fields.filter((item) => item.key !== field.key) } : previous,
    );
  };

  const submit = async () => {
    if (!claimId) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      await save(step);
      const result = await api.post<{ reference: string }>(`/api/claims/${claimId}/submit`, {
        confirm: true,
        declarationAccepted: declaration,
      });
      setSubmitted({ reference: result.reference });
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
        if (submitError.fields) setFieldErrors(submitError.fields);
      } else {
        setError('Invio non riuscito.');
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedPolicy = useMemo(
    () => prefill?.policies.find((policy) => policy.id === form.policyId),
    [prefill, form.policyId],
  );

  if (loading) {
    return (
      <div className="card flex items-center gap-4">
        <span className="w-9 h-9 rounded-full border-[3px] border-[#c5a059]/30 border-t-[#c5a059] animate-spin shrink-0" />
        <p className="text-[0.95rem] text-[#334155]">Preparazione del modulo…</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div>
        <div className="card text-center py-10">
          <span className="inline-flex w-16 h-16 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] items-center justify-center mb-4">
            <CheckCircle2 size={30} className="text-[#16a34a]" />
          </span>
          <h1 className="text-[1.5rem] font-extrabold text-[#0f172a] mb-2">Denuncia inviata</h1>
          <p className="text-[0.95rem] text-[#334155] max-w-md mx-auto leading-relaxed">
            La tua pratica ha il protocollo <strong>{submitted.reference}</strong>. Il consulente l’ha ricevuta e la
            trovi nella sezione Pratiche di sinistro, con tutti gli aggiornamenti di stato.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-6">
            <button onClick={() => navigate('/area-riservata/sinistri')} className="btn btn-primary">
              Vai alle pratiche
            </button>
            <button onClick={() => navigate('/area-riservata')} className="btn btn-outline">
              Torna alla panoramica
            </button>
          </div>
        </div>
      </div>
    );
  }

  const StepIcon = STEPS[step].icon;

  return (
    <div>
      <PageHeader
        title="Apri una pratica di sinistro"
        description="Ti guidiamo passo passo. Tutto viene salvato man mano: puoi interrompere e riprendere quando vuoi."
      />

      {/* Avanzamento */}
      <ol className="flex flex-wrap gap-1.5 mb-6" aria-label="Avanzamento">
        {STEPS.map((item, index) => (
          <li key={item.title} className="flex-1 min-w-[90px]">
            <div
              className={`h-1.5 rounded-full mb-1.5 ${
                index < step ? 'bg-[#16a34a]' : index === step ? 'bg-[#c5a059]' : 'bg-[#e2e8f0]'
              }`}
            />
            <span
              className={`text-[0.7rem] font-bold ${index === step ? 'text-[#0f172a]' : 'text-[#94a3b8]'}`}
            >
              {index + 1}. {item.title}
            </span>
          </li>
        ))}
      </ol>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[0.88rem] font-semibold text-[#991b1b] mb-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            {error}
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1.5 font-normal list-disc list-inside">
                {Object.entries(fieldErrors).map(([key, value]) => (
                  <li key={key}>{value}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="flex items-center gap-2 font-bold text-[1.05rem] text-[#0f172a] mb-5">
          <StepIcon size={19} className="text-[#c5a059]" />
          {STEPS[step].title}
        </h2>

        {/* 1. Tipo di sinistro e polizza */}
        {step === 0 && (
          <div>
            <div className="grid sm:grid-cols-2 gap-2.5 mb-5">
              {CLAIM_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => update('claimType', type.value)}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    form.claimType === type.value
                      ? 'border-[#c5a059] bg-[#fffdf9] shadow-sm'
                      : 'border-[rgba(15,23,42,0.12)] hover:border-[rgba(197,160,89,0.5)]'
                  }`}
                >
                  <span className="block font-bold text-[0.9rem] text-[#0f172a]">{type.label}</span>
                  <span className="block text-[0.78rem] text-[#64748b] mt-0.5">{type.hint}</span>
                </button>
              ))}
            </div>
            {fieldErrors.claimType && (
              <p className="text-[0.82rem] font-semibold text-[#b91c1c] mb-3">{fieldErrors.claimType}</p>
            )}

            <label className="block">
              <span className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">Polizza interessata</span>
              <select
                value={form.policyId}
                onChange={(event) => {
                  const policy = prefill?.policies.find((item) => item.id === event.target.value);
                  update('policyId', event.target.value);
                  if (policy) {
                    update('companyName', policy.companyName);
                    if (policy.plate && !form.vehicles.some((vehicle) => vehicle.side === 'assicurato')) {
                      update('vehicles', [
                        ...form.vehicles,
                        {
                          side: 'assicurato',
                          plate: policy.plate,
                          make: policy.vehicleMake ?? '',
                          model: policy.vehicleModel ?? '',
                        },
                      ]);
                    }
                  }
                }}
                className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3 text-[0.95rem] focus:border-[#c5a059]"
              >
                <option value="">Non lo so / non presente in elenco</option>
                {prefill?.policies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.companyName} — {policy.policyNumber}
                    {policy.plate ? ` (${policy.plate})` : ''}
                  </option>
                ))}
              </select>
              <span className="block mt-1.5 text-[0.75rem] text-[#64748b]">
                {prefill?.policies.length
                  ? 'Selezionandola, compagnia e veicolo vengono compilati da soli.'
                  : 'Nessuna polizza in archivio: puoi proseguire, ci penserà il consulente.'}
              </span>
            </label>
          </div>
        )}

        {/* 2. Quando e dove */}
        {step === 1 && (
          <div>
            <Text
              label="Data e ora del sinistro"
              type="datetime-local"
              value={form.occurredAt}
              onChange={(value) => update('occurredAt', value)}
              error={fieldErrors.occurredAt}
              hint="Se non ricordi l’ora esatta, indica quella approssimativa."
            />
            <Text
              label="Indirizzo o luogo"
              value={form.placeAddress}
              onChange={(value) => update('placeAddress', value)}
              placeholder="Via Roma 12, incrocio con via Verdi"
              maxLength={160}
            />
            <div className="grid sm:grid-cols-[1fr_120px] sm:gap-3">
              <Text
                label="Comune"
                value={form.placeCity}
                onChange={(value) => update('placeCity', value)}
                error={fieldErrors.placeCity}
                maxLength={80}
              />
              <Text
                label="Provincia"
                value={form.placeProvince}
                onChange={(value) => update('placeProvince', value.toUpperCase().slice(0, 2))}
                placeholder="MI"
                maxLength={2}
              />
            </div>
          </div>
        )}

        {/* 3. Dinamica */}
        {step === 2 && (
          <div>
            <label className="block mb-4">
              <span className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">Cosa è successo</span>
              <textarea
                value={form.dynamics}
                onChange={(event) => update('dynamics', event.target.value)}
                rows={6}
                maxLength={2000}
                placeholder="Descrivi con parole tue come si è svolto il fatto: direzione di marcia, condizioni della strada, cosa hai visto…"
                className={`w-full resize-y rounded-xl border bg-white px-4 py-3 text-[0.95rem] focus:border-[#c5a059] ${
                  fieldErrors.dynamics ? 'border-[#fca5a5]' : 'border-[rgba(15,23,42,0.12)]'
                }`}
              />
              <span className="flex justify-between mt-1.5 text-[0.75rem]">
                <span className={fieldErrors.dynamics ? 'font-semibold text-[#b91c1c]' : 'text-[#64748b]'}>
                  {fieldErrors.dynamics ?? 'Più dettagli fornisci, meno domande dovrà farti il consulente.'}
                </span>
                <span className="text-[#94a3b8]">{form.dynamics.length}/2000</span>
              </span>
            </label>

            <Toggle
              label="Ci sono state persone ferite"
              value={form.injuries}
              onChange={(value) => update('injuries', value)}
              hint="Anche lesioni lievi: cambia la gestione della pratica."
            />
            {form.injuries && (
              <Text
                label="Chi e quali lesioni"
                value={form.injuriesDetail}
                onChange={(value) => update('injuriesDetail', value)}
                error={fieldErrors.injuriesDetail}
                maxLength={600}
              />
            )}

            <Toggle
              label="È intervenuta un’autorità"
              value={form.authoritiesInvolved}
              onChange={(value) => update('authoritiesInvolved', value)}
              hint="Polizia locale, carabinieri, polizia stradale…"
            />
            {form.authoritiesInvolved && (
              <div className="grid sm:grid-cols-2 sm:gap-3">
                <Text
                  label="Quale autorità"
                  value={form.authorityType}
                  onChange={(value) => update('authorityType', value)}
                  error={fieldErrors.authorityType}
                  maxLength={60}
                />
                <Text
                  label="Numero del verbale"
                  value={form.reportNumber}
                  onChange={(value) => update('reportNumber', value)}
                  maxLength={60}
                />
              </div>
            )}

            {(form.claimType === 'rca' || form.claimType === 'kasko') && (
              <label className="block mb-4">
                <span className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">
                  Constatazione amichevole (modulo blu)
                </span>
                <select
                  value={form.caiSigned}
                  onChange={(event) => update('caiSigned', event.target.value)}
                  className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3 text-[0.95rem] focus:border-[#c5a059]"
                >
                  <option value="">Non indicato</option>
                  <option value="congiunto">Firmata da entrambi</option>
                  <option value="singolo">Compilata solo da me</option>
                  <option value="non_compilato">Non compilata</option>
                </select>
              </label>
            )}

            <Text
              label="Danno stimato (facoltativo)"
              value={form.estimatedDamage}
              onChange={(value) => update('estimatedDamage', value.replace(/[^\d.,]/g, ''))}
              placeholder="1500"
              hint="Una stima approssimativa in euro, se ce l’hai."
            />
          </div>
        )}

        {/* 4. Soggetti e veicoli */}
        {step === 3 && (
          <div>
            <h3 className="font-bold text-[0.92rem] text-[#0f172a] mb-3">Persone coinvolte</h3>
            {form.parties.map((party, index) => (
              <div key={index} className="rounded-xl border border-[rgba(15,23,42,0.1)] p-4 mb-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <select
                    value={party.role}
                    onChange={(event) => {
                      const parties = [...form.parties];
                      parties[index] = { ...party, role: event.target.value };
                      update('parties', parties);
                    }}
                    className="rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1.5 text-[0.82rem] font-bold"
                  >
                    <option value="assicurato">Assicurato</option>
                    <option value="conducente">Conducente</option>
                    <option value="proprietario">Proprietario</option>
                    <option value="controparte">Controparte</option>
                    <option value="testimone">Testimone</option>
                    <option value="danneggiato">Danneggiato</option>
                  </select>
                  {form.parties.length > 1 && (
                    <button
                      type="button"
                      onClick={() => update('parties', form.parties.filter((_, position) => position !== index))}
                      className="text-[0.8rem] font-semibold text-[#b91c1c]"
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 sm:gap-3">
                  <Text
                    label="Nome e cognome"
                    value={party.fullName ?? ''}
                    onChange={(value) => {
                      const parties = [...form.parties];
                      parties[index] = { ...party, fullName: value };
                      update('parties', parties);
                    }}
                    maxLength={120}
                  />
                  <div>
                    <Text
                      label="Codice fiscale"
                      value={party.fiscalCode ?? ''}
                      onChange={(value) => {
                        const parties = [...form.parties];
                        parties[index] = { ...party, fiscalCode: value.toUpperCase() };
                        update('parties', parties);
                      }}
                      maxLength={16}
                    />
                    {!party.fiscalCode && (
                      <button
                        type="button"
                        onClick={() => setCalculatorFor(index)}
                        className="-mt-3 mb-4 inline-flex items-center gap-1.5 text-[0.8rem] font-bold text-[#c5a059] hover:text-[#b38e46]"
                      >
                        <Calculator size={13} />
                        Non lo ricordi? Calcolalo
                      </button>
                    )}
                    {party.fiscalCode && (
                      <CopyValueButton
                        value={party.fiscalCode}
                        label="Copia codice fiscale"
                        compact
                        className="-mt-3 mb-4"
                      />
                    )}
                  </div>
                  <Text
                    label="Telefono"
                    value={party.phone ?? ''}
                    onChange={(value) => {
                      const parties = [...form.parties];
                      parties[index] = { ...party, phone: value };
                      update('parties', parties);
                    }}
                    maxLength={20}
                  />
                  <Text
                    label="Compagnia (se controparte)"
                    value={party.companyName ?? ''}
                    onChange={(value) => {
                      const parties = [...form.parties];
                      parties[index] = { ...party, companyName: value };
                      update('parties', parties);
                    }}
                    maxLength={80}
                  />
                </div>
              </div>
            ))}
            {fieldErrors.parties && (
              <p className="text-[0.82rem] font-semibold text-[#b91c1c] mb-2">{fieldErrors.parties}</p>
            )}
            <button
              type="button"
              onClick={() => update('parties', [...form.parties, { role: 'controparte' }])}
              className="btn btn-outline btn-sm mb-6"
            >
              <Users size={14} />
              Aggiungi persona
            </button>

            <h3 className="font-bold text-[0.92rem] text-[#0f172a] mb-3">Veicoli coinvolti</h3>
            {form.vehicles.map((vehicle, index) => (
              <div key={index} className="rounded-xl border border-[rgba(15,23,42,0.1)] p-4 mb-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <select
                    value={vehicle.side}
                    onChange={(event) => {
                      const vehicles = [...form.vehicles];
                      vehicles[index] = { ...vehicle, side: event.target.value as Vehicle['side'] };
                      update('vehicles', vehicles);
                    }}
                    className="rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-3 py-1.5 text-[0.82rem] font-bold"
                  >
                    <option value="assicurato">Il mio veicolo</option>
                    <option value="controparte">Veicolo della controparte</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => update('vehicles', form.vehicles.filter((_, position) => position !== index))}
                    className="text-[0.8rem] font-semibold text-[#b91c1c]"
                  >
                    Rimuovi
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 sm:gap-3">
                  <Text
                    label="Targa"
                    value={vehicle.plate ?? ''}
                    onChange={(value) => {
                      const vehicles = [...form.vehicles];
                      vehicles[index] = { ...vehicle, plate: value.toUpperCase() };
                      update('vehicles', vehicles);
                    }}
                    maxLength={15}
                  />
                  <Text
                    label="Marca e modello"
                    value={[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                    onChange={(value) => {
                      const [make, ...rest] = value.split(' ');
                      const vehicles = [...form.vehicles];
                      vehicles[index] = { ...vehicle, make, model: rest.join(' ') };
                      update('vehicles', vehicles);
                    }}
                    maxLength={80}
                  />
                  <Text
                    label="Compagnia"
                    value={vehicle.companyName ?? ''}
                    onChange={(value) => {
                      const vehicles = [...form.vehicles];
                      vehicles[index] = { ...vehicle, companyName: value };
                      update('vehicles', vehicles);
                    }}
                    maxLength={80}
                  />
                  <Text
                    label="Danni riportati"
                    value={vehicle.damageDescription ?? ''}
                    onChange={(value) => {
                      const vehicles = [...form.vehicles];
                      vehicles[index] = { ...vehicle, damageDescription: value };
                      update('vehicles', vehicles);
                    }}
                    maxLength={600}
                  />
                </div>
              </div>
            ))}
            {fieldErrors.vehicles && (
              <p className="text-[0.82rem] font-semibold text-[#b91c1c] mb-2">{fieldErrors.vehicles}</p>
            )}
            <button
              type="button"
              onClick={() => update('vehicles', [...form.vehicles, { side: 'controparte' }])}
              className="btn btn-outline btn-sm"
            >
              <Car size={14} />
              Aggiungi veicolo
            </button>
          </div>
        )}

        {/* 5. Documenti + lettura automatica */}
        {step === 4 && (
          <div>
            <p className="text-[0.9rem] text-[#334155] leading-relaxed mb-4">
              Allega quello che hai: fotografie dei danni, constatazione amichevole, verbale, preventivi di
              riparazione, fatture. Dai PDF proviamo a leggere i dati principali per compilare il modulo al posto tuo.
            </p>

            <DocumentUploader claimId={claimId ?? undefined} defaultCategory="fotografia" onUploaded={handleUploaded} compact />

            {extracting && (
              <div className="rounded-xl border border-[rgba(197,160,89,0.4)] bg-[#fffdf9] p-4 mt-4">
                <p className="flex items-center gap-2 text-[0.88rem] font-semibold text-[#0f172a]">
                  <span className="w-4 h-4 rounded-full border-2 border-[#c5a059]/30 border-t-[#c5a059] animate-spin" />
                  {ocrProgress?.stage ?? 'Lettura del documento in corso…'}
                </p>
                {ocrProgress && ocrProgress.percent > 0 && (
                  <div className="h-1.5 rounded-full bg-[#e2e8f0] overflow-hidden mt-2.5">
                    <div className="h-full bg-[#c5a059] transition-all" style={{ width: `${ocrProgress.percent}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Riconoscimento ottico: parte solo se l'utente lo chiede. */}
            {pendingOcrFile && !extracting && (
              <div className="rounded-xl border border-[rgba(197,160,89,0.4)] bg-[#fffdf9] p-4 mt-4">
                <h3 className="flex items-center gap-2 font-bold text-[0.92rem] text-[#0f172a] mb-1.5">
                  <ScanLine size={16} className="text-[#c5a059]" />
                  Vuoi che provi a leggere “{pendingOcrFile.name}”?
                </h3>
                <p className="text-[0.84rem] text-[#334155] leading-relaxed mb-1.5">
                  È una fotografia o una scansione: per estrarne i dati serve il riconoscimento ottico.
                </p>
                <p className="text-[0.8rem] text-[#64748b] leading-relaxed mb-3">
                  <strong>L’elaborazione avviene sul tuo dispositivo.</strong> L’immagine non viene inviata a
                  nessun servizio esterno e nulla viene salvato senza la tua conferma. La prima volta il browser
                  scarica il motore di lettura (circa 5 MB), poi resta in memoria.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runExtraction(pendingOcrFile, true)}
                    className="btn btn-primary btn-sm"
                  >
                    <ScanLine size={14} />
                    Leggi il documento
                  </button>
                  <button type="button" onClick={() => setPendingOcrFile(null)} className="btn btn-outline btn-sm">
                    No, compilo a mano
                  </button>
                </div>
              </div>
            )}

            {extraction && !extracting && extraction.source !== 'nessuno' && (
              <div className="rounded-xl border border-[rgba(197,160,89,0.4)] bg-[#fffdf9] p-4 mt-4">
                <h3 className="flex items-center gap-2 font-bold text-[0.92rem] text-[#0f172a] mb-1">
                  <Sparkles size={16} className="text-[#c5a059]" />
                  Dati letti da {extraction.fileName}
                </h3>
                <p className="text-[0.78rem] text-[#94a3b8] mb-3">
                  {extraction.source === 'ocr'
                    ? `Riconoscimento ottico sul tuo dispositivo · qualità della lettura ${Math.round(
                        extraction.ocrConfidence ?? 0,
                      )}% · ${(extraction.elapsedMs / 1000).toFixed(1)} s`
                    : 'Letto dal testo del PDF, senza riconoscimento ottico'}
                </p>

                {extraction.fields.length === 0 ? (
                  <p className="text-[0.84rem] text-[#64748b]">
                    Nessun dato riconosciuto con sufficiente certezza. Meglio così che proporti un valore
                    sbagliato: compila pure a mano, il documento resta comunque allegato.
                  </p>
                ) : (
                  <>
                    <p className="text-[0.8rem] text-[#64748b] mb-3">
                      Controlla e applica solo ciò che è corretto: niente viene inserito senza la tua conferma.
                    </p>
                    <ul className="space-y-2">
                      {extraction.fields.map((field) => {
                        const applicable = APPLICABLE_FIELDS.has(field.key);
                        return (
                          <li
                            key={field.key}
                            className="rounded-lg bg-white border border-[rgba(15,23,42,0.08)] px-3 py-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="block text-[0.72rem] font-bold uppercase tracking-wide text-[#94a3b8]">
                                  {field.label}
                                  <span
                                    className={`ml-2 normal-case ${
                                      field.confidence === 'alta'
                                        ? 'text-[#166534]'
                                        : field.confidence === 'media'
                                          ? 'text-[#b45309]'
                                          : 'text-[#94a3b8]'
                                    }`}
                                  >
                                    affidabilità {field.confidence}
                                  </span>
                                </span>
                                <span className="block font-bold text-[0.92rem] text-[#0f172a] break-all">
                                  {field.value}
                                  {field.correctedFrom && (
                                    <span className="ml-2 text-[0.74rem] font-semibold text-[#94a3b8] line-through">
                                      {field.correctedFrom}
                                    </span>
                                  )}
                                </span>
                              </div>
                              {applicable ? (
                                <span className="flex items-center gap-2 shrink-0">
                                  {field.key === 'fiscalCode' && (
                                    <CopyValueButton
                                      value={field.value}
                                      label="Copia codice fiscale"
                                      compact
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => applyField(field)}
                                    className="btn btn-outline btn-sm shrink-0"
                                  >
                                    Usa questo dato
                                  </button>
                                </span>
                              ) : (
                                <span className="text-[0.74rem] text-[#94a3b8] shrink-0">
                                  segnalato al consulente
                                </span>
                              )}
                            </div>
                            <p className="text-[0.75rem] text-[#64748b] mt-1.5 leading-relaxed">{field.reason}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}

            {attachments.length > 0 && (
              <div className="mt-5">
                <h3 className="font-bold text-[0.9rem] text-[#0f172a] mb-2">Allegati della pratica</h3>
                <ul className="space-y-1.5">
                  {attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex items-center justify-between gap-3 text-[0.85rem] text-[#334155] rounded-lg bg-[#f8fafc] px-3 py-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FileText size={15} className="text-[#94a3b8] shrink-0" />
                        <span className="truncate">{attachment.name}</span>
                      </span>
                      <span className="text-[#94a3b8] text-[0.78rem]">{formatBytes(attachment.size)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 6. Riepilogo */}
        {step === 5 && (
          <div>
            <dl className="rounded-xl border border-[rgba(15,23,42,0.1)] divide-y divide-[rgba(15,23,42,0.07)] mb-5">
              {[
                ['Tipo di sinistro', CLAIM_TYPES.find((type) => type.value === form.claimType)?.label ?? '—'],
                [
                  'Polizza',
                  selectedPolicy
                    ? `${selectedPolicy.companyName} — ${selectedPolicy.policyNumber}`
                    : form.companyName || 'Da individuare',
                ],
                ['Data e ora', form.occurredAt ? form.occurredAt.replace('T', ' ') : '—'],
                ['Luogo', [form.placeAddress, form.placeCity, form.placeProvince].filter(Boolean).join(', ') || '—'],
                ['Feriti', form.injuries ? `Sì — ${form.injuriesDetail}` : 'No'],
                ['Autorità', form.authoritiesInvolved ? form.authorityType || 'Sì' : 'No'],
                ['Persone indicate', String(form.parties.filter((party) => party.fullName).length)],
                ['Veicoli indicati', String(form.vehicles.filter((vehicle) => vehicle.plate).length)],
                ['Allegati', String(attachments.length)],
                ['Danno stimato', form.estimatedDamage ? `€ ${form.estimatedDamage}` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-3 px-4 py-2.5">
                  <dt className="text-[0.78rem] font-bold uppercase tracking-wide text-[#94a3b8]">{label}</dt>
                  <dd className="text-[0.9rem] font-semibold text-[#0f172a] text-right">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="rounded-xl bg-[#f8fafc] border border-[rgba(15,23,42,0.08)] p-4 mb-4">
              <p className="text-[0.85rem] text-[#334155] leading-relaxed mb-3">{form.dynamics || '—'}</p>
              <button type="button" onClick={() => setStep(2)} className="text-[0.82rem] font-bold text-[#c5a059]">
                Modifica la descrizione
              </button>
            </div>

            <div className="flex items-start gap-2.5 mb-4">
              <input
                id="declaration"
                type="checkbox"
                checked={declaration}
                onChange={(event) => setDeclaration(event.target.checked)}
                className="mt-0.5 w-[18px] h-[18px] accent-[#c5a059] shrink-0 cursor-pointer"
              />
              <label htmlFor="declaration" className="text-[0.85rem] leading-relaxed text-[#334155] cursor-pointer">
                Dichiaro che le informazioni fornite sono veritiere e complete, consapevole che dichiarazioni non
                veritiere possono comportare la decadenza dal diritto all’indennizzo e conseguenze penali.
              </label>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!declaration || saving}
              className="btn btn-primary w-full py-3.5 disabled:opacity-60"
            >
              <Send size={17} />
              {saving ? 'Invio in corso…' : 'Invia la denuncia al consulente'}
            </button>
          </div>
        )}

        {/* Navigazione */}
        {step < STEPS.length - 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-[rgba(15,23,42,0.08)]">
            <button type="button" onClick={goBack} disabled={step === 0} className="btn btn-outline disabled:opacity-40">
              <ArrowLeft size={16} />
              Indietro
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => save()}
                disabled={saving}
                className="text-[0.84rem] font-semibold text-[#64748b] hover:text-[#0a192f] inline-flex items-center gap-1.5"
              >
                <Save size={15} />
                {saving ? 'Salvataggio…' : 'Salva e riprendi dopo'}
              </button>
              <button type="button" onClick={goNext} disabled={saving} className="btn btn-primary">
                Avanti
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {step === STEPS.length - 1 && (
          <button type="button" onClick={goBack} className="btn btn-outline mt-5">
            <ArrowLeft size={16} />
            Indietro
          </button>
        )}
      </div>

      {calculatorFor !== null && (
        <FiscalCodeCalculator
          initial={{
            // Il campo della pratica contiene il nome completo e non consente
            // di distinguere con certezza nomi e cognomi composti. I due valori
            // strutturati vengono precompilati solo per l'assicurato che
            // coincide con il profilo; per gli altri soggetti li chiede il
            // calcolatore senza fare ipotesi.
            firstName:
              form.parties[calculatorFor]?.role === 'assicurato' &&
              (!form.parties[calculatorFor]?.fullName ||
                form.parties[calculatorFor]?.fullName === prefill?.insured.fullName)
                ? prefill?.insured.firstName
                : undefined,
            lastName:
              form.parties[calculatorFor]?.role === 'assicurato' &&
              (!form.parties[calculatorFor]?.fullName ||
                form.parties[calculatorFor]?.fullName === prefill?.insured.fullName)
                ? prefill?.insured.lastName
                : undefined,
            birthDate:
              form.parties[calculatorFor]?.birthDate ||
              (form.parties[calculatorFor]?.role === 'assicurato' &&
              (!form.parties[calculatorFor]?.fullName ||
                form.parties[calculatorFor]?.fullName === prefill?.insured.fullName)
                ? prefill?.insured.birthDate
                : undefined),
          }}
          onClose={() => setCalculatorFor(null)}
          onConfirm={(code, data) => {
            const parties = [...form.parties];
            parties[calculatorFor] = {
              ...parties[calculatorFor],
              fullName: `${data.firstName} ${data.lastName}`.trim(),
              fiscalCode: code,
              birthDate: data.birthDate,
            };
            update('parties', parties);
            setCalculatorFor(null);
          }}
        />
      )}

      {savedAt && (
        <p className="text-[0.78rem] text-[#94a3b8] text-center mt-4">
          Bozza salvata alle {new Date(savedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
};

export default ClaimWizardPage;
