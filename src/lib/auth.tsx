import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, type AppConfig, type SessionUser } from './api';

interface AuthContextValue {
  user: SessionUser | null;
  config: AppConfig | null;
  loading: boolean;
  refresh: () => Promise<SessionUser | null>;
  logout: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ authenticated: boolean; user: SessionUser | null }>('/api/auth/me');
      setUser(data.authenticated ? data.user : null);
      return data.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const [, configResult] = await Promise.allSettled([refresh(), api.get<AppConfig>('/api/config')]);
      if (!active) return;
      if (configResult.status === 'fulfilled') setConfig(configResult.value);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, config, loading, refresh, logout, setUser }),
    [user, config, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return context;
}

/** Schermata di attesa mentre si verifica la sessione. */
export const AuthLoading: React.FC<{ label?: string }> = ({ label = 'Verifica in corso…' }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#faf8f5]">
    <div
      className="w-10 h-10 rounded-full border-[3px] border-[#c5a059]/30 border-t-[#c5a059] animate-spin"
      role="status"
      aria-label={label}
    />
    <p className="text-sm font-semibold text-[#64748b]">{label}</p>
  </div>
);

/** Protegge le rotte dell'area riservata. */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/accedi?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
};

/** Impedisce di aprire login/registrazione quando si e' gia' autenticati. */
export const RedirectIfAuthenticated: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to="/area-riservata" replace />;
  return <>{children}</>;
};
