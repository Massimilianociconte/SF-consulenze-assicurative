import React, { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Phone, Video, Send, CheckCircle2 } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';
import logoImg from '../assets/logo.png';

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

  // Lock body scroll when modal is open to prevent underlying site scroll
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !gdpr) {
      alert('Per favore compila il nome, il telefono e accetta la privacy.');
      return;
    }
    setSubmitted(true);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-hidden"
      onClick={onClose}
    >
      <div 
        className="bg-[#0a192f] text-white w-full max-w-2xl rounded-2xl sm:rounded-3xl border border-[#c5a059]/35 shadow-2xl overflow-hidden my-auto relative flex flex-col max-h-[90vh] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Sticky Header with prominent X button */}
        <div className="bg-[#112240] p-4 sm:p-5 border-b border-[#1e293b] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] p-0.5 shadow-md shrink-0">
              <img src={logoImg} alt="SF Logo" className="w-full h-full object-contain rounded-full" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold text-white leading-tight truncate">
                Prenota Consulenza Gratuita
              </h3>
              <p className="text-[11px] sm:text-xs text-[#c5a059] font-semibold truncate">
                Simone Facchi • Rho (MI)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer focus:outline-none"
            aria-label="Chiudi finestra"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-200">
          
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              
              {/* Modality Selection */}
              <div>
                <label className="block text-xs font-bold text-[#c5a059] uppercase tracking-wider mb-2">
                  1. Scegli la modalità del colloquio
                </label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setModality('sede')}
                    className={`p-2.5 sm:p-3 rounded-xl border text-center flex flex-col items-center gap-1 text-xs font-bold transition-all ${
                      modality === 'sede'
                        ? 'bg-[#1e293b] border-[#c5a059] text-white shadow-md'
                        : 'bg-[#07111e] border-[#1e293b] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <MapPin size={16} className={modality === 'sede' ? 'text-[#c5a059]' : ''} />
                    <span className="text-[11px] sm:text-xs">In Sede a Rho</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModality('telefono')}
                    className={`p-2.5 sm:p-3 rounded-xl border text-center flex flex-col items-center gap-1 text-xs font-bold transition-all ${
                      modality === 'telefono'
                        ? 'bg-[#1e293b] border-[#c5a059] text-white shadow-md'
                        : 'bg-[#07111e] border-[#1e293b] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <Phone size={16} className={modality === 'telefono' ? 'text-[#c5a059]' : ''} />
                    <span className="text-[11px] sm:text-xs">Telefonica</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModality('video')}
                    className={`p-2.5 sm:p-3 rounded-xl border text-center flex flex-col items-center gap-1 text-xs font-bold transition-all ${
                      modality === 'video'
                        ? 'bg-[#1e293b] border-[#c5a059] text-white shadow-md'
                        : 'bg-[#07111e] border-[#1e293b] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <Video size={16} className={modality === 'video' ? 'text-[#c5a059]' : ''} />
                    <span className="text-[11px] sm:text-xs">Videocall</span>
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
                  className="w-full bg-[#112240] border border-[#1e293b] rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Data indicativa</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Fascia Oraria</label>
                  <select
                    value={timeSlot}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome e Cognome *</label>
                  <input
                    type="text"
                    required
                    placeholder="Mario Rossi"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
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
                    className="w-full bg-[#112240] border border-[#1e293b] rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
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
                  className="w-full bg-[#112240] border border-[#1e293b] rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Note o domande specifiche (opzionale)</label>
                <textarea
                  rows={2}
                  placeholder="Scrivi qui se hai richieste particolari..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[#112240] border border-[#1e293b] rounded-xl px-3.5 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
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
                  className="btn btn-outline text-xs text-slate-300 border-slate-600 hover:bg-[#1e293b] py-2.5 px-4"
                >
                  Annulla
                </button>
                
                <button
                  type="submit"
                  className="btn btn-primary text-xs sm:text-sm py-2.5 px-5 shadow-xl font-bold"
                >
                  <Send size={15} />
                  <span>Conferma prenotazione</span>
                </button>
              </div>

            </form>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 bg-[#c5a059] text-[#07111e] rounded-full flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle2 size={32} />
              </div>
              
              <h3 className="text-xl sm:text-2xl font-bold text-white">Prenotazione Inviata!</h3>
              <p className="text-slate-300 text-xs sm:text-sm max-w-md mx-auto">
                Gentile <span className="text-[#c5a059] font-bold">{name}</span>, abbiamo ricevuto la tua richiesta di appuntamento per <strong className="text-white">{subject}</strong>.
              </p>

              <div className="p-4 rounded-xl bg-[#112240] border border-[#1e293b] text-xs text-slate-300 text-left max-w-md mx-auto space-y-1">
                <p>• <strong>Referente:</strong> Simone Facchi</p>
                <p>• <strong>Sede:</strong> {AGENCY_INFO.address}, Rho (MI)</p>
                <p>• <strong>Contatto:</strong> Ti chiameremo al numero {phone} per la conferma finale.</p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setSubmitted(false);
                    onClose();
                  }}
                  className="btn btn-primary text-xs sm:text-sm py-2.5 px-6"
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
