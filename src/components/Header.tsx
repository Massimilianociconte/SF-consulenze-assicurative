import React, { useState, useEffect, useRef } from 'react';
import { Phone, MessageCircle, MapPin, Menu, X, Calendar, Shield, ChevronRight, Sparkles, Award } from 'lucide-react';
import { AGENCY_INFO } from '../data/content';
import logoImg from '../assets/logo.png';

interface HeaderProps {
  onOpenBooking: (subject?: string) => void;
  onOpenLegal: (type: string) => void;
  activeSection: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenBooking, onOpenLegal, activeSection }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navBottomOffset, setNavBottomOffset] = useState<number>(80);
  
  const navRef = useRef<HTMLDivElement>(null);

  // Measure exact bottom position of navbar for mobile drawer alignment
  const updateNavOffset = () => {
    if (navRef.current) {
      const rect = navRef.current.getBoundingClientRect();
      setNavBottomOffset(rect.bottom);
    }
  };

  useEffect(() => {
    updateNavOffset();
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
      updateNavOffset();
    };
    const handleResize = () => {
      updateNavOffset();
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      updateNavOffset();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { href: "#home", label: "Home", shortLabel: "Home", badge: "Inizio" },
    { href: "#soluzioni", label: "Soluzioni Assicurative", shortLabel: "Soluzioni", badge: "Privati & Imprese" },
    { href: "#checkup", label: "Check-up Polizze", shortLabel: "Check-up", badge: "Gratuito" },
    { href: "#sinistri", label: "Sinistri e Assistenza", shortLabel: "Sinistri", badge: " h24 Direct" },
    { href: "#chi-siamo", label: "Chi siamo", shortLabel: "Chi siamo", badge: "Rho (MI)" },
    { href: "#faq", label: "FAQ", shortLabel: "FAQ", badge: "Risposte" },
    { href: "#contatti", label: "Contatti", shortLabel: "Contatti", badge: "Galleria Gandhi" }
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-40 transition-all duration-300">
      
      {/* 1. Top Utility Contact Bar */}
      <div className="bg-[#050c17] text-slate-300 text-xs py-1.5 border-b border-[#1e293b]/60">
        <div className="container mx-auto px-4 flex items-center justify-between gap-2 max-w-7xl">
          
          {/* Left Info */}
          <div className="flex items-center gap-3 text-slate-300 overflow-hidden">
            <span className="inline-flex items-center gap-1.5 font-medium truncate text-[11px] sm:text-xs">
              <MapPin size={12} className="text-[#c5a059] shrink-0" />
              <span className="truncate">{AGENCY_INFO.address}, Rho (MI)</span>
            </span>
            
            <span className="hidden md:inline-block text-slate-700">|</span>
            
            <span className="hidden md:inline-flex items-center gap-1.5 text-slate-400 text-xs">
              <Shield size={12} className="text-[#c5a059] shrink-0" />
              <span>Plurimandatario Assicurativo</span>
            </span>
          </div>

          {/* Right Direct Contacts */}
          <div className="flex items-center gap-3 shrink-0 text-[11px] sm:text-xs">
            <a 
              href={`tel:${AGENCY_INFO.phoneRaw}`} 
              className="inline-flex items-center gap-1 hover:text-[#c5a059] font-semibold transition-colors"
            >
              <Phone size={12} className="text-[#c5a059]" />
              <span className="hidden sm:inline">Tel:</span>
              <span>{AGENCY_INFO.phone}</span>
            </a>

            <span className="text-slate-700">|</span>

            <a 
              href={`https://wa.me/${AGENCY_INFO.whatsappRaw}?text=Buongiorno%20Simone,%20desidero%20informazioni`}
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#25D366] hover:brightness-110 font-bold transition-all"
            >
              <MessageCircle size={12} />
              <span>WhatsApp</span>
            </a>
          </div>

        </div>
      </div>

      {/* 2. Main Glass Navbar */}
      <nav 
        ref={navRef}
        className={`transition-all duration-300 ${
          isScrolled 
            ? 'bg-[#0a192f]/95 backdrop-blur-md py-2 shadow-xl border-b border-[#c5a059]/25' 
            : 'bg-[#0a192f] py-3 border-b border-white/10'
        }`}
      >
        <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between gap-2 xl:gap-3 max-w-7xl">
          
          {/* Left: Brand Identity (Logo on mobile w-10, Logo + Title on desktop) */}
          <div className="flex items-center justify-start w-10 lg:w-auto shrink-0">
            <a href="#home" className="flex items-center gap-2 xl:gap-2.5 group focus:outline-none shrink-0">
              {/* Circular Logo Frame */}
              <div className="w-10 h-10 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] shadow-md flex items-center justify-center p-[2px] shrink-0 group-hover:scale-105 transition-transform">
                <img 
                  src={logoImg} 
                  alt="S.F. Consulenze Assicurative" 
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
              
              {/* Desktop Brand Title */}
              <div className="hidden lg:flex flex-col shrink-0">
                <span className="font-extrabold text-white tracking-tight text-xs xl:text-sm 2xl:text-base leading-tight group-hover:text-[#c5a059] transition-colors whitespace-nowrap">
                  S.F. Consulenze Assicurative
                </span>
                <span className="text-[10px] xl:text-[11px] text-[#c5a059] font-semibold tracking-wide whitespace-nowrap hidden 2xl:block">
                  Simone Facchi • Rho (MI)
                </span>
              </div>
            </a>
          </div>

          {/* Middle: Mobile Centered CTA Button & Desktop Navigation Links */}
          <div className="flex-1 flex items-center justify-center lg:justify-start lg:gap-1 xl:gap-1.5 shrink">
            {/* Mobile CTA Button - Perfectly Centered between Logo (w-10) and Hamburger Toggle (w-10) */}
            <button
              onClick={() => onOpenBooking()}
              className="lg:hidden btn btn-primary text-xs py-2 px-3 shadow-lg font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Calendar size={14} className="shrink-0" />
              <span>Prenota consulenza</span>
            </button>

            {/* Desktop Navigation Links */}
            <div className="hidden lg:flex items-center gap-1 xl:gap-1.5 shrink">
              {navLinks.map((link) => {
                const isActive = activeSection === link.href.substring(1);
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className={`px-2 py-1.5 xl:px-2.5 xl:py-2 rounded-lg text-xs xl:text-xs 2xl:text-sm font-semibold transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-[#112240] text-[#c5a059] border border-[#c5a059]/30 shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="xl:hidden">{link.shortLabel}</span>
                    <span className="hidden xl:inline">{link.label}</span>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Right: Desktop CTA Button & Mobile Menu Toggle */}
          <div className="flex items-center justify-end w-10 lg:w-auto shrink-0 gap-2">
            {/* Desktop CTA Button */}
            <button
              onClick={() => onOpenBooking()}
              className="hidden lg:flex btn btn-primary text-xs xl:text-xs 2xl:text-sm py-2 px-3 xl:py-2.5 xl:px-3.5 shadow-lg font-bold whitespace-nowrap shrink-0 items-center gap-1.5"
            >
              <Calendar size={14} className="shrink-0" />
              <span>Prenota consulenza</span>
            </button>

            {/* Mobile / Tablet Menu Toggle (exact w-10 h-10 matching logo w-10 h-10) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-white w-10 h-10 rounded-xl bg-[#112240] hover:bg-[#1e293b] border border-white/10 flex items-center justify-center transition-all focus:outline-none shrink-0 active:scale-95"
              aria-label={mobileMenuOpen ? "Chiudi menu" : "Apri menu"}
            >
              {mobileMenuOpen ? (
                <X size={20} className="text-[#c5a059] rotate-90 transition-transform duration-300" />
              ) : (
                <Menu size={20} className="transition-transform duration-300" />
              )}
            </button>
          </div>

        </div>
      </nav>

      {/* 3. Refined Mobile Native Drawer Overlay */}
      {mobileMenuOpen && (
        <div 
          style={{ top: `${navBottomOffset}px` }}
          className="lg:hidden fixed left-0 right-0 bottom-0 z-50 bg-[#050c17]/97 backdrop-blur-2xl flex flex-col justify-between p-5 border-t border-[#c5a059]/30 animate-drawer-open overflow-y-auto"
        >
          
          <div className="space-y-2 pt-1">
            
            {/* Refined Header Tag */}
            <div className="flex items-center justify-between px-2 mb-3 pb-2 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[#c5a059]" />
                <span className="text-[11px] font-bold text-[#c5a059] uppercase tracking-wider">
                  Menu Consulenza
                </span>
              </div>
              <span className="text-[10px] text-slate-300 font-semibold px-2.5 py-0.5 rounded-full bg-[#112240] border border-[#c5a059]/30 flex items-center gap-1">
                <Award size={10} className="text-[#c5a059]" />
                <span>Studio Rho</span>
              </span>
            </div>

            {/* Navigation Cards */}
            {navLinks.map((link, idx) => {
              const isActive = activeSection === link.href.substring(1);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ animationDelay: `${(idx + 1) * 35}ms` }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl font-bold text-sm transition-all animate-stagger-item ${
                    isActive
                      ? 'bg-gradient-to-r from-[#112240] via-[#1a2d4c] to-[#0a192f] text-[#c5a059] border border-[#c5a059]/50 shadow-xl scale-[1.01]'
                      : 'bg-[#0a192f]/80 border border-white/5 text-slate-200 hover:bg-[#112240] hover:text-white hover:border-[#c5a059]/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#c5a059] shadow-[0_0_8px_#c5a059]' : 'bg-slate-600'}`} />
                    <span className="tracking-tight">{link.label}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                      isActive ? 'bg-[#c5a059]/20 text-[#c5a059]' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {link.badge}
                    </span>
                    <ChevronRight size={16} className={isActive ? 'text-[#c5a059] translate-x-0.5' : 'text-slate-500'} />
                  </div>
                </a>
              );
            })}
          </div>

          {/* Bottom Actions in Drawer */}
          <div 
            className="pt-4 pb-2 border-t border-[#1e293b] space-y-3 animate-stagger-item" 
            style={{ animationDelay: '320ms' }}
          >
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenBooking();
              }}
              className="btn btn-primary w-full justify-center text-sm py-3.5 shadow-2xl font-bold rounded-2xl border border-[#e5c784]/40"
            >
              <Calendar size={18} />
              <span>Prenota una consulenza gratuita</span>
            </button>
            
            <a
              href={`https://wa.me/${AGENCY_INFO.whatsappRaw}?text=Buongiorno%20Simone,%20vorrei%20informazioni`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-whatsapp w-full justify-center text-sm py-3.5 font-bold rounded-2xl"
            >
              <MessageCircle size={18} />
              <span>Scrivici su WhatsApp</span>
            </a>

            <div className="text-center pt-1 text-[11px] text-slate-400">
              <span className="block font-semibold text-slate-200">S.F. Consulenze Assicurative di Simone Facchi</span>
              <span>{AGENCY_INFO.address}, Rho (MI) • Tel: {AGENCY_INFO.phone}</span>
            </div>
          </div>

        </div>
      )}

    </header>
  );
};
