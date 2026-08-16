import React, { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Lock,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { api, ApiError, type DocumentItem } from '../lib/api';
import { ACCEPTED_MIME, UploadError, formatBytes, uploadDocument } from '../lib/uploads';
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatusBadge, formatDate, useApiResource } from './components';

const CATEGORIES = [
  { value: 'documento_identita', label: 'Documento di identità' },
  { value: 'codice_fiscale', label: 'Codice fiscale' },
  { value: 'patente', label: 'Patente' },
  { value: 'libretto', label: 'Libretto di circolazione' },
  { value: 'polizza', label: 'Polizza' },
  { value: 'quietanza', label: 'Quietanza di pagamento' },
  { value: 'preventivo', label: 'Preventivo' },
  { value: 'fattura', label: 'Fattura' },
  { value: 'verbale', label: 'Verbale' },
  { value: 'cai', label: 'Constatazione amichevole (CAI)' },
  { value: 'fotografia', label: 'Fotografia' },
  { value: 'dichiarazione', label: 'Dichiarazione' },
  { value: 'perizia', label: 'Perizia' },
  { value: 'referto', label: 'Referto medico' },
  { value: 'corrispondenza', label: 'Corrispondenza' },
  { value: 'altro', label: 'Altro' },
];

interface Quota {
  usedBytes: number;
  limitBytes: number;
  maxFileBytes: number;
}

/** Apre il documento in una nuova scheda con un link temporaneo (5 minuti). */
export async function openDocument(documentId: string, download = false): Promise<void> {
  const result = await api.post<{ url: string }>(`/api/documents/${documentId}/link`);
  window.open(download ? `${result.url}&download=1` : result.url, '_blank', 'noopener,noreferrer');
}

