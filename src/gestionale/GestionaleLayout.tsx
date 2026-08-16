import React, { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, HardDrive, LayoutDashboard, LogOut, Menu, ShieldAlert, Users, X } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { useAuth, AuthLoading } from '../lib/auth';

const NAV = [
  { to: '/gestionale', label: 'Cruscotto', icon: LayoutDashboard, end: true },
  { to: '/gestionale/clienti', label: 'Clienti', icon: Users },
  { to: '/gestionale/sinistri', label: 'Sinistri', icon: ShieldAlert },
  { to: '/gestionale/richieste', label: 'Richieste', icon: Briefcase },
  { to: '/gestionale/archivio', label: 'Archivio documenti', icon: HardDrive },
];

/** Solo consulente e amministratore: un cliente viene rimandato alla sua area. */
export const RequireAdvisor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to={`/accedi?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  if (user.role !== 'advisor' && user.role !== 'admin') return <Navigate to="/area-riservata" replace />;
  return <>{children}</>;
};

export const GestionaleLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const nav = (
    <nav className="space-y-1" aria-label="Sezioni gestionale">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9rem] font-semibold transition-colors ${
                isActive ? 'bg-[#c5a059] text-[#07111e]' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col lg:flex-row">
      {/* Barra laterale scura: distingue a colpo d'occhio il gestionale dall'area cliente */}
      <aside className="lg:w-[240px] lg:min-h-screen bg-[#0a192f] lg:sticky lg:top-0 shrink-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:py-5">
          <Link to="/gestionale" className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full overflow-hidden bg-white border-2 border-[#c5a059] p-[2px] flex items-center justify-center shrink-0">
              <img src={logoImg} alt="" className="w-full h-full object-contain rounded-full" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-white font-bold text-[0.88rem]">S.F. Consulenze</span>
              <span className="text-[#c5a059] text-[0.66rem] font-bold tracking-wider">GESTIONALE</span>
            </span>
          </Link>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="lg:hidden w-9 h-9 rounded-lg bg-[#112240] text-white flex items-center justify-center"
            aria-label={menuOpen ? 'Chiudi menu' : 'Apri menu'}
          >
            {menuOpen ? <X size={18} className="text-[#c5a059]" /> : <Menu size={18} />}
          </button>
        </div>

        <div className={`px-3 pb-4 ${menuOpen ? 'block' : 'hidden lg:block'}`}>
          {nav}
          <div className="mt-5 pt-4 border-t border-white/10 px-1">
            <p className="text-[0.78rem] font-bold text-white truncate">
              {user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user?.email}
            </p>
            <p className="text-[0.68rem] text-slate-400 mb-3">
              {user?.role === 'admin' ? 'Amministratore' : 'Consulente'}
            </p>
            <Link to="/area-riservata" className="block text-[0.8rem] font-semibold text-slate-300 hover:text-[#c5a059] mb-2">
              Vai all’area cliente
            </Link>
            <button
              onClick={async () => {
                await logout();
                navigate('/accedi?disconnesso=1', { replace: true });
              }}
              className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-[#f87171] hover:text-[#fca5a5]"
            >
              <LogOut size={14} />
              Esci
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 lg:py-8">
        <div className="max-w-[1180px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default GestionaleLayout;
