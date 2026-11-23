/**
 * Questionario delle abilità: domande concrete, a scelta multipla, che si traducono
 * in un livello 1–5 per area. È la base per scegliere tra piano aggressivo e conservativo.
 */

export type AreaAbilita =
  | 'movimento' | 'ingressi' | 'ricaricaMovimento' | 'miniPopper' | 'piastre' | 'parziali'
  | 'lunghe' | 'transizioniLarghe' | 'mobili' | 'unaMano' | 'posizioniScomode' | 'gestioneColpi' | 'atletica'

export interface Domanda {
  area: AreaAbilita
  titolo: string // nome breve dell'area
  testo: string
  opzioni: { testo: string; livello: 1 | 2 | 3 | 4 | 5 }[]
}

export const DOMANDE: Domanda[] = [
  {
    area: 'movimento', titolo: 'Tiro in movimento',
    testo: 'Su bersagli larghi a 5–7 m, quando ti sposti tra due posizioni:',
    opzioni: [
      { testo: 'Non sparo mai in movimento', livello: 1 },
      { testo: 'Solo camminando lentamente su bersagli molto vicini', livello: 2 },
      { testo: 'Camminando a passo deciso su bersagli entro 7 m', livello: 3 },
      { testo: 'Anche a 10 m, rallentando poco', livello: 4 },
      { testo: 'Sì, senza rallentare in modo evidente, con buoni punti', livello: 5 },
    ],
  },
  {
    area: 'ingressi', titolo: 'Ingressi e uscite',
    testo: 'Quando arrivi in una posizione, il primo colpo parte:',
    opzioni: [
      { testo: 'Dopo essermi fermato e sistemato i piedi', livello: 1 },
      { testo: 'Appena fermo, ma l’arma sale solo all’arrivo', livello: 2 },
      { testo: 'Arma già in alto nell’ultimo passo, colpo all’arresto', livello: 3 },
      { testo: 'Mire allineate prima dell’arresto, colpo appena fermo', livello: 4 },
      { testo: 'In arrivo, prima dell’arresto completo, e esco con l’ultimo colpo', livello: 5 },
    ],
  },
  {
    area: 'ricaricaMovimento', titolo: 'Ricariche in movimento',
    testo: 'Le tue ricariche in gara:',
    opzioni: [
      { testo: 'Le faccio da fermo', livello: 1 },
      { testo: 'Camminando, ma spesso rallento o guardo il caricatore', livello: 2 },
      { testo: 'Camminando senza problemi', livello: 3 },
      { testo: 'Correndo, quasi sempre pulite', livello: 4 },
      { testo: 'Correndo a piena velocità, mai un errore', livello: 5 },
    ],
  },
  {
    area: 'miniPopper', titolo: 'Mini popper',
    testo: 'Mini popper a 15 m: quante volte su 10 lo abbatti al primo colpo, a ritmo gara?',
    opzioni: [
      { testo: '5 o meno', livello: 1 },
      { testo: '6–7', livello: 2 },
      { testo: '8', livello: 3 },
      { testo: '9', livello: 4 },
      { testo: '10', livello: 5 },
    ],
  },
  {
    area: 'piastre', titolo: 'Piastre',
    testo: 'Sei piastre da 20 cm a 10 m: quanti colpi in più ti servono di solito?',
    opzioni: [
      { testo: '3 o più', livello: 1 },
      { testo: '2', livello: 2 },
      { testo: '1', livello: 3 },
      { testo: 'Spesso nessuno', livello: 4 },
      { testo: 'Quasi mai uno', livello: 5 },
    ],
  },
  {
    area: 'parziali', titolo: 'Bersagli coperti',
    testo: 'Bersagli coperti al 50% da no-shoot a 10 m: ogni 10 doppiette, quante penalità (NS o miss)?',
    opzioni: [
      { testo: '3 o più', livello: 1 },
      { testo: '2', livello: 2 },
      { testo: '1', livello: 3 },
      { testo: 'Meno di una', livello: 4 },
      { testo: 'Praticamente mai', livello: 5 },
    ],
  },
  {
    area: 'lunghe', titolo: 'Distanze lunghe',
    testo: 'Carta a 20 m, doppietta a ritmo gara: quante A su 10 colpi?',
    opzioni: [
      { testo: '4 o meno', livello: 1 },
      { testo: '5–6', livello: 2 },
      { testo: '7', livello: 3 },
      { testo: '8', livello: 4 },
      { testo: '9–10', livello: 5 },
    ],
  },
  {
    area: 'transizioniLarghe', titolo: 'Transizioni larghe',
    testo: 'Tra due bersagli a più di 90° l’uno dall’altro:',
    opzioni: [
      { testo: 'Mi giro con i piedi e riparto', livello: 1 },
      { testo: 'Ci arrivo ma spesso sorpasso il bersaglio', livello: 2 },
      { testo: 'Fluido ma lento', livello: 3 },
      { testo: 'Veloce, gli occhi arrivano prima', livello: 4 },
      { testo: 'Veloce e preciso, anche al limite della sicurezza (180°)', livello: 5 },
    ],
  },
  {
    area: 'mobili', titolo: 'Bersagli mobili',
    testo: 'Swinger e drop-turn:',
    opzioni: [
      { testo: 'Aspetto sempre che si fermino', livello: 1 },
      { testo: 'Li ingaggio al primo passaggio solo se lenti', livello: 2 },
      { testo: 'Al primo passaggio se sono vicini', livello: 3 },
      { testo: 'Quasi sempre al primo passaggio', livello: 4 },
      { testo: 'Sempre al primo passaggio, anche se veloci', livello: 5 },
    ],
  },
  {
    area: 'unaMano', titolo: 'Una mano',
    testo: 'Tiro a una mano (forte e debole) a 7 m:',
    opzioni: [
      { testo: 'Molto lento e impreciso', livello: 1 },
      { testo: 'Forte ok, debole difficile', livello: 2 },
      { testo: 'Entrambe accettabili, lente', livello: 3 },
      { testo: 'Buone, poche C', livello: 4 },
      { testo: 'Quasi come a due mani', livello: 5 },
    ],
  },
  {
    area: 'posizioniScomode', titolo: 'Posizioni scomode',
    testo: 'Posizioni basse, feritoie, porte, inginocchiato:',
    opzioni: [
      { testo: 'Mi costano molto tempo', livello: 1 },
      { testo: 'Lento nell’ingresso, poi ok', livello: 2 },
      { testo: 'Nella media', livello: 3 },
      { testo: 'Rapide, le preparo bene', livello: 4 },
      { testo: 'Le trasformo in un vantaggio', livello: 5 },
    ],
  },
  {
    area: 'gestioneColpi', titolo: 'Gestione dei colpi',
    testo: 'In gara ti capita di restare a carrello aperto o con pochi colpi?',
    opzioni: [
      { testo: 'Spesso', livello: 1 },
      { testo: 'Ogni tanto', livello: 2 },
      { testo: 'Raramente', livello: 3 },
      { testo: 'Quasi mai: conto i colpi', livello: 4 },
      { testo: 'Mai: pianifico ogni ricarica', livello: 5 },
    ],
  },
  {
    area: 'atletica', titolo: 'Atletica',
    testo: 'Scatti, cambi di direzione e distanze di 10 m e oltre:',
    opzioni: [
      { testo: 'Cammino veloce', livello: 1 },
      { testo: 'Corsa leggera', livello: 2 },
      { testo: 'Corsa decisa', livello: 3 },
      { testo: 'Scatto e freno bene', livello: 4 },
      { testo: 'Esplosivo, freno e riparto in un passo', livello: 5 },
    ],
  },
]

export type Abilita = Partial<Record<AreaAbilita, number>>

export const livello = (a: Abilita | undefined, area: AreaAbilita, def = 3) => a?.[area] ?? def

export const ETICHETTE_LIVELLO = ['', 'Da costruire', 'Base', 'Solido', 'Avanzato', 'Eccellente']

/** Abilità più deboli e più forti, per il riepilogo. */
export function puntiForzaDeboli(a: Abilita) {
  const voci = DOMANDE.filter((d) => a[d.area]).map((d) => ({ area: d.area, titolo: d.titolo, v: a[d.area]! }))
  const ord = [...voci].sort((x, y) => x.v - y.v)
  return { deboli: ord.slice(0, 3).filter((x) => x.v <= 3), forti: ord.slice(-3).reverse().filter((x) => x.v >= 4) }
}
