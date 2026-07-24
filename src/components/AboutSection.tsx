import React from 'react';
import { ShieldCheck, MapPin, Users, Award, HeartHandshake, CheckCircle2, Calendar } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';

interface AboutSectionProps {
  onOpenBooking: () => void;
}

export const AboutSection: React.FC<AboutSectionProps> = ({ onOpenBooking }) => {
  return (
    <section id="chi-siamo" className="section bg-white border-t border-slate-100">
      <div className="container">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Vision & Value */}
          <div className="lg:col-span-6 space-y-6">
            <div className="section-tag">
              <span>Chi Siamo</span>
            </div>

            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0a192f] leading-tight">
              Consulenza assicurativa umana, radicata a Rho e senza compromessi.
            </h2>

            <p className="text-slate-600 text-base leading-relaxed">
              <strong className="text-[#0a192f]">S.F. Consulenze Assicurative</strong> nasce con una missione precisa: restituire al cliente il valore di un punto di riferimento umano, competente e indipendente nel settore della protezione assicurativa.
            </p>

            <p className="text-slate-600 text-sm leading-relaxed">
              Il referente <strong className="text-[#0a192f]">Simone Facchi</strong> e lo staff accolgono privati, famiglie, professionisti e imprese della zona di Rho e provincia. Non ci limitiamo a consegnare un preventivo: ascoltiamo le tue esigenze, analizziamo i rischi a cui sei esposto e ti guidiamo nella scelta consapevole delle garanzie.
            </p>

            {/* Core Values Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#faf8f5] border border-slate-200">
                <div className="p-2 rounded-lg bg-[#0a192f] text-[#c5a059] shrink-0">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-[#0a192f] text-sm">Plurimandato Reale</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Confronto tra più opzioni disponibili tramite intermediari e compagnie partner.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#faf8f5] border border-slate-200">
                <div className="p-2 rounded-lg bg-[#0a192f] text-[#c5a059] shrink-0">
                  <HeartHandshake size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-[#0a192f] text-sm">Trasparenza Totale</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Spiegazione chiara di cosa è coperto, cosa è escluso e di eventuali franchigie.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#faf8f5] border border-slate-200">
                <div className="p-2 rounded-lg bg-[#0a192f] text-[#c5a059] shrink-0">
                  <MapPin size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-[#0a192f] text-sm">Presenza Locale a Rho</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Ufficio fisico in Galleria M.K. Gandhi 32/14. Un referente reale sempre rintracciabile.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#faf8f5] border border-slate-200">
                <div className="p-2 rounded-lg bg-[#0a192f] text-[#c5a059] shrink-0">
                  <Users size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-[#0a192f] text-sm">Assistenza nel Tempo</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Supporto costante per rinnovi, adeguamenti e la gestione completa dei sinistri.</p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-wrap gap-4 items-center">
              <button onClick={onOpenBooking} className="btn btn-primary text-sm">
                <Calendar size={16} />
                <span>Prenota un colloquio in sede a Rho</span>
              </button>
            </div>

          </div>

          {/* Right Column: Office & Agency Card Showcase */}
          <div className="lg:col-span-6">
            <div className="bg-[#0a192f] text-white p-8 rounded-3xl border border-[rgba(197,160,89,0.3)] shadow-2xl relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#112240] text-[#c5a059] text-xs font-bold mb-6">
                <Award size={14} />
                <span>Sede Ufficiale • Galleria M.K. Gandhi 32/14</span>
              </div>

              <h3 className="text-2xl font-bold text-white">S.F. Consulenze Assicurative</h3>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">
                Un ambiente riservato e professionale a Rho, pensato per discutere con calma delle tue esigenze assicurative personali o aziendali.
              </p>

              <div className="mt-8 space-y-4 border-t border-[rgba(255,255,255,0.1)] pt-6">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-400">Referente Titolare:</span>
                  <span className="font-bold text-[#c5a059]">Simone Facchi</span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-400">Indirizzo:</span>
                  <span className="font-semibold text-white">{AGENCY_INFO.address}, Rho (MI)</span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-400">Telefono Studio:</span>
                  <a href={`tel:${AGENCY_INFO.phoneRaw}`} className="font-bold text-[#c5a059] hover:underline">
                    {AGENCY_INFO.phone}
                  </a>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-400">WhatsApp Diretto:</span>
                  <a href={`https://wa.me/${AGENCY_INFO.whatsappRaw}`} target="_blank" rel="noopener noreferrer" className="font-bold text-[#25D366] hover:underline">
                    {AGENCY_INFO.mobile}
                  </a>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-400">E-mail:</span>
                  <span className="font-semibold text-white">{AGENCY_INFO.email}</span>
                </div>
              </div>

              <div className="mt-8 p-4 rounded-xl bg-[#112240] border border-[#1e293b] text-xs text-slate-300">
                <span className="font-bold text-[#c5a059] block mb-1">Informativa sulla Trasparenza Professionale</span>
                Il nostro studio opera nel rigoroso rispetto della disciplina IVASS. I dati relativi agli intermediari e alle compagnie per cui si opera sono disponibili in sede ed oggetto di informativa precontrattuale come da normativa vigente.
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
