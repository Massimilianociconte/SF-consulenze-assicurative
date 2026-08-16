import React from 'react';
import { ShieldCheck, ExternalLink, MapPin, Phone, Mail, FileText, Lock } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';
import logoImg from '../assets/logo.png';

interface RegulatoryFooterProps {
  onOpenLegalModal: (modalType: 'privacy' | 'cookie' | 'ivass' | 'reclami' | 'rui') => void;
  onOpenBooking: () => void;
}

export const RegulatoryFooter: React.FC<RegulatoryFooterProps> = ({ onOpenLegalModal, onOpenBooking }) => {
  return (
    <footer className="bg-[#07111e] text-slate-300 border-t border-[#1e293b] pt-14 pb-8">
      <div className="container space-y-12">
        
        {/* Main Footer Links & Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8">
          
          {/* Brand Info Column */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] p-0.5 shadow-md shrink-0">
                <img 
                  src={logoImg} 
                  alt="S.F. Consulenze Assicurative" 
                  className="w-full h-full object-contain rounded-full" 
                />
              </div>
              <div>
                <span className="font-bold text-white tracking-tight text-base sm:text-lg leading-tight block">
                  S.F. Consulenze Assicurative
                </span>
                <span className="text-xs text-[#c5a059]">
                  Referente: Simone Facchi
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Ufficio plurimandatario attivo nella consulenza e distribuzione assicurativa a Rho (MI). Soluzioni personalizzate per privati, famiglie, professionisti e piccole imprese.
            </p>

            <div className="space-y-2 text-xs text-slate-300 pt-2">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-[#c5a059] shrink-0" />
                <span>{AGENCY_INFO.fullAddress}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-[#c5a059] shrink-0" />
                <a href={`tel:${AGENCY_INFO.phoneRaw}`} className="hover:text-[#c5a059] transition-colors">
                  Tel: {AGENCY_INFO.phone} • Cell/WA: {AGENCY_INFO.mobile}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-[#c5a059] shrink-0" />
                <a href={`mailto:${AGENCY_INFO.email}`} className="hover:text-[#c5a059] transition-colors">
                  {AGENCY_INFO.email}
                </a>
              </div>
            </div>
          </div>

          {/* Quick Navigation Links */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Navigazione</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="#home" className="hover:text-[#c5a059] transition-colors">Home</a></li>
              <li><a href="#soluzioni" className="hover:text-[#c5a059] transition-colors">Soluzioni Assicurative</a></li>
              <li><a href="#checkup" className="hover:text-[#c5a059] transition-colors">Check-up Polizze</a></li>
              <li><a href="#sinistri" className="hover:text-[#c5a059] transition-colors">Assistenza Sinistri</a></li>
              <li><a href="#chi-siamo" className="hover:text-[#c5a059] transition-colors">Chi Siamo</a></li>
              <li><a href="#faq" className="hover:text-[#c5a059] transition-colors">FAQ</a></li>
              <li><a href="#contatti" className="hover:text-[#c5a059] transition-colors">Contatti</a></li>
            </ul>
          </div>

          {/* Regulatory & Institutional Links */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Trasparenza & IVASS</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => onOpenLegalModal('rui')} className="hover:text-[#c5a059] transition-colors text-left flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[#c5a059]" />
                  <span>Informazioni Iscrizione RUI</span>
                </button>
              </li>
              <li>
                <button onClick={() => onOpenLegalModal('ivass')} className="hover:text-[#c5a059] transition-colors text-left flex items-center gap-1.5">
                  <FileText size={13} className="text-[#c5a059]" />
                  <span>Informativa IVASS Precontrattuale</span>
                </button>
              </li>
              <li>
                <button onClick={() => onOpenLegalModal('reclami')} className="hover:text-[#c5a059] transition-colors text-left flex items-center gap-1.5">
                  <FileText size={13} className="text-[#c5a059]" />
                  <span>Procedura Gestione Reclami</span>
                </button>
              </li>
              <li>
                <button onClick={() => onOpenLegalModal('privacy')} className="hover:text-[#c5a059] transition-colors text-left flex items-center gap-1.5">
                  <Lock size={13} className="text-[#c5a059]" />
                  <span>Privacy Policy (GDPR)</span>
                </button>
              </li>
              <li>
                <button onClick={() => onOpenLegalModal('cookie')} className="hover:text-[#c5a059] transition-colors text-left flex items-center gap-1.5">
                  <Lock size={13} className="text-[#c5a059]" />
                  <span>Cookie Policy & Consensi</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Official Portals & Verification */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Portali Istituzionali</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Verifica pubblica delle qualifiche e dei servizi assicurativi sui registri ufficiali dello Stato italiano.
            </p>
            <div className="space-y-2 pt-1">
              <a
                href="https://servizi.ivass.it/RUI/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-[#0a192f] border border-[#1e293b] hover:border-[#c5a059] text-xs font-semibold text-slate-200 hover:text-white flex items-center justify-between transition-colors"
              >
                <span>Registro Unico Intermediari (RUI IVASS)</span>
                <ExternalLink size={13} className="text-[#c5a059]" />
              </a>

              <a
                href="https://www.preventivass.it/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-[#0a192f] border border-[#1e293b] hover:border-[#c5a059] text-xs font-semibold text-slate-200 hover:text-white flex items-center justify-between transition-colors"
              >
                <span>Preventivass (IVASS & MIMIT)</span>
                <ExternalLink size={13} className="text-[#c5a059]" />
              </a>
            </div>
          </div>

        </div>

        {/* Regulatory Disclosure Banner (Mandatory IVASS Disclaimers) */}
        <div className="p-5 rounded-2xl bg-[#0a192f] border border-[#1e293b] text-xs text-slate-400 space-y-3 leading-relaxed">
          <div className="flex items-center gap-2 text-[#c5a059] font-bold">
            <ShieldCheck size={16} />
            <span>Informazioni di Trasparenza Regolamentare IVASS</span>
          </div>

          <p>
            <strong>S.F. Consulenze Assicurative di Simone Facchi</strong> opera nel settore della consulenza e distribuzione assicurativa in qualità di intermediario plurimandatario con sede dichiarata a Rho (MI), Galleria M.K. Gandhi 32/14.
          </p>

          <p>
            In adempimento agli obblighi di trasparenza stabiliti dal Codice delle Assicurazioni Private e dal Regolamento IVASS n. 40/2018, la documentazione informativa precontrattuale (Allegati 3, 4, 4-bis RUI e DIP Aggiuntivi) ed il dettaglio completo degli intermediari e delle compagnie partner per cui opera lo studio sono resi disponibili e consegnati al cliente prima della sottoscrizione di ogni contratto o direttamente consultabili in sede.
          </p>

          <p className="text-[11px] text-slate-500">
            Nessun contenuto di questo sito web costituisce sollecitazione al pubblico risparmio né garanzia automatica di risparmio economico o copertura indiscriminata. Le condizioni contrattuali ufficiali prevalgono in ogni caso.
          </p>
        </div>

        {/* Bottom Copyright & Credits */}
        <div className="pt-6 border-t border-[#1e293b] flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} S.F. Consulenze Assicurative di Simone Facchi • Galleria M.K. Gandhi 32/14, 20017 Rho (MI)</p>
          <div className="flex items-center gap-4">
            <button onClick={() => onOpenLegalModal('privacy')} className="hover:underline">Privacy</button>
            <span>•</span>
            <button onClick={() => onOpenLegalModal('cookie')} className="hover:underline">Cookie</button>
            <span>•</span>
            <button onClick={() => onOpenLegalModal('ivass')} className="hover:underline">Note Legali</button>
            <span>•</span>
            <a
              href="https://webnovis.it/"
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="hover:underline"
            >
              WebNovis
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
};
