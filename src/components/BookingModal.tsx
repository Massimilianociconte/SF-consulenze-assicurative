import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Phone, Video, Send, CheckCircle2, ShieldCheck } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSubject?: string;
}

export const BookingModal: React.FC<BookingModalProps> = ({ isOpen, onClose, initialSubject }) => {
  const [modality, setModality] = useState<'sede' | 'telefono' | 'video'>('sede');
  const [subject, setSubject] = useState<string>(initialSubject || 'Check-up generale polizze');
  const [date, setDate] = useState<string>('');
  const [timeSlot, setTimeSlot] = useState<string>('10:00');
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [gdpr, setGdpr] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  useEffect(() => {
    if (initialSubject) {
      setSubject(initialSubject);
    }
  }, [initialSubject]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !gdpr) {
      alert('Per favore compila il nome, il telefono e accetta la privacy.');
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      
      <div 
        className="bg-[#0a192f] text-white w-full max-w-2xl rounded-2xl border border-[rgba(197,160,89,0.35)] shadow-2xl overflow-hidden my-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="bg-[#112240] p-6 border-b border-[#1e293b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] p-0.5 shadow-md shrink-0">
              <img src="/logo.png" alt="SF Logo" className="w-full h-full object-contain rounded-full" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white leading-tight">
                Prenota una Consulenza Gratuita
              </h3>
              <p className="text-xs text-[#c5a059]">
                Simone Facchi • S.F. Consulenze Assicurative Rho
              </p>
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

        {/* Modal Content */}
        <div className="p-6 sm:p-8">
          
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Modality Selection */}
              <div>
                <label className="block text-xs font-bold text-[#c5a059] uppercase tracking-wider mb-2">
                  1. Scegli la modalità del colloquio
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setModality('sede')}
                    className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1 text-xs font-bold transition-all ${
                      modality === 'sede'
                        ? 'bg-[#1e293b] border-[#c5a059] text-white shadow-md'
                        : 'bg-[#07111e] border-[#1e293b] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <MapPin size={18} className={modality === 'sede' ? 'text-[#c5a059]' : ''} />
                    <span>In Sede a Rho</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModality('telefono')}
                    className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1 text-xs font-bold transition-all ${
                      modality === 'telefono'
                        ? 'bg-[#1e293b] border-[#c5a059] text-white shadow-md'
                        : 'bg-[#07111e] border-[#1e293b] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <Phone size={18} className={modality === 'telefono' ? 'text-[#c5a059]' : ''} />
                    <span>Telefonica</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModality('video')}
                    className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1 text-xs font-bold transition-all ${
                      modality === 'video'
                        ? 'bg-[#1e293b] border-[#c5a059] text-white shadow-md'
                        : 'bg-[#07111e] border-[#1e293b] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <Video size={18} className={modality === 'video' ? 'text-[#c5a059]' : ''} />
                    <span>Videocall Online</span>
                  </button>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Argomento principale della consulenza
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                >
                  <option value="Check-up generale polizze">Check-up generale polizze (Raccomandato)</option>
                  <option value="Auto e Mobilità">Auto, Moto e Mobilità</option>
                  <option value="Casa e Famiglia">Casa, Fabbricato e Famiglia</option>
                  <option value="Salute e Infortuni">Salute e Infortuni</option>
                  <option value="RC Professionale e P.IVA">RC Professionale e Partite IVA</option>
                  <option value="Protezione Azienda e Negozi">Protezione Azienda, Commercio e Negozi</option>
                  <option value="Gestione Sinistro">Assistenza per Sinistro in corso</option>
                </select>
              </div>

              {/* Date & Time Slot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Data indicativa</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Fascia Oraria</label>
                  <select
                    value={timeSlot}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  >
                    <option value="09:30">09:30 - 10:30</option>
                    <option value="10:30">10:30 - 11:30</option>
                    <option value="11:30">11:30 - 12:30</option>
                    <option value="15:00">15:00 - 16:00</option>
                    <option value="16:00">16:00 - 17:00</option>
                    <option value="17:00">17:00 - 18:30</option>
                  </select>
                </div>
              </div>

              {/* Personal Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome e Cognome *</label>
                  <input
                    type="text"
                    required
                    placeholder="Mario Rossi"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Telefono *</label>
                  <input
                    type="tel"
                    required
                    placeholder="334 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email di conferma</label>
                <input
                  type="email"
                  placeholder="mario.rossi@email.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Note o domande specifiche (opzionale)</label>
                <textarea
                  rows={2}
                  placeholder="Scrivi qui se hai richieste particolari..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[#112240] border border-[#1e293b] rounded-lg px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    required
                    checked={gdpr}
                    onChange={(e) => setGdpr(e.target.checked)}
                    className="mt-0.5 accent-[#c5a059]"
                  />
                  <span>Acconsento al trattamento dei dati personali ai sensi del Regolamento UE GDPR 2016/679 per l'organizzazione della consulenza.</span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-outline text-xs text-slate-300 border-slate-600 hover:bg-[#1e293b]"
                >
                  Annulla
                </button>
                
                <button
                  type="submit"
                  className="btn btn-primary text-sm shadow-xl"
                >
                  <Send size={16} />
                  <span>Conferma prenotazione</span>
                </button>
              </div>

            </form>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-[#c5a059] text-[#07111e] rounded-full flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle2 size={36} />
              </div>
              
              <h3 className="text-2xl font-bold text-white">Prenotazione Inviata!</h3>
              <p className="text-slate-300 text-sm max-w-md mx-auto">
                Gentile <span className="text-[#c5a059] font-bold">{name}</span>, abbiamo ricevuto la tua richiesta di appuntamento ({modality === 'sede' ? 'In sede a Rho' : modality === 'telefono' ? 'Telefonica' : 'Videocall'}) per l'argomento <strong className="text-white">{subject}</strong>.
              </p>

              <div className="p-4 rounded-xl bg-[#112240] border border-[#1e293b] text-xs text-slate-300 text-left max-w-md mx-auto space-y-1">
                <p>• <strong>Referente:</strong> Simone Facchi</p>
                <p>• <strong>Sede:</strong> Galleria M.K. Gandhi 32/14, 20017 Rho (MI)</p>
                <p>• <strong>Contatto:</strong> Ti chiameremo al numero {phone} per la conferma finale.</p>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => {
                    setSubmitted(false);
                    onClose();
                  }}
                  className="btn btn-primary text-sm"
                >
                  Chiudi e torna al sito
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
