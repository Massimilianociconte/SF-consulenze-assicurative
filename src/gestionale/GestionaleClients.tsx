import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  FileSignature,
  MessageSquare,
  Plus,
  Search,
  ShieldAlert,
  StickyNote,
  Trash2,
  Users,
} from 'lucide-react';
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
import {
  DeadlineForm,
  NegotiationForm,
  PolicyForm,
  QuoteForm,
  type DeadlineDraft,
  type NegotiationDraft,
  type PolicyDraft,
  type QuoteDraft,
} from './GestionaleForms';

/* -------------------------------------------------------------- Elenco ---- */

interface ClientRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  fiscalCode: string | null;
  city: string | null;
  emailVerified: boolean;
  activePolicies: number;
  openClaims: number;
  soonDeadlines: number;
  unreadMessages: number;
  lastLoginAt: string | null;
}

export const GestionaleClients: React.FC = () => {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error, reload } = useApiResource<{ clients: ClientRow[]; total: number }>(
    `/api/admin/clients?limit=50${query ? `&search=${encodeURIComponent(query)}` : ''}`,
  );

  return (
    <div>
      <PageHeader
        title="Clienti"
        description="Il tuo portafoglio. I contatori mostrano subito chi ha bisogno di attenzione."
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
        className="flex gap-2 mb-5"
      >
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca per nome, email, codice fiscale o telefono"
            className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white pl-11 pr-4 py-2.5 text-[0.92rem] focus:border-[#c5a059]"
          />
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">
          Cerca
        </button>
        {query && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setQuery('');
            }}
            className="btn btn-outline btn-sm"
          >
            Azzera
          </button>
        )}
      </form>

      {error && <ErrorBlock message={error} onRetry={reload} />}

      {loading && !data ? (
        <LoadingBlock />
      ) : (data?.clients.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title={query ? 'Nessun cliente trovato' : 'Nessun cliente assegnato'}
          description={
            query
              ? 'Prova con un altro termine di ricerca.'
              : 'I clienti che si registrano vanno assegnati al consulente dall’amministratore.'
          }
        />
      ) : (
        <>
          <p className="text-[0.82rem] text-[#64748b] mb-3">
            {data?.total} client{data?.total === 1 ? 'e' : 'i'} in portafoglio
          </p>
          <ul className="space-y-2.5">
            {data?.clients.map((client) => (
              <li key={client.id}>
                <Link
                  to={`/gestionale/clienti/${client.id}`}
                  className="card !p-4 flex flex-wrap items-center justify-between gap-4 hover:!border-[rgba(197,160,89,0.5)]"
                >
                  <div className="min-w-[200px]">
                    <h3 className="font-bold text-[0.95rem] text-[#0f172a]">
                      {[client.firstName, client.lastName].filter(Boolean).join(' ') || client.email}
                      {!client.emailVerified && (
                        <span className="ml-2 text-[0.68rem] font-bold uppercase text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                          email da confermare
                        </span>
                      )}
                    </h3>
                    <p className="text-[0.78rem] text-[#64748b] mt-0.5">
                      {[client.email, client.phone, client.city].filter(Boolean).join(' • ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-center">
                    {[
                      { icon: FileSignature, value: client.activePolicies, label: 'polizze' },
                      { icon: ShieldAlert, value: client.openClaims, label: 'sinistri', alert: client.openClaims > 0 },
                      { icon: CalendarClock, value: client.soonDeadlines, label: 'scadenze', alert: client.soonDeadlines > 0 },
                      { icon: MessageSquare, value: client.unreadMessages, label: 'messaggi', alert: client.unreadMessages > 0 },
                    ].map((metric) => {
                      const Icon = metric.icon;
                      return (
                        <span key={metric.label} className="flex flex-col items-center min-w-[52px]">
                          <Icon size={15} className={metric.alert ? 'text-[#b45309]' : 'text-[#94a3b8]'} />
                          <span className={`text-[0.95rem] font-extrabold ${metric.alert ? 'text-[#b45309]' : 'text-[#0f172a]'}`}>
                            {metric.value}
                          </span>
                          <span className="text-[0.66rem] text-[#94a3b8] uppercase tracking-wide">{metric.label}</span>
                        </span>
                      );
                    })}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------- Scheda ----- */

const TABS = ['Panoramica', 'Polizze e scadenze', 'Preventivi e trattative', 'Sinistri', 'Documenti', 'Note interne'] as const;

export const GestionaleClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApiResource<any>(id ? `/api/admin/clients/${id}` : null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Panoramica');
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  /** Modulo attualmente aperto: tipo di dato e riga in modifica (se c'e'). */
  const [editor, setEditor] = useState<
    | { kind: 'policy'; data?: PolicyDraft }
    | { kind: 'deadline'; data?: DeadlineDraft }
    | { kind: 'quote'; data?: QuoteDraft }
    | { kind: 'negotiation'; data?: NegotiationDraft }
    | null
  >(null);

  if (loading && !data) return <LoadingBlock rows={4} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const { client, policies, deadlines, claims, documents, threads, notes, requests, profileChanges = [] } = data;

  const addNote = async () => {
    if (note.trim().length < 2) return;
    setSavingNote(true);
    try {
      await api.post(`/api/admin/clients/${id}/notes`, { body: note.trim() });
      setNote('');
      setFeedback('Nota salvata.');
      reload();
    } catch (noteError) {
      setFeedback(noteError instanceof ApiError ? noteError.message : 'Salvataggio non riuscito.');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div>
      <Link
        to="/gestionale/clienti"
        className="inline-flex items-center gap-1.5 text-[0.84rem] font-semibold text-[#64748b] hover:text-[#0a192f] mb-3"
      >
        <ArrowLeft size={15} />
        Tutti i clienti
      </Link>

      <PageHeader
        title={[client.firstName, client.lastName].filter(Boolean).join(' ') || client.email}
        description={[client.email, client.phone ?? client.mobile, client.fiscalCode].filter(Boolean).join(' • ')}
      />

      <div className="flex flex-wrap gap-1.5 mb-5 border-b border-[rgba(15,23,42,0.1)]">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`px-3.5 py-2 text-[0.86rem] font-bold border-b-2 -mb-px transition-colors ${
              tab === item ? 'border-[#c5a059] text-[#0a192f]' : 'border-transparent text-[#64748b] hover:text-[#0a192f]'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {feedback && (
        <p className="text-[0.86rem] font-semibold text-[#166534] bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-4 py-2.5 mb-4">
          {feedback}
        </p>
      )}

      {tab === 'Panoramica' && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="card">
            <h2 className="font-bold text-[0.98rem] text-[#0f172a] mb-3">Anagrafica</h2>
            <dl className="text-[0.88rem] space-y-1.5">
              {[
                ['Email', client.email + (client.emailVerified ? '' : ' (da confermare)')],
                ['Telefono', client.phone ?? client.mobile ?? '—'],
                ['PEC', client.pec ?? '—'],
                ['Codice fiscale', client.fiscalCode ?? '—'],
                ['Partita IVA', client.vatNumber ?? '—'],
                ['Nato il', client.birthDate ?? '—'],
                [
                  'Indirizzo',
                  [
                    client.address?.street,
                    client.address?.locality,
                    client.address?.zip,
                    client.address?.city,
                    client.address?.province,
                    client.address?.country,
                  ]
                    .filter(Boolean)
                    .join(', ') || '—',
                ],
                ['Consenso marketing', client.marketingConsent ? 'Sì' : 'No'],
                ['Ultimo accesso', formatDateTime(client.lastLoginAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-[#64748b]">{label}</dt>
                  <dd className="font-semibold text-[#0f172a] text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card">
            <h2 className="font-bold text-[0.98rem] text-[#0f172a] mb-3">Conversazioni e richieste</h2>
            {threads.length === 0 && requests.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessuna comunicazione in corso.</p>
            ) : (
              <ul className="space-y-2">
                {threads.map((thread: any) => (
                  <li key={thread.id} className="rounded-lg bg-[#f8fafc] px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[0.88rem] text-[#0f172a]">{thread.subject}</span>
                      {thread.unread > 0 && (
                        <span className="rounded-full bg-[#c5a059] text-[#07111e] text-[0.68rem] font-extrabold px-2 py-0.5">
                          {thread.unread} da leggere
                        </span>
                      )}
                    </div>
                    <p className="text-[0.75rem] text-[#94a3b8]">{formatDateTime(thread.lastMessageAt)}</p>
                  </li>
                ))}
                {requests.map((request: any) => (
                  <li key={request.id} className="rounded-lg bg-[#f8fafc] px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[0.88rem] text-[#0f172a]">{request.subject}</span>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="text-[0.75rem] text-[#94a3b8]">Protocollo {request.reference}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-bold text-[0.98rem] text-[#0f172a]">Variazioni del profilo</h2>
              <Link to="/gestionale/richieste" className="text-[0.78rem] font-bold text-[#64748b] hover:text-[#c5a059]">
                Apri la coda di verifica
              </Link>
            </div>
            {profileChanges.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessuna variazione inviata dall’area riservata.</p>
            ) : (
              <ul className="space-y-2">
                {profileChanges.slice(0, 8).map((change: any) => (
                  <li key={change.id} className="rounded-lg bg-[#f8fafc] px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[0.84rem] text-[#0f172a]">
                        {change.changedFields.map((field: string) => field.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}
                      </span>
                      <StatusBadge status={change.status} />
                    </div>
                    <p className="text-[0.74rem] text-[#94a3b8] mt-0.5">
                      {formatDateTime(change.requestedAt)} · origine area riservata
                      {change.source !== 'manual' ? ' · compilazione assistita' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'Polizze e scadenze' && (
        <div className="space-y-5">
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-bold text-[0.98rem] text-[#0f172a]">Polizze ({policies.length})</h2>
              <button onClick={() => setEditor({ kind: 'policy' })} className="btn btn-primary btn-sm">
                <Plus size={14} />
                Aggiungi polizza
              </button>
            </div>
            {policies.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessuna polizza registrata per questo cliente.</p>
            ) : (
              <ul className="space-y-2">
                {policies.map((policy: any) => (
                  <li key={policy.id} className="rounded-lg border border-[rgba(15,23,42,0.09)] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[0.9rem] text-[#0f172a]">
                        {policy.companyName} — {policy.policyNumber}
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={policy.status} />
                        <button
                          onClick={() => setEditor({ kind: 'policy', data: policy })}
                          className="btn btn-outline btn-sm"
                        >
                          Modifica
                        </button>
                      </span>
                    </div>
                    <p className="text-[0.8rem] text-[#64748b] mt-1">
                      {[policy.branch, policy.plate, `scade ${formatDate(policy.expiryDate)}`, formatCurrency(policy.premium)]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-bold text-[0.98rem] text-[#0f172a]">Scadenze ({deadlines.length})</h2>
              <button onClick={() => setEditor({ kind: 'deadline' })} className="btn btn-primary btn-sm">
                <Plus size={14} />
                Aggiungi scadenza
              </button>
            </div>
            {deadlines.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessuna scadenza registrata.</p>
            ) : (
              <ul className="space-y-1.5">
                {deadlines.map((deadline: any) => (
                  <li
                    key={deadline.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#f8fafc] px-3.5 py-2.5"
                  >
                    <span className="font-semibold text-[0.88rem] text-[#0f172a]">{deadline.title}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-[0.84rem] text-[#334155]">{formatDate(deadline.dueDate)}</span>
                      <span className="text-[0.84rem] font-bold text-[#0f172a]">{formatCurrency(deadline.amount)}</span>
                      <StatusBadge status={deadline.status} />
                      <button
                        onClick={() => setEditor({ kind: 'deadline', data: deadline })}
                        className="btn btn-outline btn-sm"
                      >
                        Modifica
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'Preventivi e trattative' && (
        <div className="space-y-5">
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-bold text-[0.98rem] text-[#0f172a]">Preventivi ({data.quotes.length})</h2>
              <button onClick={() => setEditor({ kind: 'quote' })} className="btn btn-primary btn-sm">
                <Plus size={14} />
                Nuovo preventivo
              </button>
            </div>
            {data.quotes.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">
                Nessun preventivo. Quelli inseriti qui compaiono subito nell’area riservata del cliente.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.quotes.map((quote: any) => (
                  <li
                    key={quote.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(15,23,42,0.09)] px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-bold text-[0.9rem] text-[#0f172a]">{quote.subject}</span>
                      <span className="block text-[0.78rem] text-[#64748b]">
                        {[quote.companyName, formatCurrency(quote.premium), quote.validUntil ? `valido fino al ${formatDate(quote.validUntil)}` : null]
                          .filter(Boolean)
                          .join(' • ')}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={quote.status} />
                      <button onClick={() => setEditor({ kind: 'quote', data: quote })} className="btn btn-outline btn-sm">
                        Modifica
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-bold text-[0.98rem] text-[#0f172a]">Trattative ({data.negotiations.length})</h2>
              <button onClick={() => setEditor({ kind: 'negotiation' })} className="btn btn-primary btn-sm">
                <Plus size={14} />
                Nuova trattativa
              </button>
            </div>
            {data.negotiations.length === 0 ? (
              <p className="text-[0.88rem] text-[#64748b]">Nessuna trattativa in corso.</p>
            ) : (
              <ul className="space-y-2">
                {data.negotiations.map((negotiation: any) => (
                  <li
                    key={negotiation.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(15,23,42,0.09)] px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-bold text-[0.9rem] text-[#0f172a]">{negotiation.title}</span>
                      <span className="block text-[0.78rem] text-[#64748b]">
                        {[formatCurrency(negotiation.value), negotiation.expectedClose ? `chiusura ${formatDate(negotiation.expectedClose)}` : null]
                          .filter(Boolean)
                          .join(' • ')}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={negotiation.stage} />
                      <button
                        onClick={() => setEditor({ kind: 'negotiation', data: negotiation })}
                        className="btn btn-outline btn-sm"
                      >
                        Modifica
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'Sinistri' && (
        <section className="card">
          <h2 className="font-bold text-[0.98rem] text-[#0f172a] mb-3">Pratiche ({claims.length})</h2>
          {claims.length === 0 ? (
            <p className="text-[0.88rem] text-[#64748b]">Nessuna pratica aperta.</p>
          ) : (
            <ul className="space-y-2">
              {claims.map((claim: any) => (
                <li key={claim.id}>
                  <Link
                    to={`/gestionale/sinistri/${claim.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(15,23,42,0.09)] px-4 py-3 hover:border-[rgba(197,160,89,0.5)]"
                  >
                    <span>
                      <span className="block font-bold text-[0.9rem] text-[#0f172a]">{claim.reference}</span>
                      <span className="block text-[0.78rem] text-[#64748b]">
                        {claim.claimType?.toUpperCase()} • {formatDate(claim.occurredAt)}
                        {claim.companyClaimNumber ? ` • n. ${claim.companyClaimNumber}` : ''}
                      </span>
                    </span>
                    <StatusBadge status={claim.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'Documenti' && (
        <section className="card">
          <h2 className="font-bold text-[0.98rem] text-[#0f172a] mb-3">Documenti ({documents.length})</h2>
          {documents.length === 0 ? (
            <p className="text-[0.88rem] text-[#64748b]">Nessun documento caricato.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((document: any) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(15,23,42,0.09)] px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-[0.88rem] text-[#0f172a] truncate">
                      {document.title}
                      {document.legalHold && (
                        <span className="ml-2 text-[0.68rem] font-bold uppercase text-[#b91c1c] bg-[#fef2f2] px-2 py-0.5 rounded-full">
                          blocco legale
                        </span>
                      )}
                    </span>
                    <span className="block text-[0.76rem] text-[#94a3b8]">
                      {document.category.replace(/_/g, ' ')} • {formatBytes(document.sizeBytes)} •{' '}
                      {formatDate(document.uploadedAt)}
                      {document.retentionUntil ? ` • conservare fino al ${formatDate(document.retentionUntil)}` : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {document.deletedAt ? (
                      <span className="text-[0.78rem] font-semibold text-[#94a3b8]">
                        eliminato il {formatDate(document.deletedAt)}
                      </span>
                    ) : (
                      <>
                        <button onClick={() => openDocument(document.id)} className="btn btn-outline btn-sm">
                          <ExternalLink size={13} />
                          Apri
                        </button>
                        <DocumentActions documentId={document.id} legalHold={document.legalHold} onDone={reload} />
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editor?.kind === 'policy' && (
        <PolicyForm
          clientId={client.id}
          policy={editor.data}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setFeedback('Polizza salvata: il cliente la vede già nella sua area riservata.');
            reload();
          }}
        />
      )}
      {editor?.kind === 'deadline' && (
        <DeadlineForm
          clientId={client.id}
          deadline={editor.data}
          policies={policies}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setFeedback('Scadenza salvata.');
            reload();
          }}
        />
      )}
      {editor?.kind === 'quote' && (
        <QuoteForm
          clientId={client.id}
          quote={editor.data}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setFeedback('Preventivo salvato.');
            reload();
          }}
        />
      )}
      {editor?.kind === 'negotiation' && (
        <NegotiationForm
          clientId={client.id}
          negotiation={editor.data}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setFeedback('Trattativa salvata.');
            reload();
          }}
        />
      )}

      {tab === 'Note interne' && (
        <section className="card">
          <h2 className="flex items-center gap-2 font-bold text-[0.98rem] text-[#0f172a] mb-3">
            <StickyNote size={17} className="text-[#c5a059]" />
            Note interne
          </h2>
          <p className="text-[0.8rem] text-[#64748b] mb-3">
            Visibili solo a te e agli altri operatori: il cliente non le vede mai.
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Annota quello che ti serve ricordare su questo cliente…"
            className="w-full resize-y rounded-xl border border-[rgba(15,23,42,0.12)] px-4 py-3 text-[0.92rem] focus:border-[#c5a059] mb-3"
          />
          <button onClick={addNote} disabled={savingNote || note.trim().length < 2} className="btn btn-primary btn-sm disabled:opacity-60">
            <Plus size={14} />
            {savingNote ? 'Salvataggio…' : 'Aggiungi nota'}
          </button>

          <ul className="space-y-2 mt-5">
            {notes.map((item: any) => (
              <li key={item.id} className="rounded-lg bg-[#f8fafc] px-4 py-3">
                <p className="text-[0.88rem] text-[#334155] whitespace-pre-wrap">{item.body}</p>
                <p className="text-[0.74rem] text-[#94a3b8] mt-1.5">
                  {item.author || 'Operatore'} • {formatDateTime(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

/** Blocco legale e archiviazione: i due passaggi che precedono l'eliminazione. */
const DocumentActions: React.FC<{ documentId: string; legalHold: boolean; onDone: () => void }> = ({
  documentId,
  legalHold,
  onDone,
}) => {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleHold = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/admin/documents/${documentId}/hold`, { legalHold: !legalHold });
      onDone();
    } catch (holdError) {
      setError(holdError instanceof ApiError ? holdError.message : 'Operazione non riuscita.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Prima chiamata senza conferma: se la conservazione minima non e' ancora
   * scaduta il server risponde 409 e mostriamo la richiesta di conferma
   * esplicita, che viene poi registrata nel log insieme all'eliminazione.
   */
  const remove = async (acknowledgeRetention: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/documents/${documentId}`, {
        acknowledgeRetention,
        reason: acknowledgeRetention ? 'Archiviato fuori piattaforma dal consulente' : undefined,
      });
      setConfirming(false);
      onDone();
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.code === 'retention_active') {
        setError(deleteError.message);
        setConfirming(true);
      } else {
        setError(deleteError instanceof ApiError ? deleteError.message : 'Eliminazione non riuscita.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-2">
      <button onClick={toggleHold} disabled={busy} className="btn btn-outline btn-sm">
        {legalHold ? 'Togli blocco' : 'Blocco legale'}
      </button>
      {!legalHold && (
        <button
          onClick={() => remove(false)}
          disabled={busy}
          className="btn btn-outline btn-sm !border-[#fca5a5] !text-[#b91c1c]"
          title="Elimina dal cloud (i metadati restano)"
        >
          <Trash2 size={13} />
        </button>
      )}
      {error && <span className="text-[0.74rem] text-[#b91c1c] max-w-[220px]">{error}</span>}
      {confirming && (
        <button onClick={() => remove(true)} disabled={busy} className="btn btn-sm bg-[#b91c1c] text-white">
          Confermo, elimina
        </button>
      )}
    </span>
  );
};

export default GestionaleClients;
