import React, { useState } from 'react';
import { CheckSquare, ShieldCheck, FileSearch, ArrowRight, CheckCircle2, RefreshCw, Send, AlertCircle } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';

export const CheckupWizard: React.FC = () => {
  const [step, setStep] = useState<number>(1);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    city: 'Rho',
    notes: '',
    gdprConsent: false
  });
  const [submitted, setSubmitted] = useState<boolean>(false);

  const policyOptions = [
    { id: 'auto', label: 'Polizza Auto / Moto / Veicoli' },
    { id: 'casa', label: 'Casa / Fabbricato / Incendio' },
    { id: 'salute', label: 'Infortuni / Spese Mediche / Salute' },
    { id: 'rc-prof', label: 'RC Professionale / Tutela Legale' },
    { id: 'impresa', label: 'Impresa / Negozio / Laboratorio' },
    { id: 'previdenza', label: 'Vita / Piani Previdenziali' }
  ];

  const concernOptions = [
    { id: 'costi', label: 'Voglio verificare se il rapporto garanzie/premio è adeguato' },
    { id: 'duplicati', label: 'Temo di avere coperture doppie o sovrapposte' },
    { id: 'aggiornamento', label: 'Le mie polizze sono vecchie e le mie esigenze sono cambiate' },
    { id: 'franchigie', label: 'Non sono sicuro di cosa sia coperto e cosa sia escluso' },
    { id: 'sinistro-passato', label: 'Ho avuto difficoltà nella gestione di un sinistro' }
  ];

  const togglePolicy = (label: string) => {
    if (selectedPolicies.includes(label)) {
      setSelectedPolicies(selectedPolicies.filter(p => p !== label));
    } else {
      setSelectedPolicies([...selectedPolicies, label]);
    }
  };

  const toggleConcern = (label: string) => {
    if (selectedConcerns.includes(label)) {
      setSelectedConcerns(selectedConcerns.filter(c => c !== label));
    } else {
      setSelectedConcerns([...selectedConcerns, label]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.gdprConsent) {
      alert('Per favore compila il nome, il telefono e accetta l’informativa sulla privacy.');
      return;
    }
    setSubmitted(true);
  };

  return (
    <section id="checkup" className="section bg-[#0a192f] text-white">
      <div className="container">
        
        <div className="section-header text-center">
          <div className="section-tag bg-[#112240] text-[#c5a059] border-[rgba(197,160,89,0.3)]">
            <FileSearch size={14} />
            <span>Servizio Gratuito</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mt-2">
            Richiedi un Check-up delle tue polizze
          </h2>
          <p className="mt-4 text-slate-300">
            Un'analisi oggettiva dei tuoi contratti esistenti per individuare buchi di copertura, franchigie nascoste o duplicazioni inutili.
          </p>
        </div>

        {/* Main Interactive Box */}
        <div className="max-w-3xl mx-auto bg-[#112240] rounded-2xl border border-[rgba(197,160,89,0.3)] shadow-2xl p-6 sm:p-10 relative">
          
          {/* Wizard Progress Bar */}
          {!submitted && (
            <div className="mb-8">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
                <span className={step >= 1 ? 'text-[#c5a059]' : ''}>1. Polizze Attuali</span>
                <span className={step >= 2 ? 'text-[#c5a059]' : ''}>2. Obiettivi & Dubbi</span>
                <span className={step >= 3 ? 'text-[#c5a059]' : ''}>3. Dati Contatto</span>
              </div>
              <div className="w-full h-2 bg-[#0a192f] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#c5a059] to-[#e5c784] transition-all duration-300"
                  style={{ width: `${(step / 3) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* STEP 1: Select Existing Policies */}
          {step === 1 && !submitted && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-xl font-bold text-white">Quali polizze possiedi attualmente?</h3>
                <p className="text-xs text-slate-300 mt-1">Seleziona una o più opzioni che vuoi far esaminare da Simone Facchi.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {policyOptions.map((opt) => {
                  const isChecked = selectedPolicies.includes(opt.label);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => togglePolicy(opt.label)}
                      className={`p-4 rounded-xl border text-left flex items-center justify-between text-sm transition-all ${
                        isChecked
                          ? 'bg-[#1e293b] border-[#c5a059] text-white shadow-md'
                          : 'bg-[#0a192f] border-[#1e293b] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${isChecked ? 'bg-[#c5a059] border-[#c5a059] text-[#07111e]' : 'border-slate-600'}`}>
                        {isChecked && <CheckSquare size={14} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => {
                    if (selectedPolicies.length === 0) {
                      alert('Seleziona almeno una polizza o tipo di copertura da analizzare.');
                      return;
                    }
                    setStep(2);
                  }}
                  className="btn btn-primary text-sm"
                >
                  <span>Prosegui al Passaggio 2</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Concerns & Questions */}
          {step === 2 && !submitted && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-xl font-bold text-white">Qual è la priorità del tuo check-up?</h3>
                <p className="text-xs text-slate-300 mt-1">Indicaci cosa ti interessa capire meglio sui tuoi contratti attuali.</p>
              </div>

              <div className="space-y-3">
                {concernOptions.map((opt) => {
                  const isChecked = selectedConcerns.includes(opt.label);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleConcern(opt.label)}
                      className={`w-full p-4 rounded-xl border text-left flex items-center justify-between text-sm transition-all ${
                        isChecked
                          ? 'bg-[#1e293b] border-[#c5a059] text-white shadow-md'
                          : 'bg-[#0a192f] border-[#1e293b] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${isChecked ? 'bg-[#c5a059] border-[#c5a059] text-[#07111e]' : 'border-slate-600'}`}>
                        {isChecked && <CheckSquare size={14} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn btn-outline text-xs text-slate-300 border-slate-600 hover:bg-[#1e293b]"
                >
                  Torna indietro
                </button>

                <button
                  onClick={() => setStep(3)}
                  className="btn btn-primary text-sm"
                >
                  <span>Completa con i tuoi recapiti</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Contact Information */}
          {step === 3 && !submitted && (
            <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
              <div>
                <h3 className="text-xl font-bold text-white">Dove desideri ricevere il riscontro?</h3>
                <p className="text-xs text-slate-300 mt-1">Simone Facchi analizzerà la richiesta e ti ricontatterà per concordare l'esame della documentazione.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome e Cognome *</label>
                  <input
                    type="text"
                    required
                    placeholder="Es. Mario Rossi"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-[#0a192f] border border-[#1e293b] rounded-lg px-4 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Telefono per Contatto *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Es. 334 1234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-[#0a192f] border border-[#1e293b] rounded-lg px-4 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="mario.rossi@email.it"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-[#0a192f] border border-[#1e293b] rounded-lg px-4 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Comune di residenza / Sede</label>
                  <input
                    type="text"
                    placeholder="Es. Rho, Lainate, Arese..."
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-[#0a192f] border border-[#1e293b] rounded-lg px-4 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Dettagli o Note aggiuntive</label>
                <textarea
                  rows={3}
                  placeholder="Scrivi qui eventuali scadenze imminenti o dettagli sulle compagnie attuali..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-[#0a192f] border border-[#1e293b] rounded-lg px-4 py-2.5 text-white text-sm focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={formData.gdprConsent}
                    onChange={(e) => setFormData({ ...formData, gdprConsent: e.target.checked })}
                    className="mt-1 accent-[#c5a059]"
                  />
                  <span className="text-xs text-slate-300">
                    Acconsento al trattamento dei dati personali ai sensi del Regolamento UE 2016/679 (GDPR) esclusivamente per la gestione della richiesta di check-up assicurativo.
                  </span>
                </label>
              </div>

              <div className="pt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn btn-outline text-xs text-slate-300 border-slate-600 hover:bg-[#1e293b]"
                >
                  Torna indietro
                </button>

                <button
                  type="submit"
                  className="btn btn-primary text-sm shadow-xl"
                >
                  <Send size={16} />
                  <span>Invia richiesta Check-up</span>
                </button>
              </div>
            </form>
          )}

          {/* Success Screen */}
          {submitted && (
            <div className="text-center py-8 space-y-4 animate-fade-in">
              <div className="w-16 h-16 bg-[#c5a059] text-[#07111e] rounded-full flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-2xl font-bold text-white">Richiesta Check-up Inviata con Successo!</h3>
              <p className="text-slate-300 text-sm max-w-md mx-auto">
                Grazie <span className="text-[#c5a059] font-bold">{formData.name}</span>. Simone Facchi ha ricevuto la tua scheda d'analisi per il comune di {formData.city}. Ti ricontatteremo al numero <span className="font-bold">{formData.phone}</span>.
              </p>
              
              <div className="pt-4 p-4 rounded-xl bg-[#0a192f] border border-[#1e293b] text-xs text-slate-300 text-left max-w-md mx-auto">
                <span className="font-bold text-[#c5a059] block mb-1">Riepilogo indicativo:</span>
                <p>• Polizze selezionate: {selectedPolicies.join(', ') || 'Nessuna specifica'}</p>
                <p>• Sede riferimento: Galleria M.K. Gandhi 32/14, Rho</p>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setStep(1);
                    setSelectedPolicies([]);
                    setSelectedConcerns([]);
                  }}
                  className="btn btn-outline text-xs text-slate-300 border-slate-600"
                >
                  <RefreshCw size={14} />
                  <span>Nuova richiesta</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
};
