import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Calculator, Check, MapPin, X } from 'lucide-react';
import CopyValueButton from './CopyValueButton';
import { isValidFiscalCode, normalizeCode } from '../lib/italianCodes';
import {
  FiscalCodeError,
  describeBirthPlace,
  generateFiscalCode,
  isBirthPlaceValidAt,
  searchBirthPlaces,
  type BirthPlace,
  type FiscalCodeResult,
} from '../lib/fiscalCodeGenerator';

/**
 * Calcolo assistito del codice fiscale.
 *
 * Serve a chi sta compilando un modulo e non ha sotto mano la tessera
 * sanitaria: bastano nome, cognome, data di nascita, sesso e comune. Il calcolo
 * avviene nel browser; la tabella dei codici catastali (circa 170 KB compressi)
 * viene scaricata solo quando si apre questa schermata.
 *
 * Il risultato viene sempre presentato come *proposta* da confermare, mai
 * inserito d'ufficio: l'omocodia — la variante che l'Agenzia assegna quando due
 * persone otterrebbero lo stesso codice — non è prevedibile da nessun algoritmo.
 */

export interface FiscalCodeCalculatorProps {
  initial?: {
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    sex?: 'M' | 'F';
  };
  onConfirm: (
    code: string,
    data: {
      firstName: string;
      lastName: string;
      birthDate: string;
      sex: 'M' | 'F';
      birthPlace: string;
      belfioreCode: string;
    },
  ) => void;
  onClose: () => void;
}

