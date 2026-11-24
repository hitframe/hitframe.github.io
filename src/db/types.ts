// Modello dati di Hitframe. Tutto vive sul dispositivo (IndexedDB).

export const DIVISIONI = [
  'Production',
  'Production Optics',
  'Standard',
  'Open',
  'Classic',
  'Revolver',
  'Optics',
  'PCC',
] as const
export type Divisione = (typeof DIVISIONI)[number]

export const CLASSI = ['D', 'C', 'B', 'A', 'Master', 'Grand Master'] as const
export type Classe = (typeof CLASSI)[number]

export const CATEGORIE = ['Nessuna', 'Lady', 'Junior', 'Senior', 'Super Senior', 'Grand Senior'] as const

/** Tempi personali: la base per tutti i calcoli di tempo ideale. Secondi, tranne velocità. */
export interface TempiPersonali {
  estrazione: number // dal beep al primo colpo, bersaglio a 7 m
  split: number // tra due colpi sullo stesso bersaglio
  transizioneVicina: number // bersagli vicini, < 1 m di distanza tra loro
  transizioneLontana: number // bersagli distanti / grande angolo
  ricarica: number // da ultimo colpo a primo colpo dopo il cambio caricatore
  entrataPosizione: number // dall'arrivo in posizione al primo colpo
  uscitaPosizione: number // dall'ultimo colpo al primo passo
  velocitaMovimento: number // metri al secondo, spostamento medio tra posizioni
  colpoPiastra: number // colpo singolo su metallo a media distanza
}

export const FUNZIONAMENTI = {
  striker: 'Striker a percussore lanciato (singola azione)',
  strikerSafe: 'Striker Safe Action (percussore parzialmente armato)',
  saCane: 'Singola azione con cane esterno',
  dasa: 'Doppia/singola azione (DA/SA)',
  dao: 'Solo doppia azione (DAO)',
  lem: 'DA leggera / LEM',
  revolver: 'Revolver DA/SA',
  pcc: 'PCC (carabina semiautomatica)',
} as const
export type Funzionamento = keyof typeof FUNZIONAMENTI

export interface DettagliArma {
  funzionamento: Funzionamento
  calibro: string
  ottica: boolean
  modelloOttica: string
  capienza: number | null // colpi nel caricatore in gara
  pesoScatto: number | null // kg
  canna: string // lunghezza o tipo
  note: string
}

export const ARMA_DEFAULT: DettagliArma = {
  funzionamento: 'striker',
  calibro: '9x21',
  ottica: false,
  modelloOttica: '',
  capienza: null,
  pesoScatto: null,
  canna: '',
  note: '',
}

/** Tempi di riferimento in gara (stage puliti, senza errori) per tipo di esercizio. */
export interface RiferimentoGara { min: number; max: number; colpi: number }
export type RiferimentiGara = Record<'Short' | 'Medium' | 'Long', RiferimentoGara>

export const RIFERIMENTI_DEFAULT: RiferimentiGara = {
  Short: { min: 8, max: 12, colpi: 12 },
  Medium: { min: 16, max: 18, colpi: 24 },
  Long: { min: 20, max: 24, colpi: 32 },
}

export interface Profilo {
  id: 'me'
  nome: string
  divisione: Divisione
  classe: Classe
  categoria: string
  club: string
  arma: string
  manoForte: 'destra' | 'sinistra'
  armaDettagli: DettagliArma
  riferimenti: RiferimentiGara
  /** Livelli 1–5 dal questionario delle abilità */
  abilita?: Partial<Record<string, number>>
  storicoAbilita?: { data: string; valori: Partial<Record<string, number>> }[]
  tempi: TempiPersonali
  /** Quanto cresce il tempo per ogni metro oltre i 7 m (frazione, es. 0,035 = +3,5%), misurato dai video */
  pendenzaDistanza?: number
  /** Obiettivi a breve e lungo termine */
  obiettivi?: Obiettivo[]
  aggiornato: string // ISO
}

