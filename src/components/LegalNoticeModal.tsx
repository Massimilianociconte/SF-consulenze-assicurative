import React from 'react';
import { X, ShieldCheck, FileText, Lock, AlertCircle, ExternalLink } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';

interface LegalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalType: 'privacy' | 'cookie' | 'ivass' | 'reclami' | 'rui';
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({ isOpen, onClose, modalType }) => {
  if (!isOpen) return null;

  const titles = {
    rui: "Informazioni sull'Iscrizione RUI & Intermediario",
    ivass: "Informativa IVASS Precontrattuale & Note Legali",
    reclami: "Procedura di Gestione Reclami",
    privacy: "Informativa Privacy (Regolamento UE 2016/679 GDPR)",
    cookie: "Politica sui Cookie (Cookie Policy)"
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div 
        className="bg-white text-slate-800 w-full max-w-3xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="bg-[#0a192f] text-white p-6 border-b border-[#1e293b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck size={24} className="text-[#c5a059]" />
            <div>
              <h3 className="text-xl font-bold text-white leading-tight">
                {titles[modalType]}
              </h3>
              <p className="text-xs text-[#c5a059]">S.F. Consulenze Assicurative di Simone Facchi • Rho (MI)</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#1e293b] transition-colors"
            aria-label="Chiudi"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 max-h-[70vh] overflow-y-auto space-y-5 text-sm text-slate-700 leading-relaxed">
          
          {modalType === 'rui' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <strong>Trasparenza RUI & Registro IVASS:</strong> I dati identificativi ufficiali (Numero di iscrizione RUI, data e sezione di appartenenza) sono consultabili presso i locali dell'ufficio a Rho e resi noti nella documentazione precontrattuale consegnata ad ogni potenziale contraente prima dell'emissione della polizza.
                </div>
              </div>

              <h4 className="font-bold text-[#0a192f] text-base">Identificativo Intermediario</h4>
              <p>• <strong>Denominazione:</strong> S.F. Consulenze Assicurative di Simone Facchi</p>
              <p>• <strong>Sede Operativa:</strong> Galleria M.K. Gandhi 32/14, 20017 Rho (MI)</p>
              <p>• <strong>Contatti:</strong> Tel 02 9899 6931 | Cell 334 904 7946 | Email sfconsulenze@outlook.com</p>
              
              <h4 className="font-bold text-[#0a192f] text-base pt-2">Verifica Pubblica</h4>
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
              <h4 className="font-bold text-[#0a192f] text-base">Informativa Precontrattuale e Regolamento IVASS n. 40/2018</h4>
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
              <h4 className="font-bold text-[#0a192f] text-base">Procedura di Presentazione Reclami</h4>
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
              <h4 className="font-bold text-[#0a192f] text-base">Informativa sul Trattamento dei Dati Personali (GDPR)</h4>
              <p>
                Ai sensi dell'art. 13 del Regolamento UE 2016/679 (GDPR), informiamo che i dati personali forniti spontaneamente dagli utenti tramite i form del sito (richiesta consulenza, check-up, notifica sinistri, richiamata) vengono trattati da S.F. Consulenze Assicurative in qualità di Titolare del Trattamento.
              </p>
              <p><strong>Finalità:</strong> Risposta alle richieste di informazione, preventivazione, organizzazione degli appuntamenti ed assistenza amministrativa per i contratti assicurativi.</p>
              <p><strong>Diritti dell'interessato:</strong> In qualsiasi momento è possibile richiedere l'accesso, la rettifica o la cancellazione dei propri dati inviando una comunicazione a <span className="font-bold">sfconsulenze@outlook.com</span>.</p>
            </div>
          )}

          {modalType === 'cookie' && (
            <div className="space-y-4">
              <h4 className="font-bold text-[#0a192f] text-base">Politica sui Cookie e Strumenti di Tracciamento</h4>
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
        <div className="bg-slate-100 p-4 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} className="btn btn-[#0a192f] btn-primary text-xs">
            Ho compreso e chiudo
          </button>
        </div>

      </div>
    </div>
  );
};
