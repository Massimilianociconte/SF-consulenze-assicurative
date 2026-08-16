import React from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  Car,
  FileSignature,
  FileText,
  Handshake,
  ListChecks,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';
import type { Claim, Deadline, Negotiation, Policy, Quote, ServiceRequest } from '../lib/api';
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  daysUntil,
  formatCurrency,
  formatDate,
  formatDateTime,
  useApiResource,
} from './components';

/** Involucro comune: intestazione, caricamento, errore, stato vuoto. */
function Section<T>({
  title,
  description,
  path,
  pick,
  empty,
  render,
  action,
}: {
  title: string;
  description: string;
  path: string;
  pick: (data: any) => T[];
  empty: React.ReactNode;
  render: (items: T[]) => React.ReactNode;
  action?: React.ReactNode;
}) {
  const { data, loading, error, reload } = useApiResource<any>(path);
  const items = data ? pick(data) : [];

  return (
    <div>
      <PageHeader title={title} description={description} action={action} />
      {error && <ErrorBlock message={error} onRetry={reload} />}
      {loading && !data ? <LoadingBlock /> : items.length === 0 && !error ? empty : render(items)}
    </div>
  );
}

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="card !p-4 sm:!p-5">{children}</li>
);

const List: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="space-y-3">{children}</ul>
);

/* ---------------------------------------------------------------- Scadenze */

