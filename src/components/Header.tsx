import React, { useState, useEffect } from 'react';
import { Phone, MessageCircle, MapPin, Menu, X, Calendar, Shield, ChevronRight } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';
import { Logo } from './Logo';

interface HeaderProps {
  onOpenBooking: (subject?: string) => void;
  onOpenLegal: (type: string) => void;
  activeSection: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenBooking, onOpenLegal, activeSection }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prevent background scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { href: "#home", label: "Home" },
    { href: "#soluzioni", label: "Soluzioni Assicurative" },
    { href: "#checkup", label: "Check-up Polizze" },
    { href: "#sinistri", label: "Sinistri e Assistenza" },
    { href: "#chi-siamo", label: "Chi siamo" },
    { href: "#faq", label: "FAQ" },
    { href: "#contatti", label: "Contatti" }
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
      
      {/* 1. Top Utility Contact Bar */}
      <div className="bg-[#050c17] text-slate-300 text-xs py-2 border-b border-[#1e293b]/60">
        <div className="container mx-auto px-4 flex items-center justify-between gap-4">
          
          {/* Left Info */}
          <div className="flex items-center gap-4 text-slate-300">
            <span className="inline-flex items-center gap-1.5 font-medium truncate max-w-[200px] sm:max-w-none">
              <MapPin size={13} className="text-[#c5a059] shrink-0" />
              <span className="truncate">{AGENCY_INFO.address}, Rho (MI)</span>
            </span>
            
            <span className="hidden md:inline-block text-slate-700">|</span>
            
            <span className="hidden md:inline-flex items-center gap-1.5 text-slate-400">
              <Shield size={13} className="text-[#c5a059] shrink-0" />
              <span>Plurimandatario Assicurativo</span>
            </span>
          </div>

          {/* Right Direct Contacts */}
          <div className="flex items-center gap-4 shrink-0">
            <a 
              href={`tel:${AGENCY_INFO.phoneRaw}`} 
              className="inline-flex items-center gap-1.5 hover:text-[#c5a059] font-semibold transition-colors"
            >
              <Phone size={13} className="text-[#c5a059]" />
              <span className="hidden sm:inline">Tel:</span>
              <span>{AGENCY_INFO.phone}</span>
            </a>

            <span className="text-slate-700">|</span>

            <a 
              href={`https://wa.me/${AGENCY_INFO.whatsappRaw}?text=Buongiorno%20Simone,%20desidero%20informazioni`}
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#25D366] hover:brightness-110 font-bold transition-all"
            >
              <MessageCircle size={13} />
              <span>WhatsApp</span>
            </a>
          </div>

        </div>
      </div>

      {/* 2. Main Glass Navbar */}
      <nav className={`transition-all duration-300 ${
        isScrolled 
          ? 'bg-[#0a192f]/95 backdrop-blur-md py-3 shadow-xl border-b border-[#c5a059]/25' 
          : 'bg-[#0a192f] py-4 border-b border-white/10'
      }`}>
        <div className="container mx-auto px-4 flex items-center justify-between">
          
          {/* Official Logo Brand Identity */}
          <a href="#home" className="flex items-center gap-3 group focus:outline-none">
            {/* Perfectly aligned circular logo frame */}
            <div className="w-11 h-11 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] shadow-md flex items-center justify-center p-[2px] shrink-0 group-hover:scale-105 transition-transform">
              <img 
                src="/logo.png" 
                alt="S.F. Consulenze Assicurative" 
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-white tracking-tight text-base sm:text-lg leading-tight group-hover:text-[#c5a059] transition-colors">
                S.F. Consulenze Assicurative
              </span>
              <span className="text-[11px] text-[#c5a059] font-semibold tracking-wide">
                Simone Facchi • Rho (MI)
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center gap-1 xl:gap-2">
            {navLinks.map((link) => {
              const isActive = activeSection === link.href.substring(1);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg text-xs xl:text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-[#112240] text-[#c5a059] border border-[#c5a059]/30 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </div>

          {/* Action CTAs & Mobile Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenBooking()}
              className="hidden sm:inline-flex btn btn-primary text-xs md:text-sm py-2.5 px-4 md:px-5 shadow-lg"
            >
              <Calendar size={15} />
              <span>Prenota consulenza</span>
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-white p-2.5 rounded-xl bg-[#112240] hover:bg-[#1e293b] border border-white/10 flex items-center justify-center transition-colors focus:outline-none"
              aria-label={mobileMenuOpen ? "Chiudi menu" : "Apri menu"}
            >
              {mobileMenuOpen ? <X size={22} className="text-[#c5a059]" /> : <Menu size={22} />}
            </button>
          </div>

        </div>
      </nav>

      {/* 3. Mobile Native-feel Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-[96px] z-40 bg-[#07111e]/98 backdrop-blur-xl flex flex-col justify-between p-5 border-t border-[#c5a059]/20 animate-fade-in overflow-y-auto">
          
          <div className="space-y-2 pt-2">
            <span className="text-[11px] font-bold text-[#c5a059] uppercase tracking-wider block px-3 mb-2">
              Navigazione Principale
            </span>
            {navLinks.map((link) => {
              const isActive = activeSection === link.href.substring(1);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl font-bold text-sm transition-all ${
                    isActive
                      ? 'bg-[#112240] text-[#c5a059] border border-[#c5a059]/30'
                      : 'text-slate-200 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>{link.label}</span>
                  <ChevronRight size={18} className={isActive ? 'text-[#c5a059]' : 'text-slate-500'} />
                </a>
              );
            })}
          </div>

          {/* Bottom Actions in Drawer */}
          <div className="pt-6 pb-4 border-t border-slate-800/80 space-y-3">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenBooking();
              }}
              className="btn btn-primary w-full justify-center text-sm py-3.5 shadow-xl"
            >
              <Calendar size={18} />
              <span>Prenota una consulenza gratuita</span>
            </button>
            
            <a
              href={`https://wa.me/${AGENCY_INFO.whatsappRaw}?text=Buongiorno%20Simone,%20vorrei%20informazioni`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-whatsapp w-full justify-center text-sm py-3.5"
            >
              <MessageCircle size={18} />
              <span>Scrivici su WhatsApp</span>
            </a>

            <div className="text-center pt-2 text-xs text-slate-400">
              <span className="block font-semibold text-slate-300">Studio Simone Facchi</span>
              <span>{AGENCY_INFO.address}, Rho (MI) • Tel: {AGENCY_INFO.phone}</span>
            </div>
          </div>

        </div>
      )}

    </header>
  );
};
