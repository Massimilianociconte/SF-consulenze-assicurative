export interface SolutionItem {
  id: string;
  category: 'privati' | 'imprese';
  title: string;
  subtitle: string;
  description: string;
  benefits: string[];
  requiresDiscovery: boolean;
  tag: string;
}

export interface FaqItem {
  id: string;
  category: 'generale' | 'plurimandato' | 'sinistri' | 'checkup';
  question: string;
  answer: string;
}

export interface ClaimStep {
  step: number;
  title: string;
  description: string;
  actionText: string;
}

export const AGENCY_INFO = {
  name: "S.F. Consulenze Assicurative",
  referent: "Simone Facchi",
  address: "Galleria M.K. Gandhi 32/14",
  cap: "20017",
  city: "Rho",
  province: "MI",
  fullAddress: "Galleria M.K. Gandhi 32/14, 20017 Rho (MI)",
  phone: "02 9899 6931",
  phoneRaw: "0298996931",
  mobile: "334 904 7946",
  whatsappRaw: "393349047946",
  email: "sfconsulenze@outlook.com",
  googleMapsUrl: "https://maps.google.com/?q=Galleria+M.K.+Gandhi+32/14,+20017+Rho+MI",
  municipalitiesServed: [
    "Rho",
    "Lainate",
    "Arese",
    "Pero",
    "Cornaredo",
    "Pregnana Milanese",
    "Pogliano Milanese",
    "Settimo Milanese",
    "Legnano",
    "Baranzate",
    "Bollate"
  ]
};

export const CORE_PILLARS = [
  {
    id: "plurimandato",
    title: "Plurimandato Indipendente",
    description: "Non rappresentiamo un solo marchio. Lavoriamo attraverso una rete di intermediari e compagnie per individuare la soluzione più adatta a te.",
    icon: "ShieldCheck"
  },
  {
    id: "consulenza",
    title: "Consulenza Su Misura",
    description: "Nessun pacchetto standard predefinito. Analizziamo le tue reali esigenze personali, familiari o professionali con un approccio trasparente.",
    icon: "UserCheck"
  },
  {
    id: "confronto",
    title: "Confronto Soluzioni",
    description: "Mettiamo a confronto le opzioni di mercato spiegando garanzie, franchigie ed esclusioni in modo chiaro e comprensibile.",
    icon: "Scale"
  },
  {
    id: "sinistri",
    title: "Gestione e Assistenza Sinistri",
    description: "Non ti lasciamo solo dopo la firma. In caso di sinistro, ti assistiamo nelle pratiche amministrative e nella liquidazione del danno.",
    icon: "LifeBuoy"
  }
];