export const DeadlinesPage: React.FC = () => (
  <Section<Deadline>
    title="Scadenze"
    description="Rate, rinnovi e adempimenti in ordine di data. Le scadenze entro 15 giorni sono evidenziate."
    path="/api/portal/deadlines"
    pick={(data) => data.deadlines}
    empty={
      <EmptyState
        icon={<CalendarClock size={26} />}
        title="Nessuna scadenza registrata"
        description="Quando il consulente carica le tue polizze, qui trovi rate e rinnovi con importi e date, senza doverli cercare."
      />
    }
    render={(items) => (
      <List>
        {items.map((item) => {
          const days = daysUntil(item.dueDate);
          const urgent = days !== null && days <= 15 && item.status === 'pending';
          return (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[200px] flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-[0.98rem] text-[#0f172a]">{item.title}</h3>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-[0.82rem] text-[#64748b] mt-1">
                    {[item.companyName, item.policyNumber && `Polizza n. ${item.policyNumber}`, item.branch]
                      .filter(Boolean)
                      .join(' • ') || 'Scadenza non collegata a una polizza'}
                  </p>
                  {item.notes && <p className="text-[0.82rem] text-[#64748b] mt-2 italic">{item.notes}</p>}
                </div>
                <div className="text-right">
                  <p className={`font-bold text-[0.95rem] ${urgent ? 'text-[#b45309]' : 'text-[#0f172a]'}`}>
                    {formatDate(item.dueDate)}
                  </p>
                  {days !== null && item.status === 'pending' && (
                    <p className={`text-[0.75rem] font-semibold ${urgent ? 'text-[#b45309]' : 'text-[#94a3b8]'}`}>
                      {days < 0 ? `scaduta da ${Math.abs(days)} gg` : days === 0 ? 'scade oggi' : `fra ${days} gg`}
                    </p>
                  )}
                  <p className="text-[0.95rem] font-bold text-[#0f172a] mt-1.5">{formatCurrency(item.amount)}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </List>
    )}
  />
);

/* ---------------------------------------------------------------- Polizze */

export const PoliciesPage: React.FC = () => (
  <Section<Policy>
    title="Polizze e contratti"
    description="Tutte le coperture in corso e quelle archiviate, con compagnia, decorrenza, scadenza e premio."
    path="/api/portal/policies"
    pick={(data) => data.policies}
    empty={
      <EmptyState
        icon={<FileSignature size={26} />}
        title="Nessuna polizza caricata"
        description="Il consulente sta popolando la tua posizione. Se hai contratti stipulati altrove, puoi segnalarli dalla sezione Comunicazioni per farli inserire."
        action={
          <Link to="/area-riservata/comunicazioni" className="btn btn-outline btn-sm">
            <MessageSquare size={15} />
            Segnala una polizza
          </Link>
        }
      />
    }
    render={(items) => (
      <List>
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[1rem] text-[#0f172a]">{item.companyName}</h3>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-[0.82rem] text-[#64748b] mt-1">
                  {item.productName ?? item.branch} • n. {item.policyNumber}
                </p>
              </div>
              <p className="text-[1.05rem] font-extrabold text-[#0f172a]">
                {formatCurrency(item.premium)}
                {item.paymentFrequency && (
                  <span className="block text-[0.7rem] font-semibold text-[#94a3b8] text-right">
                    rata {item.paymentFrequency}
                  </span>
                )}
              </p>
            </div>

            <dl className="grid sm:grid-cols-3 gap-x-4 gap-y-2 text-[0.82rem] border-t border-[rgba(15,23,42,0.07)] pt-3">
              <div>
                <dt className="text-[#94a3b8] font-semibold">Decorrenza</dt>
                <dd className="font-bold text-[#0f172a]">{formatDate(item.effectiveDate)}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] font-semibold">Scadenza</dt>
                <dd className="font-bold text-[#0f172a]">{formatDate(item.expiryDate)}</dd>
              </div>
              <div>
                <dt className="text-[#94a3b8] font-semibold">Oggetto assicurato</dt>
                <dd className="font-bold text-[#0f172a] flex items-center gap-1.5">
                  {item.plate && <Car size={14} className="text-[#c5a059]" />}
                  {item.plate ?? item.insuredObject ?? '—'}
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </List>
    )}
  />
);

/* -------------------------------------------------------------- Preventivi */

export const QuotesPage: React.FC = () => (
  <Section<Quote>
    title="Preventivi"
    description="Le proposte elaborate dal consulente, con premio, garanzie principali e validita’."
    path="/api/portal/quotes"
    pick={(data) => data.quotes}
    empty={
      <EmptyState
        icon={<FileText size={26} />}
        title="Nessun preventivo disponibile"
        description="Quando richiedi un confronto, le proposte delle diverse compagnie compaiono qui, pronte da leggere e confrontare."
        action={
          <Link to="/area-riservata/comunicazioni" className="btn btn-outline btn-sm">
            <MessageSquare size={15} />
            Richiedi un preventivo
          </Link>
        }
      />
    }
    render={(items) => (
      <List>
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[0.98rem] text-[#0f172a]">{item.subject}</h3>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-[0.82rem] text-[#64748b] mt-1">
                  {[item.companyName, item.branch].filter(Boolean).join(' • ') || 'Compagnia da definire'}
                </p>
                {item.coverageSummary && (
                  <p className="text-[0.85rem] text-[#334155] mt-2 leading-relaxed">{item.coverageSummary}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[1.05rem] font-extrabold text-[#0f172a]">{formatCurrency(item.premium)}</p>
                {item.validUntil && (
                  <p className="text-[0.75rem] text-[#94a3b8] font-semibold">valido fino al {formatDate(item.validUntil)}</p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </List>
    )}
  />
);

/* -------------------------------------------------------------- Trattative */

export const NegotiationsPage: React.FC = () => (
  <Section<Negotiation>
    title="Trattative in corso"
    description="Lo stato dei confronti aperti con le compagnie, dalla raccolta esigenze alla firma."
    path="/api/portal/negotiations"
    pick={(data) => data.negotiations}
    empty={
      <EmptyState
        icon={<Handshake size={26} />}
        title="Nessuna trattativa aperta"
        description="Qui seguirai passo passo le pratiche in corso di negoziazione: fase, valore stimato e prossimi passi."
      />
    }
    render={(items) => (
      <List>
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[0.98rem] text-[#0f172a]">{item.title}</h3>
                  <StatusBadge status={item.stage} />
                </div>
                {item.notes && <p className="text-[0.85rem] text-[#334155] mt-2 leading-relaxed">{item.notes}</p>}
                <p className="text-[0.75rem] text-[#94a3b8] mt-2">
                  Ultimo aggiornamento: {formatDateTime(item.lastUpdate)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[1.02rem] font-extrabold text-[#0f172a]">{formatCurrency(item.value)}</p>
                {item.expectedClose && (
                  <p className="text-[0.75rem] text-[#94a3b8] font-semibold">
                    chiusura prevista {formatDate(item.expectedClose)}
                  </p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </List>
    )}
  />
);

/* ---------------------------------------------------------------- Sinistri */

export const ClaimsPage: React.FC = () => (
  <Section<Claim>
    title="Pratiche di sinistro"
    description="Segui l’avanzamento delle tue pratiche: dalla denuncia alla liquidazione, con tutti i documenti collegati."
    path="/api/portal/claims"
    pick={(data) => data.claims}
    action={
      <Link to="/area-riservata/sinistri/nuovo" className="btn btn-primary btn-sm">
        <ShieldAlert size={15} />
        Apri una pratica
      </Link>
    }
    empty={
      <EmptyState
        icon={<ShieldAlert size={26} />}
        title="Nessuna pratica aperta"
        description="Se hai avuto un sinistro, il modulo guidato ti accompagna passo passo: bastano pochi minuti e puoi interrompere e riprendere quando vuoi."
        action={
          <Link to="/area-riservata/sinistri/nuovo" className="btn btn-primary btn-sm">
            <ShieldAlert size={15} />
            Apri una pratica di sinistro
          </Link>
        }
      />
    }
    render={(items) => (
      <List>
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/area-riservata/sinistri/${item.id}`}
                    className="font-bold text-[0.98rem] text-[#0f172a] hover:text-[#c5a059] underline decoration-transparent hover:decoration-[#c5a059] underline-offset-2 transition-colors"
                  >
                    Pratica {item.reference}
                  </Link>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-[0.82rem] text-[#64748b] mt-1">
                  {[
                    item.claimType?.toUpperCase(),
                    item.companyName,
                    item.policyNumber && `polizza n. ${item.policyNumber}`,
                    item.companyClaimNumber && `sinistro n. ${item.companyClaimNumber}`,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </p>
                <p className="text-[0.82rem] text-[#334155] mt-2">
                  Avvenuto il {formatDateTime(item.occurredAt)}
                  {item.placeCity ? ` a ${item.placeCity}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[0.95rem] font-extrabold text-[#0f172a]">{formatCurrency(item.estimatedDamage)}</p>
                <p className="text-[0.72rem] text-[#94a3b8] font-semibold">danno stimato</p>
              </div>
            </div>
          </Card>
        ))}
      </List>
    )}
  />
);

/* --------------------------------------------------------------- Richieste */

export const RequestsPage: React.FC = () => (
  <Section<ServiceRequest>
    title="Stato delle richieste"
    description="Ogni richiesta inviata al consulente ha un protocollo e uno stato aggiornato: sai sempre a che punto e’."
    path="/api/portal/requests"
    pick={(data) => data.requests}
    empty={
      <EmptyState
        icon={<ListChecks size={26} />}
        title="Nessuna richiesta in corso"
        description="Quando chiedi una modifica di polizza, un preventivo o un documento, qui trovi il protocollo e l’avanzamento passo per passo."
      />
    }
    render={(items) => (
      <List>
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[0.95rem] text-[#0f172a]">{item.subject}</h3>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-[0.78rem] text-[#94a3b8] mt-1">
                  Protocollo {item.reference} • aperta il {formatDate(item.createdAt)}
                </p>
                {item.detail && <p className="text-[0.85rem] text-[#334155] mt-2 leading-relaxed">{item.detail}</p>}
              </div>
              <p className="text-[0.75rem] font-semibold text-[#94a3b8]">
                aggiornata {formatDateTime(item.updatedAt)}
              </p>
            </div>
          </Card>
        ))}
      </List>
    )}
  />
);
