import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, ClipboardCheck, HardDrive } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  formatDate,
  useApiResource,
} from '../portal/components';
import { formatBytes } from '../lib/uploads';

/* ----------------------------------------------------------- Richieste ---- */

const CHANGE_LABELS: Record<string, string> = {
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
  addressLocality: 'Località',
  addressCity: 'Comune',
  addressZip: 'CAP',
  addressProvince: 'Provincia',
  addressCountry: 'Paese',
};

export const GestionaleRequests: React.FC = () => {
  const { data, loading, error, reload } = useApiResource<any>('/api/admin/requests');
  const [busyId, setBusyId] = useState<string | null>(null);

  const advance = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await api.patch(`/api/admin/requests/${id}`, { status, note: `Stato aggiornato a ${status}.` });
      reload();
    } catch (updateError) {
      alert(updateError instanceof ApiError ? updateError.message : 'Aggiornamento non riuscito.');
    } finally {
      setBusyId(null);
    }
  };

  const reviewProfileChange = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await api.patch(`/api/admin/profile-changes/${id}`, {
        status,
        note:
          status === 'verified'
            ? 'Dati verificati dal consulente.'
            : status === 'rejected'
              ? 'Variazione non confermata: contattare il consulente.'
              : status === 'failed'
                ? 'Verifica non completata per un errore: è necessario un controllo manuale.'
                : 'Verifica presa in carico.',
      });
      reload();
    } catch (updateError) {
      alert(updateError instanceof ApiError ? updateError.message : 'Aggiornamento non riuscito.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Richieste"
        description="Le richieste aperte dai clienti, ordinate per priorità. Ogni cambio di stato è visibile nella loro area riservata."
      />

      {error && <ErrorBlock message={error} onRetry={reload} />}

      {loading && !data ? (
        <LoadingBlock />
      ) : (data?.requests.length ?? 0) === 0 && (data?.profileChanges.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Briefcase size={26} />}
          title="Nessuna richiesta aperta"
          description="Quando un cliente chiede un preventivo, una modifica di polizza o un documento, la trovi qui con il suo protocollo."
        />
      ) : (
        <div className="space-y-7">
          {(data?.profileChanges.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 font-bold text-[1rem] text-[#0f172a] mb-3">
                <ClipboardCheck size={17} className="text-[#c5a059]" />
                Variazioni anagrafiche e recapiti
              </h2>
              <ul className="space-y-2.5">
                {data.profileChanges.map((change: any) => (
                  <li key={change.id} className="card !p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-[240px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/gestionale/clienti/${change.client.id}`}
                            className="font-bold text-[0.93rem] text-[#0f172a] hover:text-[#c5a059]"
                          >
                            {change.client.name}
                          </Link>
                          <StatusBadge status={change.status} />
                          {change.source !== 'manual' && (
                            <span className="text-[0.68rem] font-bold uppercase text-[#166534] bg-[#f0fdf4] px-2 py-0.5 rounded-full">
                              {change.source === 'assisted' ? 'dato ANNCSU' : 'ANNCSU corretto a mano'}
                            </span>
                          )}
                        </div>
                        <p className="text-[0.76rem] text-[#94a3b8] mt-1">
                          Ricevuta il {formatDate(change.requestedAt)} · già salvata nel profilo · da verificare
                        </p>
                        <dl className="mt-3 space-y-1.5">
                          {change.changedFields.map((field: string) => (
                            <div
                              key={field}
                              className="grid sm:grid-cols-[125px_1fr_18px_1fr] gap-1.5 text-[0.79rem]"
                            >
                              <dt className="font-semibold text-[#64748b]">{CHANGE_LABELS[field] ?? field}</dt>
                              <dd className="text-[#94a3b8] break-words">{change.before[field] || '—'}</dd>
                              <span aria-hidden className="hidden sm:block text-[#c5a059]">→</span>
                              <dd className="font-semibold text-[#0f172a] break-words">{change.after[field] || '—'}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {change.status !== 'in_review' && (
                          <button
                            onClick={() => reviewProfileChange(change.id, 'in_review')}
                            disabled={busyId === change.id}
                            className="btn btn-outline btn-sm"
                          >
                            Prendi in carico
                          </button>
                        )}
                        <button
                          onClick={() => reviewProfileChange(change.id, 'failed')}
                          disabled={busyId === change.id}
                          className="btn btn-outline btn-sm"
                        >
                          Segnala errore
                        </button>
                        <button
                          onClick={() => reviewProfileChange(change.id, 'rejected')}
                          disabled={busyId === change.id}
                          className="btn btn-outline btn-sm !text-[#b91c1c]"
                        >
                          Non confermare
                        </button>
                        <button
                          onClick={() => reviewProfileChange(change.id, 'verified')}
                          disabled={busyId === change.id}
                          className="btn btn-primary btn-sm"
                        >
                          Verificata
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(data?.requests.length ?? 0) > 0 && (
            <section>
              <h2 className="flex items-center gap-2 font-bold text-[1rem] text-[#0f172a] mb-3">
                <Briefcase size={17} className="text-[#c5a059]" />
                Richieste di servizio
              </h2>
              <ul className="space-y-2.5">
                {data.requests.map((request: any) => (
                  <li key={request.id} className="card !p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[0.93rem] text-[#0f172a]">{request.subject}</span>
                    <StatusBadge status={request.status} />
                    {request.priority !== 'normal' && (
                      <span className="text-[0.7rem] font-bold uppercase text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                        {request.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-[0.8rem] text-[#64748b] mt-1">
                    <Link to={`/gestionale/clienti/${request.client.id}`} className="font-semibold hover:text-[#c5a059]">
                      {request.client.name}
                    </Link>{' '}
                    • protocollo {request.reference} • aperta il {formatDate(request.createdAt)}
                  </p>
                  {request.detail && <p className="text-[0.85rem] text-[#334155] mt-2">{request.detail}</p>}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => advance(request.id, 'in_progress')}
                    disabled={busyId === request.id}
                    className="btn btn-outline btn-sm"
                  >
                    In lavorazione
                  </button>
                  <button
                    onClick={() => advance(request.id, 'completed')}
                    disabled={busyId === request.id}
                    className="btn btn-primary btn-sm"
                  >
                    Completata
                  </button>
                </div>
              </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------ Archivio ---- */

/**
 * Spazio occupato su R2. Serve a decidere cosa archiviare in locale ed
 * eliminare dal cloud per restare entro i 10 GB del piano gratuito.
 */
export const GestionaleStorage: React.FC = () => {
  const { data, loading, error, reload } = useApiResource<any>('/api/admin/storage');

  if (loading && !data) return <LoadingBlock rows={3} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const usedPercent = Math.min(100, (data.total.bytes / data.freeTierBytes) * 100);

  return (
    <div>
      <PageHeader
        title="Archivio documenti"
        description="Quanto spazio occupano i documenti dei tuoi clienti e dove conviene intervenire."
      />

      <section className="card mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <p className="text-[2rem] font-extrabold text-[#0f172a] leading-none">{formatBytes(data.total.bytes)}</p>
            <p className="text-[0.84rem] text-[#64748b] mt-1">
              {data.total.files} file archiviati su {formatBytes(data.freeTierBytes)} compresi nel piano gratuito
            </p>
          </div>
          <p className={`text-[0.9rem] font-bold ${usedPercent > 80 ? 'text-[#b45309]' : 'text-[#166534]'}`}>
            {usedPercent < 0.1 ? '< 0,1' : usedPercent.toFixed(1)}% utilizzato
          </p>
        </div>
        <div className="h-2.5 rounded-full bg-[#e2e8f0] overflow-hidden">
          <div
            className={`h-full transition-all ${usedPercent > 80 ? 'bg-[#b45309]' : 'bg-[#16a34a]'}`}
            style={{ width: `${Math.max(usedPercent, 0.5)}%` }}
          />
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-5">
        <section className="card">
          <h2 className="flex items-center gap-2 font-bold text-[1rem] text-[#0f172a] mb-3">
            <HardDrive size={17} className="text-[#c5a059]" />
            Per tipologia
          </h2>
          {data.byCategory.length === 0 ? (
            <p className="text-[0.88rem] text-[#64748b]">Nessun documento archiviato.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.byCategory.map((row: any) => (
                <li key={row.category} className="flex justify-between gap-3 text-[0.88rem]">
                  <span className="text-[#334155]">
                    {row.category.replace(/_/g, ' ')} <span className="text-[#94a3b8]">({row.files})</span>
                  </span>
                  <span className="font-semibold text-[#0f172a]">{formatBytes(Number(row.bytes))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="font-bold text-[1rem] text-[#0f172a] mb-3">Clienti con più documenti</h2>
          {data.topClients.length === 0 ? (
            <p className="text-[0.88rem] text-[#64748b]">Nessun dato disponibile.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.topClients.map((row: any) => (
                <li key={row.id} className="flex justify-between gap-3 text-[0.88rem]">
                  <Link to={`/gestionale/clienti/${row.id}`} className="text-[#334155] hover:text-[#c5a059] font-medium">
                    {row.name || 'Cliente'} <span className="text-[#94a3b8]">({row.files})</span>
                  </Link>
                  <span className="font-semibold text-[#0f172a]">{formatBytes(row.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-[0.8rem] text-[#64748b] leading-relaxed mt-5">
        Per liberare spazio: apri la scheda del cliente, scarica il documento e archivialo dove conservi la
        documentazione, poi eliminalo dal cloud. I metadati restano nel gestionale, così resta traccia di cosa
        esisteva, chi lo ha rimosso e quando. I documenti sotto blocco legale o ancora in periodo di conservazione
        obbligatoria non si eliminano senza conferma esplicita.
      </p>
    </div>
  );
};
