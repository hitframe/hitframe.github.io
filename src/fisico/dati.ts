import type { NomePosa } from './pose'

/** A cosa serve un esercizio nel tiro dinamico. */
export type Obiettivo = 'esplosivita' | 'mobilita' | 'core' | 'presa' | 'spalle' | 'cardio' | 'equilibrio' | 'prevenzione'
export const OBIETTIVI: Record<Obiettivo, { nome: string; perche: string }> = {
  esplosivita: { nome: 'Esplosività', perche: 'Partenze e cambi di posizione più rapidi' },
  mobilita: { nome: 'Mobilità', perche: 'Posizioni basse, porte, tiri in ginocchio' },
  core: { nome: 'Core', perche: 'Piattaforma di tiro stabile, anche in movimento' },
  presa: { nome: 'Presa', perche: 'Controllo del rinculo e rientro del mirino' },
  spalle: { nome: 'Spalle', perche: 'Braccia ferme in mira, meno fatica a fine gara' },
  cardio: { nome: 'Cardio', perche: 'Stage lunghi e tiro col cuore alto' },
  equilibrio: { nome: 'Equilibrio', perche: 'Tiro in movimento, entrate e uscite pulite' },
  prevenzione: { nome: 'Prevenzione', perche: 'Schiena e ginocchia pronte a una stagione di gare' },
}

export type Attrezzo = 'nessuno' | 'elastici' | 'manubri' | 'sbarra'
export const ATTREZZI: Record<Attrezzo, string> = { nessuno: 'Niente', elastici: 'Elastici', manubri: 'Manubri', sbarra: 'Sbarra' }

export interface Esercizio {
  id: string
  nome: string
  /** Come si esegue, in una o due frasi */
  cue: string
  attrezzo: Attrezzo
  obiettivi: Obiettivo[]
  /** Pose dell'animazione, in ordine (si ripetono) */
  pose: NomePosa[]
  /** Secondi per un ciclo completo dell'animazione */
  ritmo: number
  /** Esercizio da fare per lato: il lettore lo divide a metà e lo dice */
  perLato?: boolean
}

