/**
 * Disegni e istruzioni dei drill.
 * Coordinate in metri: x laterale (negativo a sinistra), y verso i bersagli (0 = linea del tiratore).
 */

export type TipoElemento = 'carta' | 'mini' | 'popper' | 'miniPopper' | 'piastra' | 'noshoot' | 'tiratore' | 'box' | 'tavolo' | 'muro' | 'freccia' | 'linea' | 'barile' | 'bobber'

export interface ElementoSchema {
  t: TipoElemento
  x: number
  y: number
  x2?: number
  y2?: number
  /** etichetta: T1, P1… */
  id?: string
  /** nota breve sul bersaglio, es. "×2", "1° e 4°" */
  nota?: string
  /** piastra: 'asta' (su asta da 1 m) o 'terra'; bobber: 'laterale', 'passata', 'piatto' */
  variante?: string
  /** tiratore: verso dove guarda all'inizio */
  verso?: 'avanti' | 'indietro'
}

export interface Schema { elementi: ElementoSchema[] }

export interface Istruzioni {
  allestimento: string
  passi: string[]
  attenzione: string[]
  schema: Schema
}

const T = (x: number, y: number, id: string, nota = '×2'): ElementoSchema => ({ t: 'carta', x, y, id, nota })
const tiratore = (x = 0, y = 0, verso: 'avanti' | 'indietro' = 'avanti'): ElementoSchema => ({ t: 'tiratore', x, y, verso })

