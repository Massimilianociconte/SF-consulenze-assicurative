import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  FileSignature,
  FileText,
  FolderOpen,
  Handshake,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import logoImg from '../assets/logo.png';
import { api, ApiError, type PortalSummary } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApiResource, type Resource } from './components';

const NAV_ITEMS = [
  { to: '/area-riservata', label: 'Panoramica', icon: LayoutDashboard, end: true, counter: null },
  { to: '/area-riservata/scadenze', label: 'Scadenze', icon: CalendarClock, counter: 'upcomingDeadlines' },
  { to: '/area-riservata/polizze', label: 'Polizze e contratti', icon: FileSignature, counter: 'activePolicies' },
  { to: '/area-riservata/preventivi', label: 'Preventivi', icon: FileText, counter: 'openQuotes' },
  { to: '/area-riservata/trattative', label: 'Trattative', icon: Handshake, counter: 'openNegotiations' },
  { to: '/area-riservata/sinistri', label: 'Pratiche di sinistro', icon: ShieldAlert, counter: 'openClaims' },
  { to: '/area-riservata/comunicazioni', label: 'Comunicazioni', icon: MessageSquare, counter: 'unreadMessages' },
  { to: '/area-riservata/documenti', label: 'Documenti', icon: FolderOpen, counter: 'documents' },
  { to: '/area-riservata/richieste', label: 'Stato richieste', icon: ListChecks, counter: 'openRequests' },
  { to: '/area-riservata/profilo', label: 'Profilo e sicurezza', icon: User, counter: null },
] as const;

/** Riepilogo condiviso fra layout (badge del menu) e pagina panoramica. */
const SummaryContext = createContext<Resource<PortalSummary> | null>(null);

export function usePortalSummary(): Resource<PortalSummary> {
  const context = useContext(SummaryContext);
  if (!context) throw new Error('usePortalSummary richiede PortalLayout');
  return context;
}

