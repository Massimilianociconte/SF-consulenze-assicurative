import React, { useState } from 'react';
import { SOLUTIONS, SolutionItem } from '../data/content';
import { User, Building2, CheckCircle2, ArrowRight, Shield, AlertCircle } from 'lucide-react';

interface SolutionsSectionProps {
  onSelectSolution: (solutionTitle: string) => void;
}

export const SolutionsSection: React.FC<SolutionsSectionProps> = ({ onSelectSolution }) => {
  const [activeTab, setActiveTab] = useState<'privati' | 'imprese'>('privati');

  const filteredSolutions = SOLUTIONS.filter(s => s.category === activeTab);

  return (
    <section id="soluzioni" className="section bg-white">
      <div className="container">
        
        <div className="section-header">
          <div className="section-tag">
            <span>Ambiti di Intervento</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0a192f] mt-2">
            Soluzioni costruite sulla tua realtà
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600">
            Che tu sia un privato, una famiglia o il titolare di un'attività a Rho e provincia, analizziamo i tuoi rischi reali prima di proporre qualsiasi copertura.
          </p>

          {/* Filter Tabs */}
          <div className="mt-6 sm:mt-8 inline-flex p-1.5 rounded-2xl bg-[#f4f0ea] border border-slate-200 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('privati')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                activeTab === 'privati'
                  ? 'bg-[#0a192f] text-[#c5a059] shadow-md'
                  : 'text-slate-600 hover:text-[#0a192f]'
              }`}
            >
              <User size={16} />
              <span>Privati e Famiglie</span>
            </button>

            <button
              onClick={() => setActiveTab('imprese')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                activeTab === 'imprese'
                  ? 'bg-[#0a192f] text-[#c5a059] shadow-md'
                  : 'text-slate-600 hover:text-[#0a192f]'
              }`}
            >
              <Building2 size={16} />
              <span>Professionisti & Imprese</span>
            </button>
          </div>
        </div>

        {/* Notice Disclaimer Badge */}
        <div className="mb-8 p-4 rounded-xl bg-[#faf8f5] border border-[rgba(197,160,89,0.3)] text-xs text-slate-600 flex items-start gap-3 max-w-3xl mx-auto">
          <AlertCircle size={18} className="text-[#c5a059] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-[#0a192f]">Nota di Trasparenza IVASS: </span>
            Tutti i contratti assicurativi prevedono limiti, franchigie ed esclusioni specifiche. Durante la consulenza personalizzata con Simone Facchi verificheremo le opzioni disponibili attraverso la nostra rete di intermediari e compagnie.
          </div>
        </div>

        {/* Solutions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {filteredSolutions.map((solution) => (
            <div
              key={solution.id}
              className="card bg-white rounded-2xl border border-slate-200 hover:border-[#c5a059] shadow-sm hover:shadow-xl transition-all flex flex-col justify-between p-5 sm:p-8 relative overflow-hidden group"
            >
              <div className="space-y-4">
                {/* Header row: wrap elements cleanly to prevent collisions on mobile */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="badge-pill badge-gold shrink-0">
                    <Shield size={12} />
                    {solution.tag}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold shrink-0">Consulenza Dedicata</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-extrabold text-[#0a192f] group-hover:text-[#c5a059] transition-colors leading-tight">
                  {solution.title}
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-[#c5a059]">
                  {solution.subtitle}
                </p>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {solution.description}
                </p>

                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <span className="text-[11px] font-bold text-[#0a192f] uppercase tracking-wider block">
                    Cosa analizziamo per te:
                  </span>
                  {solution.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                      <CheckCircle2 size={14} className="text-[#c5a059] shrink-0 mt-0.5" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-5 mt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500 italic">Studio di Rho (MI)</span>
                <button
                  onClick={() => onSelectSolution(solution.title)}
                  className="btn btn-outline btn-sm group-hover:bg-[#0a192f] group-hover:text-white group-hover:border-[#0a192f] w-full sm:w-auto justify-center text-xs py-2 px-4"
                >
                  <span>Richiedi informazioni</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Tailored Bottom Banner */}
        <div className="mt-10 sm:mt-12 text-center bg-[#faf8f5] p-6 sm:p-8 rounded-2xl border border-slate-200">
          <h3 className="text-lg sm:text-xl font-bold text-[#0a192f]">
            Hai esigenze particolari o più polizze da riorganizzare?
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-xl mx-auto">
            Spesso chi possiede più contratti stipulati in tempi diversi paga coperture doppie o rischia scoperti. Richiedi una verifica globale senza impegno.
          </p>
          <div className="mt-5 flex justify-center">
            <a href="#checkup" className="btn btn-primary text-xs sm:text-sm py-3 px-5 w-full sm:w-auto text-center whitespace-normal shadow-lg font-bold">
              Attiva il Check-up Gratuito del Portafoglio
            </a>
          </div>
        </div>

      </div>
    </section>
  );
};