export type TipoObiettivo = 'media' | 'reale' | 'evento' | 'libero'
export interface Tappa { testo: string; fatto: boolean }
export interface Obiettivo {
  id: string
  titolo: string
  orizzonte: 'breve' | 'lungo'
  /** Entro quando (YYYY-MM-DD) */
  entro: string
  tipo: TipoObiettivo
  /** Fascia di percentuale (media) o di punteggio reale da tenere */
  min?: number
  max?: number
  /** Classe collegata, es. "Master" da confermare */
  classe?: string
  tappe: Tappa[]
  note: string
  creato: string
}

export const TEMPI_DEFAULT: TempiPersonali = {
  estrazione: 1.1,
  split: 0.22,
  transizioneVicina: 0.3,
  transizioneLontana: 0.5,
  ricarica: 1.4,
  entrataPosizione: 0.6,
  uscitaPosizione: 0.4,
  velocitaMovimento: 2.5,
  colpoPiastra: 0.35,
}

export type TipoEvento = 'fuoco' | 'bianco' | 'gara' | 'altro'

export const TIPI_EVENTO: Record<TipoEvento, { label: string; breve: string }> = {
  fuoco: { label: 'Allenamento a fuoco', breve: 'Fuoco' },
  bianco: { label: 'Allenamento in bianco', breve: 'In bianco' },
  gara: { label: 'Gara', breve: 'Gara' },
  altro: { label: 'Altro', breve: 'Altro' },
}

export const LIVELLI_GARA = ['Level I', 'Level II', 'Level III', 'Level IV', 'Level V'] as const

export interface DettagliGara {
  aperturaIscrizione?: string // YYYY-MM-DD o ''
  livello: string
  organizzatore: string
  iscrizioneUrl: string
  scadenzaIscrizione: string // YYYY-MM-DD o ''
  iscritto: boolean
  /** Giorno in cui spari (gare su più giorni): una volta iscritto, in calendario resta solo questo. */
  giornoGara?: string
  /** Turno o squadra, es. "Squadra 4 · sabato mattina". */
  turno?: string
  /** Date complete della gara, conservate quando l'evento è ridotto al tuo giorno. */
  periodo?: { inizio: string; fine: string }
  numeroStage: number | null
  colpiTotali: number | null
}

export interface Evento {
  id?: number
  tipo: TipoEvento
  titolo: string
  data: string // YYYY-MM-DD
  dataFine: string // YYYY-MM-DD, = data se singolo giorno
  ora: string // HH:mm o ''
  durataMin: number | null
  luogo: string
  mapsUrl?: string // link Google Maps (automatico dal luogo o incollato)
  note: string
  colpiPianificati: number | null
  colpiSparati: number | null
  completato: boolean
  gara?: DettagliGara
  creato: string
  piano?: number // id dell'analisi gara che ha generato la sessione
  drill?: string[] // drill della sessione
  armaId?: number | null // arma usata (se vuoto: la principale)
  lottoId?: number | null
  /** Sincronizzazione Google Calendar */
  google?: { eventoId?: string; aperturaId?: string; scadenzaId?: string; daSincronizzare?: boolean; ultimaSync?: string }
}

export interface VoceDiario {
  id?: number
  data: string // YYYY-MM-DD
  titolo: string
  testo: string
  umore: number // 1-5
  energia: number // 1-5
  concentrazione: number // 1-5
  sonnoOre: number | null
  tag: string[]
  eventoId: number | null
  videoUrl: string
  creato: string
  aggiornato: string
}

export interface Impostazione {
  chiave: string
  valore: unknown
}

