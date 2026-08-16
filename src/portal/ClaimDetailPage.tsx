import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Car, ExternalLink, FileText, MapPin, Users } from 'lucide-react';
import { openDocument } from './DocumentsPage';
import {
  DetailRow,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  formatCurrency,
  formatDateTime,
  useApiResource,
} from './components';
import { formatBytes } from '../lib/uploads';

interface ClaimDetail {
  claim: {
    id: string;
    reference: string;
    status: string;
    claimType: string;
    companyName: string | null;
    companyClaimNumber: string | null;
    occurredAt: string | null;
    placeAddress: string | null;
    placeCity: string | null;
    placeProvince: string | null;
    dynamics: string | null;
    injuries: boolean;
    injuriesDetail: string | null;
    authoritiesInvolved: boolean;
    authorityType: string | null;
    reportNumber: string | null;
    caiSigned: string | null;
    estimatedDamage: number | null;
    submittedAt: string | null;
  };
  parties: Array<{ id: string; role: string; fullName: string | null; fiscalCode: string | null; phone: string | null; companyName: string | null }>;
  vehicles: Array<{ id: string; side: string; plate: string | null; make: string | null; model: string | null; damageDescription: string | null }>;
  events: Array<{ id: string; status: string; title: string; detail: string | null; createdAt: string }>;
  documents: Array<{ id: string; title: string; category: string; sizeBytes: number; uploadedAt: string }>;
}

export const ClaimDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApiResource<ClaimDetail>(id ? `/api/claims/${id}` : null);

  if (loading && !data) return <LoadingBlock rows={4} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const { claim, parties, vehicles, events, documents } = data;

  return (
    <div>
      <Link
        to="/area-riservata/sinistri"
        className="inline-flex items-center gap-1.5 text-[0.84rem] font-semibold text-[#64748b] hover:text-[#0a192f] mb-3"
      >
        <ArrowLeft size={15} />
        Tutte le pratiche
      </Link>

      <PageHeader
        title={`Pratica ${claim.reference}`}
        description="Qui trovi tutto quello che riguarda questa denuncia: stato, dati dichiarati e documenti."
        action={<StatusBadge status={claim.status} />}
      />

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        <div className="space-y-6">
          <section className="card">
            <h2 className="font-bold text-[1rem] text-[#0f172a] mb-3">Dati del sinistro</h2>
            <DetailRow label="Tipo">{claim.claimType?.toUpperCase()}</DetailRow>
            <DetailRow label="Avvenuto il">{formatDateTime(claim.occurredAt)}</DetailRow>
            <DetailRow label="Luogo">
              {[claim.placeAddress, claim.placeCity, claim.placeProvince].filter(Boolean).join(', ') || '—'}
            </DetailRow>
            <DetailRow label="Compagnia">{claim.companyName ?? '—'}</DetailRow>
            <DetailRow label="Numero sinistro compagnia">{claim.companyClaimNumber ?? 'In attesa'}</DetailRow>
            <DetailRow label="Danno stimato">{formatCurrency(claim.estimatedDamage)}</DetailRow>
            <DetailRow label="Feriti">{claim.injuries ? claim.injuriesDetail || 'Sì' : 'No'}</DetailRow>
            <DetailRow label="Autorità intervenuta">
              {claim.authoritiesInvolved ? `${claim.authorityType ?? 'Sì'}${claim.reportNumber ? ` — verbale ${claim.reportNumber}` : ''}` : 'No'}
            </DetailRow>
            {claim.dynamics && (
              <div className="mt-4 pt-4 border-t border-[rgba(15,23,42,0.07)]">
                <p className="text-[0.78rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1.5">Dinamica dichiarata</p>
                <p className="text-[0.9rem] text-[#334155] leading-relaxed whitespace-pre-wrap">{claim.dynamics}</p>
              </div>
            )}
          </section>

          {parties.length > 0 && (
            <section className="card">
              <h2 className="flex items-center gap-2 font-bold text-[1rem] text-[#0f172a] mb-3">
                <Users size={17} className="text-[#c5a059]" />
                Persone coinvolte
              </h2>
              <ul className="space-y-2">
                {parties.map((party) => (
                  <li key={party.id} className="rounded-lg bg-[#f8fafc] px-3.5 py-2.5">
                    <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#94a3b8]">{party.role}</p>
                    <p className="font-semibold text-[0.9rem] text-[#0f172a]">{party.fullName ?? '—'}</p>
                    <p className="text-[0.8rem] text-[#64748b]">
                      {[party.fiscalCode, party.phone, party.companyName].filter(Boolean).join(' • ')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {vehicles.length > 0 && (
            <section className="card">
              <h2 className="flex items-center gap-2 font-bold text-[1rem] text-[#0f172a] mb-3">
                <Car size={17} className="text-[#c5a059]" />
                Veicoli coinvolti
              </h2>
              <ul className="space-y-2">
                {vehicles.map((vehicle) => (
                  <li key={vehicle.id} className="rounded-lg bg-[#f8fafc] px-3.5 py-2.5">
                    <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[#94a3b8]">
                      {vehicle.side === 'assicurato' ? 'Il tuo veicolo' : 'Controparte'}
                    </p>
                    <p className="font-semibold text-[0.9rem] text-[#0f172a]">
                      {[vehicle.plate, vehicle.make, vehicle.model].filter(Boolean).join(' — ') || '—'}
                    </p>
                    {vehicle.damageDescription && (
                      <p className="text-[0.8rem] text-[#64748b]">{vehicle.damageDescription}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card">
            <h2 className="flex items-center gap-2 font-bold text-[1rem] text-[#0f172a] mb-4">
              <MapPin size={17} className="text-[#c5a059]" />
              Stato di avanzamento
            </h2>
            {events.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessun aggiornamento registrato.</p>
            ) : (
              <ol className="relative border-l-2 border-[#e2e8f0] pl-5 space-y-4">
                {events.map((event, index) => (
                  <li key={event.id} className="relative">
                    <span
                      className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                        index === 0 ? 'bg-[#c5a059]' : 'bg-[#cbd5e1]'
                      }`}
                    />
                    <p className="font-bold text-[0.88rem] text-[#0f172a]">{event.title}</p>
                    {event.detail && <p className="text-[0.84rem] text-[#334155] mt-0.5">{event.detail}</p>}
                    <p className="text-[0.72rem] text-[#94a3b8] mt-1">{formatDateTime(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card">
            <h2 className="flex items-center gap-2 font-bold text-[1rem] text-[#0f172a] mb-3">
              <FileText size={17} className="text-[#c5a059]" />
              Allegati ({documents.length})
            </h2>
            {documents.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessun allegato su questa pratica.</p>
            ) : (
              <ul className="space-y-2">
                {documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-[#f8fafc] px-3.5 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-[0.86rem] text-[#0f172a] truncate">
                        {document.title}
                      </span>
                      <span className="block text-[0.75rem] text-[#94a3b8]">
                        {document.category.replace(/_/g, ' ')} • {formatBytes(document.sizeBytes)}
                      </span>
                    </span>
                    <button onClick={() => openDocument(document.id)} className="btn btn-outline btn-sm shrink-0">
                      <ExternalLink size={13} />
                      Apri
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ClaimDetailPage;
