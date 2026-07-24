import React from 'react';
import { Calendar, MessageCircle, ShieldCheck, Scale, Users, CheckCircle2, ArrowRight } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';
import logoImg from '../assets/logo.png';

interface HeroProps {
  onOpenBooking: () => void;
  onOpenCheckup: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenBooking, onOpenCheckup }) => {
  return (
    <section id="home" className="pt-28 pb-16 sm:pt-36 sm:pb-24 md:pt-40 md:pb-28 bg-[#0a192f] text-white relative overflow-hidden">
      {/* Background Subtle Gradient & Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#c5a059] opacity-10 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#112240] opacity-30 blur-2xl rounded-full pointer-events-none" />

      <div className="container relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Main Hero Copy Column */}
          <div className="lg:col-span-7 space-y-5 text-center lg:text-left">
            
            {/* Plurimandate Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#112240] border border-[rgba(197,160,89,0.3)] text-[#c5a059] text-xs sm:text-sm font-semibold tracking-wide shadow-sm max-w-full">
              <ShieldCheck size={16} className="shrink-0" />
              <span className="truncate">Ufficio Plurimandatario Assicurativo a Rho</span>
            </div>

            {/* Official Agency Name on a single line */}
            <div className="pt-1 text-[#c5a059] font-extrabold text-lg sm:text-2xl tracking-tight leading-snug">
              S.F. Consulenze Assicurative <span className="hidden sm:inline">•</span> <span className="block sm:inline text-slate-300 font-semibold text-base sm:text-xl">Simone Facchi</span>
            </div>

            {/* Exact Requested Hero Title */}
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight pt-1">
              Più soluzioni assicurative. <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c5a059] via-[#e5c784] to-[#c5a059]">
                Una consulenza costruita su di te.
              </span>
            </h1>

            {/* Exact Requested Hero Text */}
            <p className="text-slate-300 text-sm sm:text-base lg:text-lg leading-relaxed max-w-2xl font-normal mx-auto lg:mx-0">
              Aiutiamo privati, famiglie e imprese a individuare le coperture più adatte, valutando le opportunità disponibili attraverso la nostra rete e accompagnandoli anche nella gestione delle polizze e degli eventuali sinistri.
            </p>

            {/* CTA Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
              <button
                onClick={onOpenBooking}
                className="btn btn-primary btn-lg w-full sm:w-auto shadow-lg text-xs sm:text-base py-3 px-6 font-bold"
              >
                <Calendar size={18} />
                <span>Prenota una consulenza</span>
              </button>

              <a
                href={`https://wa.me/${AGENCY_INFO.whatsappRaw}?text=Buongiorno%20Simone,%20desidero%20informazioni%20per%20una%20consulenza%20assicurativa`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp btn-lg w-full sm:w-auto text-xs sm:text-base py-3 px-6 font-bold"
              >
                <MessageCircle size={18} />
                <span>Scrivici su WhatsApp</span>
              </a>
            </div>

            {/* Secondary Link for Check-up */}
            <div className="pt-1 flex flex-wrap items-center justify-center lg:justify-start gap-1.5 text-xs sm:text-sm text-slate-400">
              <span>Vuoi prima verificare le tue polizze esistenti?</span>
              <a 
                href="#checkup" 
                onClick={onOpenCheckup}
                className="text-[#c5a059] hover:underline font-semibold inline-flex items-center gap-1"
              >
                <span>Richiedi un check-up polizze</span>
                <ArrowRight size={14} />
              </a>
            </div>

            {/* Trust Highlights Checklist */}
            <div className="pt-5 border-t border-[rgba(255,255,255,0.08)] grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-slate-300">
                <CheckCircle2 size={15} className="text-[#c5a059] shrink-0" />
                <span>Analisi imparziale</span>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-slate-300">
                <CheckCircle2 size={15} className="text-[#c5a059] shrink-0" />
                <span>Nessun pacchetto fisso</span>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-slate-300">
                <CheckCircle2 size={15} className="text-[#c5a059] shrink-0" />
                <span>Assistenza sinistri diretta</span>
              </div>
            </div>

          </div>

          {/* Right Card / Interactive Advisory Hero Feature */}
          <div className="lg:col-span-5">
            <div className="bg-[#112240] p-5 sm:p-7 rounded-2xl border border-[rgba(197,160,89,0.25)] shadow-2xl relative">
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] p-0.5 shadow-md shrink-0">
                    <img src={logoImg} alt="SF Logo" className="w-full h-full object-contain rounded-full" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base sm:text-lg leading-tight">S.F. Consulenze Assicurative</h3>
                    <p className="text-xs text-[#c5a059] font-medium">Referente unico: Simone Facchi</p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-[#1e293b] flex items-center justify-center text-[#c5a059] font-bold border border-[rgba(197,160,89,0.3)] text-xs shrink-0">
                  Rho
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="bg-[#0a192f] p-3.5 rounded-xl border border-[#1e293b] flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#1e293b] text-[#c5a059] shrink-0">
                    <Scale size={18} />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-xs sm:text-sm">Confronto Soluzioni plurimandatario</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Valutiamo più opzioni sul mercato tramite la nostra rete di intermediari e compagnie per proporti garanzie chiare.</p>
                  </div>
                </div>

                <div className="bg-[#0a192f] p-3.5 rounded-xl border border-[#1e293b] flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#1e293b] text-[#c5a059] shrink-0">
                    <Users size={18} />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-xs sm:text-sm">Contatto Umano & Presenza sul Territorio</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Nessun call center impersonale o bot. Risponde direttamente Simone Facchi nel suo studio di Rho (MI).</p>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-[#1e293b] to-[#112240] p-3.5 rounded-xl border border-[rgba(197,160,89,0.3)] flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Sede Ufficiale:</span>
                    <span className="text-xs font-semibold text-white">{AGENCY_INFO.address}, Rho</span>
                  </div>
                  <a
                    href={`tel:${AGENCY_INFO.phoneRaw}`}
                    className="btn btn-primary btn-sm text-xs py-1.5 px-3"
                  >
                    <span>{AGENCY_INFO.phone}</span>
                  </a>
                </div>
              </div>

              <div className="mt-4 text-center text-xs text-slate-400">
                <span>Consulta le </span>
                <a href="#contatti" className="text-[#c5a059] underline font-medium">informazioni di trasparenza e contatti</a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