export const DocumentUploader: React.FC<{
  claimId?: string;
  defaultCategory?: string;
  onUploaded: (document: { id: string }, file: File) => void;
  compact?: boolean;
}> = ({ claimId, defaultCategory = 'altro', onUploaded, compact }) => {
  const [category, setCategory] = useState(defaultCategory);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setBusy(true);

      for (const file of Array.from(files)) {
        try {
          setProgress(0);
          const uploaded = await uploadDocument(file, { category, claimId }, setProgress);
          onUploaded(uploaded, file);
        } catch (uploadError) {
          setError(
            uploadError instanceof UploadError || uploadError instanceof ApiError
              ? uploadError.message
              : 'Caricamento non riuscito.',
          );
          break;
        }
      }

      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    },
    [category, claimId, onUploaded],
  );

  return (
    <div>
      {error && (
        <p className="flex items-start gap-2 text-[0.85rem] font-semibold text-[#b91c1c] mb-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="doc-category" className="block text-[0.78rem] font-bold text-[#0f172a] mb-1.5">
            Tipo di documento
          </label>
          <select
            id="doc-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2.5 text-[0.9rem] focus:border-[#c5a059]"
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed px-5 ${compact ? 'py-6' : 'py-9'} text-center transition-colors ${
          dragging ? 'border-[#c5a059] bg-[#fffdf9]' : 'border-[rgba(15,23,42,0.15)] bg-white'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_MIME.join(',')}
          onChange={(event) => handleFiles(event.target.files)}
          className="hidden"
          id="doc-input"
        />

        {busy ? (
          <div className="max-w-xs mx-auto">
            <p className="text-[0.88rem] font-semibold text-[#0f172a] mb-2">Caricamento in corso… {progress}%</p>
            <div className="h-2 rounded-full bg-[#e2e8f0] overflow-hidden">
              <div className="h-full bg-[#c5a059] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <UploadCloud size={compact ? 24 : 30} className="mx-auto text-[#c5a059] mb-2" />
            <p className="text-[0.92rem] font-semibold text-[#0f172a]">
              Trascina qui i file oppure{' '}
              <label htmlFor="doc-input" className="text-[#c5a059] underline cursor-pointer">
                scegli dal dispositivo
              </label>
            </p>
            <p className="text-[0.78rem] text-[#64748b] mt-1.5">
              PDF, JPEG, PNG, WebP o HEIC fino a 10 MB. Dalle foto vengono rimossi i dati di posizione prima
              dell’invio.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export const DocumentsPage: React.FC = () => {
  const list = useApiResource<{ documents: DocumentItem[] }>('/api/portal/documents');
  const quota = useApiResource<Quota>('/api/documents/quota');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refresh = () => {
    list.reload();
    quota.reload();
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/api/documents/${id}`);
      setMessage('Documento eliminato.');
      setConfirmingId(null);
      refresh();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Eliminazione non riuscita.');
      setConfirmingId(null);
    }
  };

  const documents = list.data?.documents ?? [];
  const usedPercent = quota.data ? Math.min(100, Math.round((quota.data.usedBytes / quota.data.limitBytes) * 100)) : 0;

  return (
    <div>
      <PageHeader
        title="Documenti"
        description="Il tuo archivio: polizze, verbali, fotografie e ricevute. I file sono visibili solo a te e al tuo consulente."
      />

      {quota.data && (
        <div className="card !p-4 mb-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-[0.82rem] font-bold text-[#0f172a]">Spazio utilizzato</span>
            <span className="text-[0.82rem] text-[#64748b]">
              {formatBytes(quota.data.usedBytes)} di {formatBytes(quota.data.limitBytes)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#e2e8f0] overflow-hidden">
            <div
              className={`h-full transition-all ${usedPercent > 85 ? 'bg-[#b45309]' : 'bg-[#c5a059]'}`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="card mb-5">
        <h2 className="font-bold text-[1rem] text-[#0f172a] mb-4">Carica un documento</h2>
        <DocumentUploader
          onUploaded={() => {
            setMessage('Documento caricato.');
            refresh();
          }}
        />
      </div>

      {message && (
        <p className="text-[0.88rem] font-semibold text-[#166534] bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-4 py-2.5 mb-4">
          {message}
        </p>
      )}

      {list.error && <ErrorBlock message={list.error} onRetry={refresh} />}

      {list.loading && !list.data ? (
        <LoadingBlock />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={26} />}
          title="Nessun documento archiviato"
          description="Carica qui i documenti che il consulente ti ha chiesto: restano al sicuro e li ritrovi sempre."
        />
      ) : (
        <ul className="space-y-3">
          {documents.map((document) => (
            <li key={document.id} className="card !p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-[220px]">
                  <span className="w-10 h-10 rounded-lg bg-[#f4ece0] text-[#c5a059] flex items-center justify-center shrink-0">
                    {document.mimeType.startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-[0.93rem] text-[#0f172a] break-words">{document.title}</h3>
                    <p className="text-[0.78rem] text-[#64748b] mt-0.5">
                      {[
                        CATEGORIES.find((item) => item.value === document.category)?.label ?? document.category,
                        formatBytes(document.sizeBytes),
                        formatDate(document.uploadedAt),
                        document.claimReference ? `pratica ${document.claimReference}` : null,
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={document.status} />
                  <button
                    onClick={() => openDocument(document.id)}
                    className="btn btn-outline btn-sm"
                    title="Apri in una nuova scheda"
                  >
                    <ExternalLink size={14} />
                    Apri
                  </button>
                  <button
                    onClick={() => openDocument(document.id, true)}
                    className="btn btn-outline btn-sm"
                    title="Scarica"
                  >
                    <Download size={14} />
                  </button>
                  {confirmingId === document.id ? (
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => remove(document.id)} className="btn btn-sm bg-[#b91c1c] text-white">
                        Conferma
                      </button>
                      <button onClick={() => setConfirmingId(null)} className="btn btn-outline btn-sm">
                        Annulla
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(document.id)}
                      className="btn btn-outline btn-sm !border-[#fca5a5] !text-[#b91c1c]"
                      title="Elimina"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 text-[0.78rem] text-[#64748b] mt-5 leading-relaxed">
        <Lock size={14} className="shrink-0 mt-0.5 text-[#94a3b8]" />
        I documenti si aprono con un collegamento valido cinque minuti e non sono raggiungibili da chi non ha
        accesso alla tua area riservata. Entro 24 ore dal caricamento puoi eliminarli tu; dopo, o se sono
        allegati a una pratica inviata, se ne occupa il consulente.
      </p>
    </div>
  );
};

export default DocumentsPage;
