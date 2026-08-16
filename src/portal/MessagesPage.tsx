import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, Plus, Send } from 'lucide-react';
import { api, ApiError, type MessageThread, type ThreadMessage } from '../lib/api';
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, formatDateTime, useApiResource } from './components';

const CATEGORIES = [
  { value: 'generale', label: 'Richiesta generale' },
  { value: 'polizza', label: 'Polizza o contratto' },
  { value: 'sinistro', label: 'Sinistro' },
  { value: 'preventivo', label: 'Preventivo' },
  { value: 'documenti', label: 'Documenti' },
  { value: 'amministrativo', label: 'Amministrativo' },
] as const;

export const MessagesPage: React.FC = () => {
  const threads = useApiResource<{ threads: MessageThread[] }>('/api/portal/threads');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const conversation = useApiResource<{ thread: MessageThread; messages: ThreadMessage[] }>(
    selectedId ? `/api/portal/threads/${selectedId}` : null,
  );

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation.data?.messages.length]);

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || reply.trim().length < 2) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/api/portal/threads/${selectedId}/messages`, { body: reply.trim() });
      setReply('');
      conversation.reload();
      threads.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invio non riuscito.');
    } finally {
      setSending(false);
    }
  };

  const list = threads.data?.threads ?? [];

  return (
    <div>
      <PageHeader
        title="Comunicazioni"
        description="Il canale diretto con il tuo consulente. Ogni conversazione resta archiviata e consultabile."
        action={
          <button onClick={() => setComposing(true)} className="btn btn-primary btn-sm">
            <Plus size={15} />
            Nuova conversazione
          </button>
        }
      />

      {threads.error && <ErrorBlock message={threads.error} onRetry={threads.reload} />}

      {composing && (
        <NewThreadForm
          onCancel={() => setComposing(false)}
          onCreated={(threadId) => {
            setComposing(false);
            threads.reload();
            setSelectedId(threadId);
          }}
        />
      )}

      {threads.loading && !threads.data ? (
        <LoadingBlock />
      ) : list.length === 0 && !composing ? (
        <EmptyState
          icon={<MessageSquare size={26} />}
          title="Nessuna conversazione"
          description="Scrivi al consulente per richieste, segnalazioni o chiarimenti: le risposte arrivano qui e restano sempre consultabili."
          action={
            <button onClick={() => setComposing(true)} className="btn btn-primary btn-sm">
              <Plus size={15} />
              Inizia una conversazione
            </button>
          }
        />
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-5">
          {/* Elenco conversazioni */}
          <ul className={`space-y-2 ${selectedId ? 'hidden lg:block' : ''}`}>
            {list.map((thread) => (
              <li key={thread.id}>
                <button
                  onClick={() => setSelectedId(thread.id)}
                  className={`w-full text-left card !p-4 transition-colors ${
                    selectedId === thread.id ? '!border-[#c5a059] bg-[#fffdf9]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-[0.9rem] text-[#0f172a] leading-snug">{thread.subject}</h3>
                    {thread.unread > 0 && (
                      <span className="shrink-0 min-w-[20px] text-center rounded-full bg-[#c5a059] text-[#07111e] text-[0.68rem] font-extrabold px-1.5 py-0.5">
                        {thread.unread}
                      </span>
                    )}
                  </div>
                  {thread.preview && (
                    <p className="text-[0.8rem] text-[#64748b] mt-1 line-clamp-2">{thread.preview}</p>
                  )}
                  <p className="text-[0.7rem] text-[#94a3b8] mt-2 font-semibold uppercase tracking-wide">
                    {thread.category} • {formatDateTime(thread.lastMessageAt)}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {/* Conversazione */}
          <section className={`card !p-0 overflow-hidden flex flex-col ${selectedId ? '' : 'hidden lg:flex'}`}>
            {!selectedId ? (
              <p className="p-10 text-center text-[0.9rem] text-[#64748b]">
                Seleziona una conversazione per leggerla.
              </p>
            ) : conversation.loading && !conversation.data ? (
              <div className="p-5">
                <LoadingBlock rows={2} />
              </div>
            ) : conversation.error ? (
              <div className="p-5">
                <ErrorBlock message={conversation.error} onRetry={conversation.reload} />
              </div>
            ) : (
              conversation.data && (
                <>
                  <header className="px-5 py-4 border-b border-[rgba(15,23,42,0.07)] flex items-center gap-3">
                    <button
                      onClick={() => setSelectedId(null)}
                      className="lg:hidden w-9 h-9 rounded-lg bg-[#f4f0ea] flex items-center justify-center shrink-0"
                      aria-label="Torna all’elenco"
                    >
                      <ArrowLeft size={17} className="text-[#0a192f]" />
                    </button>
                    <div className="min-w-0">
                      <h2 className="font-bold text-[1rem] text-[#0f172a] truncate">{conversation.data.thread.subject}</h2>
                      <p className="text-[0.72rem] text-[#94a3b8] font-semibold uppercase tracking-wide">
                        {conversation.data.thread.category}
                      </p>
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto max-h-[52vh] px-5 py-4 space-y-3 bg-[#fcfbf9]">
                    {conversation.data.messages.map((message) => {
                      const mine = message.senderRole === 'client';
                      return (
                        <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-[0.9rem] leading-relaxed whitespace-pre-wrap ${
                              mine
                                ? 'bg-[#0a192f] text-white rounded-br-md'
                                : 'bg-white border border-[rgba(15,23,42,0.08)] text-[#334155] rounded-bl-md'
                            }`}
                          >
                            <p className={`text-[0.68rem] font-bold uppercase tracking-wide mb-1 ${mine ? 'text-[#c5a059]' : 'text-[#94a3b8]'}`}>
                              {mine ? 'Tu' : message.senderRole === 'advisor' ? 'Consulente' : 'Sistema'}
                            </p>
                            {message.body}
                            <p className={`text-[0.68rem] mt-1.5 ${mine ? 'text-slate-400' : 'text-[#94a3b8]'}`}>
                              {formatDateTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>

                  <form onSubmit={sendReply} className="border-t border-[rgba(15,23,42,0.07)] p-4 bg-white">
                    {error && <p className="text-[0.82rem] font-semibold text-[#b91c1c] mb-2">{error}</p>}
                    <div className="flex items-end gap-2">
                      <label htmlFor="reply" className="sr-only">
                        Scrivi un messaggio
                      </label>
                      <textarea
                        id="reply"
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        rows={2}
                        maxLength={5000}
                        placeholder="Scrivi al consulente…"
                        className="flex-1 resize-none rounded-xl border border-[rgba(15,23,42,0.12)] px-4 py-3 text-[0.92rem] focus:border-[#c5a059]"
                      />
                      <button
                        type="submit"
                        disabled={sending || reply.trim().length < 2}
                        className="btn btn-primary !px-4 !py-3 disabled:opacity-50"
                        aria-label="Invia messaggio"
                      >
                        <Send size={17} />
                      </button>
                    </div>
                  </form>
                </>
              )
            )}
          </section>
        </div>
      )}
    </div>
  );
};

const NewThreadForm: React.FC<{ onCancel: () => void; onCreated: (threadId: string) => void }> = ({
  onCancel,
  onCreated,
}) => {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('generale');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<{ threadId: string }>('/api/portal/threads', { subject, category, body });
      onCreated(result.threadId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invio non riuscito.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mb-5">
      <h2 className="font-bold text-[1rem] text-[#0f172a] mb-4">Nuova conversazione</h2>
      {error && <p className="text-[0.85rem] font-semibold text-[#b91c1c] mb-3">{error}</p>}

      <div className="grid sm:grid-cols-[1fr_220px] gap-3 mb-3">
        <div>
          <label htmlFor="subject" className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">
            Oggetto
          </label>
          <input
            id="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            minLength={3}
            maxLength={150}
            placeholder="Es. Rinnovo polizza auto"
            className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] px-4 py-3 text-[0.93rem] focus:border-[#c5a059]"
          />
        </div>
        <div>
          <label htmlFor="category" className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">
            Argomento
          </label>
          <select
            id="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] px-4 py-3 text-[0.93rem] bg-white focus:border-[#c5a059]"
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor="body" className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">
        Messaggio
      </label>
      <textarea
        id="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        required
        minLength={2}
        maxLength={5000}
        rows={4}
        placeholder="Descrivi la tua richiesta…"
        className="w-full resize-y rounded-xl border border-[rgba(15,23,42,0.12)] px-4 py-3 text-[0.93rem] focus:border-[#c5a059] mb-4"
      />

      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">
          Annulla
        </button>
        <button type="submit" disabled={loading} className="btn btn-primary btn-sm disabled:opacity-60">
          <Send size={15} />
          {loading ? 'Invio…' : 'Invia'}
        </button>
      </div>
    </form>
  );
};

export default MessagesPage;
