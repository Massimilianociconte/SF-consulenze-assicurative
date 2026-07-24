import React, { useState, useEffect } from 'react';
import { Cookie, Check, X } from 'lucide-react';

interface CookieBannerProps {
  onOpenPrivacyModal: () => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onOpenPrivacyModal }) => {
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    const consent = localStorage.getItem('sf_cookie_consent');
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 600);
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
      className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:right-6 sm:left-auto sm:max-w-md z-40 animate-fade-in"
    >
      <div className="bg-[#0a192f] text-white p-5 rounded-2xl border border-[#c5a059]/40 shadow-2xl space-y-4">
        
        {/* Banner Top Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-[#c5a059] font-bold text-sm">
            <Cookie size={18} className="shrink-0" />
            <span>Gestione Privacy e Cookie</span>
          </div>

          <button
            onClick={acceptEssentialOnly}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0"
            aria-label="Chiudi banner cookie"
          >
            <X size={15} />
          </button>
        </div>

        {/* Text */}
        <p className="text-xs text-slate-300 leading-relaxed">
          Utilizziamo cookie tecnici essenziali e strumenti analitici anonimizzati basati sul consenso per garantire la migliore esperienza di navigazione.
        </p>

        {/* Action Buttons Grid */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={acceptAll}
              className="btn btn-primary text-xs py-2.5 px-3 justify-center shadow-md font-bold w-full"
            >
              <Check size={14} />
              <span>Accetta Tutti</span>
            </button>

            <button
              onClick={acceptEssentialOnly}
              className="btn btn-outline text-xs py-2.5 px-3 justify-center text-slate-300 border-slate-600 hover:bg-[#112240] hover:text-white font-semibold w-full"
            >
              <span>Solo Necessari</span>
            </button>
          </div>

          <button
            onClick={() => {
              setVisible(false);
              onOpenPrivacyModal();
            }}
            className="text-xs text-[#c5a059] hover:underline font-semibold block w-full text-center py-1"
          >
            Informativa Privacy e Cookie
          </button>
        </div>

      </div>
    </aside>
  );
};
