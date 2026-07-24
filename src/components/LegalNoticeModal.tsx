import React, { useEffect } from 'react';
import { X, ShieldCheck, ExternalLink, AlertCircle } from 'lucide-react';

interface LegalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalType: 'privacy' | 'cookie' | 'ivass' | 'reclami' | 'rui';
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({ isOpen, onClose, modalType }) => {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const titles = {
    rui: "Informazioni sull'Iscrizione RUI & Intermediario",
    ivass: "Informativa IVASS Precontrattuale & Note Legali",
    reclami: "Procedura di Gestione Reclami",
    privacy: "Informativa Privacy (Regolamento UE 2016/679 GDPR)",
    cookie: "Politica sui Cookie (Cookie Policy)"
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-hidden"
      onClick={onClose}
    >
      <div 
        className="bg-white text-slate-800 w-full max-w-3xl rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-auto relative flex flex-col max-h-[90vh] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="bg-[#0a192f] text-white p-4 sm:p-5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck size={22} className="text-[#c5a059] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight truncate">
                {titles[modalType]}
              </h3>
              <p className="text-[11px] sm:text-xs text-[#c5a059] truncate">S.F. Consulenze Assicurative • Simone Facchi (Rho)</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer focus:outline-none"
            aria-label="Chiudi finestra"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed flex-1">
          
          {modalType === 'rui' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <strong>Trasparenza RUI & Registro IVASS:</strong> I dati identificativi ufficiali (Numero di iscrizione RUI, data e sezione di appartenenza) sono consultabili presso i locali dell'ufficio a Rho e resi noti nella documentazione precontrattuale consegnata ad ogni potenziale contraente prima dell'emissione della polizza.
                </div>
              </div>

              <h4 className="font-bold text-[#0a192f] text-sm sm:text-base">Identificativo Intermediario</h4>
              <p>• <strong>Denominazione:</strong> S.F. Consulenze Assicurative di Simone Facchi</p>
              <p>• <strong>Sede Operativa:</strong> Galleria M.K. Gandhi 32/14, 20017 Rho (MI)</p>
              <p>• <strong>Contatti:</strong> Tel 02 9899 6931 | Cell 334 904 7946 | Email sfconsulenze@outlook.com</p>
              
              <h4 className="font-bold text-[#0a192f] text-sm sm:text-base pt-2">Verifica Pubblica</h4>
              <p>
                Gli estremi di iscrizione al RUI (Registro Unico degli Intermediari assicurativi e riassicurativi) sono pubblicamente verificabili sul sito ufficiale dell'IVASS (Istituto per la Vigilanza sulle Assicurazioni):
              </p>
              <a
                href="https://servizi.ivass.it/RUI/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm text-xs inline-flex items-center gap-2"
              >
                <span>Accedi al Registro RUI IVASS</span>
                <ExternalLink size={14} />
              </a>
            </div>
          )}

          {modalType === 'ivass' && (
            <div className="space-y-4">
              <h4 className="font-bold text-[#0a192f] text-sm sm:text-base">Informativa Precontrattuale e Regolamento IVASS n. 40/2018</h4>
              <p>
                Prima della sottoscrizione di ciascuna proposta o contratto di assicurazione, S.F. Consulenze Assicurative mette a disposizione del cliente i documenti informativi stabiliti dalla normativa vigente:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                <li>Allegato 3 (Informativa sul modello di distribuzione e sulle regole di comportamento);</li>
                <li>Allegato 4 (Elenco degli intermediari di riferimento e compagnie con cui si opera);</li>
                <li>Allegato 4-bis (Dichiarazione sulle consulenze trasparenti ed adeguatezza);</li>
                <li>DIP (Documento Informativo Precontrattuale) e DIP Aggiuntivo specifico di ciascun prodotto.</li>
              </ul>
              <p className="text-xs text-slate-500 pt-2">
                Qualsiasi proposta fornita costituisce un'indicazione orientativa soggetta a verifica delle condizioni di assumibilità da parte dell'impresa di assicurazione emittente.
              </p>
            </div>
          )}

          {modalType === 'reclami' && (
            <div className="space-y-4">
              <h4 className="font-bold text-[#0a192f] text-sm sm:text-base">Procedura di Presentazione Reclami</h4>
              <p>
                Eventuali reclami relativi al rapporto contrattuale o al comportamento dell'intermediario o dei suoi collaboratori possono essere inoltrati a S.F. Consulenze Assicurative tramite raccomandata A/R indirizzata a:
              </p>
              <div className="p-3 rounded-lg bg-slate-100 font-mono text-xs text-[#0a192f]">
                S.F. Consulenze Assicurative di Simone Facchi<br />
                Galleria M.K. Gandhi 32/14 - 20017 Rho (MI)<br />
                Oppure a mezzo Email: sfconsulenze@outlook.com
              </div>
              <p className="text-xs text-slate-600">
                Qualora il cliente non si ritenga soddisfatto dell'esito del reclamo o in caso di mancata risposta nei termini di legge (45 giorni), è possibile rivolgersi all'IVASS (Servizio Tutela del Consumatore, Via del Quirinale 21 - 00187 Roma), corredando l'esposto della documentazione relativa al reclamo trattato dall'intermediario o dalla compagnia.
              </p>
            </div>
          )}

          {modalType === 'privacy' && (
            <div className="space-y-4">
              <h4 className="font-bold text-[#0a192f] text-sm sm:text-base">Informativa sul Trattamento dei Dati Personali (GDPR)</h4>
              <p>
                Ai sensi dell'art. 13 del Regolamento UE 2016/679 (GDPR), informiamo che i dati personali forniti spontaneamente dagli utenti tramite i form del sito (richiesta consulenza, check-up, notifica sinistri, richiamata) vengono trattati da S.F. Consulenze Assicurative in qualità di Titolare del Trattamento.
              </p>
              <p><strong>Finalità:</strong> Risposta alle richieste di informazione, preventivazione, organizzazione degli appuntamenti ed assistenza amministrativa per i contratti assicurativi.</p>
              <p><strong>Diritti dell'interessato:</strong> In qualsiasi momento è possibile richiedere l'accesso, la rettifica o la cancellazione dei propri dati inviando una comunicazione a <span className="font-bold">sfconsulenze@outlook.com</span>.</p>
            </div>
          )}

          {modalType === 'cookie' && (
            <div className="space-y-4">
              <h4 className="font-bold text-[#0a192f] text-sm sm:text-base">Politica sui Cookie e Strumenti di Tracciamento</h4>
              <p>
                Questo sito web utilizza esclusivamente cookie tecnici essenziali al corretto funzionamento della navigazione (es. gestione delle sessioni dei form) e cookie analitici anonimizzati basati sul consenso dell'utente per misurare il traffico aggregato.
              </p>
              <p className="text-xs text-slate-600">
                Non vengono utilizzati cookie di profilazione o cessione di dati a terzi a fini pubblicitari senza esplicita autorizzazione preventiva. È possibile modificare le preferenze di tracciamento in qualsiasi momento tramite il banner consensi.
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-100 p-3.5 border-t border-slate-200 flex justify-end shrink-0">
          <button onClick={onClose} className="btn btn-primary text-xs py-2 px-4">
            Ho compreso e chiudo
          </button>
        </div>

      </div>
    </div>
  );
};
