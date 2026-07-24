import React, { useState } from 'react';
import { LifeBuoy, Phone, MessageCircle, AlertTriangle, CheckCircle2, FileText, Send, Camera, ShieldAlert } from 'lucide-react';
import { AGENCY_INFO, CLAIMS_STEPS } from '../data/content';

export const ClaimsSection: React.FC = () => {
  const [claimType, setClaimType] = useState<string>('auto');
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false);
  const [claimData, setClaimData] = useState({
    name: '',
    phone: '',
    policyNumber: '',
    eventDate: '',
    description: '',
    gdpr: false
  });

  const handleClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimData.name || !claimData.phone || !claimData.gdpr) {
      alert('Inserisci i dati obbligatori e l’accettazione della privacy.');
      return;
    }
    setFormSubmitted(true);
  };

  return (
    <section id="sinistri" className="section bg-[#faf8f5]">
      <div className="container">
        
        <div className="section-header">
          <div className="section-tag bg-amber-100 text-amber-900 border-amber-300">
            <LifeBuoy size={14} />
            <span>Supporto In Caso di Incidente o Danno</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#0a192f] mt-2">
            Gestione Sinistri e Assistenza Diretta
          </h2>
          <p className="mt-4 text-slate-600">
            Il vero valore di un consulente assicurativo si misura al momento del bisogno. Ti affianchiamo in ogni fase dell'apertura e liquidazione del sinistro.
          </p>
        </div>

        {/* Emergency Contact Quick Bar */}
        <div className="bg-[#0a192f] text-white rounded-2xl p-6 sm:p-8 border border-[rgba(197,160,89,0.3)] shadow-xl mb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                <ShieldAlert size={14} />
                <span>Hai avuto un sinistro in questo momento?</span>
              </div>
              <h3 className="text-2xl font-bold text-white">Non ti preoccupare. Segui i primi passi guidati.</h3>
              <p className="text-slate-300 text-sm">
                Contatta subito l'ufficio di Rho al <span className="text-[#c5a059] font-bold">{AGENCY_INFO.phone}</span> oppure invia foto e dettagli su WhatsApp.
              </p>
            </div>

            <div className="lg:col-span-5 flex flex-col sm:flex-row gap-3 justify-end">
              <a
                href={`tel:${AGENCY_INFO.phoneRaw}`}
                className="btn btn-primary text-sm shadow-md justify-center"
              >
                <Phone size={16} />
                <span>Chiama 02 9899 6931</span>
              </a>
              <a
                href={`https://wa.me/${AGENCY_INFO.whatsappRaw}?text=Buongiorno%20Simone,%20devo%20segnalare%20un%20sinistro`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp text-sm justify-center"
              >
                <MessageCircle size={16} />
                <span>WhatsApp Sinistri</span>
              </a>
            </div>
          </div>
        </div>

        {/* 4 Step Guide */}
        <div className="mb-14">
          <h3 className="text-xl font-bold text-[#0a192f] mb-6 text-center">
            Guida pratica in 4 passaggi
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {CLAIMS_STEPS.map((stepItem) => (
              <div key={stepItem.step} className="card bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                <div className="w-9 h-9 rounded-full bg-[#0a192f] text-[#c5a059] font-bold flex items-center justify-center text-sm mb-4 border border-[rgba(197,160,89,0.3)]">
                  {stepItem.step}
                </div>
                <h4 className="font-bold text-[#0a192f] text-base mb-2">
                  {stepItem.title}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  {stepItem.description}
                </p>
                <span className="text-[11px] font-semibold text-[#c5a059] uppercase tracking-wider block border-t border-slate-100 pt-3">
                  {stepItem.actionText}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sinistri Notification Form Card */}
        <div className="max-w-3xl mx-auto bg-white p-6 sm:p-10 rounded-2xl border border-slate-200 shadow-lg">
          <div className="border-b border-slate-100 pb-4 mb-6">
            <h3 className="text-2xl font-bold text-[#0a192f]">Segnala un Sinistro all'Ufficio</h3>
            <p className="text-xs text-slate-500 mt-1">Compila il form per inoltrare la prima notifica a Simone Facchi e avviare la lavorazione.</p>
          </div>

          {!formSubmitted ? (
            <form onSubmit={handleClaimSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0a192f] mb-1">Tipologia di Sinistro</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'auto', label: 'Auto / Moto' },
                    { id: 'casa', label: 'Danno Casa' },
                    { id: 'infortunio', label: 'Infortunio' },
                    { id: 'azienda', label: 'Attività / Impresa' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setClaimType(t.id)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                        claimType === t.id
                          ? 'bg-[#0a192f] text-[#c5a059] border-[#0a192f]'
                          : 'bg-[#faf8f5] text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome e Cognome *</label>
                  <input
                    type="text"
                    required
                    placeholder="Mario Rossi"
                    value={claimData.name}
                    onChange={(e) => setClaimData({ ...claimData, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Telefono *</label>
                  <input
                    type="tel"
                    required
                    placeholder="334 1234567"
                    value={claimData.phone}
                    onChange={(e) => setClaimData({ ...claimData, phone: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Numero di Polizza (se disponibile)</label>
                  <input
                    type="text"
                    placeholder="Es. POL-123456"
                    value={claimData.policyNumber}
                    onChange={(e) => setClaimData({ ...claimData, policyNumber: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data dell'evento</label>
                  <input
                    type="date"
                    value={claimData.eventDate}
                    onChange={(e) => setClaimData({ ...claimData, eventDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrizione sintetica della dinamica o dei danni</label>
                <textarea
                  rows={3}
                  placeholder="Descrivi brevemente dove è accaduto l'evento e quali danni si sono verificati..."
                  value={claimData.description}
                  onChange={(e) => setClaimData({ ...claimData, description: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600">
                  <input
                    type="checkbox"
                    required
                    checked={claimData.gdpr}
                    onChange={(e) => setClaimData({ ...claimData, gdpr: e.target.checked })}
                    className="mt-0.5 accent-[#0a192f]"
                  />
                  <span>Autorizzo il trattamento dei dati per la gestione dell'assistenza sinistro (GDPR UE 2016/679).</span>
                </label>
              </div>

              <div className="pt-4">
                <button type="submit" className="btn btn-secondary w-full justify-center text-sm py-3">
                  <Send size={16} />
                  <span>Trasmetti Segnalazione Sinistro</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} />
              </div>
              <h4 className="text-xl font-bold text-[#0a192f]">Segnalazione Ricevuta</h4>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Abbiamo preso in carico la notifica di sinistro per <span className="font-bold">{claimData.name}</span>. L'ufficio di Rho ti contatterà al numero {claimData.phone} nelle prossime ore per la raccolta dei documenti ufficiali.
              </p>
              <button
                onClick={() => setFormSubmitted(false)}
                className="btn btn-outline btn-sm text-xs mt-2"
              >
                Invia un'altra segnalazione
              </button>
            </div>
          )}
        </div>

      </div>
    </section>
  );
};
