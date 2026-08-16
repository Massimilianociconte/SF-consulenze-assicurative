import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';

/* -------------------------------------------------------------------------
 * Caricamento dati
 * ---------------------------------------------------------------------- */

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useApiResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let active = true;
    setLoading(true);
    setError(null);

    api
      .get<T>(path)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Caricamento non riuscito.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, loading, error, reload };
}

/* -------------------------------------------------------------------------
 * Formattazione
 * ---------------------------------------------------------------------- */

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Giorni mancanti a una data (negativo = scaduta). */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value.length === 10 ? `${value}T00:00:00Z` : value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

/* -------------------------------------------------------------------------
 * Elementi di interfaccia
 * ---------------------------------------------------------------------- */

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
    <div>
      <h1 className="text-[1.6rem] sm:text-[1.85rem] font-extrabold tracking-tight text-[#0f172a] leading-tight">
        {title}
      </h1>
      {description && <p className="mt-1.5 text-[0.92rem] text-[#64748b] max-w-2xl leading-relaxed">{description}</p>}
    </div>
    {action}
  </header>
);

const STATUS_LABELS: Record<string, string> = {
  // polizze
  active: 'Attiva',
  draft: 'Bozza',
  suspended: 'Sospesa',
  expired: 'Scaduta',
  cancelled: 'Annullata',
  // scadenze
  pending: 'Da saldare',
  paid: 'Pagata',
  renewed: 'Rinnovata',
  // preventivi
  sent: 'Inviato',
  under_review: 'In valutazione',
  accepted: 'Accettato',
  rejected: 'Non accolto',
  // trattative
  analisi: 'Analisi esigenze',
  preventivazione: 'Preventivazione',
  confronto: 'Confronto soluzioni',
  in_firma: 'In firma',
  conclusa: 'Conclusa',
  abbandonata: 'Non proseguita',
  // sinistri
  submitted: 'Inviata',
  in_review: 'In esame',
  waiting_documents: 'In attesa documenti',
  sent_to_company: 'Trasmessa alla compagnia',
  in_progress: 'In lavorazione',
  settled: 'Liquidata',
  closed: 'Chiusa',
  // richieste
  received: 'Ricevuta',
  verified: 'Verificata',
  failed: 'Errore da risolvere',
  waiting_client: 'In attesa di risposta',
  waiting_company: 'In attesa compagnia',
  completed: 'Completata',
  // documenti
  uploaded: 'Caricato',
  pending_scan: 'In verifica',
  archived_by_advisor: 'Archiviato',
};

const STATUS_TONES: Record<string, string> = {
  active: 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
  paid: 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
  accepted: 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
  settled: 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
  completed: 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
  conclusa: 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
  renewed: 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
  verified: 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
  pending: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]',
  waiting_documents: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]',
  waiting_client: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]',
  expired: 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]',
  cancelled: 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]',
  rejected: 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]',
  failed: 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]',
  abbandonata: 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]',
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-bold whitespace-nowrap ${
      STATUS_TONES[status] ?? 'bg-[#f4ece0] text-[#0a192f] border-[rgba(197,160,89,0.35)]'
    }`}
  >
    {STATUS_LABELS[status] ?? status}
  </span>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="card text-center py-12 px-6">
    <span className="inline-flex w-14 h-14 rounded-full bg-[#f4ece0] border border-[rgba(197,160,89,0.35)] items-center justify-center mb-4 text-[#c5a059]">
      {icon}
    </span>
    <h2 className="text-[1.05rem] font-bold text-[#0f172a] mb-2">{title}</h2>
    <p className="text-[0.9rem] text-[#64748b] max-w-md mx-auto leading-relaxed">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const LoadingBlock: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-3" aria-busy="true" aria-live="polite">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="card animate-pulse">
        <div className="h-3.5 w-1/3 rounded bg-[#e2e8f0] mb-3" />
        <div className="h-3 w-2/3 rounded bg-[#eef2f7]" />
      </div>
    ))}
  </div>
);

export const ErrorBlock: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="card border-[#fecaca] bg-[#fef2f2]">
    <div className="flex items-start gap-3">
      <AlertTriangle size={20} className="text-[#b91c1c] shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-bold text-[#991b1b] text-[0.95rem]">Non e’ stato possibile caricare i dati</p>
        <p className="text-[0.88rem] text-[#7f1d1d] mt-1">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn btn-outline btn-sm mt-3">
            <RefreshCw size={14} />
            Riprova
          </button>
        )}
      </div>
    </div>
  </div>
);

/** Riga chiave/valore usata nelle schede di dettaglio. */
export const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 border-b border-[rgba(15,23,42,0.06)] last:border-0">
    <span className="text-[0.78rem] font-bold uppercase tracking-wide text-[#94a3b8]">{label}</span>
    <span className="text-[0.92rem] font-semibold text-[#0f172a] text-right">{children}</span>
  </div>
);
