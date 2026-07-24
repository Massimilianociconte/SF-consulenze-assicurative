import React, { useState } from 'react';
import { AGENCY_INFO } from '../data/content';
import { MapPin, Phone, MessageCircle, Mail, Clock, Navigation, CheckCircle2, Send } from 'lucide-react';

interface ContactAndMapProps {
  onOpenBooking: () => void;
}

export const ContactAndMap: React.FC<ContactAndMapProps> = ({ onOpenBooking }) => {
  const [callbackSubmitted, setCallbackSubmitted] = useState<boolean>(false);
  const [callbackData, setCallbackData] = useState({
    name: '',
    phone: '',
    timePreference: 'mattina',
    gdpr: false
  });

  const handleCallbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callbackData.name || !callbackData.phone || !callbackData.gdpr) {
      alert('Per favore inserisci nome, telefono e accetta la privacy.');
      return;
    }
    setCallbackSubmitted(true);
  };

  return (
    <section id="contatti" className="section bg-white border-t border-slate-100">
      <div className="container">
        
        <div className="section-header">
          <div className="section-tag">
            <MapPin size={14} />
            <span>Dove Siamo & Contatti</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#0a192f] mt-2">
            Contatta lo studio a Rho
          </h2>
          <p className="mt-4 text-slate-600">
            Siamo a tua disposizione per consulenze in sede, telefoniche o per la gestione diretta delle tue pratiche.
          </p>
        </div>

        {/* Top 3 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Phone */}
          <div className="card bg-[#faf8f5] p-6 rounded-2xl border border-slate-200 text-center flex flex-col items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-[#0a192f] text-[#c5a059] flex items-center justify-center mb-4">
              <Phone size={22} />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Telefono Fisso Studio</span>
              <a href={`tel:${AGENCY_INFO.phoneRaw}`} className="text-xl font-extrabold text-[#0a192f] hover:text-[#c5a059] mt-1 block">
                {AGENCY_INFO.phone}
              </a>
              <p className="text-xs text-slate-500 mt-1">Chiamata diretta per informazioni e appuntamenti</p>
            </div>
            <a href={`tel:${AGENCY_INFO.phoneRaw}`} className="mt-4 btn btn-outline btn-sm text-xs w-full justify-center">
              Chiama ora
            </a>
          </div>

          {/* WhatsApp */}
          <div className="card bg-[#faf8f5] p-6 rounded-2xl border border-slate-200 text-center flex flex-col items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-[#25D366] text-white flex items-center justify-center mb-4">
              <MessageCircle size={22} />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">WhatsApp & Mobile</span>
              <a 
                href={`https://wa.me/${AGENCY_INFO.whatsappRaw}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-extrabold text-[#0a192f] hover:text-[#25D366] mt-1 block"
              >
                {AGENCY_INFO.mobile}
              </a>
              <p className="text-xs text-slate-500 mt-1">Scrivi un messaggio o invia documenti 24/7</p>
            </div>
            <a 
              href={`https://wa.me/${AGENCY_INFO.whatsappRaw}?text=Buongiorno%20Simone,%20vorrei%20informazioni`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 btn btn-whatsapp btn-sm text-xs w-full justify-center"
            >
              Apri WhatsApp
            </a>
          </div>

          {/* Email */}
          <div className="card bg-[#faf8f5] p-6 rounded-2xl border border-slate-200 text-center flex flex-col items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-[#0a192f] text-[#c5a059] flex items-center justify-center mb-4">
              <Mail size={22} />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Posta Elettronica</span>
              <a href={`mailto:${AGENCY_INFO.email}`} className="text-base font-bold text-[#0a192f] hover:text-[#c5a059] mt-1 block break-all">
                {AGENCY_INFO.email}
              </a>
              <p className="text-xs text-slate-500 mt-1">Per comunicazioni ufficiali ed invio polizze</p>
            </div>
            <a href={`mailto:${AGENCY_INFO.email}`} className="mt-4 btn btn-outline btn-sm text-xs w-full justify-center">
              Invia un'email
            </a>
          </div>
        </div>

        {/* Map & Callback Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-14">
          
          {/* Map Column */}
          <div className="lg:col-span-7 bg-[#faf8f5] p-6 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#0a192f] text-lg">Sede di Rho (MI)</h3>
                <p className="text-xs text-slate-600">{AGENCY_INFO.fullAddress}</p>
              </div>
              <a
                href={AGENCY_INFO.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm text-xs"
              >
                <Navigation size={14} />
                <span>Ottieni indicazioni</span>
              </a>
            </div>

            {/* Embedded OpenStreetMap View for Rho */}
            <div className="w-full h-80 rounded-xl overflow-hidden border border-slate-300 relative shadow-inner bg-slate-100">
              <iframe
                title="Mappa Sede S.F. Consulenze Assicurative Rho"
                width="100%"
                height="100%"
                frameBorder="0"
                scrolling="no"
                marginHeight={0}
                marginWidth={0}
                src="https://www.openstreetmap.org/export/embed.html?bbox=9.0251%2C45.5200%2C9.0550%2C45.5390&amp;layer=mapnik&amp;marker=45.5298%2C9.0401"
                className="w-full h-full"
              />
            </div>

            {/* Local Municipalities SEO Footer Chips */}
            <div className="pt-2">
              <span className="text-xs font-bold text-slate-700 block mb-2">Comuni serviti direttamente nell'area:</span>
              <div className="flex flex-wrap gap-1.5">
                {AGENCY_INFO.municipalitiesServed.map((m) => (
                  <span key={m} className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-600 text-xs font-medium">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Callback Request Form */}
          <div className="lg:col-span-5 bg-[#0a192f] text-white p-6 sm:p-8 rounded-2xl border border-[rgba(197,160,89,0.3)] shadow-xl">
            <div className="border-b border-[#1e293b] pb-4 mb-5">
              <span className="text-xs font-bold text-[#c5a059] uppercase tracking-wider">Richiamami</span>
              <h3 className="text-xl font-bold text-white mt-1">Richiedi un contatto telefonico</h3>
              <p className="text-xs text-slate-300 mt-1">Lascia il tuo numero e ti richiameremo nella fascia oraria da te indicata.</p>
            </div>

            {!callbackSubmitted ? (
              <form onSubmit={handleCallbackSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome e Cognome *</label>
                  <input
                    type="text"
                    required
                    placeholder="Mario Rossi"
                    value={callbackData.name}
                    onChange={(e) => setCallbackData({ ...callbackData, name: e.target.value })}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Numero di Telefono *</label>
                  <input
                    type="tel"
                    required
                    placeholder="334 1234567"
                    value={callbackData.phone}
                    onChange={(e) => setCallbackData({ ...callbackData, phone: e.target.value })}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Fascia oraria preferita</label>
                  <select
                    value={callbackData.timePreference}
                    onChange={(e) => setCallbackData({ ...callbackData, timePreference: e.target.value })}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  >
                    <option value="mattina">Mattina (09:00 - 12:30)</option>
                    <option value="pomeriggio">Pomeriggio (14:30 - 18:30)</option>
                    <option value="qualsiasi">Qualsiasi orario</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      required
                      checked={callbackData.gdpr}
                      onChange={(e) => setCallbackData({ ...callbackData, gdpr: e.target.checked })}
                      className="mt-0.5 accent-[#c5a059]"
                    />
                    <span>Acconsento a ricevere la richiamata telefonica per finalità di consulenza.</span>
                  </label>
                </div>

                <button type="submit" className="btn btn-primary w-full justify-center text-sm py-3 mt-2">
                  <Send size={16} />
                  <span>Richiedi Richiamata Gratuita</span>
                </button>
              </form>
            ) : (
              <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 bg-[#c5a059] text-[#07111e] rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 size={28} />
                </div>
                <h4 className="text-lg font-bold text-white">Richiesta registrata!</h4>
                <p className="text-xs text-slate-300">
                  Grazie <span className="text-[#c5a059] font-bold">{callbackData.name}</span>. Ti ricontatteremo al numero {callbackData.phone} nella fascia {callbackData.timePreference}.
                </p>
                <button
                  onClick={() => setCallbackSubmitted(false)}
                  className="btn btn-outline text-xs text-slate-300 border-slate-600"
                >
                  Effettua un'altra richiesta
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </section>
  );
};
