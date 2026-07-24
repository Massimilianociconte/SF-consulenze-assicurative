import React, { useState } from 'react';
import { FAQ_ITEMS, FaqItem } from '../data/content';
import { Search, ChevronDown, HelpCircle, MessageSquare } from 'lucide-react';

export const FaqSection: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('tutte');
  const [openId, setOpenId] = useState<string | null>('1');

  const filteredFaqs = FAQ_ITEMS.filter((faq) => {
    const matchesCategory = activeCategory === 'tutte' || faq.category === activeCategory;
    const matchesSearch = 
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <section id="faq" className="section bg-[#faf8f5]">
      <div className="container">
        
        <div className="section-header">
          <div className="section-tag">
            <HelpCircle size={14} />
            <span>Domande Frequenti</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#0a192f] mt-2">
            Risposte chiare ai tuoi dubbi
          </h2>
          <p className="mt-4 text-slate-600">
            Trasparenza e chiarezza sono alla base del nostro rapporto di consulenza. Trova subito le risposte alle domande più comuni.
          </p>

          {/* Search Bar & Category Filters */}
          <div className="mt-8 space-y-4 max-w-2xl mx-auto">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca una domanda o parola chiave (es. plurimandato, sinistro, preventivo)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white rounded-xl border border-slate-200 text-sm text-[#0a192f] focus:border-[#c5a059] focus:outline-none shadow-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                { id: 'tutte', label: 'Tutte le domande' },
                { id: 'plurimandato', label: 'Plurimandato' },
                { id: 'checkup', label: 'Check-up Polizze' },
                { id: 'sinistri', label: 'Sinistri' },
                { id: 'generale', label: 'Info Generali' }
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    activeCategory === cat.id
                      ? 'bg-[#0a192f] text-[#c5a059]'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* FAQ Accordion List */}
        <div className="max-w-3xl mx-auto space-y-4">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => {
              const isOpen = openId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition-all"
                >
                  <button
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-[#0a192f] text-base hover:text-[#c5a059] transition-colors"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#c5a059]' : 'text-slate-400'}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-0 text-sm text-slate-600 leading-relaxed border-t border-slate-100 mt-1">
                      <p className="pt-3">{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 bg-white rounded-xl border border-slate-200 p-6">
              <p className="text-slate-500 text-sm">Nessuna domanda trovata per "{searchTerm}".</p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setActiveCategory('tutte');
                }}
                className="mt-3 btn btn-outline btn-sm text-xs"
              >
                Reimposta filtri
              </button>
            </div>
          )}
        </div>

        {/* Ask Question CTA */}
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-600">
            Non hai trovato la risposta che cercavi?
          </p>
          <a
            href={`https://wa.me/393349047946?text=Buongiorno%20Simone,%20avrei%20una%20domanda...`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#25D366] hover:underline"
          >
            <span>Fai una domanda diretta su WhatsApp a Simone Facchi</span>
          </a>
        </div>

      </div>
    </section>
  );
};