export const ISTRUZIONI: Record<string, Istruzioni> = {
  estrazione: {
    allestimento: 'Un bersaglio IPSC a 7 m, al centro. Fondina e caricatori come in gara.',
    passi: ['Mani in resa sopra le spalle, arma carica in fondina.', 'Al beep presa, estrazione e un solo colpo in A.', 'Ripeti 5–10 volte: annota il tempo del primo colpo.'],
    attenzione: ['La presa si costruisce in fondina, non durante la salita.', 'Il colpo parte appena il punto è in A: niente rifinitura.'],
    schema: { elementi: [tiratore(), T(0, 7, 'T1', '×1')] },
  },
  bill: {
    allestimento: 'Un bersaglio IPSC a 7 m.',
    passi: ['Mani in resa, arma in fondina.', 'Al beep estrazione e 6 colpi sullo stesso bersaglio.', 'Tutti i colpi devono essere A: se esci dalla A rallenta il ritmo.'],
    attenzione: ['Il ritmo segue l’immagine delle mire, non un tempo prefissato.', 'Spingi in avanti con la mano debole per tenere il punto basso.'],
    schema: { elementi: [tiratore(), T(0, 7, 'T1', '×6')] },
  },
  doppiette: {
    allestimento: 'Un bersaglio IPSC a 7 m.',
    passi: ['Mani in resa, arma in fondina.', 'Al beep estrazione e due colpi in A.', 'Ripeti in serie: guarda lo split tra primo e secondo colpo.'],
    attenzione: ['Il secondo colpo parte quando il punto rientra in A, non quando si ferma.', 'Non rilasciare del tutto il grilletto: solo fino al reset.'],
    schema: { elementi: [tiratore(), T(0, 7, 'T1')] },
  },
  blake: {
    allestimento: 'Tre bersagli IPSC a 7 m, a 1 m l’uno dall’altro.',
    passi: ['Mani in resa, arma in fondina.', 'Al beep due colpi su T1, poi T2, poi T3.', 'Ripeti partendo anche da T3 verso T1.'],
    attenzione: ['Gli occhi vanno sul bersaglio successivo prima che l’arma si muova.', 'Frena l’arma sul bersaglio: non scivolare oltre.'],
    schema: { elementi: [tiratore(), T(-1, 7, 'T1'), T(0, 7, 'T2'), T(1, 7, 'T3')] },
  },
  presidente: {
    allestimento: 'Tre bersagli IPSC a 10 m, a 1 m l’uno dall’altro. Un caricatore con 6 colpi e uno di ricarica.',
    passi: ['Spalle ai bersagli, mani sopra le spalle.', 'Al beep ti giri, estrai e spari due colpi su T1, T2, T3.', 'Ricarica e di nuovo due colpi su ciascun bersaglio.'],
    attenzione: ['Gira sul piede del lato della fondina: l’arma esce già verso i bersagli.', 'In ricarica gli occhi restano sul primo bersaglio da ingaggiare.'],
    schema: { elementi: [tiratore(0, 0, 'indietro'), T(-1, 10, 'T1', '×2+2'), T(0, 10, 'T2', '×2+2'), T(1, 10, 'T3', '×2+2')] },
  },
  ricarica: {
    allestimento: 'Un bersaglio IPSC a 7 m. Primo caricatore con 2 colpi (o 1 per la ricarica a carrello aperto).',
    passi: ['Arma puntata in basso verso il bersaglio.', 'Al beep due colpi in A.', 'Ricarica e altri due colpi in A.'],
    attenzione: ['Il caricatore nuovo parte verso l’arma mentre il vecchio sta cadendo.', 'L’arma resta alta, all’altezza degli occhi: la ricarica avviene nel campo visivo.'],
    schema: { elementi: [tiratore(), T(0, 7, 'T1', '2-R-2')] },
  },
  accelerator: {
    allestimento: 'Tre bersagli IPSC: T1 a 7 m, T2 a 15 m, T3 a 25 m, leggermente sfalsati.',
    passi: ['Mani in resa, arma in fondina.', 'Al beep due colpi su T1, poi T2, poi T3.', 'Prova anche l’ordine inverso, dal lontano al vicino.'],
    attenzione: ['Cambia ritmo con la distanza: veloce sul vicino, mira più stretta sul lontano.', 'Non portare il ritmo del vicino sul bersaglio a 25 m.'],
    schema: { elementi: [tiratore(), T(-1.5, 7, 'T1'), T(0, 15, 'T2'), T(1.5, 25, 'T3')] },
  },
  'carta-metallo': {
    allestimento: 'Due bersagli IPSC a 7 m e un mini popper a 15 m in mezzo.',
    passi: ['Mani in resa, arma in fondina.', 'Al beep due colpi su T1 e due su T2.', 'Ultimo colpo, singolo e preciso, sul mini popper.'],
    attenzione: ['Sulla carta doppietta veloce, sul metallo un colpo solo con il punto fermo.', 'Non anticipare il colpo sul popper guardando se cade.'],
    schema: { elementi: [tiratore(), T(-1, 7, 'T1'), T(1, 7, 'T2'), { t: 'miniPopper', x: 0, y: 15, id: 'MP1', nota: '×1' }] },
  },
  piastre: {
    allestimento: 'Plate rack o sei piastre da 20 cm in fila a 10 m.',
    passi: ['Mani in resa, arma in fondina.', 'Al beep un colpo su ciascuna piastra, da sinistra a destra.', 'Ripeti da destra a sinistra.'],
    attenzione: ['Il punto si ferma sulla piastra prima di premere.', 'Gli occhi saltano alla piastra successiva appena parte il colpo.'],
    schema: { elementi: [tiratore(), ...[-1.25, -0.75, -0.25, 0.25, 0.75, 1.25].map((x, i): ElementoSchema => ({ t: 'piastra', x, y: 10, id: `${i + 1}` }))] },
  },
  parziali: {
    allestimento: 'Due bersagli IPSC a 10 m, ciascuno coperto per metà da un no-shoot.',
    passi: ['Mani in resa, arma in fondina.', 'Al beep due colpi su T1 e due su T2.', 'Conta solo le A: un no-shoot o un miss annulla la prova.'],
    attenzione: ['Mira sulla parte libera della zona A, lontano dal bordo del no-shoot.', 'Rallenta quanto basta: qui la penalità costa più del tempo.'],
    schema: { elementi: [tiratore(), T(-1.2, 10, 'T1'), { t: 'noshoot', x: -0.85, y: 9.8 }, T(1.2, 10, 'T2'), { t: 'noshoot', x: 0.85, y: 9.8 }] },
  },
  ingresso: {
    allestimento: 'Un box (o due fault line) a 7 m da due bersagli IPSC. Partenza 4 m dietro il box.',
    passi: ['Fuori dal box, mani in resa.', 'Al beep corri verso il box estraendo durante il movimento.', 'Appena i piedi sono dentro, due colpi su T1 e due su T2.'],
    attenzione: ['Accorcia gli ultimi passi: arrivi già fermo e in mira.', 'L’arma è in mira prima che il secondo piede tocchi terra.'],
    schema: { elementi: [{ t: 'box', x: 0, y: 0 }, tiratore(0, -4), { t: 'freccia', x: 0, y: -3.4, x2: 0, y2: -0.6 }, T(-1, 7, 'T1'), T(1, 7, 'T2')] },
  },
  'box-box': {
    allestimento: 'Due box a 5 m di distanza, una parete tra i due. T1 si vede solo dal box A, T2 solo dal box B.',
    passi: ['Nel box A, mani in resa.', 'Al beep due colpi su T1.', 'Ti sposti nel box B e spari due colpi su T2.'],
    attenzione: ['Il primo passo parte con l’ultimo colpo su T1.', 'Durante lo spostamento l’arma resta in alto, pronta.'],
    schema: { elementi: [{ t: 'box', x: -2.5, y: 0, id: 'A' }, { t: 'box', x: 2.5, y: 0, id: 'B' }, tiratore(-2.5, 0), { t: 'freccia', x: -1.6, y: 0, x2: 1.6, y2: 0 }, { t: 'muro', x: 0, y: 1.5, x2: 0, y2: 5 }, T(-3, 7, 'T1'), T(3, 7, 'T2')] },
  },
  movimento: {
    allestimento: 'Una linea di 6 m parallela ai bersagli. Quattro bersagli IPSC a 5–7 m, distribuiti in larghezza.',
    passi: ['Inizio linea, mani in resa.', 'Al beep cammini lungo la linea e spari due colpi su ciascun bersaglio.', 'Ripeti nel senso opposto.'],
    attenzione: ['Passi corti e ginocchia morbide: il busto non deve saltare.', 'Velocità costante: meglio lento e regolare che a strappi.'],
    schema: { elementi: [tiratore(-3, 0), { t: 'freccia', x: -2.4, y: 0, x2: 3, y2: 0 }, T(-3, 6, 'T1'), T(-1, 6.5, 'T2'), T(1, 6.5, 'T3'), T(3, 6, 'T4')] },
  },
  'mano-forte': {
    allestimento: 'Tre bersagli IPSC a 7 m, a 1 m l’uno dall’altro.',
    passi: ['Arma in mano forte puntata in basso.', 'Al beep due colpi su ciascun bersaglio, solo mano forte.', 'Ripeti partendo dall’altro lato.'],
    attenzione: ['Polso bloccato e braccio teso: lo scatto deve essere dritto.', 'Ruota leggermente l’arma verso l’interno se ti aiuta a tenerla ferma.'],
    schema: { elementi: [tiratore(), T(-1, 7, 'T1'), T(0, 7, 'T2'), T(1, 7, 'T3')] },
  },
  'mano-debole': {
    allestimento: 'Un tavolo con l’arma carica sopra, due bersagli IPSC a 7 m.',
    passi: ['Mani sui segni, arma sul tavolo.', 'Al beep prendi l’arma con la mano debole.', 'Due colpi su ciascun bersaglio, solo mano debole.'],
    attenzione: ['Non cercare la stessa velocità della mano forte: prima la precisione.', 'Inclina la testa verso l’arma se ti aiuta l’occhio dominante.'],
    schema: { elementi: [{ t: 'tavolo', x: 0, y: 0.7 }, tiratore(), T(-1, 7, 'T1'), T(1, 7, 'T2')] },
  },
  tavolo: {
    allestimento: 'Un tavolo con l’arma carica sopra, un bersaglio IPSC a 7 m.',
    passi: ['Mani sui segni, arma sul tavolo.', 'Al beep presa dell’arma direttamente in impugnatura da tiro.', 'Due colpi in A.'],
    attenzione: ['Afferra l’arma già con la presa giusta: niente correzioni in salita.', 'Abbassa le spalle verso il tavolo, non piegarti con la schiena.'],
    schema: { elementi: [{ t: 'tavolo', x: 0, y: 0.7 }, tiratore(), T(0, 7, 'T1')] },
  },
  scarica: {
    allestimento: 'Arma scarica sul tavolo con il carrello chiuso, caricatore accanto. Un bersaglio IPSC a 7 m.',
    passi: ['Mani sui segni.', 'Al beep prendi arma e caricatore, inserisci e cameri.', 'Due colpi in A.'],
    attenzione: ['Arma alta davanti agli occhi mentre inserisci il caricatore.', 'Cameratura decisa: la mano tira il carrello fino in fondo e lo lascia.'],
    schema: { elementi: [{ t: 'tavolo', x: 0, y: 0.7 }, tiratore(), T(0, 7, 'T1')] },
  },
  giro: {
    allestimento: 'Un bersaglio IPSC a 7 m.',
    passi: ['Spalle al bersaglio, mani in resa.', 'Al beep giri, estrai e spari due colpi.', 'Alterna il giro a destra e a sinistra, rispettando l’angolo di sicurezza.'],
    attenzione: ['L’arma esce dalla fondina solo quando sei girato verso il bersaglio.', 'Il giro lo fanno i piedi, non il busto.'],
    schema: { elementi: [tiratore(0, 0, 'indietro'), T(0, 7, 'T1')] },
  },
  'b-estrazione': {
    allestimento: 'Un bersaglio in scala sulla parete di casa (a 3 m equivale a un IPSC a 7 m). Arma scarica, nessuna munizione nella stanza.',
    passi: ['Imposta il par del timer sul tuo obiettivo.', 'Al primo beep estrazione e scatto in A.', 'Lo scatto deve arrivare prima del secondo beep. 10 su 10: abbassa il par di 0,05 s.'],
    attenzione: ['Il punto deve restare fermo allo scatto: conta più del tempo.', 'Controlla sempre che arma e caricatori siano scarichi.'],
    schema: { elementi: [tiratore(), { t: 'mini', x: 0, y: 3, id: 'T1', nota: 'in scala' }] },
  },
  'b-ricarica': {
    allestimento: 'Un bersaglio in scala, caricatori zavorrati senza munizioni.',
    passi: ['Arma puntata sul bersaglio.', 'Al beep ricarica completa.', 'Mire di nuovo sul bersaglio prima del par.'],
    attenzione: ['Il caricatore vecchio cade da solo: la mano va subito sul nuovo.', 'Lo sguardo resta sul bersaglio, non sul pozzetto.'],
    schema: { elementi: [tiratore(), { t: 'mini', x: 0, y: 3, id: 'T1', nota: 'in scala' }] },
  },
  'b-transizioni': {
    allestimento: 'Tre bersagli in scala sulla parete, distanziati come in uno stage.',
    passi: ['Mani in resa.', 'Al beep uno scatto su ciascun bersaglio.', 'Cambia ordine e distanza tra i bersagli a ogni serie.'],
    attenzione: ['Prima si muovono gli occhi, poi l’arma.', 'Lo scatto parte solo con il punto sulla A.'],
    schema: { elementi: [tiratore(), { t: 'mini', x: -1, y: 3, id: 'T1', nota: '×1' }, { t: 'mini', x: 0, y: 3, id: 'T2', nota: '×1' }, { t: 'mini', x: 1, y: 3, id: 'T3', nota: '×1' }] },
  },
  'b-ingressi': {
    allestimento: 'Due bersagli in scala e un segno a terra due passi più avanti.',
    passi: ['Fuori dalla posizione, mani in resa.', 'Al beep due passi verso il segno estraendo.', 'Scatto sui due bersagli appena i piedi si fermano.'],
    attenzione: ['L’arma arriva in mira insieme all’ultimo passo.', 'Piedi larghi e stabili all’arrivo.'],
    schema: { elementi: [tiratore(0, -1.5), { t: 'freccia', x: 0, y: -1, x2: 0, y2: -0.2 }, { t: 'box', x: 0, y: 0 }, { t: 'mini', x: -0.8, y: 3, id: 'T1', nota: '×1' }, { t: 'mini', x: 0.8, y: 3, id: 'T2', nota: '×1' }] },
  },
  'b-mano': {
    allestimento: 'Due bersagli in scala sulla parete.',
    passi: ['Arma puntata in basso, solo una mano.', 'Al beep scatto pulito su T1 e su T2.', 'Alterna una serie in mano forte e una in mano debole.'],
    attenzione: ['Polso bloccato: il punto non deve muoversi allo scatto.', 'Spalla rilassata, braccio teso.'],
    schema: { elementi: [tiratore(), { t: 'mini', x: -0.8, y: 3, id: 'T1', nota: '×1' }, { t: 'mini', x: 0.8, y: 3, id: 'T2', nota: '×1' }] },
  },
}
