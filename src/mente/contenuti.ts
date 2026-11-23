/** Contenuti del mental coach: frasi, esercizi guidati, routine. Testi originali Hitframe. */

export const FRASI = [
  'Lo stage si vince prima del beep: nel modo in cui lo hai visto, camminato e ripassato.',
  'Un colpo alla volta. Il prossimo è l’unico che conta.',
  'Velocità è togliere ciò che non serve, non aggiungere fretta.',
  'Vedi quello che ti serve vedere, poi premi. Né più né meno.',
  'L’errore è già passato: il bersaglio dopo no.',
  'In gara non si diventa più bravi: si tira come ci si è allenati. Allenati come vuoi tirare.',
  'Fluido prima, veloce poi. Il veloce arriva da solo.',
  'Il piano è la tua àncora: quando la testa corre, torna al piano.',
  'Respira, guarda il primo bersaglio, parti.',
  'Le A si costruiscono in bianco, a casa, quando nessuno guarda.',
  'Non serve lo stage perfetto: serve lo stage pulito.',
  'Ogni stage è una gara a sé. Chiudi quello prima, apri quello dopo.',
  'Il cronometro misura il tempo, non il tuo valore.',
  'La fiducia è un ricordo di lavoro fatto bene. Ricordatelo.',
  'Tieni lo sguardo dove devi andare, non dove sei appena stato.',
  'Il nervosismo è energia: decidi tu dove metterla.',
  'Meno pensieri, più mira.',
  'Pulito, deciso, tuo.',
  'Cammina lo stage con i piedi, tiralo con gli occhi.',
  'Il risultato è la conseguenza. Concentrati sul processo.',
  'Una ricarica fatta mille volte non ti tradisce alla millesima e una.',
  'Fai il tuo stage, non quello di chi ti ha preceduto.',
  'Calma nelle mani, decisione nei piedi.',
  'Quando dubiti, rallenta di un decimo e guarda la mira.',
  'Prepararsi bene è il modo migliore per divertirsi in gara.',
  'Hai già fatto tutto questo in allenamento. Ora fallo vedere.',
  'Il silenzio prima del beep è tuo: usalo.',
  'Ogni colpo ha un inizio e una fine. Finisci il colpo.',
  'Testa leggera, piano chiaro, grilletto pulito.',
  'Oggi meglio di ieri, non meglio di tutti.',
]

export const fraseDelGiorno = (d = new Date()) => {
  const giorno = Math.floor(d.getTime() / 86400000)
  return FRASI[giorno % FRASI.length]
}

export interface Fase { testo: string; secondi: number; respiro?: 'dentro' | 'trattieni' | 'fuori' }
export interface Esercizio {
  id: string
  titolo: string
  durata: string
  quando: string
  perche: string
  fasi: Fase[]
  ripeti?: number
}

const quadrata: Fase[] = [
  { testo: 'Inspira dal naso', secondi: 4, respiro: 'dentro' },
  { testo: 'Trattieni', secondi: 4, respiro: 'trattieni' },
  { testo: 'Espira lentamente', secondi: 4, respiro: 'fuori' },
  { testo: 'Trattieni a vuoto', secondi: 4, respiro: 'trattieni' },
]
const recupero: Fase[] = [
  { testo: 'Inspira dal naso', secondi: 4, respiro: 'dentro' },
  { testo: 'Espira lunga dalla bocca', secondi: 7, respiro: 'fuori' },
]

