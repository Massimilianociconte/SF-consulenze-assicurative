-- Migration 0002 - Dati di riferimento
--
-- ATTENZIONE: i periodi di conservazione qui sotto sono valori di partenza
-- ragionevoli, NON un parere legale. Vanno confermati con il consulente e con
-- il responsabile privacy prima della messa in produzione: incidono su obblighi
-- IVASS (Reg. 40/2018), antiriciclaggio (D.lgs 231/2007), termini di
-- prescrizione civilistici e principio di minimizzazione GDPR.
-- Si modificano con una UPDATE su `retention_policies`, senza toccare il codice.

INSERT INTO retention_policies (category, months, legal_basis, description) VALUES
  ('documento_identita', 120, 'D.lgs 231/2007 - adeguata verifica clientela', 'Documenti di identita'' acquisiti per identificazione'),
  ('codice_fiscale',     120, 'D.lgs 231/2007',                                'Tessera sanitaria / codice fiscale'),
  ('patente',             60, 'Reg. IVASS 40/2018',                            'Patente di guida allegata a pratiche auto'),
  ('libretto',            60, 'Reg. IVASS 40/2018',                            'Carta di circolazione'),
  ('polizza',            120, 'Art. 2946 c.c. - prescrizione ordinaria',       'Contratti e condizioni di polizza'),
  ('quietanza',          120, 'Art. 2220 c.c. - scritture contabili',          'Quietanze di pagamento premi'),
  ('preventivo',          24, 'Interesse legittimo - gestione trattativa',     'Preventivi non trasformati in contratto'),
  ('fattura',            120, 'Art. 2220 c.c.',                                'Fatture e note spese'),
  ('verbale',            120, 'Prescrizione risarcitoria',                     'Verbali delle autorita'''),
  ('cai',                120, 'Prescrizione risarcitoria',                     'Constatazione amichevole di incidente'),
  ('fotografia',          60, 'Gestione sinistro',                             'Fotografie di danni e luoghi'),
  ('dichiarazione',      120, 'Gestione sinistro',                             'Dichiarazioni di parti e testimoni'),
  ('perizia',            120, 'Gestione sinistro',                             'Perizie e stime danni'),
  ('referto',             60, 'Art. 9 GDPR - dati sanitari, minimizzazione',   'Referti e certificati medici'),
  ('corrispondenza',      60, 'Interesse legittimo',                           'Corrispondenza con compagnie e controparti'),
  ('altro',               60, 'Interesse legittimo',                           'Documenti non classificati');

-- Elenco compagnie: e'' solo una lista di comodo per la selezione rapida nei
-- moduli. Va allineata ai mandati effettivi del consulente (UPDATE ... SET
-- active = 0 per quelle non gestite).
INSERT INTO insurance_companies (id, name, short_name, active) VALUES
  ('generali',    'Generali Italia',                      'Generali',   1),
  ('allianz',     'Allianz S.p.A.',                       'Allianz',    1),
  ('unipolsai',   'UnipolSai Assicurazioni',              'UnipolSai',  1),
  ('axa',         'AXA Assicurazioni',                    'AXA',        1),
  ('zurich',      'Zurich Insurance',                     'Zurich',     1),
  ('reale',       'Reale Mutua Assicurazioni',            'Reale Mutua',1),
  ('cattolica',   'Cattolica Assicurazioni',              'Cattolica',  1),
  ('groupama',    'Groupama Assicurazioni',               'Groupama',   1),
  ('hdi',         'HDI Assicurazioni',                    'HDI',        1),
  ('vittoria',    'Vittoria Assicurazioni',               'Vittoria',   1),
  ('sara',        'Sara Assicurazioni',                   'Sara',       1),
  ('itas',        'ITAS Mutua',                           'ITAS',       1),
  ('helvetia',    'Helvetia Italia',                      'Helvetia',   1),
  ('assimoco',    'Assimoco',                             'Assimoco',   1),
  ('net',         'Net Insurance',                        'Net',        1),
  ('europ',       'Europ Assistance Italia',              'Europ Ass.', 1),
  ('altro',       'Altra compagnia',                      'Altro',      1);
