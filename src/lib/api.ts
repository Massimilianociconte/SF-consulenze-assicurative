/** Client HTTP verso le API del Worker (stessa origine, cookie di sessione). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiErrorPayload {
  error?: { code?: string; message?: string; details?: { fields?: Record<string, string>; retryAfter?: number } };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Connessione non riuscita. Verifica la rete e riprova.');
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const body = (payload ?? {}) as ApiErrorPayload;
    throw new ApiError(
      response.status,
      body.error?.code ?? 'error',
      body.error?.message ?? 'Si e’ verificato un errore imprevisto. Riprova.',
      body.error?.details?.fields,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

// --- Tipi condivisi con il Worker -----------------------------------------

export interface SessionUser {
  id: string;
  email: string;
  role: 'client' | 'advisor' | 'admin';
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  hasPassword: boolean;
  marketingConsent?: boolean;
  googleLinked?: boolean;
  profileCompletion?: number;
  memberSince?: string;
}

/** Parametri della derivazione password eseguita dal browser (vedi lib/password.ts). */
export interface PasswordKdf {
  version: number;
  algorithm: string;
  iterations: number;
  saltPrefix: string;
}

export interface AppConfig {
  googleEnabled: boolean;
  turnstileSiteKey: string | null;
  privacyVersion: string;
  passwordKdf: PasswordKdf;
}

export interface PortalSummary {
  counters: {
    activePolicies: number;
    upcomingDeadlines: number;
    openClaims: number;
    openQuotes: number;
    openNegotiations: number;
    documents: number;
    unreadMessages: number;
    openRequests: number;
  };
  nextDeadlines: Array<{
    id: string;
    title: string;
    type: string;
    dueDate: string;
    amount: number | null;
    status: string;
    companyName: string | null;
    policyNumber: string | null;
    branch: string | null;
  }>;
  recentActivity: Array<{ kind: string; title: string; status: string; at: string }>;
}

export interface Deadline {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  amount: number | null;
  status: string;
  companyName: string | null;
  policyNumber: string | null;
  branch: string | null;
  notes: string | null;
}

export interface Policy {
  id: string;
  companyName: string;
  policyNumber: string;
  branch: string;
  productName: string | null;
  status: string;
  effectiveDate: string | null;
  expiryDate: string | null;
  renewalType: string | null;
  paymentFrequency: string | null;
  premium: number | null;
  insuredObject: string | null;
  plate: string | null;
  notes: string | null;
}

export interface Quote {
  id: string;
  subject: string;
  companyName: string | null;
  branch: string | null;
  premium: number | null;
  coverageSummary: string | null;
  status: string;
  validUntil: string | null;
  createdAt: string;
}

export interface Negotiation {
  id: string;
  title: string;
  stage: string;
  expectedClose: string | null;
  value: number | null;
  lastUpdate: string | null;
  notes: string | null;
}

export interface Claim {
  id: string;
  reference: string;
  status: string;
  claimType: string;
  companyName: string | null;
  companyClaimNumber: string | null;
  policyNumber: string | null;
  occurredAt: string | null;
  placeCity: string | null;
  estimatedDamage: number | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  category: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  uploadedAt: string;
  claimReference: string | null;
}

export interface ServiceRequest {
  id: string;
  reference: string;
  type: string;
  subject: string;
  detail: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageThread {
  id: string;
  subject: string;
  category: string;
  status: string;
  unread: number;
  preview: string | null;
  lastMessageAt: string;
}

export interface ThreadMessage {
  id: string;
  senderRole: 'client' | 'advisor' | 'system';
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface Profile {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  mobile: string | null;
  pec: string | null;
  fiscalCode: string | null;
  vatNumber: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  addressStreet: string | null;
  addressLocality: string | null;
  addressCity: string | null;
  addressZip: string | null;
  addressProvince: string | null;
  addressCountry: string | null;
  marketingConsent: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressSuggestion {
  id: string;
  datasetId: string;
  kind: 'street' | 'access';
  municipalityCode: string;
  istatCode: string;
  street: string;
  officialStreetName: string;
  civic: string | null;
  civicExtension: string | null;
  civicSpecificity: string | null;
  metric: string | null;
  isWithoutStandardNumber: boolean;
  locality: string | null;
  city: string;
  province: string;
  postalCode: string | null;
  postalDatasetId: string | null;
  country: string;
}

export interface ReferenceDataset {
  id: string;
  kind: 'address' | 'municipality' | 'other';
  name: string;
  publisher: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  version: string;
  sourceUpdatedAt: string | null;
  importedAt: string;
  updateFrequency: string;
  coverage: string;
  limitations: string;
  status: 'active' | 'stale';
}

export interface AddressSearchResponse {
  suggestions: AddressSuggestion[];
  datasets: ReferenceDataset[];
  minimumCharacters: number;
  manualEntryAvailable: true;
  postalCodeProvided: boolean;
}

export type ProfileChangeStatus = 'received' | 'in_review' | 'verified' | 'rejected' | 'failed';

export interface ProfileChange {
  id: string;
  status: ProfileChangeStatus;
  changedFields: string[];
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  origin: string;
  source: 'manual' | 'assisted' | 'assisted_corrected';
  sourceReferenceId: string | null;
  requestedAt: string;
  appliedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}
