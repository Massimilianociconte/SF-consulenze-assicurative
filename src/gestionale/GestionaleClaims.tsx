import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Eye, EyeOff, Paperclip, Save, ShieldAlert, User } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { openDocument } from '../portal/DocumentsPage';
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  formatCurrency,
  formatDate,
  formatDateTime,
  useApiResource,
} from '../portal/components';
import { formatBytes } from '../lib/uploads';

const STATUS_OPTIONS = [
  { value: 'in_review', label: 'In esame' },
  { value: 'waiting_documents', label: 'In attesa di documenti' },
  { value: 'sent_to_company', label: 'Trasmessa alla compagnia' },
  { value: 'in_progress', label: 'In lavorazione' },
  { value: 'settled', label: 'Liquidata' },
  { value: 'closed', label: 'Chiusa' },
  { value: 'rejected', label: 'Non accolta' },
];

/* ------------------------------------------------------------- Elenco ----- */

export const GestionaleClaimsQueue: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const stato = searchParams.get('stato') ?? '';
  const { data, loading, error, reload } = useApiResource<any>(
    `/api/admin/claims${stato ? `?status=${encodeURIComponent(stato)}` : ''}`,
  );

  const filters = [
    { value: '', label: 'Tutte' },
    { value: 'da_lavorare', label: 'Da lavorare' },
    { value: 'sent_to_company', label: 'In compagnia' },
    { value: 'settled', label: 'Liquidate' },
    { value: 'closed', label: 'Chiuse' },
  ];

  return (
    <div>
      <PageHeader
        title="Sinistri"
        description="Le pratiche dei tuoi clienti, con le più urgenti in cima."
      />

      <div className="flex flex-wrap gap-1.5 mb-5">
        {filters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setSearchParams(filter.value ? { stato: filter.value } : {})}
            className={`rounded-full px-3.5 py-1.5 text-[0.82rem] font-bold border transition-colors ${
              stato === filter.value
                ? 'bg-[#0a192f] text-[#c5a059] border-[#0a192f]'
                : 'bg-white text-[#334155] border-[rgba(15,23,42,0.12)] hover:border-[#c5a059]'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && <ErrorBlock message={error} onRetry={reload} />}

      {loading && !data ? (
        <LoadingBlock />
      ) : (data?.claims.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={26} />}
          title="Nessuna pratica in questo stato"
          description="Quando un cliente invia una denuncia dall’area riservata, compare qui immediatamente."
        />
      ) : (
        <ul className="space-y-2.5">
          {data.claims.map((claim: any) => (
            <li key={claim.id}>
              <Link
                to={`/gestionale/sinistri/${claim.id}`}
                className="card !p-4 flex flex-wrap items-center justify-between gap-4 hover:!border-[rgba(197,160,89,0.5)]"
              >
                <div className="min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[0.95rem] text-[#0f172a]">{claim.reference}</span>
                    <StatusBadge status={claim.status} />
                    {claim.attachments > 0 && (
                      <span className="inline-flex items-center gap-1 text-[0.74rem] font-semibold text-[#64748b]">
                        <Paperclip size={12} />
                        {claim.attachments}
                      </span>
                    )}
                  </div>
                  <p className="text-[0.8rem] text-[#64748b] mt-1">
                    {claim.client.name} • {claim.claimType?.toUpperCase()} • {formatDate(claim.occurredAt)}
                    {claim.placeCity ? ` • ${claim.placeCity}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[0.9rem] text-[#0f172a]">{formatCurrency(claim.estimatedDamage)}</p>
                  <p className="text-[0.74rem] text-[#94a3b8]">
                    aggiornata {formatDateTime(claim.updatedAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ------------------------------------------------------- Lavorazione ------ */

export const GestionaleClaimWork: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApiResource<any>(id ? `/api/admin/claims/${id}` : null);

  const [status, setStatus] = useState('');
  const [companyClaimNumber, setCompanyClaimNumber] = useState('');
  const [advisorNotes, setAdvisorNotes] = useState('');
  const [clientUpdate, setClientUpdate] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // I campi modificabili partono dai valori salvati, senza sovrascrivere quello
  // che l'operatore sta scrivendo dopo un ricaricamento.
  useEffect(() => {
    if (!data?.claim) return;
    setCompanyClaimNumber((previous) => previous || data.claim.companyClaimNumber || '');
    setAdvisorNotes((previous) => previous || data.claim.advisorNotes || '');
  }, [data?.claim?.id]);

  if (loading && !data) return <LoadingBlock rows={4} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const { claim, client, parties, vehicles, events, documents } = data;

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch(`/api/admin/claims/${id}`, {
        status: status || undefined,
        companyClaimNumber: companyClaimNumber || undefined,
        advisorNotes: advisorNotes || undefined,
        clientUpdate: clientUpdate || undefined,
      });
      setFeedback(
        clientUpdate
          ? 'Aggiornamento salvato e reso visibile al cliente.'
          : 'Aggiornamento salvato (nessuna notifica al cliente).',
      );
      setClientUpdate('');
      setStatus('');
      reload();
    } catch (saveError) {
      setFeedback(saveError instanceof ApiError ? saveError.message : 'Salvataggio non riuscito.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link
        to="/gestionale/sinistri"
        className="inline-flex items-center gap-1.5 text-[0.84rem] font-semibold text-[#64748b] hover:text-[#0a192f] mb-3"
      >
        <ArrowLeft size={15} />
        Tutte le pratiche
      </Link>

      <PageHeader
        title={`Pratica ${claim.reference}`}
        description={`${claim.claimType?.toUpperCase()} • avvenuto il ${formatDate(claim.occurredAt)}${
          claim.placeCity ? ` a ${claim.placeCity}` : ''
        }`}
        action={<StatusBadge status={claim.status} />}
      />

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-5">
          <section className="card">
            <h2 className="flex items-center gap-2 font-bold text-[1rem] text-[#0f172a] mb-3">
              <User size={17} className="text-[#c5a059]" />
              Cliente
            </h2>
            <p className="font-semibold text-[0.95rem] text-[#0f172a]">{client.name}</p>
            <p className="text-[0.84rem] text-[#64748b]">
              {[client.email, client.phone, client.fiscalCode].filter(Boolean).join(' • ')}
            </p>
            <Link
              to={`/gestionale/clienti/${client.id}`}
              className="inline-block mt-2 text-[0.84rem] font-bold text-[#c5a059]"
            >
              Apri la scheda cliente
            </Link>
          </section>

          <section className="card">
            <h2 className="font-bold text-[1rem] text-[#0f172a] mb-3">Dichiarazione del cliente</h2>
            <p className="text-[0.9rem] text-[#334155] leading-relaxed whitespace-pre-wrap mb-4">
              {claim.dynamics || '—'}
            </p>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[0.86rem]">
              {[
                ['Luogo', [claim.placeAddress, claim.placeCity, claim.placeProvince].filter(Boolean).join(', ') || '—'],
                ['Feriti', claim.injuries ? claim.injuriesDetail || 'Sì' : 'No'],
                [
                  'Autorità',
                  claim.authoritiesInvolved
                    ? `${claim.authorityType ?? 'Sì'}${claim.reportNumber ? ` — verbale ${claim.reportNumber}` : ''}`
                    : 'No',
                ],
                ['CAI', claim.caiSigned ?? '—'],
                ['Danno stimato', formatCurrency(claim.estimatedDamage)],
                ['Inviata il', formatDateTime(claim.submittedAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-[rgba(15,23,42,0.06)] py-1.5">
                  <dt className="text-[#64748b]">{label}</dt>
                  <dd className="font-semibold text-[#0f172a] text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {(parties.length > 0 || vehicles.length > 0) && (
            <section className="card">
              <h2 className="font-bold text-[1rem] text-[#0f172a] mb-3">Soggetti e veicoli</h2>
              <ul className="space-y-2">
                {parties.map((party: any) => (
                  <li key={party.id} className="rounded-lg bg-[#f8fafc] px-3.5 py-2.5">
                    <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#94a3b8]">{party.role}</p>
                    <p className="font-semibold text-[0.88rem] text-[#0f172a]">{party.full_name ?? '—'}</p>
                    <p className="text-[0.8rem] text-[#64748b]">
                      {[party.fiscal_code, party.phone, party.company_name, party.policy_number]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </li>
                ))}
                {vehicles.map((vehicle: any) => (
                  <li key={vehicle.id} className="rounded-lg bg-[#f8fafc] px-3.5 py-2.5">
                    <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#94a3b8]">
                      veicolo {vehicle.side}
                    </p>
                    <p className="font-semibold text-[0.88rem] text-[#0f172a]">
                      {[vehicle.plate, vehicle.make, vehicle.model].filter(Boolean).join(' — ') || '—'}
                    </p>
                    {vehicle.damage_description && (
                      <p className="text-[0.8rem] text-[#64748b]">{vehicle.damage_description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="font-bold text-[1rem] text-[#0f172a] mb-3">Allegati ({documents.length})</h2>
            {documents.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessun allegato: valuta di chiederli al cliente.</p>
            ) : (
              <ul className="space-y-2">
                {documents.map((document: any) => (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(15,23,42,0.09)] px-3.5 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-[0.86rem] text-[#0f172a] truncate">
                        {document.title}
                      </span>
                      <span className="block text-[0.75rem] text-[#94a3b8]">
                        {document.category.replace(/_/g, ' ')} • {formatBytes(document.sizeBytes)}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button onClick={() => openDocument(document.id)} className="btn btn-outline btn-sm">
                        <ExternalLink size={13} />
                        Apri
                      </button>
                      <button onClick={() => openDocument(document.id, true)} className="btn btn-outline btn-sm">
                        Scarica
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Colonna di lavorazione */}
        <div className="space-y-5">
          <section className="card">
            <h2 className="font-bold text-[1rem] text-[#0f172a] mb-4">Aggiorna la pratica</h2>

            {feedback && (
              <p className="text-[0.85rem] font-semibold text-[#166534] bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-3.5 py-2.5 mb-3">
                {feedback}
              </p>
            )}

            <label className="block mb-3">
              <span className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">Nuovo stato</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2.5 text-[0.9rem] focus:border-[#c5a059]"
              >
                <option value="">Lascia invariato ({claim.status})</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block mb-3">
              <span className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">Numero sinistro compagnia</span>
              <input
                value={companyClaimNumber}
                onChange={(event) => setCompanyClaimNumber(event.target.value)}
                maxLength={60}
                className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] px-4 py-2.5 text-[0.9rem] focus:border-[#c5a059]"
              />
            </label>

            <label className="block mb-3">
              <span className="flex items-center gap-1.5 text-[0.8rem] font-bold text-[#0f172a] mb-1.5">
                <Eye size={14} className="text-[#16a34a]" />
                Aggiornamento visibile al cliente
              </span>
              <textarea
                value={clientUpdate}
                onChange={(event) => setClientUpdate(event.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Es. Abbiamo trasmesso la pratica alla compagnia, attendiamo il perito."
                className="w-full resize-y rounded-xl border border-[rgba(15,23,42,0.12)] px-4 py-2.5 text-[0.9rem] focus:border-[#c5a059]"
              />
            </label>

            <label className="block mb-4">
              <span className="flex items-center gap-1.5 text-[0.8rem] font-bold text-[#0f172a] mb-1.5">
                <EyeOff size={14} className="text-[#94a3b8]" />
                Nota interna (mai visibile al cliente)
              </span>
              <textarea
                value={advisorNotes}
                onChange={(event) => setAdvisorNotes(event.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full resize-y rounded-xl border border-[rgba(15,23,42,0.12)] px-4 py-2.5 text-[0.9rem] focus:border-[#c5a059]"
              />
            </label>

            <button onClick={save} disabled={saving} className="btn btn-primary w-full disabled:opacity-60">
              <Save size={16} />
              {saving ? 'Salvataggio…' : 'Salva aggiornamento'}
            </button>
          </section>

          <section className="card">
            <h2 className="font-bold text-[1rem] text-[#0f172a] mb-3">Cronologia</h2>
            {events.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessun evento registrato.</p>
            ) : (
              <ol className="relative border-l-2 border-[#e2e8f0] pl-5 space-y-3.5">
                {events.map((event: any, index: number) => (
                  <li key={event.id} className="relative">
                    <span
                      className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                        index === 0 ? 'bg-[#c5a059]' : 'bg-[#cbd5e1]'
                      }`}
                    />
                    <p className="font-bold text-[0.86rem] text-[#0f172a]">
                      {event.title}
                      {!event.visibleToClient && (
                        <span className="ml-2 text-[0.66rem] font-bold uppercase text-[#94a3b8]">interno</span>
                      )}
                    </p>
                    {event.detail && <p className="text-[0.82rem] text-[#334155] mt-0.5">{event.detail}</p>}
                    <p className="text-[0.72rem] text-[#94a3b8] mt-0.5">{formatDateTime(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default GestionaleClaimsQueue;
