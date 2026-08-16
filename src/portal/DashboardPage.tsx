import React from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  FileSignature,
  FileText,
  FolderOpen,
  Handshake,
  ListChecks,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { usePortalSummary } from './PortalLayout';
import {
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  daysUntil,
  formatCurrency,
  formatDate,
  formatDateTime,
} from './components';

const KPI = [
  { key: 'activePolicies', label: 'Polizze attive', icon: FileSignature, to: '/area-riservata/polizze' },
  { key: 'upcomingDeadlines', label: 'Scadenze entro 60 giorni', icon: CalendarClock, to: '/area-riservata/scadenze' },
  { key: 'openClaims', label: 'Sinistri in corso', icon: ShieldAlert, to: '/area-riservata/sinistri' },
  { key: 'openQuotes', label: 'Preventivi aperti', icon: FileText, to: '/area-riservata/preventivi' },
  { key: 'openNegotiations', label: 'Trattative in corso', icon: Handshake, to: '/area-riservata/trattative' },
  { key: 'openRequests', label: 'Richieste in lavorazione', icon: ListChecks, to: '/area-riservata/richieste' },
  { key: 'unreadMessages', label: 'Messaggi da leggere', icon: MessageSquare, to: '/area-riservata/comunicazioni' },
  { key: 'documents', label: 'Documenti archiviati', icon: FolderOpen, to: '/area-riservata/documenti' },
] as const;

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { data, loading, error, reload } = usePortalSummary();

  const hour = new Date().getHours();
  const greeting = hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const name = user?.firstName ?? '';

  return (
    <div>
      <PageHeader
        title={`${greeting}${name ? `, ${name}` : ''}`}
        description="Questa e’ la tua posizione assicurativa aggiornata. Tutto quello che il consulente lavora per te compare qui."
      />

      {error && <ErrorBlock message={error} onRetry={reload} />}

      {loading && !data ? (
        <LoadingBlock rows={4} />
      ) : (
        data && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8" aria-label="Riepilogo">
              {KPI.map((item) => {
                const Icon = item.icon;
                const value = data.counters[item.key];
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    className="card !p-4 sm:!p-5 hover:!border-[rgba(197,160,89,0.5)] group"
                  >
                    <span className="inline-flex w-9 h-9 rounded-lg bg-[#f4ece0] items-center justify-center text-[#c5a059] mb-3">
                      <Icon size={18} />
                    </span>
                    <p className="text-[1.75rem] font-extrabold text-[#0f172a] leading-none group-hover:text-[#c5a059] transition-colors">
                      {value}
                    </p>
                    <p className="mt-1.5 text-[0.78rem] font-semibold text-[#64748b] leading-snug">{item.label}</p>
                  </Link>
                );
              })}
            </section>

            <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
              {/* Prossime scadenze */}
              <section className="card !p-0 overflow-hidden">
                <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[rgba(15,23,42,0.07)]">
                  <h2 className="font-bold text-[1rem] text-[#0f172a] flex items-center gap-2">
                    <CalendarClock size={18} className="text-[#c5a059]" />
                    Prossime scadenze
                  </h2>
                  <Link to="/area-riservata/scadenze" className="text-[0.8rem] font-bold text-[#64748b] hover:text-[#0a192f]">
                    Vedi tutte
                  </Link>
                </header>

                {data.nextDeadlines.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[0.9rem] text-[#64748b]">
                    Nessuna scadenza registrata al momento. Appena il consulente carica le tue polizze, qui vedrai
                    rate e rinnovi in ordine di data.
                  </p>
                ) : (
                  <ul>
                    {data.nextDeadlines.map((deadline) => {
                      const days = daysUntil(deadline.dueDate);
                      const urgent = days !== null && days <= 15;
                      return (
                        <li
                          key={deadline.id}
                          className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 border-b border-[rgba(15,23,42,0.06)] last:border-0"
                        >
                          <div className="flex-1 min-w-[180px]">
                            <p className="font-bold text-[0.92rem] text-[#0f172a]">{deadline.title}</p>
                            <p className="text-[0.78rem] text-[#64748b] mt-0.5">
                              {[deadline.companyName, deadline.policyNumber && `n. ${deadline.policyNumber}`]
                                .filter(Boolean)
                                .join(' • ') || 'Scadenza generica'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-[0.88rem] font-bold ${urgent ? 'text-[#b45309]' : 'text-[#0f172a]'}`}>
                              {formatDate(deadline.dueDate)}
                            </p>
                            {days !== null && (
                              <p className={`text-[0.72rem] font-semibold ${urgent ? 'text-[#b45309]' : 'text-[#94a3b8]'}`}>
                                {days < 0 ? `scaduta da ${Math.abs(days)} gg` : days === 0 ? 'scade oggi' : `fra ${days} gg`}
                              </p>
                            )}
                          </div>
                          <div className="text-right min-w-[92px]">
                            <p className="text-[0.9rem] font-bold text-[#0f172a]">{formatCurrency(deadline.amount)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <div className="space-y-6">
                {/* Azioni rapide */}
                <section className="card">
                  <h2 className="font-bold text-[1rem] text-[#0f172a] flex items-center gap-2 mb-4">
                    <Sparkles size={18} className="text-[#c5a059]" />
                    Cosa vuoi fare
                  </h2>
                  <div className="space-y-2.5">
                    <Link to="/area-riservata/sinistri/nuovo" className="btn btn-primary w-full justify-start !py-3">
                      <ShieldAlert size={17} />
                      Apri una pratica di sinistro
                    </Link>
                    <Link to="/area-riservata/comunicazioni" className="btn btn-outline w-full justify-start !py-3">
                      <MessageSquare size={17} />
                      Scrivi al consulente
                    </Link>
                    <Link to="/area-riservata/profilo" className="btn btn-outline w-full justify-start !py-3">
                      <ListChecks size={17} />
                      Aggiorna i tuoi recapiti
                    </Link>
                  </div>
                </section>

                {/* Attivita' recente */}
                <section className="card !p-0 overflow-hidden">
                  <header className="px-5 py-4 border-b border-[rgba(15,23,42,0.07)]">
                    <h2 className="font-bold text-[1rem] text-[#0f172a]">Ultimi aggiornamenti</h2>
                  </header>
                  {data.recentActivity.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[0.88rem] text-[#64748b]">
                      Non ci sono ancora aggiornamenti da mostrare.
                    </p>
                  ) : (
                    <ul>
                      {data.recentActivity.map((item, index) => (
                        <li
                          key={`${item.kind}-${index}`}
                          className="px-5 py-3 border-b border-[rgba(15,23,42,0.06)] last:border-0"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.72rem] font-bold uppercase tracking-wide text-[#94a3b8]">
                              {item.kind}
                            </span>
                            <StatusBadge status={item.status} />
                          </div>
                          <p className="font-semibold text-[0.9rem] text-[#0f172a] mt-1">{item.title}</p>
                          <p className="text-[0.75rem] text-[#94a3b8] mt-0.5">{formatDateTime(item.at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default DashboardPage;