export const FiscalCodeCalculator: React.FC<FiscalCodeCalculatorProps> = ({ initial, onConfirm, onClose }) => {
  const [form, setForm] = useState({
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    birthDate: initial?.birthDate ?? '',
    sex: (initial?.sex ?? '') as '' | 'M' | 'F',
  });
  const [placeQuery, setPlaceQuery] = useState('');
  const [places, setPlaces] = useState<BirthPlace[]>([]);
  const [place, setPlace] = useState<BirthPlace | null>(null);
  const [searching, setSearching] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [result, setResult] = useState<FiscalCodeResult | null>(null);
  const [candidateCode, setCandidateCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const searchRequest = useRef(0);

  const updateForm = <K extends keyof typeof form,>(key: K, value: (typeof form)[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    // Un codice già calcolato non deve restare confermabile dopo che uno dei
    // dati sorgente è cambiato.
    setResult(null);
    setCandidateCode('');
    setVerified(false);
    setError(null);

    if (key === 'birthDate' && place && !isBirthPlaceValidAt(place, String(value) || undefined)) {
      setPlace(null);
      setPlaces([]);
    }
  };

  // Ricerca del luogo: si aspetta che l'utente smetta di digitare, altrimenti
  // si filtrerebbero oltre 16.000 voci a ogni tasto.
  useEffect(() => {
    const requestId = ++searchRequest.current;
    if (place && placeQuery === place.name) {
      setSearching(false);
      return;
    }
    if (placeQuery.trim().length < 2) {
      setPlaces([]);
      setSearching(false);
      return;
    }

    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true);
      setTableError(null);
      try {
        const nextPlaces = await searchBirthPlaces(placeQuery, form.birthDate || undefined);
        if (searchRequest.current === requestId) setPlaces(nextPlaces);
      } catch {
        if (searchRequest.current === requestId) {
          setTableError('Elenco dei comuni non disponibile. Riprova fra poco.');
        }
      } finally {
        if (searchRequest.current === requestId) setSearching(false);
      }
    }, 220);

    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [placeQuery, form.birthDate, place]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const calculate = () => {
    setError(null);
    setResult(null);
    try {
      if (!place) throw new FiscalCodeError('belfioreCode', 'Scegli il comune o lo stato di nascita dall’elenco.');
      if (!form.sex) throw new FiscalCodeError('sex', 'Indica il sesso come riportato all’anagrafe.');
      if (!isBirthPlaceValidAt(place, form.birthDate || undefined)) {
        throw new FiscalCodeError(
          'belfioreCode',
          'Il luogo selezionato non era valido alla data di nascita indicata. Selezionalo di nuovo.',
        );
      }

      const calculated = generateFiscalCode({
          firstName: form.firstName,
          lastName: form.lastName,
          birthDate: form.birthDate,
          sex: form.sex,
          belfioreCode: place.code,
        });
      setResult(calculated);
      setCandidateCode(calculated.code);
      setVerified(false);
    } catch (calcError) {
      setError(calcError instanceof FiscalCodeError ? calcError.message : 'Calcolo non riuscito.');
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2.5 text-[0.93rem] focus:border-[#c5a059]';

  return (
    <div
      className="fixed inset-0 z-50 bg-[#050c17]/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Calcolo del codice fiscale"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-4" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[rgba(15,23,42,0.08)]">
          <h2 className="flex items-center gap-2 font-bold text-[1.05rem] text-[#0f172a]">
            <Calculator size={19} className="text-[#c5a059]" />
            Calcola il codice fiscale
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-[#f4f0ea] flex items-center justify-center hover:bg-[#e9e3d9]"
            aria-label="Chiudi"
          >
            <X size={18} className="text-[#0a192f]" />
          </button>
        </header>

        <div className="px-5 py-5">
          <p className="text-[0.88rem] text-[#334155] leading-relaxed mb-4">
            Non serve la tessera sanitaria: bastano i dati anagrafici. Il calcolo avviene sul tuo dispositivo,
            nessun dato viene inviato a servizi esterni.
          </p>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[0.86rem] font-semibold text-[#991b1b] mb-4">
              <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="grid sm:grid-cols-2 sm:gap-3">
            <label className="block mb-3.5">
              <span className="block text-[0.78rem] font-bold text-[#0f172a] mb-1.5">Nome</span>
              <input
                value={form.firstName}
                onChange={(event) => updateForm('firstName', event.target.value)}
                className={inputClass}
                autoComplete="given-name"
                required
              />
            </label>
            <label className="block mb-3.5">
              <span className="block text-[0.78rem] font-bold text-[#0f172a] mb-1.5">Cognome</span>
              <input
                value={form.lastName}
                onChange={(event) => updateForm('lastName', event.target.value)}
                className={inputClass}
                autoComplete="family-name"
                required
              />
            </label>
            <label className="block mb-3.5">
              <span className="block text-[0.78rem] font-bold text-[#0f172a] mb-1.5">Data di nascita</span>
              <input
                type="date"
                value={form.birthDate}
                onInput={(event) => updateForm('birthDate', event.currentTarget.value)}
                className={inputClass}
                max={new Date().toISOString().slice(0, 10)}
                required
              />
            </label>
            <label className="block mb-3.5">
              <span className="block text-[0.78rem] font-bold text-[#0f172a] mb-1.5">Sesso (come all’anagrafe)</span>
              <select
                value={form.sex}
                onChange={(event) => updateForm('sex', event.target.value as '' | 'M' | 'F')}
                className={inputClass}
                required
              >
                <option value="">Seleziona…</option>
                <option value="M">Maschile</option>
                <option value="F">Femminile</option>
              </select>
            </label>
          </div>

          {/* Luogo di nascita con ricerca */}
          <div className="mb-4 relative">
            <label className="block">
              <span className="block text-[0.78rem] font-bold text-[#0f172a] mb-1.5">Comune o stato di nascita</span>
              <div className="relative">
                <MapPin size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <input
                  value={placeQuery}
                  onChange={(event) => {
                    setPlaceQuery(event.target.value);
                    setPlace(null);
                    setResult(null);
                    setCandidateCode('');
                    setVerified(false);
                  }}
                  placeholder="Inizia a scrivere: Rho, Milano, Germania…"
                  className={`${inputClass} pl-11`}
                  autoComplete="off"
                />
              </div>
            </label>

            {place && (
              <p className="mt-1.5 text-[0.8rem] font-semibold text-[#166534]">
                Selezionato: {describeBirthPlace(place, form.birthDate || undefined)} · codice {place.code}
              </p>
            )}
            {searching && <p className="mt-1.5 text-[0.8rem] text-[#64748b]">Ricerca in corso…</p>}
            {tableError && <p className="mt-1.5 text-[0.8rem] font-semibold text-[#b91c1c]">{tableError}</p>}

            {places.length > 0 && !place && (
              <ul className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[rgba(15,23,42,0.12)] bg-white shadow-lg">
                {places.map((option) => (
                  <li key={`${option.code}-${option.name}-${option.validTo ?? ''}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlace(option);
                        setPlaceQuery(option.name);
                        setPlaces([]);
                        setResult(null);
                        setCandidateCode('');
                        setVerified(false);
                        setError(null);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#f4f0ea] border-b border-[rgba(15,23,42,0.05)] last:border-0"
                    >
                      <span className="block font-semibold text-[0.88rem] text-[#0f172a]">{option.name}</span>
                      <span className="block text-[0.76rem] text-[#64748b]">
                        {describeBirthPlace(option, form.birthDate || undefined)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {form.birthDate && (
              <p className="mt-1.5 text-[0.75rem] text-[#94a3b8]">
                L’elenco tiene conto della data di nascita: se il comune ha cambiato nome o è stato accorpato,
                viene proposta la denominazione in vigore allora, che è quella usata nel codice fiscale.
              </p>
            )}
          </div>

          <button type="button" onClick={calculate} className="btn btn-primary w-full">
            <Calculator size={17} />
            Calcola
          </button>

          {result && (
            <div className="mt-5 rounded-xl border border-[rgba(197,160,89,0.45)] bg-[#fffdf9] p-4">
              <p className="text-[0.78rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">
                Codice fiscale proposto — verificabile e correggibile
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mb-2">
                <input
                  value={candidateCode}
                  onChange={(event) => {
                    setCandidateCode(normalizeCode(event.target.value).slice(0, 16));
                    setVerified(false);
                  }}
                  maxLength={16}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Codice fiscale proposto, correggibile"
                  aria-invalid={!isValidFiscalCode(candidateCode)}
                  className={`min-w-0 flex-1 rounded-xl border bg-white px-4 py-2.5 font-mono font-extrabold text-[1.12rem] tracking-[0.08em] uppercase ${
                    isValidFiscalCode(candidateCode)
                      ? 'border-[rgba(15,23,42,0.12)] focus:border-[#c5a059]'
                      : 'border-[#fca5a5] focus:border-[#ef4444]'
                  }`}
                />
                <CopyValueButton value={candidateCode} label="Copia codice" className="shrink-0" />
              </div>
              {!isValidFiscalCode(candidateCode) && (
                <p className="text-[0.77rem] font-semibold text-[#b91c1c] mb-3">
                  Il codice deve avere 16 caratteri e un carattere di controllo valido.
                </p>
              )}
              {isValidFiscalCode(candidateCode) && candidateCode !== result.code && (
                <p className="text-[0.77rem] font-semibold text-[#166534] mb-3">
                  Correzione manuale valida: sarà usata al posto del codice base calcolato.
                </p>
              )}

              <ul className="space-y-1.5 mb-4">
                {result.blocks.map((block) => (
                  <li key={block.label} className="flex items-start gap-3 text-[0.82rem]">
                    <span className="font-mono font-bold text-[#c5a059] shrink-0 w-12">{block.value}</span>
                    <span className="text-[#334155]">
                      <strong className="text-[#0f172a]">{block.label}.</strong> {block.explanation}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-start gap-2 rounded-lg bg-[#fffbeb] border border-[#fde68a] px-3.5 py-2.5 mb-4">
                <AlertTriangle size={15} className="text-[#b45309] shrink-0 mt-0.5" />
                <p className="text-[0.8rem] text-[#78350f] leading-relaxed">
                  Verifica il codice e correggilo qui se necessario. Il calcolo produce il codice base, ma
                  l’Anagrafe tributaria può assegnare una variante per omocodia: questa non è prevedibile dal
                  solo algoritmo.
                </p>
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-[rgba(15,23,42,0.1)] bg-white px-3.5 py-3 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(event) => setVerified(event.target.checked)}
                  className="mt-0.5 w-[17px] h-[17px] accent-[#c5a059] shrink-0"
                />
                <span className="text-[0.8rem] text-[#334155] leading-relaxed">
                  Ho controllato i dati e il codice proposto. So che potrò correggerlo anche nel campo del modulo
                  prima del salvataggio definitivo.
                </span>
              </label>

              <button
                type="button"
                onClick={() =>
                  onConfirm(normalizeCode(candidateCode), {
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    birthDate: form.birthDate,
                    sex: form.sex as 'M' | 'F',
                    birthPlace: place?.name ?? '',
                    belfioreCode: place?.code ?? '',
                  })
                }
                disabled={!verified || !isValidFiscalCode(candidateCode)}
                className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={17} />
                Usa il codice verificato
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FiscalCodeCalculator;
