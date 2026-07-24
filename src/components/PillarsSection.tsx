import React from 'react';
import { ShieldCheck, UserCheck, Scale, LifeBuoy, CheckCircle2 } from 'lucide-react';
import { CORE_PILLARS } from '../data/content';

const iconMap: Record<string, React.ReactNode> = {
  ShieldCheck: <ShieldCheck size={28} className="text-[#c5a059]" />,
  UserCheck: <UserCheck size={28} className="text-[#c5a059]" />,
  Scale: <Scale size={28} className="text-[#c5a059]" />,
  LifeBuoy: <LifeBuoy size={28} className="text-[#c5a059]" />
};

export const PillarsSection: React.FC = () => {
  return (
    <section className="section bg-[#faf8f5]">
      <div className="container">
        
        <div className="section-header">
          <div className="section-tag">
            <span>Il Nostro Metodo</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#0a192f] mt-2">
            Perché la consulenza plurimandataria fa la differenza
          </h2>
          <p className="mt-4 text-slate-600">
            A differenza delle agenzie tradizionali monomandatarie vincolate a un unico marchio, il nostro approccio parte dalle tue reali necessità per trovare la soluzione ideale.
          </p>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {CORE_PILLARS.map((pillar) => (
            <div 
              key={pillar.id}
              className="card bg-white p-6 rounded-xl border border-slate-200 hover:border-[#c5a059] shadow-sm hover:shadow-lg transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-14 h-14 rounded-xl bg-[#0a192f] flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-md">
                  {iconMap[pillar.icon]}
                </div>
                <h3 className="text-xl font-bold text-[#0a192f] mb-3 group-hover:text-[#c5a059] transition-colors">
                  {pillar.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {pillar.description}
                </p>
              </div>

              <div className="pt-4 mt-6 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-[#0a192f]">
                <CheckCircle2 size={14} className="text-[#c5a059]" />
                <span>Valore garantito dal metodo</span>
              </div>
            </div>
          ))}
        </div>

        {/* Difference Comparison Table Banner */}
        <div className="mt-12 bg-[#0a192f] text-white rounded-2xl p-6 sm:p-8 border border-[rgba(197,160,89,0.3)] shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">Confronto di Approccio</span>
              <h3 className="text-2xl font-bold text-white mt-1">
                Agenzia Monomandataria vs. S.F. Consulenze Assicurative
              </h3>
              <p className="text-slate-300 text-sm mt-2">
                Un agente monomandatario deve vendere esclusivamente i prodotti della propria compagnia. S.F. Consulenze Assicurative valuta liberamente più soluzioni sul mercato attraverso la propria rete di intermediari e compagnie.
              </p>
            </div>
            <div className="lg:col-span-4 flex justify-start lg:justify-end">
              <a href="#soluzioni" className="btn btn-primary text-sm">
                Esplora le nostre soluzioni
              </a>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
