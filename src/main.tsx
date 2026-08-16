import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import './index.css';
import { AuthLoading, AuthProvider, RedirectIfAuthenticated, RequireAuth } from './lib/auth';
import LoginPage from './auth/LoginPage';
import RegisterPage from './auth/RegisterPage';
import ForgotPasswordPage from './auth/ForgotPasswordPage';
import ResetPasswordPage from './auth/ResetPasswordPage';
import VerifyEmailPage from './auth/VerifyEmailPage';
import PortalLayout from './portal/PortalLayout';
import DashboardPage from './portal/DashboardPage';
import MessagesPage from './portal/MessagesPage';
import ProfilePage from './portal/ProfilePage';
import DocumentsPage from './portal/DocumentsPage';
import ClaimDetailPage from './portal/ClaimDetailPage';
import {
  ClaimsPage,
  DeadlinesPage,
  NegotiationsPage,
  PoliciesPage,
  QuotesPage,
  RequestsPage,
} from './portal/sections';

/**
 * Caricamento differito per le parti pesanti o usate da pochi:
 *  - il modulo guidato sinistri porta con se' pdf.js (lettura dei documenti);
 *  - il gestionale serve solo al consulente.
 * Cosi' il cliente che apre l'area riservata scarica solo cio' che usa.
 */
const ClaimWizardPage = lazy(() => import('./portal/ClaimWizardPage'));
const GestionaleLayout = lazy(() => import('./gestionale/GestionaleLayout'));
const RequireAdvisor = lazy(() =>
  import('./gestionale/GestionaleLayout').then((module) => ({ default: module.RequireAdvisor })),
);
const GestionaleDashboard = lazy(() => import('./gestionale/GestionaleDashboard'));
const GestionaleClients = lazy(() =>
  import('./gestionale/GestionaleClients').then((module) => ({ default: module.GestionaleClients })),
);
const GestionaleClientDetail = lazy(() =>
  import('./gestionale/GestionaleClients').then((module) => ({ default: module.GestionaleClientDetail })),
);
const GestionaleClaimsQueue = lazy(() =>
  import('./gestionale/GestionaleClaims').then((module) => ({ default: module.GestionaleClaimsQueue })),
);
const GestionaleClaimWork = lazy(() =>
  import('./gestionale/GestionaleClaims').then((module) => ({ default: module.GestionaleClaimWork })),
);
const GestionaleRequests = lazy(() =>
  import('./gestionale/GestionaleMisc').then((module) => ({ default: module.GestionaleRequests })),
);
const GestionaleStorage = lazy(() =>
  import('./gestionale/GestionaleMisc').then((module) => ({ default: module.GestionaleStorage })),
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<AuthLoading label="Caricamento…" />}>
          <Routes>
          {/* Sito pubblico */}
          <Route path="/" element={<App />} />

          {/* Autenticazione */}
          <Route
            path="/accedi"
            element={
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/registrati"
            element={
              <RedirectIfAuthenticated>
                <RegisterPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route path="/password-dimenticata" element={<ForgotPasswordPage />} />
          <Route path="/reimposta-password" element={<ResetPasswordPage />} />
          <Route path="/verifica-email" element={<VerifyEmailPage />} />

          {/* Area riservata */}
          <Route
            path="/area-riservata"
            element={
              <RequireAuth>
                <PortalLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="scadenze" element={<DeadlinesPage />} />
            <Route path="polizze" element={<PoliciesPage />} />
            <Route path="preventivi" element={<QuotesPage />} />
            <Route path="trattative" element={<NegotiationsPage />} />
            <Route path="sinistri" element={<ClaimsPage />} />
            <Route path="sinistri/nuovo" element={<ClaimWizardPage />} />
            <Route path="sinistri/:id" element={<ClaimDetailPage />} />
            <Route path="comunicazioni" element={<MessagesPage />} />
            <Route path="documenti" element={<DocumentsPage />} />
            <Route path="richieste" element={<RequestsPage />} />
            <Route path="profilo" element={<ProfilePage />} />
          </Route>

          {/* Gestionale del consulente */}
          <Route
            path="/gestionale"
            element={
              <RequireAdvisor>
                <GestionaleLayout />
              </RequireAdvisor>
            }
          >
            <Route index element={<GestionaleDashboard />} />
            <Route path="clienti" element={<GestionaleClients />} />
            <Route path="clienti/:id" element={<GestionaleClientDetail />} />
            <Route path="sinistri" element={<GestionaleClaimsQueue />} />
            <Route path="sinistri/:id" element={<GestionaleClaimWork />} />
            <Route path="richieste" element={<GestionaleRequests />} />
            <Route path="archivio" element={<GestionaleStorage />} />
          </Route>

          {/* Qualsiasi altro percorso torna al sito pubblico */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
