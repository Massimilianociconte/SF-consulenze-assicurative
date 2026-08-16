import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, FileText, MessageSquare, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ErrorBlock, LoadingBlock, PageHeader, StatusBadge, formatDate, formatDateTime, useApiResource } from '../portal/components';
import { formatBytes } from '../lib/uploads';

interface AdminDashboard {
  counters: {
    clients: number;
    claimsToWork: number;
    expiringDeadlines: number;
    overdueDeadlines: number;
    unreadMessages: number;
    openRequests: number;
    profileChangesToReview: number;
  };
  recentClaims: Array<{
    id: string;
    reference: string;
    status: string;
    claimType: string;
    occurredAt: string | null;
    submittedAt: string | null;
    clientName: string;
  }>;
  recentDocuments: Array<{
    id: string;
    originalName: string;
    category: string;
    uploadedAt: string;
    sizeBytes: number;
    clientName: string;
  }>;
}

const QUEUE = [
  {
    key: 'claimsToWork' as const,
    label: 'Sinistri da lavorare',
    icon: ShieldAlert,
    to: '/gestionale/sinistri?stato=da_lavorare',
    urgent: true,
  },
  { key: 'unreadMessages' as const, label: 'Messaggi da leggere', icon: MessageSquare, to: '/gestionale/clienti' },
  { key: 'openRequests' as const, label: 'Richieste aperte', icon: FileText, to: '/gestionale/richieste' },
  {
    key: 'profileChangesToReview' as const,
    label: 'Variazioni profilo da verificare',
    icon: Users,
    to: '/gestionale/richieste',
    urgent: true,
  },
  { key: 'overdueDeadlines' as const, label: 'Scadenze superate', icon: AlertTriangle, to: '/gestionale/clienti', urgent: true },
  { key: 'expiringDeadlines' as const, label: 'Scadenze entro 30 giorni', icon: CalendarClock, to: '/gestionale/clienti' },
  { key: 'clients' as const, label: 'Clienti in portafoglio', icon: Users, to: '/gestionale/clienti' },
];

export const GestionaleDashboard: React.FC = () => {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiResource<AdminDashboard>('/api/admin/dashboard');

  return (
    <div>
      <PageHeader
        title={`Cruscotto${user?.firstName ? `, ${user.firstName}` : ''}`}
        description="Le cose da fare oggi, in ordine di urgenza. I numeri riguardano solo i clienti del tuo portafoglio."
      />

      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data ? (
        <LoadingBlock rows={3} />
      ) : (
        data && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-7">
              {QUEUE.map((item) => {
                const Icon = item.icon;
                const value = data.counters[item.key] ?? 0;
                const highlight = item.urgent && value > 0;
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    className={`card !p-4 sm:!p-5 group ${highlight ? '!border-[#fbbf24] bg-[#fffbeb]' : ''}`}
                  >
                    <span
                      className={`inline-flex w-9 h-9 rounded-lg items-center justify-center mb-3 ${
                        highlight ? 'bg-[#fef3c7] text-[#b45309]' : 'bg-[#f4ece0] text-[#c5a059]'
                      }`}
                    >
                      <Icon size={18} />
                    </span>
                    <p className="text-[1.75rem] font-extrabold text-[#0f172a] leading-none group-hover:text-[#c5a059] transition-colors">
                      {value}
                    </p>
                    <p className="mt-1.5 text-[0.8rem] font-semibold text-[#64748b] leading-snug">{item.label}</p>
                  </Link>
                );
              })}
            </section>

            <div className="grid lg:grid-cols-2 gap-6">
              <section className="card !p-0 overflow-hidden">
                <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[rgba(15,23,42,0.07)]">
                  <h2 className="font-bold text-[1rem] text-[#0f172a]">Ultime pratiche</h2>
                  <Link to="/gestionale/sinistri" className="text-[0.8rem] font-bold text-[#64748b] hover:text-[#0a192f]">
                    Vedi tutte
                  </Link>
                </header>
                {data.recentClaims.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[0.9rem] text-[#64748b]">Nessuna pratica registrata.</p>
                ) : (
                  <ul>
                    {data.recentClaims.map((claim) => (
                      <li key={claim.id} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                        <Link
                          to={`/gestionale/sinistri/${claim.id}`}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-[#f8fafc]"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-[0.9rem] text-[#0f172a]">{claim.reference}</p>
                            <p className="text-[0.78rem] text-[#64748b]">
                              {claim.clientName} • {claim.claimType?.toUpperCase()} •{' '}
                              {formatDate(claim.occurredAt)}
                            </p>
                          </div>
                          <StatusBadge status={claim.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card !p-0 overflow-hidden">
                <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[rgba(15,23,42,0.07)]">
                  <h2 className="font-bold text-[1rem] text-[#0f172a]">Documenti appena caricati</h2>
                  <Link to="/gestionale/archivio" className="text-[0.8rem] font-bold text-[#64748b] hover:text-[#0a192f]">
                    Archivio
                  </Link>
                </header>
                {data.recentDocuments.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[0.9rem] text-[#64748b]">Nessun documento recente.</p>
                ) : (
                  <ul>
                    {data.recentDocuments.map((document) => (
                      <li
                        key={document.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[rgba(15,23,42,0.06)] last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[0.88rem] text-[#0f172a] truncate">{document.originalName}</p>
                          <p className="text-[0.76rem] text-[#64748b]">
                            {document.clientName} • {document.category.replace(/_/g, ' ')} •{' '}
                            {formatBytes(document.sizeBytes)}
                          </p>
                        </div>
                        <span className="text-[0.74rem] text-[#94a3b8]">{formatDateTime(document.uploadedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default GestionaleDashboard;