function initials(firstName: string | null, lastName: string | null, email: string): string {
  const first = firstName?.trim()?.[0];
  const last = lastName?.trim()?.[0];
  if (first || last) return `${first ?? ''}${last ?? ''}`.toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

const VerifyEmailBanner: React.FC = () => {
  const { user, refresh } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setSending(true);
    setError(null);
    try {
      await api.post('/api/auth/resend-verification', { email: user.email });
      setSent(true);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invio non riuscito.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-[#f4ece0] border-b border-[rgba(197,160,89,0.4)]">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.85rem]">
        <AlertTriangle size={17} className="text-[#b38e46] shrink-0" />
        <p className="text-[#0a192f] font-semibold flex-1 min-w-[240px]">
          {sent
            ? 'Email di conferma inviata: controlla la posta (anche nello spam).'
            : 'Conferma il tuo indirizzo email per caricare documenti e aprire pratiche di sinistro.'}
        </p>
        {error && <span className="text-[#b91c1c] font-semibold">{error}</span>}
        {!sent && (
          <button onClick={resend} disabled={sending} className="btn btn-secondary btn-sm disabled:opacity-60">
            {sending ? 'Invio…' : 'Invia di nuovo'}
          </button>
        )}
      </div>
    </div>
  );
};

export const PortalLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const summary = useApiResource<PortalSummary>('/api/portal/summary');

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileNavOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
        setMobileNavOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/accedi?disconnesso=1', { replace: true });
  };

  const counters = summary.data?.counters;

  const navList = (
    <nav className="space-y-1" aria-label="Sezioni area riservata">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const count = item.counter ? counters?.[item.counter as keyof typeof counters] ?? 0 : 0;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : false}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9rem] font-semibold transition-colors ${
                isActive
                  ? 'bg-[#0a192f] text-[#c5a059] shadow-sm'
                  : 'text-[#334155] hover:bg-white hover:text-[#0a192f]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? 'text-[#c5a059]' : 'text-[#94a3b8]'} />
                <span className="flex-1">{item.label}</span>
                {item.counter && count > 0 && (
                  <span
                    className={`min-w-[22px] text-center rounded-full px-1.5 py-0.5 text-[0.7rem] font-bold ${
                      isActive ? 'bg-[#c5a059] text-[#07111e]' : 'bg-[#e8eef6] text-[#334155]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col">
      {/* Barra superiore */}
      <header className="sticky top-0 z-30 bg-[#0a192f] border-b border-[#c5a059]/25">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen((open) => !open)}
              className="lg:hidden w-10 h-10 rounded-xl bg-[#112240] border border-white/10 text-white flex items-center justify-center shrink-0"
              aria-label={mobileNavOpen ? 'Chiudi menu' : 'Apri menu'}
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X size={19} className="text-[#c5a059]" /> : <Menu size={19} />}
            </button>

            <Link to="/area-riservata" className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] p-[2px] flex items-center justify-center shrink-0">
                <img src={logoImg} alt="" className="w-full h-full object-contain rounded-full" />
              </span>
              <span className="flex flex-col leading-tight min-w-0">
                <span className="text-white font-bold text-[0.9rem] truncate">S.F. Consulenze</span>
                <span className="text-[#c5a059] text-[0.68rem] font-semibold tracking-wide">AREA RISERVATA</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-slate-300 hover:text-[#c5a059] px-3 py-2 rounded-lg transition-colors"
            >
              <ExternalLink size={14} />
              Sito pubblico
            </Link>

            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-xl bg-[#112240] border border-white/10 hover:border-[#c5a059]/40 px-2.5 py-1.5 transition-colors"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <span className="w-8 h-8 rounded-full bg-[#c5a059] text-[#07111e] font-extrabold text-[0.78rem] flex items-center justify-center">
                  {user ? initials(user.firstName, user.lastName, user.email) : '—'}
                </span>
                <span className="hidden md:block text-left leading-tight max-w-[150px]">
                  <span className="block text-white text-[0.82rem] font-bold truncate">
                    {user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user?.email}
                  </span>
                  <span className="block text-slate-400 text-[0.68rem] truncate">
                    {user?.role === 'client' ? 'Cliente' : user?.role === 'advisor' ? 'Consulente' : 'Amministratore'}
                  </span>
                </span>
                <ChevronDown size={15} className="text-slate-400" />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-[rgba(15,23,42,0.1)] shadow-lg overflow-hidden py-1.5"
                >
                  <div className="px-4 py-2.5 border-b border-[rgba(15,23,42,0.07)]">
                    <p className="text-[0.8rem] font-bold text-[#0f172a] truncate">{user?.email}</p>
                  </div>
                  <Link
                    to="/area-riservata/profilo"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[0.87rem] font-semibold text-[#334155] hover:bg-[#f4f0ea]"
                    role="menuitem"
                  >
                    <User size={16} className="text-[#94a3b8]" />
                    Profilo e sicurezza
                  </Link>
                  {(user?.role === 'advisor' || user?.role === 'admin') && (
                    <Link
                      to="/gestionale"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-[0.87rem] font-bold text-[#0a192f] hover:bg-[#f4f0ea]"
                      role="menuitem"
                    >
                      <Briefcase size={16} className="text-[#c5a059]" />
                      Vai al gestionale
                    </Link>
                  )}
                  <Link
                    to="/"
                    className="sm:hidden flex items-center gap-2.5 px-4 py-2.5 text-[0.87rem] font-semibold text-[#334155] hover:bg-[#f4f0ea]"
                    role="menuitem"
                  >
                    <ExternalLink size={16} className="text-[#94a3b8]" />
                    Sito pubblico
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.87rem] font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                    role="menuitem"
                  >
                    <LogOut size={16} />
                    Esci
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <VerifyEmailBanner />

      {/* Menu mobile a scomparsa */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 top-16 z-20 bg-[#050c17]/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)}>
          <div
            className="bg-[#faf8f5] p-4 border-b border-[rgba(15,23,42,0.1)] animate-drawer-open max-h-[calc(100vh-4rem)] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            {navList}
          </div>
        </div>
      )}

      <div className="flex-1 w-full max-w-[1240px] mx-auto px-4 sm:px-6 py-6 lg:py-8 flex gap-8">
        <aside className="hidden lg:block w-[268px] shrink-0">
          <div className="sticky top-24">
            {navList}
            <div className="mt-6 rounded-xl bg-white border border-[rgba(15,23,42,0.08)] p-4">
              <p className="text-[0.78rem] font-bold uppercase tracking-wide text-[#94a3b8] mb-1.5">Serve aiuto?</p>
              <p className="text-[0.83rem] text-[#64748b] leading-relaxed mb-3">
                Scrivi al consulente dalla sezione Comunicazioni: ti risponde direttamente in area riservata.
              </p>
              <Link to="/area-riservata/comunicazioni" className="btn btn-outline btn-sm w-full">
                <MessageSquare size={14} />
                Apri una conversazione
              </Link>
            </div>
          </div>
        </aside>

        <SummaryContext.Provider value={summary}>
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </SummaryContext.Provider>
      </div>
    </div>
  );
};

export default PortalLayout;
