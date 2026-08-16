import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { PillarsSection } from './components/PillarsSection';
import { SolutionsSection } from './components/SolutionsSection';
import { CheckupWizard } from './components/CheckupWizard';
import { ClaimsSection } from './components/ClaimsSection';
import { AboutSection } from './components/AboutSection';
import { FaqSection } from './components/FaqSection';
import { ContactAndMap } from './components/ContactAndMap';
import { BookingModal } from './components/BookingModal';
import { RegulatoryFooter } from './components/RegulatoryFooter';
import { LegalNoticeModal } from './components/LegalNoticeModal';
import { CookieBanner } from './components/CookieBanner';
import { Phone, MessageCircle, Calendar } from 'lucide-react';
import { AGENCY_INFO } from './data/content';

export const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>('home');
  const [bookingModalOpen, setBookingModalOpen] = useState<boolean>(false);
  const [bookingSubject, setBookingSubject] = useState<string | undefined>(undefined);
  const [legalModalOpen, setLegalModalOpen] = useState<boolean>(false);
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'cookie' | 'ivass' | 'reclami' | 'rui'>('ivass');
  const [searchParams] = useSearchParams();

  // Permette di aprire un'informativa da un link esterno alla home
  // (es. il consenso privacy nella pagina di registrazione: /?legale=privacy).
  useEffect(() => {
    const requested = searchParams.get('legale');
    const allowed = ['privacy', 'cookie', 'ivass', 'reclami', 'rui'] as const;
    if (requested && (allowed as readonly string[]).includes(requested)) {
      setLegalModalType(requested as typeof allowed[number]);
      setLegalModalOpen(true);
    }
  }, [searchParams]);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['home', 'soluzioni', 'checkup', 'sinistri', 'chi-siamo', 'faq', 'contatti'];
      const scrollPosition = window.scrollY + 200;

      for (const sectionId of sections) {
        const element = document.getElementById(sectionId);
        if (element) {
          const top = element.offsetTop;
          const height = element.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleOpenBooking = (subject?: string) => {
    setBookingSubject(subject || 'Check-up generale polizze');
    setBookingModalOpen(true);
  };

  const handleOpenLegalModal = (type: 'privacy' | 'cookie' | 'ivass' | 'reclami' | 'rui') => {
    setLegalModalType(type);
    setLegalModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#334155] flex flex-col selection:bg-[#c5a059] selection:text-[#07111e]">
      
      {/* Header Navigation */}
      <Header 
        onOpenBooking={handleOpenBooking} 
        onOpenLegal={(t) => handleOpenLegalModal(t as any)} 
        activeSection={activeSection} 
      />

      {/* Main Content Sections */}
      <main className="flex-grow">
        <Hero 
          onOpenBooking={() => handleOpenBooking()} 
          onOpenCheckup={() => {
            const checkupEl = document.getElementById('checkup');
            if (checkupEl) checkupEl.scrollIntoView({ behavior: 'smooth' });
          }} 
        />
        
        <PillarsSection />
        
        <SolutionsSection 
          onSelectSolution={(solutionTitle) => handleOpenBooking(solutionTitle)} 
        />
        
        <CheckupWizard />
        
        <ClaimsSection />
        
        <AboutSection 
          onOpenBooking={() => handleOpenBooking('Incontro conoscitivo in sede a Rho')} 
        />
        
        <FaqSection />
        
        <ContactAndMap 
          onOpenBooking={() => handleOpenBooking()} 
        />
      </main>

      {/* Regulatory IVASS Footer */}
      <RegulatoryFooter 
        onOpenLegalModal={handleOpenLegalModal}
        onOpenBooking={() => handleOpenBooking()}
      />

      {/* Modals & Banners */}
      <BookingModal 
        isOpen={bookingModalOpen} 
        onClose={() => setBookingModalOpen(false)}
        initialSubject={bookingSubject}
      />

      <LegalNoticeModal 
        isOpen={legalModalOpen}
        onClose={() => setLegalModalOpen(false)}
        modalType={legalModalType}
      />

      <CookieBanner 
        onOpenPrivacyModal={() => handleOpenLegalModal('privacy')}
      />

      {/* Floating Action Button (Mobile & Quick Access) */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
        <a
          href={`https://wa.me/${AGENCY_INFO.whatsappRaw}?text=Buongiorno%20Simone,%20desidero%20informazioni`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-13 h-13 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-2xl hover:scale-110 transition-transform p-3 border-2 border-white"
          title="Scrivici su WhatsApp"
          aria-label="Contatta su WhatsApp"
        >
          <MessageCircle size={26} />
        </a>

        <button
          onClick={() => handleOpenBooking()}
          className="w-13 h-13 rounded-full bg-[#0a192f] text-[#c5a059] flex items-center justify-center shadow-2xl hover:scale-110 transition-transform p-3 border-2 border-[#c5a059]"
          title="Prenota una consulenza"
          aria-label="Prenota consulenza"
        >
          <Calendar size={24} />
        </button>
      </div>

    </div>
  );
};

export default App;
