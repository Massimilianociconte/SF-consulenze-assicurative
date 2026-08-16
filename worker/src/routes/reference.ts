import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { enforceRateLimit } from '../lib/ratelimit';

const reference = new Hono<AppEnv>();
reference.use('*', requireAuth);

const MAX_RESULTS = 8;
const MAX_QUERY_LENGTH = 50;

function searchTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 6);
}

/**
 * Ricerca assistita su una copia D1 circoscritta e versionata di ANNCSU.
 *
 * Nessun dato personale viene inviato a terzi mentre l'utente digita. FTS5
 * interroga soltanto i record ufficiali importati; se la copertura non comprende
 * l'indirizzo cercato, il frontend continua a consentire la compilazione manuale.
 */
reference.get('/addresses', async (c) => {
  const rawQuery = (c.req.query('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const tokens = searchTokens(rawQuery);
  const requestedLimit = Number(c.req.query('limit') ?? MAX_RESULTS);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_RESULTS, Math.trunc(requestedLimit)))
    : MAX_RESULTS;

  if (rawQuery.length < 3 || tokens.length === 0) {
    return c.json(
      {
        suggestions: [],
        datasets: [],
        minimumCharacters: 3,
        manualEntryAvailable: true,
      },
      200,
      { 'Cache-Control': 'private, max-age=60' },
    );
  }

  const user = c.get('user')!;
  await enforceRateLimit(
    c.env,
    `address-search:${user.id}`,
    240,
    900,
    'Troppe ricerche di indirizzo ravvicinate. Attendi qualche minuto o continua a mano.',
  );

  // Se compare un numero (o SNC/KM), si cercano accessi/civici. Altrimenti si
  // restituisce una sola riga per strada, evitando otto proposte identiche.
  const kind = /\d/.test(rawQuery) || /\b(?:SNC|KM)\b/i.test(rawQuery) ? 'access' : 'street';
  const ftsQuery = tokens.map((token) => `${token}*`).join(' AND ');

  const [matches, datasets] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT a.id, a.dataset_id, a.kind, a.municipality_code, a.istat_code,
              a.city, a.province, a.country, a.street, a.locality,
              a.civic, a.civic_extension, a.civic_specificity, a.metric,
              a.snc_progressive, a.postal_code, a.postal_dataset_id, a.display_street
       FROM address_reference_fts
       JOIN address_reference a ON a.rowid = address_reference_fts.rowid
       JOIN reference_datasets d ON d.id = a.dataset_id
       WHERE address_reference_fts MATCH ? AND a.kind = ? AND d.status = 'active'
       ORDER BY bm25(address_reference_fts), a.city, a.street, a.civic
       LIMIT ?`,
    ).bind(ftsQuery, kind, limit),
    c.env.DB.prepare(
      `SELECT id, kind, name, publisher, source_url, license_name, license_url, version,
              source_updated_at, imported_at, update_frequency, coverage, limitations, status
       FROM reference_datasets
       WHERE status IN ('active', 'stale')
         AND id IN (
           SELECT dataset_id FROM address_reference
           UNION
           SELECT postal_dataset_id FROM address_reference WHERE postal_dataset_id IS NOT NULL
         )
       ORDER BY source_updated_at DESC`,
    ),
  ]);

  const sourceRows = (datasets.results ?? []) as Record<string, unknown>[];
  const datasetPayload = sourceRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    publisher: row.publisher,
    sourceUrl: row.source_url,
    licenseName: row.license_name,
    licenseUrl: row.license_url,
    version: row.version,
    sourceUpdatedAt: row.source_updated_at,
    importedAt: row.imported_at,
    updateFrequency: row.update_frequency,
    coverage: row.coverage,
    limitations: row.limitations,
    status: row.status,
  }));

  return c.json(
    {
      suggestions: ((matches.results ?? []) as Record<string, unknown>[]).map((row) => ({
        id: row.id,
        datasetId: row.dataset_id,
        kind: row.kind,
        municipalityCode: row.municipality_code,
        istatCode: row.istat_code,
        street: row.display_street,
        officialStreetName: row.street,
        civic: row.civic,
        civicExtension: row.civic_extension,
        civicSpecificity: row.civic_specificity,
        metric: row.metric,
        isWithoutStandardNumber: Boolean(row.snc_progressive),
        locality: row.locality,
        city: row.city,
        province: row.province,
        postalCode: row.postal_code,
        postalDatasetId: row.postal_dataset_id,
        country: row.country,
      })),
      datasets: datasetPayload,
      minimumCharacters: 3,
      manualEntryAvailable: true,
      postalCodeProvided: ((matches.results ?? []) as Record<string, unknown>[]).some(
        (row) => typeof row.postal_code === 'string' && row.postal_code.length === 5,
      ),
    },
    200,
    { 'Cache-Control': 'private, max-age=300' },
  );
});

export default reference;