export const ESERCIZI: Esercizio[] = [
  {
    id: 'quadrata', titolo: 'Respirazione quadrata', durata: '≈ 1 min 40 s', quando: 'La sera prima, al campo, in attesa del turno',
    perche: 'Abbassa il battito e rimette ordine nei pensieri: è la stessa tecnica usata da piloti e forze speciali per restare lucidi sotto pressione.',
    fasi: quadrata, ripeti: 6,
  },
  {
    id: 'recupero', titolo: 'Respiro prima dello start', durata: '≈ 1 min', quando: 'Ultimi minuti prima di entrare nello stage',
    perche: 'L’espirazione più lunga dell’inspirazione calma il sistema nervoso senza toglierti energia.',
    fasi: recupero, ripeti: 5,
  },
  {
    id: 'visualizzazione', titolo: 'Visualizzazione dello stage', durata: '≈ 4 min', quando: 'Dopo il walkthrough, la sera prima della gara',
    perche: 'Il cervello usa gli stessi circuiti per immaginare e per fare: ripassare lo stage nella testa lo rende già “tirato”.',
    fasi: [
      { testo: 'Chiudi gli occhi. Tre respiri lenti.', secondi: 15 },
      { testo: 'Posizione di partenza: senti i piedi, le mani, il timer. Guarda il primo bersaglio.', secondi: 20 },
      { testo: 'Primo passaggio, al rallentatore: ogni posizione, ogni bersaglio, ogni ricarica. Vedi la mira su ogni colpo.', secondi: 60 },
      { testo: 'Secondo passaggio, a velocità reale. Mani morbide, piedi decisi.', secondi: 45 },
      { testo: 'Terzo passaggio con un imprevisto: un colpo dubbio. Lo rifai con calma e prosegui senza fretta.', secondi: 45 },
      { testo: 'Ultimo colpo, scarica e mostra. Senti la soddisfazione dello stage pulito.', secondi: 20 },
      { testo: 'Apri gli occhi. Ripeti la tua parola chiave.', secondi: 10 },
    ],
  },
  {
    id: 'reset', titolo: 'Reset dopo l’errore', durata: '30 s', quando: 'Dopo un miss, una procedura o uno stage andato male',
    perche: 'L’errore costa una volta; ripensarci lo fa costare in ogni stage dopo. Il reset lo chiude.',
    fasi: [
      { testo: 'Riconosci: “È successo.” Senza giudicarti.', secondi: 6 },
      { testo: 'Respira: un’inspirazione lunga e un’espirazione lunghissima.', secondi: 10, respiro: 'fuori' },
      { testo: 'Riparti: cosa farai di diverso nel prossimo stage? Una cosa sola.', secondi: 8 },
      { testo: 'Ripeti la tua parola chiave e passa oltre.', secondi: 6 },
    ],
  },
  {
    id: 'scansione', titolo: 'Scansione del corpo', durata: '≈ 2 min', quando: 'Quando ti senti rigido o agitato',
    perche: 'Le tensioni nelle spalle e nelle mani rovinano lo scatto. Trovarle è il primo passo per scioglierle.',
    fasi: [
      { testo: 'Piedi e gambe: radicati, ginocchia morbide.', secondi: 20 },
      { testo: 'Pancia e respiro: lascia scendere il respiro in basso.', secondi: 20 },
      { testo: 'Spalle: abbassale, allontanale dalle orecchie.', secondi: 20 },
      { testo: 'Braccia e mani: presa ferma, dita libere.', secondi: 20 },
      { testo: 'Viso e mascella: rilassa la fronte, apri i denti.', secondi: 20 },
      { testo: 'Tutto il corpo: pronto, non rigido.', secondi: 15 },
    ],
  },
  {
    id: 'focus', titolo: 'Focus sul mirino (in bianco)', durata: '≈ 2 min', quando: 'Durante l’allenamento in bianco',
    perche: 'Allena l’attenzione a restare sulla mira mentre il dito lavora: è la concentrazione che serve sui colpi difficili.',
    fasi: [
      { testo: 'Arma scarica e verificata, bersaglio in sicurezza. Impugna e mira.', secondi: 15 },
      { testo: '10 scatti lenti: guarda solo il mirino, che non deve muoversi.', secondi: 50 },
      { testo: '10 scatti al tuo ritmo da gara: stessa attenzione.', secondi: 40 },
      { testo: 'Com’è andata? Se il mirino si è mosso, rallenta al prossimo giro.', secondi: 10 },
    ],
  },
]

export const ROUTINE_DEFAULT = [
  'La sera prima: borsa pronta, caricatori pieni, munizioni contate',
  'La sera prima: visualizzazione degli stage che conosci',
  'Sveglia con margine, colazione leggera, acqua',
  'Al campo: briefing e walkthrough di ogni stage, scrivi il piano',
  'In attesa del turno: respirazione quadrata, niente telefono',
  'Prima dello start: respiro lungo, parola chiave, sguardo sul primo bersaglio',
  'Dopo ogni stage: reset, poi pensa solo al prossimo',
]

export const PAROLE_DEFAULT = ['Vedi la mira', 'Fluido', 'Piano']

export const DOMANDE_RIFLESSIONE = [
  'Cosa è andato bene oggi? (almeno una cosa)',
  'Cosa cambierò nella prossima gara?',
  'Cosa porto con me da questa gara?',
]