export const SOLUTIONS: SolutionItem[] = [
  // Privati & Famiglie
  {
    id: "auto-moto",
    category: "privati",
    title: "Mobilità & Veicoli",
    subtitle: "Auto, Moto, Mezzi Commerciali e Mobilità",
    description: "Protezione completa per la tua mobilità quotidiana. Analizziamo garanzie accessorie (furto, incendio, kasko, cristalli, assistenza stradale) per proteggerti da ogni imprevisto.",
    benefits: [
      "Valutazione attenta di franchigie e scoperti",
      "Assistenza h24 in caso di incidente o guasto",
      "Supporto dedicato nella compilazione CID/CAI"
    ],
    requiresDiscovery: true,
    tag: "Mobilità"
  },
  {
    id: "casa-famiglia",
    category: "privati",
    title: "Casa & Fabbricato",
    subtitle: "Abitazione principale, in affitto o di proprietà",
    description: "La tua casa è il tuo bene più prezioso. Ti aiutiamo a proteggerla contro danni da acqua, incendio, eventi atmosferici, furto e responsabilità civile verso terzi.",
    benefits: [
      "Copertura danni alla struttura e al contenuto",
      "Responsabilità civile capofamiglia ed animali domestici",
      "Assistenza di emergenza per guasti domestici"
    ],
    requiresDiscovery: true,
    tag: "Casa & Patrimonio"
  },
  {
    id: "salute-infortuni",
    category: "privati",
    title: "Salute & Infortuni",
    subtitle: "Protezione della persona e del nucleo familiare",
    description: "Garantisci la tranquillità tua e della tua famiglia fronteggiando le spese mediche, ricoveri o periodi di inabilità temporanea e permanente dovuti a infortuni o malattie.",
    benefits: [
      "Rimborso spese mediche e di diagnosi",
      "Indennità giornaliera da ricovero o gesso",
      "Capitale protetto per invalidità permanente"
    ],
    requiresDiscovery: true,
    tag: "Persona & Salute"
  },
  {
    id: "vita-previdenza",
    category: "privati",
    title: "Vita & Futuro Familiare",
    subtitle: "Previdenza complementare e tutela del tenore di vita",
    description: "Pianifica con serenità il futuro della tua famiglia o la tua integrazione pensionistica attraverso soluzioni assicurative mirate e sostenibili.",
    benefits: [
      "Protezione del reddito familiare in caso di imprevisti gravi",
      "Piani di risparmio e previdenza personalizzati",
      "Vantaggi fiscali previsti dalla normativa"
    ],
    requiresDiscovery: true,
    tag: "Futuro & Famiglia"
  },

  // Professionisti & Imprese
  {
    id: "rc-professionale",
    category: "imprese",
    title: "RC Professionale",
    subtitle: "Per Liberi Professionisti, Consulenti e Partite IVA",
    description: "Proteggi la tua reputazione e il tuo patrimonio da eventuali richieste di risarcimento avanzate dai clienti per errori, omissioni o ritardi nell'esercizio dell'attività.",
    benefits: [
      "Copertura specifica per la tua albo/categoria",
      "Inclusione delle spese di difesa legale",
      "Adeguamento costante ai requisiti normativi di legge"
    ],
    requiresDiscovery: true,
    tag: "Partite IVA & Professioni"
  },
  {
    id: "imprese-negozi",
    category: "imprese",
    title: "Protezione Attività & Negozi",
    subtitle: "Commercianti, Artigiani, Laboratori e PMI",
    description: "Tutela il tuo locale, le merci, i macchinari e la continuità del tuo business contro incendio, furto, guasti ad apparecchiature e danni causati a terzi o dipendenti.",
    benefits: [
      "Garanzia danni materiali e fermo attività",
      "RC Prodotti, RC Terzi (RCT) e RC Prestatori di Lavoro (RCO)",
      "Soluzioni flessibili modulabili sulla tua reale dimensione"
    ],
    requiresDiscovery: true,
    tag: "Negozi & Piccole Imprese"
  },
  {
    id: "tutela-legale-biz",
    category: "imprese",
    title: "Tutela Legale e Contrattuale",
    subtitle: "Difesa dei diritti aziendali e professionali",
    description: "Sostieni le spese legali e peritali per contenziosi con clienti, fornitori, dipendenti o enti pubblici, senza intaccare la liquidità aziendale.",
    benefits: [
      "Libera scelta dell'avvocato o legale di fiducia",
      "Copertura spese giudiziarie ed extragiudiziarie",
      "Consulenza preventiva per vertenze di lavoro"
    ],
    requiresDiscovery: true,
    tag: "Tutela Giuridica"
  },
  {
    id: "cyber-welfare",
    category: "imprese",
    title: "Cyber Risk & Welfare",
    subtitle: "Protezione digitale e benessere dei collaboratori",
    description: "Proteggi i tuoi sistemi informatici da attacchi informatici, ransomware e violazioni dei dati (GDPR), ed offre piani di welfare assicurativo ai tuoi dipendenti.",
    benefits: [
      "Supporto tecnico per la gestione e ripristino post-attacco",
      "Copertura sanzioni GDPR ed estorsioni informatiche",
      "Coperture sanitarie integrative per titolari e dipendenti"
    ],
    requiresDiscovery: true,
    tag: "Innovazione & Impresa"
  }
];