export const ESERCIZI: Esercizio[] = [
  // esplosività
  { id: 'squat-jump', nome: 'Squat jump', cue: 'Scendi come in una partenza bassa, esplodi verso l’alto, atterra morbido sulle punte con le ginocchia sopra i piedi.', attrezzo: 'nessuno', obiettivi: ['esplosivita'], pose: ['IN_PIEDI', 'ACCOSCIATO', 'SALTO'], ritmo: 1.6 },
  { id: 'affondi-saltati', nome: 'Affondi saltati', cue: 'Dall’affondo salta e cambia gamba in aria. Busto dritto, atterra con il ginocchio dietro che sfiora il pavimento.', attrezzo: 'nessuno', obiettivi: ['esplosivita', 'equilibrio'], pose: ['AFFONDO', 'AFFONDO_IN_VOLO', 'AFFONDO_INV', 'AFFONDO_IN_VOLO_INV'], ritmo: 1.8 },
  { id: 'pattinatore', nome: 'Salti del pattinatore', cue: 'Salta di lato su una gamba sola e fermati in equilibrio un istante prima di ripartire dall’altra parte.', attrezzo: 'nessuno', obiettivi: ['esplosivita', 'equilibrio'], pose: ['PATTINATORE', 'PATTINATORE_B'], ritmo: 1.4 },
  { id: 'salto-lungo', nome: 'Salto in lungo da fermo', cue: 'Carica le braccia dietro, salta in avanti con tutta l’anca, atterra piegato e stabile. Torna indietro camminando.', attrezzo: 'nessuno', obiettivi: ['esplosivita'], pose: ['IN_PIEDI', 'SALTO_LUNGO_CARICA', 'SALTO_LUNGO_VOLO'], ritmo: 2 },
  { id: 'scatto-resa', nome: 'Partenza dalla resa', cue: 'Mani sopra le spalle come al via, poi tre passi esplosivi in avanti. Torna camminando e riparti.', attrezzo: 'nessuno', obiettivi: ['esplosivita'], pose: ['RESA', 'RESA', 'SCATTO'], ritmo: 1.8 },
  { id: 'burpee', nome: 'Burpee', cue: 'Mani a terra, gambe indietro in plank, ritorna in accosciata e salta. Ritmo costante, niente schiena curva.', attrezzo: 'nessuno', obiettivi: ['cardio', 'esplosivita'], pose: ['IN_PIEDI', 'ACC_MANI_TERRA', 'PLANK_ALTA', 'ACC_MANI_TERRA', 'SALTO'], ritmo: 2.6 },
  // cardio
  { id: 'ginocchia-alte', nome: 'Corsa sul posto, ginocchia alte', cue: 'Ginocchia all’altezza dell’anca, braccia che spingono, appoggi rapidi sull’avampiede.', attrezzo: 'nessuno', obiettivi: ['cardio'], pose: ['GINOCCHIA_A', 'GINOCCHIA_B'], ritmo: 0.7 },
  { id: 'jumping-jack', nome: 'Jumping jack', cue: 'Apri gambe e braccia insieme, chiudi senza fermarti. Respira con il ritmo.', attrezzo: 'nessuno', obiettivi: ['cardio'], pose: ['FRONTE', 'JACK_APERTO'], ritmo: 0.9 },
  { id: 'scalatore', nome: 'Mountain climber', cue: 'In plank alta porta le ginocchia al petto alternandole. Spalle sopra le mani, anca bassa.', attrezzo: 'nessuno', obiettivi: ['cardio', 'core'], pose: ['SCALATORE_A', 'SCALATORE_B'], ritmo: 0.7 },
  { id: 'corda', nome: 'Saltelli con la corda (anche senza)', cue: 'Piccoli saltelli sulle punte, polsi che girano come con la corda. Ginocchia morbide.', attrezzo: 'nessuno', obiettivi: ['cardio'], pose: ['SALTELLO_GIU', 'SALTELLO'], ritmo: 0.5 },
  // core
  { id: 'plank', nome: 'Plank sui gomiti', cue: 'Corpo in linea da spalle a talloni, glutei stretti, respira senza far cadere l’anca.', attrezzo: 'nessuno', obiettivi: ['core'], pose: ['PLANK_GOMITI', 'PLANK_GOMITI'], ritmo: 3 },
  { id: 'plank-laterale', nome: 'Plank laterale', cue: 'Gomito sotto la spalla, anca alta e ferma. Braccio libero verso l’alto.', attrezzo: 'nessuno', obiettivi: ['core', 'prevenzione'], pose: ['PLANK_LATERALE', 'PLANK_LATERALE_GIU'], ritmo: 2.4, perLato: true },
  { id: 'dead-bug', nome: 'Dead bug', cue: 'Schiena a terra, allunga braccio e gamba opposti senza staccare la zona lombare.', attrezzo: 'nessuno', obiettivi: ['core', 'prevenzione'], pose: ['DEAD_BUG', 'DEAD_BUG_EST'], ritmo: 2.2 },
  { id: 'bird-dog', nome: 'Bird dog', cue: 'In quadrupedia allunga braccio e gamba opposti, fermati un attimo, torna. Bacino fermo.', attrezzo: 'nessuno', obiettivi: ['core', 'equilibrio', 'prevenzione'], pose: ['QUADRUPEDIA', 'BIRD_DOG'], ritmo: 2.4 },
  { id: 'tocchi-spalla', nome: 'Plank con tocchi alla spalla', cue: 'In plank alta tocca la spalla opposta alternando le mani, senza far ondeggiare il bacino.', attrezzo: 'nessuno', obiettivi: ['core', 'spalle'], pose: ['PLANK_ALTA', 'TOCCO_SPALLA'], ritmo: 1.2 },
  // spalle
  { id: 'tenuta-mira', nome: 'Tenuta in posizione di tiro', cue: 'Braccia tese come in impugnatura, spalle basse, ginocchia morbide. Tieni ferma la linea di mira.', attrezzo: 'nessuno', obiettivi: ['spalle'], pose: ['MIRA', 'MIRA'], ritmo: 3 },
  { id: 'piegamenti', nome: 'Piegamenti', cue: 'Mani sotto le spalle, gomiti a 45 gradi, petto vicino al pavimento. Anche sulle ginocchia va bene.', attrezzo: 'nessuno', obiettivi: ['spalle', 'core'], pose: ['PLANK_ALTA', 'PIEGAMENTO'], ritmo: 1.8 },
  { id: 'circonduzioni', nome: 'Circonduzioni delle spalle', cue: 'Braccia lunghe, cerchi ampi e lenti avanti e indietro. Riscalda spalle e scapole.', attrezzo: 'nessuno', obiettivi: ['spalle', 'mobilita'], pose: ['FRONTE', 'SPALLE_LATO', 'SPALLE_SU', 'SPALLE_LATO'], ritmo: 2.4 },
  { id: 'alzate-frontali', nome: 'Alzate frontali', cue: 'Braccia tese fino all’altezza degli occhi, scendi lento. Come portare l’arma in mira.', attrezzo: 'manubri', obiettivi: ['spalle'], pose: ['IN_PIEDI', 'ALZATA'], ritmo: 2.2 },
  { id: 'rematore', nome: 'Rematore', cue: 'Busto inclinato, schiena piatta, tira i gomiti indietro stringendo le scapole.', attrezzo: 'manubri', obiettivi: ['spalle', 'prevenzione'], pose: ['PIEGATO', 'REMATORE'], ritmo: 2 },
  { id: 'aperture-elastico', nome: 'Aperture con l’elastico', cue: 'Elastico teso davanti al petto, aprilo fino alle spalle stringendo le scapole, torna piano.', attrezzo: 'elastici', obiettivi: ['spalle', 'prevenzione'], pose: ['MANI_AVANTI', 'SPALLE_LATO'], ritmo: 2 },
  // presa
  { id: 'pugni', nome: 'Stretta e apertura rapide', cue: 'Braccia avanti: chiudi i pugni al massimo e apri le dita a ventaglio, veloce. Brucia gli avambracci.', attrezzo: 'nessuno', obiettivi: ['presa'], pose: ['MANI_AVANTI', 'MANI_AVANTI'], ritmo: 0.6 },
  { id: 'stretta-asciugamano', nome: 'Stretta dell’asciugamano', cue: 'Arrotola un asciugamano e strizzalo con tutta la forza, alternando il verso. Tieni 5 secondi a stretta.', attrezzo: 'nessuno', obiettivi: ['presa'], pose: ['MANI_AVANTI', 'MANI_AVANTI'], ritmo: 2 },
  { id: 'farmer', nome: 'Camminata del contadino', cue: 'Un manubrio pesante per mano, spalle basse, cammina a passi corti senza far dondolare i pesi.', attrezzo: 'manubri', obiettivi: ['presa', 'core'], pose: ['CAMMINA_A', 'CAMMINA_B'], ritmo: 1.2 },
  { id: 'sospensione', nome: 'Sospensione alla sbarra', cue: 'Appeso con le braccia tese, presa piena. Ogni tanto abbassa le spalle attivando le scapole.', attrezzo: 'sbarra', obiettivi: ['presa', 'spalle'], pose: ['SOSPESO', 'SOSPESO_ATTIVO'], ritmo: 2.6 },
  // gambe con pesi
  { id: 'goblet', nome: 'Goblet squat', cue: 'Manubrio al petto, scendi tra le ginocchia tenendo il busto alto, risali spingendo sui talloni.', attrezzo: 'manubri', obiettivi: ['esplosivita', 'mobilita'], pose: ['IN_PIEDI_GOBLET', 'GOBLET'], ritmo: 2.2 },
  { id: 'stacco', nome: 'Stacco rumeno', cue: 'Ginocchia appena piegate, porta l’anca indietro con la schiena piatta, risali stringendo i glutei.', attrezzo: 'manubri', obiettivi: ['prevenzione', 'esplosivita'], pose: ['IN_PIEDI', 'STACCO'], ritmo: 2.4 },
  // mobilità
  { id: 'affondo-basso', nome: 'Allungamento dei flessori dell’anca', cue: 'Ginocchio dietro a terra, spingi l’anca avanti e in basso. Busto dritto, respira.', attrezzo: 'nessuno', obiettivi: ['mobilita'], pose: ['AFFONDO_BASSO', 'AFFONDO_BASSO'], ritmo: 3, perLato: true },
  { id: 'squat-tenuto', nome: 'Accosciata profonda tenuta', cue: 'Scendi più basso che puoi con i talloni a terra, gomiti che spingono le ginocchia in fuori.', attrezzo: 'nessuno', obiettivi: ['mobilita'], pose: ['ACCOSCIATO', 'ACCOSCIATO'], ritmo: 3 },
  { id: 'cosacco', nome: 'Squat del cosacco', cue: 'Gambe larghe, scendi su un lato con l’altra gamba tesa e la punta in su. Alterna lento.', attrezzo: 'nessuno', obiettivi: ['mobilita', 'equilibrio'], pose: ['COSACCO', 'FRONTE', 'COSACCO_B', 'FRONTE'], ritmo: 3.2 },
  { id: '9090', nome: 'Rotazioni 90/90', cue: 'Seduto con le gambe a 90 gradi, ruota il busto verso il ginocchio davanti e torna. Anche e bacino liberi.', attrezzo: 'nessuno', obiettivi: ['mobilita'], pose: ['SEDUTO_9090', 'SEDUTO_9090_RUOTA'], ritmo: 3 },
  { id: 'gatto-mucca', nome: 'Gatto e mucca', cue: 'In quadrupedia arrotonda la schiena verso l’alto, poi inarca guardando avanti. Lento, con il respiro.', attrezzo: 'nessuno', obiettivi: ['mobilita', 'prevenzione'], pose: ['GATTO', 'MUCCA'], ritmo: 3 },
  { id: 'allungo-torace', nome: 'Apertura del torace', cue: 'Braccia larghe e in alto, petto aperto, poi richiudi. Scioglie la parte alta della schiena.', attrezzo: 'nessuno', obiettivi: ['mobilita', 'spalle'], pose: ['IN_PIEDI', 'ALLUNGO_TORACE'], ritmo: 2.6 },
  // equilibrio e prevenzione
  { id: 'una-gamba-mira', nome: 'In mira su una gamba', cue: 'Posizione di tiro su una gamba sola, linea di mira ferma. Cambia gamba a metà.', attrezzo: 'nessuno', obiettivi: ['equilibrio', 'spalle'], pose: ['MIRA_UNA_GAMBA', 'MIRA_UNA_GAMBA'], ritmo: 3, perLato: true },
  { id: 'camminata-mira', nome: 'Camminata in mira', cue: 'Braccia in posizione di tiro, cammina con passi rullati tallone-punta: la linea di mira non deve saltare.', attrezzo: 'nessuno', obiettivi: ['equilibrio'], pose: ['MIRA_CAMMINA_A', 'MIRA_CAMMINA_B'], ritmo: 1.4 },
  { id: 'ponte', nome: 'Ponte per i glutei', cue: 'Schiena a terra, piedi vicini al bacino, alza l’anca stringendo i glutei e scendi lento.', attrezzo: 'nessuno', obiettivi: ['prevenzione', 'core'], pose: ['PONTE_GIU', 'PONTE_SU'], ritmo: 2.2 },
  { id: 'superman', nome: 'Superman', cue: 'A pancia in giù solleva insieme braccia e gambe, tieni un istante, scendi. Guarda il pavimento.', attrezzo: 'nessuno', obiettivi: ['prevenzione'], pose: ['PRONO', 'SUPERMAN'], ritmo: 2.4 },
]
export const esercizio = (id: string) => ESERCIZI.find((e) => e.id === id)

