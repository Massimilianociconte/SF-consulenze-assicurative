import React, { useState, useEffect } from 'react';
import { Cookie, Check, X, ShieldCheck } from 'lucide-react';

interface CookieBannerProps {
  onOpenPrivacyModal: () => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onOpenPrivacyModal }) => {
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    const consent = localStorage.getItem('sf_cookie_consent');
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const acceptAll = () => {
    localStorage.setItem('sf_cookie_consent', 'all');
    setVisible(false);
  };

  const acceptEssentialOnly = () => {
    localStorage.setItem('sf_cookie_consent', 'essential');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside 
      aria-label="Gestione Consensi Cookie"
      className="fixed bottom-3 left-3 right-3 sm:bottom-6 sm:right-6 sm:left-auto sm:max-w-md z-50 animate-fade-in"
    >
      <div className="bg-[#0a192f]/95 backdrop-blur-xl text-white p-5 rounded-2xl border border-[#c5a059]/40 shadow-2xl space-y-3.5">
        
        {/* Banner Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-[#c5a059] font-bold text-sm">
            <Cookie size={18} className="shrink-0" />
            <span>Gestione Privacy e Cookie</span>
          </div>

          <button
            onClick={acceptEssentialOnly}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Chiudi banner cookie"
          >
            <X size={16} />
          </button>
        </div>

        {/* Text */}
        <p className="text-xs text-slate-300 leading-relaxed">
          Utilizziamo cookie tecnici essenziali e strumenti analitici anonimizzati basati sul consenso per garantire la migliore esperienza di navigazione.
        </p>

        {/* Action Buttons Grid */}
        <div className="pt-1 flex flex-col sm:flex-row items-center gap-2">
          <button
            onClick={acceptAll}
            className="btn btn-primary text-xs w-full py-2.5 px-4 justify-center shadow-md font-bold"
          >
            <Check size={14} />
            <span>Accetta Tutti</span>
          </button>

          <button
            onClick={acceptEssentialOnly}
            className="btn btn-outline text-xs w-full py-2.5 px-4 justify-center text-slate-300 border-slate-600 hover:bg-[#112240] hover:text-white font-medium"
          >
            <span>Solo Necessari</span>
          </button>

          <button
            onClick={() => {
              setVisible(false);
              onOpenPrivacyModal();
            }}
            className="text-xs text-[#c5a059] hover:underline font-semibold w-full sm:w-auto text-center py-1.5 shrink-0"
          >
            Informativa
          </button>
        </div>

      </div>
    </aside>
  );
};