/** Analisi di un PDF di gara letta sul dispositivo. */
export interface AnalisiGara {
  id?: number
  creato: string
  nomeFile: string
  pdf: Blob | null // null dopo un ripristino da backup, o finché non arriva dal Drive
  /** Id del PDF nel Google Drive dell'utente (cartella nascosta dell'app), per gli altri dispositivi */
  pdfDrive?: string | null
  lettura: import('../analisi/tipi').GaraLetta
  sezione: number // libretto scelto (es. Handgun o PCC)
  eventoId: number | null
  /** Gare che l'utente ha detto non essere questa (per non riproporle) */
  eventiRifiutati?: number[]
  /** Mappe degli stage, chiave "sezione-numero" */
  mappe?: Record<string, import('../analisi/mappa').MappaStage>
}

/** Una prova di un drill (a fuoco o in bianco). */
export interface Prova {
  id?: number
  drillId: string
  data: string // YYYY-MM-DD
  creato: string
  modalita: 'fuoco' | 'bianco'
  tempo: number | null // secondi totali
  colpi: number[] // tempi dei colpi dal beep (dal timer), se disponibili
  zone: { A: number; C: number; D: number; M: number; NS: number }
  major: boolean
  hf: number | null
  riuscita?: boolean // in bianco: entro il par
  par?: number | null
  eventoId: number | null
  note: string
}

/** Drill creato dall'utente. */
export interface DrillPersonale {
  id?: number
  nome: string
  categoria: string
  modalita: 'fuoco' | 'bianco'
  descrizione: string
  distanza: string
  bersagli: string
  colpi: number
  partenza: string
  obiettivo: number | null
  creato: string
  /** Disegno e spiegazione */
  schema?: import('../allenamento/schemi').Schema
  allestimento?: string
  passi?: string[]
  attenzione?: string[]
  /** Drill nato dallo studio di uno stage */
  stage?: { analisiId: number; numero: number; stile: 'aggressivo' | 'conservativo' }
}

/* ---------- Fase 3: munizioni ---------- */

export type TipoComponente = 'palle' | 'polvere' | 'inneschi' | 'bossoli'

export const TIPI_COMPONENTE: Record<TipoComponente, { label: string; unita: string; unitaPrezzo: string }> = {
  palle: { label: 'Palle', unita: 'pz', unitaPrezzo: 'pz' },
  polvere: { label: 'Polvere', unita: 'g', unitaPrezzo: 'g' },
  inneschi: { label: 'Inneschi', unita: 'pz', unitaPrezzo: 'pz' },
  bossoli: { label: 'Bossoli', unita: 'pz', unitaPrezzo: 'pz' },
}

/** Un componente in magazzino. Il prezzo è per confezione: costo unitario = prezzo / quantità confezione. */
export interface Componente {
  id?: number
  tipo: TipoComponente
  nome: string
  quantita: number // pezzi, o grammi per la polvere
  confezione: number | null // pezzi o grammi per confezione
  prezzoConfezione: number | null // €
  sogliaMinima: number | null
  riusi?: number | null // bossoli: ricariche medie per bossolo
  note: string
  creato: string
}

export const TIPI_PALLA = ['Piombo ricoperto (coated)', 'Ramata (plated)', 'FMJ', 'Piombo nudo', 'Altro'] as const

export interface Ricetta {
  id?: number
  nome: string
  calibro: string
  palla: string // marca e modello
  pesoPalla: number // grani
  tipoPalla: string
  polvere: string
  carica: number | null // grani
  innesco: string
  bossolo: string
  oal: number | null // mm
  note: string
  /** Componenti di magazzino collegati (scaricati quando produci un lotto) */
  pallaId?: number | null
  polvereId?: number | null
  innescoId?: number | null
  bossoloId?: number | null
  archiviata: boolean
  creato: string
}

export interface SessioneCrono {
  id?: number
  ricettaId: number
  armaId: number | null
  data: string // YYYY-MM-DD
  unita: 'ms' | 'fps'
  velocita: number[] // nell'unità indicata
  pesoMisurato: number | null // grani, se diverso da quello della ricetta
  temperatura: number | null // °C
  note: string
  creato: string
}

/** Munizioni prodotte o acquistate (quantità negativa = rettifica). */
export interface Lotto {
  id?: number
  ricettaId: number | null // null = munizioni commerciali
  descrizione: string
  data: string
  quantita: number
  costoColpo: number | null // € per colpo al momento della produzione
  note: string
  creato: string
}