/* ---------------- allenamenti ---------------- */

export type Formato = 'tabata' | 'circuito' | 'intervalli' | 'mobilita' | 'tiro'
export const FORMATI: Record<Formato, string> = { tabata: 'Tabata', circuito: 'Circuito', intervalli: 'Intervalli', mobilita: 'Mobilità', tiro: 'Per il tiro' }

/** Un passo di un blocco: esercizio a tempo, oppure "estrazione a secco" col beep. */
export interface Passo { es: string; lavoro: number; recupero: number }
export interface Blocco { passi: Passo[]; giri: number; recuperoDopo: number }
export interface Allenamento {
  id: string
  nome: string
  descrizione: string
  formato: Formato
  obiettivo: Obiettivo
  livello: 1 | 2 | 3
  blocchi: Blocco[]
  /** Leggero: va bene anche nei giorni prima di una gara */
  leggero?: boolean
  /** Alterna allo sforzo un'estrazione a secco col beep */
  conTiro?: boolean
}

const tab = (a: string, b: string): Blocco => ({ passi: [{ es: a, lavoro: 20, recupero: 10 }, { es: b, lavoro: 20, recupero: 10 }], giri: 4, recuperoDopo: 60 })

export const ALLENAMENTI: Allenamento[] = [
  {
    id: 'riscaldamento', nome: 'Riscaldamento pre-poligono', formato: 'mobilita', obiettivo: 'mobilita', livello: 1, leggero: true,
    descrizione: 'Spalle, polsi, anche e presa pronti prima del primo stage. Da fare al poligono o prima di partire.',
    blocchi: [{ passi: [
      { es: 'circonduzioni', lavoro: 45, recupero: 5 }, { es: 'allungo-torace', lavoro: 40, recupero: 5 }, { es: 'pugni', lavoro: 30, recupero: 5 },
      { es: 'affondo-basso', lavoro: 60, recupero: 5 }, { es: 'squat-tenuto', lavoro: 40, recupero: 5 }, { es: 'ginocchia-alte', lavoro: 30, recupero: 5 },
      { es: 'scatto-resa', lavoro: 40, recupero: 5 }, { es: 'tenuta-mira', lavoro: 40, recupero: 0 },
    ], giri: 1, recuperoDopo: 0 }],
  },
  {
    id: 'sforzo', nome: 'Drill sotto sforzo', formato: 'tiro', obiettivo: 'cardio', livello: 2, conTiro: true,
    descrizione: 'Uno scatto fisico e subito un’estrazione a secco al beep: il tiro col cuore alto, come in gara. Arma scarica e nessuna munizione nella stanza.',
    blocchi: [{ passi: [{ es: 'burpee', lavoro: 30, recupero: 0 }, { es: 'estrazione', lavoro: 12, recupero: 30 }, { es: 'ginocchia-alte', lavoro: 30, recupero: 0 }, { es: 'estrazione', lavoro: 12, recupero: 30 }], giri: 3, recuperoDopo: 60 }],
  },
  {
    id: 'gambe-esplosive', nome: 'Gambe esplosive', formato: 'tabata', obiettivo: 'esplosivita', livello: 2,
    descrizione: 'Partenze e cambi di posizione: due tabata da 4 minuti, 20 secondi a tutta e 10 di recupero.',
    blocchi: [{ passi: [{ es: 'circonduzioni', lavoro: 30, recupero: 0 }, { es: 'ginocchia-alte', lavoro: 30, recupero: 0 }, { es: 'squat-tenuto', lavoro: 30, recupero: 15 }], giri: 1, recuperoDopo: 0 }, tab('squat-jump', 'pattinatore'), tab('affondi-saltati', 'scatto-resa')],
  },
  {
    id: 'core', nome: 'Core e piattaforma', formato: 'circuito', obiettivo: 'core', livello: 2,
    descrizione: 'Busto stabile in posizione di tiro e in movimento. Tre giri, 40 secondi di lavoro e 20 di recupero.',
    blocchi: [{ passi: [
      { es: 'plank', lavoro: 40, recupero: 20 }, { es: 'dead-bug', lavoro: 40, recupero: 20 }, { es: 'plank-laterale', lavoro: 40, recupero: 20 },
      { es: 'bird-dog', lavoro: 40, recupero: 20 }, { es: 'tocchi-spalla', lavoro: 40, recupero: 20 },
    ], giri: 3, recuperoDopo: 60 }],
  },
  {
    id: 'posizioni-basse', nome: 'Posizioni basse', formato: 'mobilita', obiettivo: 'mobilita', livello: 1, leggero: true,
    descrizione: 'Anche e caviglie per porte, finestre basse e tiri in ginocchio. Lento, respirando.',
    blocchi: [{ passi: [
      { es: 'gatto-mucca', lavoro: 45, recupero: 10 }, { es: 'affondo-basso', lavoro: 80, recupero: 10 }, { es: 'squat-tenuto', lavoro: 60, recupero: 10 },
      { es: 'cosacco', lavoro: 60, recupero: 10 }, { es: '9090', lavoro: 60, recupero: 10 }, { es: 'allungo-torace', lavoro: 45, recupero: 0 },
    ], giri: 2, recuperoDopo: 30 }],
  },
  {
    id: 'cardio-stage', nome: 'Cardio da stage lungo', formato: 'intervalli', obiettivo: 'cardio', livello: 3,
    descrizione: 'Intervalli brevi e intensi come uno stage da 30 colpi con tre posizioni. Quattro giri.',
    blocchi: [{ passi: [
      { es: 'ginocchia-alte', lavoro: 30, recupero: 15 }, { es: 'burpee', lavoro: 30, recupero: 15 }, { es: 'scalatore', lavoro: 30, recupero: 15 }, { es: 'pattinatore', lavoro: 30, recupero: 15 },
    ], giri: 4, recuperoDopo: 60 }],
  },
  {
    id: 'presa', nome: 'Presa e avambracci', formato: 'circuito', obiettivo: 'presa', livello: 1,
    descrizione: 'Controllo del rinculo e rientro del mirino. Senza attrezzi: basta un asciugamano.',
    blocchi: [{ passi: [
      { es: 'pugni', lavoro: 40, recupero: 20 }, { es: 'stretta-asciugamano', lavoro: 40, recupero: 20 }, { es: 'tenuta-mira', lavoro: 45, recupero: 15 }, { es: 'tocchi-spalla', lavoro: 30, recupero: 30 },
    ], giri: 3, recuperoDopo: 30 }],
  },
  {
    id: 'mira-equilibrio', nome: 'Mira ed equilibrio', formato: 'circuito', obiettivo: 'equilibrio', livello: 1, leggero: true,
    descrizione: 'Linea di mira ferma mentre ti muovi: utile per il tiro in movimento.',
    blocchi: [{ passi: [
      { es: 'camminata-mira', lavoro: 45, recupero: 15 }, { es: 'una-gamba-mira', lavoro: 60, recupero: 15 }, { es: 'bird-dog', lavoro: 40, recupero: 15 }, { es: 'pattinatore', lavoro: 30, recupero: 30 },
    ], giri: 2, recuperoDopo: 30 }],
  },
  {
    id: 'scarico-gara', nome: 'Settimana di gara: attivazione', formato: 'mobilita', obiettivo: 'prevenzione', livello: 1, leggero: true,
    descrizione: 'Nei giorni prima di una gara: muoversi senza stancarsi, gambe fresche e spalle sciolte.',
    blocchi: [{ passi: [
      { es: 'circonduzioni', lavoro: 40, recupero: 10 }, { es: 'gatto-mucca', lavoro: 40, recupero: 10 }, { es: 'ponte', lavoro: 40, recupero: 10 },
      { es: 'affondo-basso', lavoro: 60, recupero: 10 }, { es: 'scatto-resa', lavoro: 30, recupero: 30 }, { es: 'tenuta-mira', lavoro: 40, recupero: 0 },
    ], giri: 1, recuperoDopo: 0 }],
  },
  {
    id: 'manubri', nome: 'Forza con i manubri', formato: 'circuito', obiettivo: 'prevenzione', livello: 2,
    descrizione: 'Gambe, schiena e spalle: la base fisica di una stagione di gare. Tre giri.',
    blocchi: [{ passi: [
      { es: 'goblet', lavoro: 45, recupero: 15 }, { es: 'rematore', lavoro: 45, recupero: 15 }, { es: 'stacco', lavoro: 45, recupero: 15 },
      { es: 'alzate-frontali', lavoro: 40, recupero: 20 }, { es: 'farmer', lavoro: 45, recupero: 30 },
    ], giri: 3, recuperoDopo: 60 }],
  },
  {
    id: 'spalle-elastico', nome: 'Spalle sane con l’elastico', formato: 'circuito', obiettivo: 'spalle', livello: 1, leggero: true,
    descrizione: 'Scapole forti e spalle stabili: meno fatica a tenere la mira, meno dolori a fine gara.',
    blocchi: [{ passi: [
      { es: 'aperture-elastico', lavoro: 40, recupero: 15 }, { es: 'circonduzioni', lavoro: 30, recupero: 10 }, { es: 'piegamenti', lavoro: 30, recupero: 20 }, { es: 'superman', lavoro: 30, recupero: 20 },
    ], giri: 3, recuperoDopo: 30 }],
  },
  {
    id: 'sbarra', nome: 'Presa alla sbarra', formato: 'intervalli', obiettivo: 'presa', livello: 2,
    descrizione: 'Sospensioni brevi e ripetute per una presa che non molla nemmeno a fine giornata.',
    blocchi: [{ passi: [{ es: 'sospensione', lavoro: 25, recupero: 35 }, { es: 'pugni', lavoro: 30, recupero: 20 }], giri: 4, recuperoDopo: 0 }],
  },
]

