-- Migration 0007 - CAP comunale da fonte ufficiale IPA
--
-- ANNCSU non distribuisce il CAP. Per la copertura iniziale di Rho viene
-- proposto il CAP dichiarato dal Comune nell'Indice PA, mantenendo distinta la
-- provenienza e senza presentarlo come verifica postale definitiva.

ALTER TABLE address_reference
  ADD COLUMN postal_code TEXT
  CHECK (
    postal_code IS NULL
    OR (length(postal_code) = 5 AND postal_code NOT GLOB '*[^0-9]*')
  );

ALTER TABLE address_reference
  ADD COLUMN postal_dataset_id TEXT
  REFERENCES reference_datasets(id) ON DELETE SET NULL;

CREATE INDEX idx_address_reference_postal
  ON address_reference (postal_code, municipality_code);

INSERT INTO reference_datasets (
  id, kind, name, publisher, source_url, license_name, license_url,
  version, source_updated_at, update_frequency, coverage, limitations,
  content_sha256, status
) VALUES (
  'ipa-cap-h264',
  'municipality',
  'Indice dei domicili digitali delle Pubbliche Amministrazioni (IPA) - Enti',
  'Agenzia per l''Italia Digitale',
  'https://www.indicepa.gov.it/ipa-dati/dataset/enti',
  'Creative Commons Attribuzione 4.0 Internazionale (CC BY 4.0)',
  'https://creativecommons.org/licenses/by/4.0/',
  '2026-07-30',
  '2026-07-30',
  'Giornaliera',
  'CAP della sede del Comune di Rho, codice IPA c_h264',
  'Il CAP 20017 e'' quello dichiarato per la sede dell''ente in IPA (dato ente aggiornato il 2025-07-31) ed e'' proposto come riferimento comunale. Non sostituisce la verifica puntuale del recapito da parte dell''utente.',
  'edb4f808d873f9c9ff45026e68351830b8500eaf6448d699a4e67187ea4572f4',
  'active'
);

UPDATE address_reference
SET postal_code = '20017',
    postal_dataset_id = 'ipa-cap-h264',
    search_text = search_text || ' 20017'
WHERE dataset_id = 'anncsu-h264'
  AND municipality_code = 'H264';