/* ---------- Fase 3: attrezzatura ---------- */

export interface ParteArma {
  id: string
  nome: string // Canna, Molla di recupero, ...
  installata: string // YYYY-MM-DD
  colpiInstallazione: number // colpi dell'arma al montaggio
  vitaColpi: number | null // sostituzione consigliata ogni N colpi
  note: string
}

export interface Manutenzione {
  id: string
  nome: string // Pulizia completa, ...
  ogniColpi: number | null
  ogniGiorni: number | null
  ultimaColpi: number
  ultimaData: string
}

export interface Arma {
  id?: number
  nome: string
  modello: string
  calibro: string
  divisione: Divisione
  principale: boolean
  colpiIniziali: number // colpi già sparati prima di usare Hitframe
  dal: string // da questa data contano le sessioni del calendario
  parti: ParteArma[]
  manutenzioni: Manutenzione[]
  note: string
  creato: string
}

export interface Intervento {
  id?: number
  armaId: number
  data: string
  tipo: 'manutenzione' | 'sostituzione' | 'riparazione' | 'colpi' | 'nota'
  titolo: string
  descrizione: string
  colpiArma: number // conteggio al momento
  colpiAggiunti?: number // tipo 'colpi': colpi sparati fuori calendario
  parteId?: string
  manutenzioneId?: string
  costo: number | null
  creato: string
}

/* ---------- Stage designer ---------- */
export interface StageAllenamento {
  id?: number
  nome: string
  larghezza: number // m
  profondita: number // m
  schema: import('../allenamento/schemi').Schema
  partenza: string // condizione di partenza
  note: string
  creato: string
  aggiornato: string
}

/** Tipo di ogni intervallo tra due colpi di una run (il primo è dal beep). */
/** Un allenamento fisico svolto (sezione Fisico). */
export interface SessioneFisico {
  id?: number
  data: string // YYYY-MM-DD
  ora: string
  allenamentoId: string
  titolo: string
  durataSec: number
  /** Com'è andata, da 1 (facile) a 5 (durissima) */
  fatica: number | null
  completo: boolean
  creato: string
}

export type TipoIntervallo = 'primo' | 'split' | 'transizione' | 'ricarica' | 'movimento' | 'ricaricaMov' | 'lungo'

/** Una run analizzata con GDA Split (dati dall'audio del video, il video resta sul dispositivo). */
export interface Corsa {
  id?: number
  creato: string
  data: string // YYYY-MM-DD
  /** da dove viene la data: dai metadati del video, dalla data del file, scelta a mano, o sconosciuta (oggi) */
  dataFonte?: 'video' | 'file' | 'manuale' | 'evento' | 'oggi'
  titolo: string
  file: string // nome del video
  /** tempi dei colpi dal beep (già allineati al tempo ufficiale, se indicato) */
  colpi: number[]
  /** tipo dell'intervallo che termina a ogni colpo (stessa lunghezza di colpi) */
  tipi: TipoIntervallo[]
  /** colpi segnati "da verificare" da GDA Split */
  daVerificare: number[]
  tempoTimer: number | null
  contesto: 'allenamento' | 'gara' | 'libero'
  /** il primo colpo parte da mani in resa e arma in fondina: vale come estrazione */
  partenzaStandard: boolean
  eventoId: number | null
  drillId: string | null
  provaId: number | null
  risultatoId: number | null
  analisiId: number | null
  stage: number | null
  link: string
  note: string
  /** distanza tipica dei bersagli della run, in metri */
  distanzaTipica?: number | null
  /** bersaglio di ogni colpo: tipo e distanza (se diversa da quella tipica) */
  bersagli?: (BersaglioColpo | null)[]
}

export type TipoBersaglioColpo = 'carta' | 'mini' | 'ferro'
export interface BersaglioColpo { tipo: TipoBersaglioColpo; distanza: number | null }