export const CLAIMS_STEPS: ClaimStep[] = [
  {
    step: 1,
    title: "Metti in sicurezza la zona e raccogli i dati",
    description: "In caso di sinistro auto/moto o danno alla struttura, scatta foto, raccogli i dati delle controparti (targa, nomi, contatti) ed eventuali testimoni.",
    actionText: "Scarica modulo CID / Note utili"
  },
  {
    step: 2,
    title: "Contatta l'ufficio S.F. Consulenze",
    description: "Chiamaci subito al 02 9899 6931 o scrivi su WhatsApp al 334 904 7946 per segnalarci l'accaduto. Ti guideremo sulla corretta compilazione della denuncia.",
    actionText: "Chiama l'Ufficio di Rho"
  },
  {
    step: 3,
    title: "Invio documenti ed istruttoria",
    description: "Raccogliamo foto, ricevute, preventivi o verbale delle autorità e li trasmettiamo alla compagnia/intermediario di riferimento aprendo la pratica ufficiale.",
    actionText: "Compila Form Segnalazione"
  },
  {
    step: 4,
    title: "Seguimento peritale e liquidazione",
    description: "Monitoriamo l'operato del perito incaricato e ti aggiorniamo costantemente fino alla definitiva liquidazione del risarcimento.",
    actionText: "Verifica stato pratica"
  }
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "1",
    category: "plurimandato",
    question: "Che cosa significa che S.F. Consulenze Assicurative è un ufficio plurimandatario?",
    answer: "Significa che non siamo vincolati a una singola compagnia assicurativa. Operiamo attraverso una rete di intermediari e compagnie partner, consentendoci di mettere a confronto diverse opzioni sul mercato per individuare la soluzione con le garanzie più adatte alle tue reali esigenze."
  },
  {
    id: "2",
    category: "checkup",
    question: "In cosa consiste il Check-up delle polizze gratuito?",
    answer: "Il Check-up è un'analisi approfondita del tuo portafoglio assicurativo attuale (auto, casa, infortuni, RC professione). Verifichiamo se esistono doppi contratti inutile, scoperti o franchigie penalizzanti, e se le coperture rispecchiano i rischi effettivi della tua vita o della tua azienda oggi."
  },
  {
    id: "3",
    category: "sinistri",
    question: "Cosa devo fare in caso di incidente stradale o danno in casa?",
    answer: "Conserva la calma, compila il Modulo di Constatazione Amichevole (CID) se si tratta di un sinistro stradale o scatta fotografie dettagliate per un danno domestico. Dopodiché contattaci subito al 02 9899 6931 o via WhatsApp: Simone Facchi e lo staff gestiranno direttamente l'apertura e il percorso del sinistro."
  },
  {
    id: "4",
    category: "generale",
    question: "Dove si trova lo studio e quali sono le modalità di appuntamento?",
    answer: "La nostra sede è situata a Rho (MI) in Galleria M.K. Gandhi 32/14. È possibile fissare un appuntamento sia direttamente presso il nostro ufficio, sia richiedere una consulenza telefonica o in videochiamata a seconda delle tue preferenze."
  },
  {
    id: "5",
    category: "generale",
    question: "Ci sono costi per la consulenza iniziale o per i preventivi?",
    answer: "No, la consulenza conoscitiva e la prima analisi delle tue esigenze o del tuo portafoglio polizze sono completamente gratuite e senza alcun impegno."
  },
  {
    id: "6",
    category: "plurimandato",
    question: "Come posso essere sicuro di ottenere garanzie chiare e senza sorprese?",
    answer: "Il nostro metodo si basa sulla trasparenza: per ogni soluzione proposta spieghiamo nel dettaglio non solo le coperture, ma soprattutto gli esclusioni, le franchigie e le regole di rivalsa prima di qualunque sottoscrizione."
  }
];