/** L'estrazione a secco: un passo speciale del lettore (beep casuale, poi estrazione e ingaggio). */
export const ESTRAZIONE = { id: 'estrazione', nome: 'Estrazione a secco', cue: 'Mani in posizione di partenza. Al beep estrai e ingaggia il bersaglio come in gara. Arma scarica.' }

export const attrezziDi = (a: Allenamento): Attrezzo[] => [...new Set(a.blocchi.flatMap((b) => b.passi).map((p) => esercizio(p.es)?.attrezzo).filter((x): x is Attrezzo => !!x && x !== 'nessuno'))]

/** Un momento del lettore: preparazione, lavoro o recupero. */
export interface Momento { tipo: 'prepara' | 'lavoro' | 'recupero'; es: string; durata: number; giro: number; giri: number; blocco: number; blocchi: number }

export function sequenza(a: Allenamento, prepara = 10): Momento[] {
  const out: Momento[] = []
  a.blocchi.forEach((b, bi) => {
    for (let g = 1; g <= b.giri; g++) {
      b.passi.forEach((p, pi) => {
        if (!out.length) out.push({ tipo: 'prepara', es: p.es, durata: prepara, giro: g, giri: b.giri, blocco: bi + 1, blocchi: a.blocchi.length })
        out.push({ tipo: 'lavoro', es: p.es, durata: p.lavoro, giro: g, giri: b.giri, blocco: bi + 1, blocchi: a.blocchi.length })
        const ultimoPasso = pi === b.passi.length - 1
        const rec = ultimoPasso && g === b.giri ? (bi < a.blocchi.length - 1 ? Math.max(b.recuperoDopo, p.recupero) : 0) : p.recupero
        const prossimo = ultimoPasso ? (g < b.giri ? b.passi[0] : a.blocchi[bi + 1]?.passi[0]) : b.passi[pi + 1]
        if (rec > 0 && prossimo) out.push({ tipo: 'recupero', es: prossimo.es, durata: rec, giro: g, giri: b.giri, blocco: bi + 1, blocchi: a.blocchi.length })
      })
    }
  })
  return out
}

export const durataSec = (a: Allenamento) => sequenza(a).reduce((s, m) => s + m.durata, 0)
export const durataMin = (a: Allenamento) => Math.round(durataSec(a) / 60)
