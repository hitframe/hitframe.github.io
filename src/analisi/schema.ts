/**
 * Schema di uno stage: le posizioni nell'ordine in cui le fai e, per ognuna, i bersagli nell'ordine in cui li ingaggi.
 * È la base del motore di strategia: stringhe, ricariche, movimenti, tempi stimati sul profilo del tiratore.
 *
 * Regola FITDS di progettazione: ogni stage è pensato per la divisione Classic (10 colpi + 1 in canna se previsto),
 * quindi nessuna stringa supera i 10 colpi: tra una stringa e l'altra c'è sempre un punto naturale di ricarica.
 */
import { chiedi, estraiJson, getConfigAI, ErroreAI } from '../ai/ai'
import type { Classe, Profilo } from '../db/types'
import { CAPIENZA, PERC_PUNTI, stimaStage } from './motore'
import { TIPI_BERSAGLIO, type MappaStage, type TipoBersaglio } from './mappa'
import type { StageLetto } from './tipi'

export type Visibilita = 'piena' | 'parziale' | 'sporgersi'
export type Ingaggio = 'auto' | 'fermo' | 'movimento'
export type Stile = 'aggressivo' | 'equilibrato' | 'prudente'

export type Movimento = 'fermo' | 'arrivo' | 'uscita' | 'movimento'
export const NOMI_MOV: Record<Movimento, string> = { fermo: 'Da fermo', arrivo: 'In arrivo', uscita: 'In uscita / indietreggiando', movimento: 'In movimento' }

export interface BersaglioSchema {
  id: string
  tipo: TipoBersaglio
  distanza: number // metri
  vis: Visibilita
  /** come lo spari: fermo, arrivando in posizione, uscendo (anche indietreggiando) o in movimento */
  mov?: Movimento
  /** da che lato della posizione è (per chi si sporge: lato debole o forte) */
  lato?: 'sx' | 'dx'
  mobile?: boolean
  nota?: string
}
export interface Segno {
  k: 'P' | 'pos' | 'bers'
  x: number
  y: number
  tipo?: TipoBersaglio
  vis?: Visibilita
  /** distanza scelta a mano (metri): vince sul calcolo dal disegno */
  d?: number
  mov?: Movimento
  mobile?: boolean
  nome?: string
}
export interface PosizioneSchema {
  id: string // A, B, C…
  nome: string // "box destro, dietro i barili"
  metri: number // dalla posizione precedente (o dalla partenza)
  ingaggio: Ingaggio
  bersagli: BersaglioSchema[]
}
export interface SchemaStage {
  partenza: string
  posizioni: PosizioneSchema[]
  lettura?: string
  fonte: 'ai' | 'manuale'
  risposte?: { domanda: string; risposta: string }[]
  /** segni sul disegno (coordinate 0–1000 sull'immagine), nell'ordine: P, posizioni e bersagli */
  segni?: Segno[]
  /** profondità dello stage in metri, dalla fault line più bassa al parapalle (scala del disegno) */
  profondita?: number
  /** consigli del coach AI, per stile */
  coach?: Partial<Record<Stile, string[]>>
  aggiornato: string
}

export const DISTANZE = [3, 5, 7, 10, 12, 15, 20, 25]
export const METRI = [0, 1, 2, 3, 4, 5, 7, 10, 15]
export const NOMI_VIS: Record<Visibilita, string> = { piena: 'Visibile', parziale: 'Parziale / no-shoot', sporgersi: 'Devo sporgermi' }
export const NOMI_STILE: Record<Stile, string> = { aggressivo: 'Aggressiva', equilibrato: 'Equilibrata', prudente: 'Prudente' }
const TIPI_SCHEMA = (Object.keys(TIPI_BERSAGLIO) as TipoBersaglio[]).filter((t) => t !== 'noshoot')

export const lettera = (i: number) => String.fromCharCode(65 + i)
export const colpiDi = (b: Pick<BersaglioSchema, 'tipo'>) => TIPI_BERSAGLIO[b.tipo].colpi
export const colpiPosizione = (p: PosizioneSchema) => p.bersagli.reduce((t, b) => t + colpiDi(b), 0)

export function schemaVuoto(s?: StageLetto): SchemaStage {
  return { partenza: s?.posizionePartenza ?? '', posizioni: [{ id: 'A', nome: 'Partenza', metri: 0, ingaggio: 'auto', bersagli: [] }], fonte: 'manuale', aggiornato: new Date().toISOString() }
}

/** Ripulisce uno schema (anche quello arrivato dall'AI). */
export function normalizzaSchema(raw: Record<string, unknown>, fonte: 'ai' | 'manuale'): SchemaStage {
  const num = (v: unknown, a: number, b: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d }
  const visti = new Set<string>()
  const pos = (Array.isArray(raw.posizioni) ? raw.posizioni : []) as Record<string, unknown>[]
  const posizioni: PosizioneSchema[] = pos.map((p, i) => ({
    id: lettera(i),
    nome: String(p.nome ?? p.descrizione ?? '').slice(0, 80),
    metri: num(p.metri, 0, 40, i === 0 ? 0 : 4),
    ingaggio: p.ingaggio === 'fermo' || p.ingaggio === 'movimento' ? p.ingaggio : 'auto',
    bersagli: ((Array.isArray(p.bersagli) ? p.bersagli : []) as Record<string, unknown>[]).flatMap((b, j) => {
      const tipo = String(b.tipo ?? 'carta') as TipoBersaglio
      if (tipo === 'noshoot') return []
      let id = String(b.id ?? `${i + 1}.${j + 1}`).toUpperCase().replace(/\s+/g, '')
      if (visti.has(id)) return []
      visti.add(id)
      const vis = b.vis ?? b.visibilita
      return [{
        id,
        tipo: TIPI_SCHEMA.includes(tipo) ? tipo : 'carta',
        distanza: Math.round(num(b.distanza, 2, 40, 8)),
        vis: vis === 'parziale' || vis === 'sporgersi' ? vis : 'piena',
        mobile: !!b.mobile,
        nota: b.nota ? String(b.nota).slice(0, 80) : undefined,
      } satisfies BersaglioSchema]
    }),
  }))
  return {
    partenza: String(raw.partenza ?? ''),
    posizioni: posizioni.length ? posizioni : schemaVuoto().posizioni,
    lettura: typeof raw.lettura === 'string' ? raw.lettura : undefined,
    fonte,
    aggiornato: new Date().toISOString(),
  }
}

/** Dalla vecchia mappa disegnata: ogni bersaglio va alla prima posizione che lo vede. */
export function daMappa(m: MappaStage, s: StageLetto): SchemaStage | null {
  if (!m.posizioni.length || !m.bersagli.length) return null
  const fatti = new Set<string>()
  const posizioni: PosizioneSchema[] = m.posizioni.map((p, i) => {
    const prima = i === 0 ? m.partenza : m.posizioni[i - 1]
    const bersagli = p.vede.flatMap((id) => {
      const b = m.bersagli.find((x) => x.id === id)
      if (!b || b.tipo === 'noshoot' || fatti.has(id)) return []
      fatti.add(id)
      return [{ id, tipo: b.tipo, distanza: Math.round(b.distanza), vis: b.parziale ? 'parziale' : 'piena', mobile: b.mobile } as BersaglioSchema]
    })
    return { id: lettera(i), nome: p.nota, metri: Math.round(Math.hypot((p.x - prima.x) * m.larghezzaM, (p.y - prima.y) * m.profonditaM)), ingaggio: 'auto' as Ingaggio, bersagli }
  }).filter((p) => p.bersagli.length)
  if (!posizioni.length) return null
  return { partenza: s.posizionePartenza, posizioni: posizioni.map((p, i) => ({ ...p, id: lettera(i) })), lettura: m.lettura, fonte: m.fonte, aggiornato: new Date().toISOString() }
}

/** Confronto con il briefing: colpi e bersagli per tipo. */
export function controllaSchema(sc: SchemaStage, s: StageLetto): string[] {
  const tutti = sc.posizioni.flatMap((p) => p.bersagli)
  const out: string[] = []
  const colpi = tutti.reduce((t, b) => t + colpiDi(b), 0)
  if (colpi !== s.colpi) out.push(`Lo schema ha ${colpi} colpi, il briefing ne indica ${s.colpi}.`)
  const carta = tutti.filter((b) => b.tipo === 'carta' || b.tipo === 'mini').length
  const metallo = tutti.filter((b) => TIPI_BERSAGLIO[b.tipo].metallo).length
  const attCarta = s.bersagli.carta + s.bersagli.miniCarta
  const attMet = s.bersagli.popper + s.bersagli.miniPopper + s.bersagli.piastre
  if (carta !== attCarta) out.push(`Bersagli di carta: ${carta} nello schema, ${attCarta} nel briefing.`)
  if (metallo !== attMet) out.push(`Metalli: ${metallo} nello schema, ${attMet} nel briefing.`)
  return out
}

/* ---------------- motore della strategia ---------------- */

export interface Passo {
  tipo: 'partenza' | 'movimento' | 'tiro' | 'ricarica'
  titolo: string
  dettaglio: string
  tempo: number
  posizione?: string
}
export interface Stringa { n: number; colpi: number; testo: string }
export interface Strategia {
  stile: Stile
  capienza: number
  scorta: number
  tempo: number
  punti: number
  hf: number
  stringhe: Stringa[]
  ricariche: { prima: string; inMovimento: boolean; testo: string }[]
  passi: Passo[]
  consigli: string[]
}

const PARAMETRI: Record<Stile, { split: number; entrata: number; uscita: number; rischio: number }> = {
  aggressivo: { split: 0.94, entrata: 0.7, uscita: 0.55, rischio: 0.035 },
  equilibrato: { split: 1, entrata: 1, uscita: 1, rischio: 0.015 },
  prudente: { split: 1.08, entrata: 1.15, uscita: 1.1, rischio: 0 },
}
// chi ha meno esperienza paga di più l'aggressività in punti
const PENALITA_CLASSE: Record<Classe, number> = { D: 2.2, C: 1.8, B: 1.4, A: 1.1, Master: 0.8, 'Grand Master': 0.6 }

export function capienzaDi(profilo: Pick<Profilo, 'divisione' | 'armaDettagli'>) {
  return profilo.armaDettagli?.capienza || CAPIENZA[profilo.divisione] || 15
}

/** Colpi in arma alla partenza: arma scarica o non camerata = caricatore pieno; altrimenti +1 in canna. */
export function colpiAllaPartenza(s: StageLetto, cap: number) {
  return s.flag.armaScarica || s.flag.colpoNonCamerato ? cap : cap + 1
}

interface Ctx { cap: number; t: Profilo['tempi']; pend: number; st: typeof PARAMETRI[Stile]; scorta: number; mano: 'destra' | 'sinistra' }

const fattoreDist = (c: Ctx, d: number) => 1 + Math.max(0, d - 7) * c.pend

/** Tiro in una posizione: tempi dei bersagli e ricariche da fermo se i colpi non bastano. */
function tiraPosizione(c: Ctx, p: PosizioneSchema, colpiIn: number, entraInMovimento: boolean, finale: boolean) {
  let colpi = colpiIn
  let tempo = 0
  const dettagli: string[] = []
  const ricaricheFermo: string[] = []
  p.bersagli.forEach((b, i) => {
    let altriExtra = 0
    const n = colpiDi(b)
    // colpi di scorta per i makeup: mai pianificare di sparare l'ultimo colpo prima di un cambio (tranne alla fine dello stage)
    const ultimo = finale && i === p.bersagli.length - 1
    if (colpi < n + (ultimo ? 0 : c.scorta)) {
      tempo += c.t.ricarica - c.t.transizioneVicina + (colpi === 0 ? 0.3 : 0)
      ricaricheFermo.push(b.id)
      colpi = colpi > 0 ? c.cap + 1 : c.cap
    }
    const f = fattoreDist(c, b.distanza)
    const metallo = TIPI_BERSAGLIO[b.tipo].metallo
    // primo colpo sul bersaglio
    let primo: number
    if (i === 0) primo = entraInMovimento ? 0.15 : 0 // il grosso è nell'entrata in posizione
    else {
      const prima = p.bersagli[i - 1]
      const lontano = Math.abs(prima.distanza - b.distanza) > 5 || b.vis === 'sporgersi' || prima.vis === 'sporgersi'
      primo = (lontano ? c.t.transizioneLontana : c.t.transizioneVicina) * f
    }
    if (metallo) primo += Math.max(0, c.t.colpoPiastra - c.t.split) * f * 0.5
    if (b.vis === 'sporgersi') {
      primo += 0.25
      // sporgersi dal lato debole (a sinistra per un destro, a destra per un mancino) costa di più
      if (b.lato && (b.lato === 'sx') === (c.mano === 'destra')) primo += 0.15
    }
    // sparare in movimento: split un po' più lenti
    if (b.mov === 'movimento' || (b.mov && b.mov !== 'fermo' && i > 0)) altriExtra += n * 0.04
    let altri = (n - 1) * c.t.split * c.st.split * f + altriExtra
    if (b.vis !== 'piena') altri += n * 0.07
    if (b.mobile) primo += 0.3
    tempo += primo + altri
    colpi -= n
    dettagli.push(`${b.id}${metallo ? ' (metallo)' : ''}`)
  })
  return { tempo, colpi, dettagli, ricaricheFermo }
}

/** Calcola la strategia per uno stile: sceglie dove ricaricare (meglio in movimento) e stima tempi e punti. */
export function strategia(sc: SchemaStage, s: StageLetto, profilo: Profilo, stile: Stile, capienza?: number, scorta = 2): Strategia | null {
  const pos = sc.posizioni.filter((p) => p.bersagli.length)
  if (!pos.length) return null
  const t = profilo.tempi
  const c: Ctx = { cap: capienza ?? capienzaDi(profilo), t, pend: profilo.pendenzaDistanza ?? 0.035, st: PARAMETRI[stile], scorta, mano: profilo.manoForte ?? 'destra' }
  const inizio = colpiAllaPartenza(s, c.cap)

  const movimento = (i: number) => {
    const m = pos[i].metri
    // se l'ultimo bersaglio della posizione prima si spara uscendo, l'uscita è quasi gratis
    const ultimo = i > 0 ? pos[i - 1].bersagli[pos[i - 1].bersagli.length - 1] : undefined
    const usc = ultimo?.mov === 'uscita' || ultimo?.mov === 'movimento' ? 0.4 : c.st.uscita
    return m > 0 ? t.uscitaPosizione * usc + m / Math.max(1.2, t.velocitaMovimento) : 0
  }
  // tiro in movimento: deciso dal tiratore o, in automatico, solo per bersagli vicini e visibili con stile aggressivo
  const inMov = (p: PosizioneSchema) => p.ingaggio === 'movimento' || p.bersagli[0].mov === 'arrivo' || p.bersagli[0].mov === 'movimento'
    || (p.ingaggio === 'auto' && !p.bersagli[0].mov && stile === 'aggressivo' && p.metri > 0 && p.bersagli[0].distanza <= 8 && p.bersagli[0].vis === 'piena')

  // programmazione dinamica sulle ricariche in movimento: stato = colpi rimasti entrando nella posizione i
  type Nodo = { costo: number; prev: number | null; ricarica: boolean }
  let correnti = new Map<number, Nodo>([[inizio, { costo: 0, prev: null, ricarica: false }]])
  const storia: Map<number, Nodo>[] = []
  for (let i = 0; i < pos.length; i++) {
    const nuovi = new Map<number, Nodo>()
    for (const [colpi, nodo] of correnti) {
      const scelte: [number, boolean, number][] = [[colpi, false, 0]]
      if (i > 0 && colpi < c.cap + 1) {
        const tm = movimento(i)
        // la ricarica in movimento costa solo la parte che non si nasconde nello spostamento
        // a parità di tempo meglio ricaricare tardi (meno colpi lasciati nel caricatore)
        scelte.push([colpi > 0 ? c.cap + 1 : c.cap, true, Math.max(0.2, t.ricarica * 0.85 - tm) + (colpi === 0 ? 0.3 : 0) + colpi * 0.01])
      }
      for (const [entra, ric, extra] of scelte) {
        const r = tiraPosizione(c, pos[i], entra, inMov(pos[i]), i === pos.length - 1)
        const costo = nodo.costo + extra + r.tempo
        const k = r.colpi
        const prima = nuovi.get(k)
        if (!prima || costo < prima.costo) nuovi.set(k, { costo, prev: colpi, ricarica: ric })
      }
    }
    storia.push(nuovi)
    correnti = nuovi
  }
  // ricostruzione del percorso migliore
  let migliore: [number, Nodo] | null = null
  for (const e of correnti) if (!migliore || e[1].costo < migliore[1].costo) migliore = e
  if (!migliore) return null
  const scelte: { ricarica: boolean; entra: number }[] = []
  let k: number | null = migliore[0]
  for (let i = pos.length - 1; i >= 0; i--) {
    const n: Nodo = storia[i].get(k!)!
    scelte.unshift({ ricarica: n.ricarica, entra: n.ricarica ? (n.prev! > 0 ? c.cap + 1 : c.cap) : n.prev! })
    k = n.prev
  }

  // passi e totali
  const passi: Passo[] = []
  const ricariche: Strategia['ricariche'] = []
  const stringhe: Stringa[] = []
  let corrente: { colpi: number; parti: string[] } = { colpi: 0, parti: [] }
  const chiudiStringa = () => { if (corrente.colpi) stringhe.push({ n: stringhe.length + 1, colpi: corrente.colpi, testo: corrente.parti.join(' · ') }); corrente = { colpi: 0, parti: [] } }
  let tempo = 0
  const partenzaTavolo = s.flag.armaSuTavolo
  const carica = s.flag.armaScarica || s.flag.colpoNonCamerato
  let manipolazione = partenzaTavolo ? 0.35 : 0
  if (s.flag.armaScarica) manipolazione += 1.5
  else if (s.flag.colpoNonCamerato) manipolazione += 0.45

  pos.forEach((p, i) => {
    const mov = i === 0 && p.metri === 0 ? 0 : (i === 0 ? p.metri / Math.max(1.2, t.velocitaMovimento) + 0.2 : movimento(i))
    const scelta = scelte[i]
    const movimentoEntrando = inMov(p)
    if (i === 0) {
      const base = Math.max(t.estrazione, manipolazione + 0.5)
      const durata = p.metri > 0 ? Math.max(mov, manipolazione) + t.entrataPosizione * c.st.entrata : base
      tempo += durata
      passi.push({
        tipo: 'partenza', titolo: p.metri > 0 ? `Partenza e corsa verso ${p.id}` : 'Partenza',
        dettaglio: p.metri > 0
          ? `${partenzaTavolo ? 'Prendi l’arma dal tavolo' : 'Estrai'}${carica ? ' e carica camminando' : ''}: ${p.metri} m fino a ${p.id}${p.nome ? ` (${p.nome})` : ''}. Arma pronta prima di arrivare.`
          : `${partenzaTavolo ? 'Prendi l’arma dal tavolo' : 'Estrazione'}${carica ? ', inserisci il caricatore e cameri' : ''} e primo colpo da ${p.id}.`,
        tempo: durata, posizione: p.id,
      })
    } else {
      if (scelta.ricarica) {
        ricariche.push({ prima: p.id, inMovimento: true, testo: `Ricarica mentre vai da ${pos[i - 1].id} a ${p.id}` })
        chiudiStringa()
      }
      const entrata = movimentoEntrando ? t.entrataPosizione * 0.45 : t.entrataPosizione * c.st.entrata
      const durata = mov + entrata + (scelta.ricarica ? Math.max(0.2, t.ricarica * 0.85 - mov) : 0)
      tempo += durata
      passi.push({
        tipo: 'movimento', titolo: `${pos[i - 1].id} → ${p.id}${scelta.ricarica ? ' con ricarica' : ''}`,
        dettaglio: [
          `${p.metri} m${p.nome ? ` verso ${p.nome}` : ''}.`,
          scelta.ricarica ? 'Cambia caricatore appena lasci la posizione, arma alta e occhi già sul prossimo bersaglio.' : '',
          movimentoEntrando ? `Spara il ${p.bersagli[0].id} entrando, senza fermarti del tutto.` : 'Piedi piantati prima del primo colpo.',
        ].filter(Boolean).join(' '),
        tempo: durata, posizione: p.id,
      })
    }
    const r = tiraPosizione(c, p, scelta.entra, movimentoEntrando, i === pos.length - 1)
    tempo += r.tempo
    let parti: string[] = []
    for (const b of p.bersagli) {
      if (r.ricaricheFermo.includes(b.id)) {
        corrente.parti.push(`${p.id}: ${parti.join(', ')}`)
        chiudiStringa(); parti = []
        ricariche.push({ prima: p.id, inMovimento: false, testo: `Ricarica da fermo in ${p.id} prima del ${b.id}` })
      }
      parti.push(b.id)
      corrente.colpi += colpiDi(b)
    }
    if (parti.length) corrente.parti.push(`${p.id}: ${parti.join(', ')}`)
    const vis = p.bersagli.filter((b) => b.vis !== 'piena').map((b) => `${b.id} ${b.vis === 'sporgersi' ? `(sporgiti${b.lato && (b.lato === 'sx') === (c.mano === 'destra') ? ', lato debole' : ''})` : '(parziale: mira precisa)'}`)
    const inMovimento = p.bersagli.filter((b) => b.mov && b.mov !== 'fermo').map((b) => `${b.id} ${NOMI_MOV[b.mov!].toLowerCase()}`)
    passi.push({
      tipo: 'tiro', titolo: `${p.id}${p.nome ? ` · ${p.nome}` : ''}: ${colpiPosizione(p)} colpi`,
      dettaglio: [`Ordine: ${p.bersagli.map((b) => b.id).join(' → ')}.`, inMovimento.length ? `In movimento: ${inMovimento.join(', ')}.` : '', vis.length ? `Attenzione: ${vis.join(', ')}.` : '', r.ricaricheFermo.length ? `Ricarica da fermo prima del ${r.ricaricheFermo.join(', ')}.` : ''].filter(Boolean).join(' '),
      tempo: r.tempo, posizione: p.id,
    })
  })
  chiudiStringa()

  const perc = PERC_PUNTI[profilo.classe] - c.st.rischio * PENALITA_CLASSE[profilo.classe]
  const parziali = pos.flatMap((p) => p.bersagli).filter((b) => b.vis !== 'piena').length
  const punti = Math.max(0, s.puntiMax * perc - parziali * 0.6)
  const consigli = consigliBase(pos, ricariche, stile, c.cap)
  return { stile, capienza: c.cap, scorta, tempo, punti, hf: punti / tempo, stringhe, ricariche, passi, consigli }
}

function consigliBase(pos: PosizioneSchema[], ricariche: Strategia['ricariche'], stile: Stile, cap: number): string[] {
  const out: string[] = []
  const fermo = ricariche.filter((r) => !r.inMovimento)
  if (fermo.length) out.push(`Con ${cap} colpi c’è una ricarica da fermo: valuta di anticiparla in un movimento (sposta l’ultimo bersaglio della stringa nella posizione dopo, se si vede).`)
  if (ricariche.some((r) => r.inMovimento)) out.push('Le ricariche cadono negli spostamenti: allenale in movimento, sono tempo gratis.')
  const lontani = pos.flatMap((p) => p.bersagli).filter((b) => b.distanza >= 15)
  if (lontani.length) out.push(`${lontani.map((b) => b.id).join(', ')} oltre i 15 m: split più lenti, mira sulla A.`)
  if (stile === 'aggressivo') out.push('Ingressi e uscite in movimento solo sui bersagli vicini e pieni: sui parziali fermati.')
  if (stile === 'prudente') out.push('Piano pulito: posizioni stabili e zero rischi, ideale se lo stage è il primo della gara.')
  return out
}

export type Scorta = number | 'auto'
/** Colpi di scorta per i makeup (impostazione del tiratore): 'auto' li decide lo stile e quanti metalli ci sono. */
export function leggiScorta(): Scorta {
  try {
    const v = localStorage.getItem('hf-colpi-scorta')
    if (v == null || v === 'auto') return 'auto'
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 'auto'
  } catch { return 'auto' }
}

/**
 * Scorta automatica: aggressiva = si può finire a slide aperto (ricarica da aperto); equilibrata 1; prudente 2.
 * Con molti ferri si tengono colpi per le ribattute: +1 ogni 3 metalli (massimo +2).
 */
export function scortaPer(stile: Stile, sc: SchemaStage, scelta: Scorta) {
  if (scelta !== 'auto') return scelta
  const ferri = sc.posizioni.flatMap((p) => p.bersagli).filter((b) => TIPI_BERSAGLIO[b.tipo].metallo).length
  const base = stile === 'aggressivo' ? 0 : stile === 'equilibrato' ? 1 : 2
  return base + Math.min(2, Math.floor(ferri / 3))
}

/**
 * Le tre strategie e quella consigliata (miglior hit factor atteso per il tuo livello).
 * I tempi assoluti sono ancorati ai tuoi tempi reali di gara per quel tipo di stage: il motore decide le differenze
 * tra le strategie e quanto questo stage è più facile o più difficile della media, non il tempo da zero.
 */
export function strategie(sc: SchemaStage, s: StageLetto, profilo: Profilo, scorta: Scorta = leggiScorta(), correzione = 1) {
  const tutte = (['aggressivo', 'equilibrato', 'prudente'] as Stile[]).map((st) => strategia(sc, s, profilo, st, undefined, scortaPer(st, sc, scorta))).filter(Boolean) as Strategia[]
  if (!tutte.length) return null
  const eq = tutte.find((x) => x.stile === 'equilibrato') ?? tutte[0]
  const rif = stimaStage(s, profilo)
  const motore = Math.min(rif.obiettivo * 1.3, Math.max(rif.obiettivo * 0.8, eq.tempo))
  const base = (0.6 * rif.obiettivo + 0.4 * motore) * correzione
  const k = base / eq.tempo
  for (const x of tutte) {
    x.tempo *= k
    x.passi = x.passi.map((p) => ({ ...p, tempo: p.tempo * k }))
    x.hf = x.punti / x.tempo
  }
  const consigliata = tutte.reduce((a, b) => (b.hf > a.hf ? b : a)).stile
  return { tutte, consigliata, riferimento: rif }
}

/* ---------------- segni sul disegno ---------------- */

/** Profondità standard per livello (FITDS): dalla fault line più bassa al parapalle. */
export function profonditaDaLivello(livello: string | undefined) {
  const l = (livello ?? '').toUpperCase()
  if (/\bIII\b|LEVEL 3|LIVELLO 3/.test(l)) return 30
  if (/\bII\b|LEVEL 2|LIVELLO 2/.test(l)) return 20
  return 25
}

/** Metri per unità del disegno: nei disegni FITDS il campo (fault line → parapalle) occupa circa il 70% dell'altezza. */
const metriPerUnita = (profondita: number) => profondita / 700

/** Dai segni allo schema: ogni posizione prende i bersagli segnati dopo di lei; metri dalla scala del disegno. */
export function schemaDaSegni(segni: Segno[], profondita: number, aspetto: number, base?: Partial<SchemaStage>): SchemaStage {
  const k = metriPerUnita(profondita)
  // le x sono in millesimi della larghezza: le riporto alla stessa unità delle y
  const dist = (a: Segno, b: Segno) => Math.hypot((a.x - b.x) * aspetto, a.y - b.y) * k
  const P = segni.find((x) => x.k === 'P')
  const posizioni: (PosizioneSchema & { _s: Segno })[] = []
  let prev: Segno | undefined = P
  let n = 0
  for (const sg of segni) {
    if (sg.k === 'P') continue
    if (sg.k === 'pos' || !posizioni.length) {
      const punto = sg.k === 'pos' ? sg : (P ?? sg)
      posizioni.push({ id: lettera(posizioni.length), nome: punto.nome ?? '', metri: prev ? Math.round(dist(prev, punto)) : 0, ingaggio: 'auto', bersagli: [], _s: punto })
      prev = punto
      if (sg.k === 'pos') continue
    }
    const pos = posizioni[posizioni.length - 1]
    n++
    pos.bersagli.push({
      id: String(n), tipo: sg.tipo ?? 'carta',
      distanza: sg.d ?? Math.max(2, Math.min(profondita + 5, Math.round(dist(pos._s, sg)))),
      vis: sg.vis ?? 'piena', mobile: sg.mobile, mov: sg.mov,
      lato: sg.x < pos._s.x - 15 ? 'sx' : sg.x > pos._s.x + 15 ? 'dx' : undefined,
    })
  }
  return {
    partenza: base?.partenza ?? '', lettura: base?.lettura, risposte: base?.risposte,
    fonte: base?.fonte ?? 'manuale', aggiornato: new Date().toISOString(),
    posizioni: posizioni.length ? posizioni.map(({ _s, ...p }) => { void _s; return p }) : schemaVuoto().posizioni,
    segni, profondita,
  }
}

/** Numeri e lettere da mostrare sui segni, nello stesso ordine dello schema. */
export function etichetteSegni(segni: Segno[]): string[] {
  const primaPos = segni.findIndex((x) => x.k === 'pos')
  // bersagli segnati prima di ogni posizione si sparano dalla partenza: quella è la posizione A
  let p = segni.some((x, i) => x.k === 'bers' && (primaPos < 0 || i < primaPos)) ? 1 : 0
  let b = 0
  return segni.map((x) => (x.k === 'P' ? 'P' : x.k === 'pos' ? lettera(p++) : String(++b)))
}

/* ---------------- AI ---------------- */

const SISTEMA = `Sei un tiratore IPSC Grand Master, istruttore e Range Officer FITDS. Leggi i disegni degli stage e prepari
la strategia più veloce e sicura. Regole di lettura dei disegni FITDS (sempre valide):
- Il disegno si legge dal basso: in basso c'è la fault line più bassa e la zona di partenza, in alto (riga nera) il parapalle.
  Il tiratore guarda verso l'alto (verso il parapalle). Destra è destra, sinistra è sinistra; salire nel disegno = avanzare,
  scendere = arretrare (solo in rari casi di partenze vincolate si torna indietro).
- La linea rossa è il perimetro dell'area di tiro (fault line): il tiratore si muove solo dentro di essa.
- Distanze dalla fault line più bassa: 0–25 m (Level II 0–20 m, Level III 0–30 m). I metri non sono scritti: stimali dalle proporzioni.
- Bersagli: sagoma ottagonale marrone = carta (2 colpi); sagoma bianca = no-shoot (non si spara, 0 colpi);
  sagoma azzurra/blu a birillo = popper o mini popper (1 colpo); quadrato o cerchio metallico = piastra (1 colpo).
  Pannelli azzurri = muri e ostacoli che coprono la vista; barili neri = coperture.
- La FITDS progetta ogni stage sulla divisione Classic: le stringhe non superano mai 10 colpi.
  Le posizioni e i punti di ricarica si leggono da come i bersagli sono raggruppati a pacchetti di massimo 10 colpi.
- Una posizione è il punto dove il tiratore si ferma (o passa) per ingaggiare un gruppo di bersagli; l'ordine delle
  posizioni è il percorso più veloce; l'ordine dei bersagli è la sequenza di tiro.
- Si può sparare un bersaglio arrivando in posizione ("in arrivo"/"in entrata"), uscendo o indietreggiando ("uscita"),
  o in movimento tra due posizioni: quando un bersaglio è vicino e ben visibile sul percorso, è tempo guadagnato.
- Bersagli mobili e attivazioni: il popper che attiva un mobile si spara prima, poi il mobile quando si muove.
- Mano forte: per un tiratore destro sporgersi a sinistra di un ostacolo è il lato debole; per un mancino tutto è a specchio
  (partenze, lato da cui sporgersi, senso del percorso).
- Il disegno può essere 2D (muri azzurri) o 3D (pannelli a rete o legno, sagome su supporto); la lettura non cambia.
Coordinate: x e y vanno da 0 a 1000 sull'immagine (0,0 = angolo in alto a sinistra), punta il centro dell'oggetto.
Rispondi SOLO con JSON valido e compatto.`

const FORMATO = `{"lettura":"max 3 frasi","partenza":{"x":0,"y":0,"nota":"dove e come"},
"posizioni":[{"x":0,"y":0,"nome":"breve","bersagli":[{"id":"1","tipo":"carta|mini|popper|miniPopper|piastra","x":0,"y":0,"vis":"piena|parziale|sporgersi","mov":"fermo|arrivo|uscita|movimento","mobile":false}]}],
"domande":[{"domanda":"...","opzioni":["...","..."]}]}`

/** Esempi risolti da un tiratore esperto: insegnano all'AI come si legge un disegno FITDS (2D e 3D). */
const ESEMPI: { url: string; testo: string; risposta: string }[] = [
  {
    url: 'esempi/fitds-stage-1.jpg',
    testo: `Esempio. Stage Medium course, 22 colpi minimi, 110 punti. Bersagli dal briefing: 10 carta, 2 popper, 1 no-shoot.
Partenza: al tavolo, arma scarica sul tavolo. Leggi il disegno e rispondi con il JSON.`,
    risposta: JSON.stringify({
      lettura: 'Partenza al tavolo in basso; percorso in senso orario: prima i bersagli vicini a destra dietro i barili e il muro, poi l’angolo in basso a sinistra, risalita sul lato sinistro per i popper e la carta dietro il muro, infine il fondo al centro e a destra. Due stringhe naturali da 10: A+B+C(popper) e C+D+E.',
      partenza: { x: 312, y: 684, nota: 'al tavolo, arma scarica' },
      posizioni: [
        { x: 454, y: 711, nome: 'in basso, a destra del muro centrale', bersagli: [
          { id: '1', tipo: 'carta', x: 665, y: 655, vis: 'parziale' }, { id: '2', tipo: 'carta', x: 623, y: 635, vis: 'piena' }, { id: '3', tipo: 'carta', x: 492, y: 603, vis: 'piena' }] },
        { x: 117, y: 720, nome: 'angolo in basso a sinistra', bersagli: [{ id: '4', tipo: 'carta', x: 61, y: 626, vis: 'piena' }] },
        { x: 179, y: 576, nome: 'lato sinistro, dietro il muro lungo', bersagli: [
          { id: '5', tipo: 'popper', x: 71, y: 302, vis: 'piena' }, { id: '6', tipo: 'popper', x: 93, y: 284, vis: 'piena' },
          { id: '7', tipo: 'carta', x: 462, y: 533, vis: 'parziale' }, { id: '8', tipo: 'carta', x: 177, y: 320, vis: 'piena' }] },
        { x: 442, y: 450, nome: 'in fondo al centro', bersagli: [
          { id: '9', tipo: 'carta', x: 467, y: 351, vis: 'piena' }, { id: '10', tipo: 'carta', x: 429, y: 176, vis: 'piena' }, { id: '11', tipo: 'carta', x: 312, y: 340, vis: 'piena' }] },
        { x: 533, y: 490, nome: 'in fondo a destra', bersagli: [{ id: '12', tipo: 'carta', x: 664, y: 385, vis: 'piena' }] },
      ],
      domande: [],
    }),
  },
  {
    url: 'esempi/fitds-stage-2.jpg',
    testo: `Esempio annotato a mano da un tiratore (le scritte nere sono sue: numero = ordine di tiro, lettera = posizione; i metri e il tempo sono reali).
Stage Short course 3D, 12 colpi: 5 carta (uno mobile), 2 popper, 1 no-shoot. Rispondi con il JSON della lettura corretta.`,
    risposta: JSON.stringify({"lettura": "Short da 12 colpi in prospettiva 3D. Si parte da A in basso a destra: subito il T5 a destra (5 m) e il T4 in alto a destra. Spostamento di 8 m verso B: popper MP2 che attiva il T3 mobile, poi T2 e il T3 mentre si muove. Ultimo spostamento a sinistra su C: T1 (7 m) e il popper MP1 (12 m). Tempo reale del tiratore: 11 s.", "partenza": {"x": 693, "y": 815, "nota": "in A, dentro il box in basso a destra"}, "posizioni": [{"x": 693, "y": 815, "nome": "A, in basso a destra", "bersagli": [{"id": "1", "tipo": "carta", "x": 938, "y": 670, "vis": "piena"}, {"id": "2", "tipo": "carta", "x": 888, "y": 319, "vis": "piena"}]}, {"x": 381, "y": 656, "nome": "B, al centro del lato lungo", "bersagli": [{"id": "3", "tipo": "popper", "x": 702, "y": 247, "vis": "parziale"}, {"id": "4", "tipo": "carta", "x": 493, "y": 195, "vis": "piena"}, {"id": "5", "tipo": "carta", "x": 583, "y": 173, "vis": "piena", "mobile": true}]}, {"x": 173, "y": 656, "nome": "C, estremo sinistro", "bersagli": [{"id": "6", "tipo": "carta", "x": 94, "y": 361, "vis": "piena"}, {"id": "7", "tipo": "popper", "x": 155, "y": 253, "vis": "piena"}]}], "domande": []}),
  },
  {
    url: 'esempi/fitds-stage-3.jpg',
    testo: `Esempio annotato a mano da un tiratore (numero = ordine di tiro, lettera = posizione; metri e tempo reali).
Stage Long course 3D, 32 colpi: 15 carta (una mobile), 2 popper, 4 no-shoot. Rispondi con il JSON della lettura corretta.`,
    risposta: JSON.stringify({"lettura": "Long da 32 colpi in 3D. Partenza in A a sinistra del box: T1 e T2 a sinistra (5 m, il T2 coperto da un no-shoot). In B (angolo alto a sinistra) T3 e T4 a 5–6 m e il T10 lontano a destra (16 m). Lungo la fault line in alto: da C il popper MP1 che attiva il T7 mobile, poi T6 e T5 a sinistra e il T7; da D il popper MP2 e il T9; da E il gruppo di destra T12, T13, T11 e il T8 lontano a sinistra. Ultima posizione F in basso a destra: T15 e T14 con no-shoot. Tempo reale del tiratore: 26 s.", "partenza": {"x": 375, "y": 730, "nota": "in A, nel box in basso a sinistra"}, "posizioni": [{"x": 375, "y": 730, "nome": "A, box in basso a sinistra", "bersagli": [{"id": "1", "tipo": "carta", "x": 110, "y": 685, "vis": "piena"}, {"id": "2", "tipo": "carta", "x": 128, "y": 630, "vis": "parziale"}]}, {"x": 195, "y": 555, "nome": "B, angolo in alto a sinistra", "bersagli": [{"id": "3", "tipo": "carta", "x": 70, "y": 420, "vis": "parziale"}, {"id": "4", "tipo": "carta", "x": 118, "y": 335, "vis": "piena"}, {"id": "5", "tipo": "carta", "x": 602, "y": 255, "vis": "piena"}]}, {"x": 418, "y": 515, "nome": "C, centro sinistra sulla fault line in alto", "bersagli": [{"id": "6", "tipo": "popper", "x": 388, "y": 240, "vis": "piena"}, {"id": "7", "tipo": "carta", "x": 205, "y": 258, "vis": "piena"}, {"id": "8", "tipo": "carta", "x": 205, "y": 285, "vis": "piena"}, {"id": "9", "tipo": "carta", "x": 248, "y": 228, "vis": "piena", "mobile": true}]}, {"x": 655, "y": 515, "nome": "D, centro destra", "bersagli": [{"id": "10", "tipo": "popper", "x": 639, "y": 295, "vis": "parziale"}, {"id": "11", "tipo": "carta", "x": 512, "y": 262, "vis": "piena"}]}, {"x": 800, "y": 515, "nome": "E, angolo in alto a destra", "bersagli": [{"id": "12", "tipo": "carta", "x": 790, "y": 300, "vis": "piena"}, {"id": "13", "tipo": "carta", "x": 790, "y": 325, "vis": "piena"}, {"id": "14", "tipo": "carta", "x": 731, "y": 290, "vis": "parziale"}, {"id": "15", "tipo": "carta", "x": 432, "y": 255, "vis": "piena"}]}, {"x": 688, "y": 745, "nome": "F, in basso a destra", "bersagli": [{"id": "16", "tipo": "carta", "x": 875, "y": 698, "vis": "piena"}, {"id": "17", "tipo": "carta", "x": 835, "y": 688, "vis": "parziale"}]}], "domande": []}),
  },
  {
    url: 'esempi/fitds-stage-4.jpg',
    testo: `Esempio annotato a mano da un tiratore (numero = ordine di tiro, lettera = posizione; "in arrivo", "in entrata", "in movimento", "indietreggiando" = come si spara quel bersaglio; tempo reale).
Stage Medium course 2D, 24 colpi: 10 carta, 4 mini popper, 2 no-shoot. Rispondi con il JSON della lettura corretta.`,
    risposta: JSON.stringify({"lettura": "Medium da 24 colpi, disegno 2D classico. Partenza al centro (PART): si va subito in A a destra per i 4 mini popper e il T9 dietro i barili, sparato indietreggiando. B in basso: il T1 dietro i barili sparato arrivando. Poi C: T10 dietro barili con no-shoot. D: T2 e T3 a sinistra. E: T5 arrivando e T4 in movimento. F in fondo: T8 entrando, poi T7 e T6. Stringhe da 10: A+B+C, D+E+F. Tempo reale del tiratore: 16,3 s.", "partenza": {"x": 640, "y": 700, "nota": "PART, al centro del box"}, "posizioni": [{"x": 865, "y": 690, "nome": "A, punta destra", "bersagli": [{"id": "1", "tipo": "miniPopper", "x": 798, "y": 225, "vis": "piena"}, {"id": "2", "tipo": "miniPopper", "x": 826, "y": 180, "vis": "piena"}, {"id": "3", "tipo": "miniPopper", "x": 862, "y": 140, "vis": "piena"}, {"id": "4", "tipo": "miniPopper", "x": 903, "y": 115, "vis": "piena"}, {"id": "5", "tipo": "carta", "x": 925, "y": 515, "vis": "parziale", "mov": "uscita"}]}, {"x": 620, "y": 765, "nome": "B, in basso", "bersagli": [{"id": "6", "tipo": "carta", "x": 310, "y": 710, "vis": "parziale", "mov": "arrivo"}]}, {"x": 655, "y": 600, "nome": "C, corridoio centrale", "bersagli": [{"id": "7", "tipo": "carta", "x": 665, "y": 500, "vis": "parziale"}]}, {"x": 500, "y": 645, "nome": "D, dentro la U", "bersagli": [{"id": "8", "tipo": "carta", "x": 127, "y": 545, "vis": "piena"}, {"id": "9", "tipo": "carta", "x": 170, "y": 505, "vis": "piena"}]}, {"x": 515, "y": 530, "nome": "E, uscita della U a sinistra", "bersagli": [{"id": "10", "tipo": "carta", "x": 263, "y": 235, "vis": "piena", "mov": "arrivo"}, {"id": "11", "tipo": "carta", "x": 271, "y": 405, "vis": "piena", "mov": "movimento"}]}, {"x": 637, "y": 415, "nome": "F, in fondo", "bersagli": [{"id": "12", "tipo": "carta", "x": 562, "y": 100, "vis": "piena", "mov": "arrivo"}, {"id": "13", "tipo": "carta", "x": 459, "y": 105, "vis": "piena"}, {"id": "14", "tipo": "carta", "x": 347, "y": 155, "vis": "piena"}]}], "domande": []}),
  },
]

async function immagineEsempio(url: string): Promise<{ mime: string; base64: string } | undefined> {
  try {
    const r = await fetch(import.meta.env.BASE_URL + url)
    if (!r.ok) return undefined
    const b = new Uint8Array(await r.arrayBuffer())
    let bin = ''
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000))
    return { mime: 'image/jpeg', base64: btoa(bin) }
  } catch { return undefined }
}

function briefing(s: StageLetto) {
  const b = s.bersagli
  return `Stage ${s.numero}, ${s.tipo} course, ${s.colpi} colpi minimi, ${s.puntiMax} punti.
Bersagli dal briefing: ${b.carta} carta, ${b.miniCarta} mini carta, ${b.popper} popper, ${b.miniPopper} mini popper, ${b.piastre} piastre, ${b.noShoot} no-shoot.
Etichette nel disegno: ${s.etichetteDisegno.join(' ') || 'non lette'}.
Partenza: ${s.posizionePartenza}. Pronto: ${s.prontoTiratore} / ${s.prontoArma}.
Procedura: ${s.procedura}
Note: ${s.note}`
}

function leggiDomande(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 6).flatMap((d, i) => {
    const o = d as Record<string, unknown>
    const op = Array.isArray(o?.opzioni) ? (o.opzioni as unknown[]).map(String).map((x) => x.trim()).filter(Boolean).slice(0, 4) : []
    const q = typeof o?.domanda === 'string' ? o.domanda.trim() : ''
    return q && op.length >= 2 ? [{ id: `d${i + 1}`, domanda: q, opzioni: op }] : []
  })
}
export interface Domanda { id: string; domanda: string; opzioni: string[] }

/** Dalla risposta dell'AI (con coordinate) ai segni sul disegno. */
function segniDaAI(raw: Record<string, unknown>): Segno[] {
  const c = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1000, Math.max(0, n)) : null }
  const out: Segno[] = []
  const p = raw.partenza as Record<string, unknown> | undefined
  if (p && c(p.x) != null && c(p.y) != null) out.push({ k: 'P', x: c(p.x)!, y: c(p.y)!, nome: typeof p.nota === 'string' ? p.nota : undefined })
  for (const pos of (Array.isArray(raw.posizioni) ? raw.posizioni : []) as Record<string, unknown>[]) {
    if (c(pos.x) == null || c(pos.y) == null) continue
    out.push({ k: 'pos', x: c(pos.x)!, y: c(pos.y)!, nome: typeof pos.nome === 'string' ? pos.nome.slice(0, 60) : undefined })
    for (const b of (Array.isArray(pos.bersagli) ? pos.bersagli : []) as Record<string, unknown>[]) {
      const tipo = String(b.tipo ?? 'carta') as TipoBersaglio
      if (tipo === 'noshoot' || c(b.x) == null || c(b.y) == null) continue
      const mv = String(b.mov ?? '')
      out.push({ k: 'bers', x: c(b.x)!, y: c(b.y)!, tipo: TIPI_SCHEMA.includes(tipo) ? tipo : 'carta', vis: b.vis === 'parziale' || b.vis === 'sporgersi' ? b.vis : 'piena', mobile: !!b.mobile,
        mov: mv === 'arrivo' || mv === 'uscita' || mv === 'movimento' ? mv : undefined })
    }
  }
  return out
}

/** L'AI propone i segni (partenza, posizioni, bersagli in ordine) e qualche domanda; il tiratore li corregge sul disegno. */
export async function leggiStageAI(img: { url: string; w: number; h: number }, s: StageLetto, profilo: Profilo, profondita: number) {
  const cfg = await getConfigAI()
  if (!cfg?.chiave) throw new ErroreAI('Collega un assistente AI in Impostazioni.')
  const esempi = (await Promise.all(ESEMPI.map(async (e) => ({ immagine: await immagineEsempio(e.url), testo: e.testo, risposta: e.risposta })))).filter((e) => e.immagine)
  const testo = `${briefing(s)}
Profondità massima del campo per questo livello: ${profondita} m.
Il tiratore è in ${profilo.divisione} (${capienzaDi(profilo)} colpi nel caricatore), classe ${profilo.classe}, ${profilo.manoForte === 'sinistra' ? 'mancino' : 'destro'}.

Ora il disegno da leggere (senza note del tiratore). Segna sul disegno partenza, posizioni nell'ordine del percorso più veloce e bersagli nell'ordine di ingaggio, con le coordinate.
Il totale dei colpi deve fare ${s.colpi} e i bersagli per tipo devono corrispondere al briefing (no-shoot esclusi).
Usa le etichette del disegno come id se ci sono, altrimenti numera 1, 2, 3… nell'ordine di tiro.
Poi 2–5 "domande" a scelta rapida solo su ciò che il disegno non chiarisce e cambia la strategia (visibilità da una posizione,
attivazioni, tiro in movimento), citando i bersagli col loro id e dove sono.
Rispondi con questo JSON:
${FORMATO}`
  const risposta = await chiedi(cfg, {
    sistema: SISTEMA, testo, maxToken: 12000,
    immagine: { mime: 'image/jpeg', base64: img.url.split(',')[1] },
    esempi: esempi.length ? esempi : undefined,
  })
  const raw = estraiJson(risposta) as Record<string, unknown>
  const segni = segniDaAI(raw)
  if (!segni.some((x) => x.k === 'bers')) throw new ErroreAI('L’AI non ha trovato bersagli nel disegno: segnali tu con un tocco.')
  const schema = schemaDaSegni(segni, profondita, img.w / img.h, { lettura: typeof raw.lettura === 'string' ? raw.lettura : undefined, partenza: s.posizionePartenza, fonte: 'ai' })
  return { schema, domande: leggiDomande(raw.domande) }
}

/** Consigli del coach sulla strategia calcolata, per il livello del tiratore. */
export async function consigliCoachAI(s: StageLetto, profilo: Profilo, sc: SchemaStage, st: Strategia): Promise<string[]> {
  const cfg = await getConfigAI()
  if (!cfg?.chiave) throw new ErroreAI('Collega un assistente AI in Impostazioni.')
  const t = profilo.tempi
  const pos = sc.posizioni.map((p) => ({ id: p.id, dove: p.nome, metri: p.metri, bersagli: p.bersagli.map((b) => `${b.id} ${b.tipo} ${b.distanza}m${b.vis !== 'piena' ? ' ' + b.vis : ''}${b.mov && b.mov !== 'fermo' ? ' ' + b.mov : ''}${b.lato ? ' a ' + b.lato : ''}${b.mobile ? ' mobile' : ''}`) }))
  const testo = `${briefing(s)}

Tiratore: ${profilo.divisione}, classe ${profilo.classe}, ${profilo.manoForte === 'sinistra' ? 'mancino' : 'destro'}, ${st.capienza} colpi nel caricatore (colpi di scorta pianificati: ${st.scorta}).
Tempi tecnici: estrazione ${t.estrazione}s, split ${t.split}s, transizione ${t.transizioneVicina}/${t.transizioneLontana}s, ricarica ${t.ricarica}s,
entrata ${t.entrataPosizione}s, uscita ${t.uscitaPosizione}s, velocità ${t.velocitaMovimento} m/s.

Schema dello stage (già controllato dal tiratore, è affidabile): ${JSON.stringify(pos)}
Strategia ${st.stile} calcolata: stringhe ${JSON.stringify(st.stringhe)}, ricariche ${JSON.stringify(st.ricariche)}, tempo stimato ${st.tempo.toFixed(1)} s.

Scrivi da 5 a 8 consigli pratici e specifici per QUESTO stage e QUESTO tiratore, in italiano, ognuno di una o due frasi:
da dove partire e con quale piede, il percorso, dove guadagnare tempo (ingressi/uscite, tiro in movimento, ordine dei bersagli,
dove guardare durante lo spostamento), dove non rischiare, dove fare il cambio caricatore senza restare aperto e come, cosa provare
nel walkthrough. Cita posizioni (A, B…) e bersagli con il loro id.
Rispondi SOLO con JSON: {"consigli": ["...", "..."]}`
  const risposta = await chiedi(cfg, { sistema: SISTEMA, testo, maxToken: 3000 })
  const raw = estraiJson(risposta) as Record<string, unknown>
  return Array.isArray(raw.consigli) ? (raw.consigli as unknown[]).map(String).filter(Boolean).slice(0, 8) : []
}

/* ---------------- confronto con il video della gara ---------------- */

export interface ConfrontoPosizione {
  id: string
  nome: string
  colpi: number
  arrivoStimato: number
  arrivoReale: number | null
  tiroStimato: number
  tiroReale: number | null
}
export interface Confronto {
  stile: Stile
  stimato: number
  reale: number
  colpiAttesi: number
  colpiRilevati: number
  /** il confronto posizione per posizione regge solo se i colpi rilevati sono quelli dello schema */
  perPosizione: ConfrontoPosizione[] | null
}

/**
 * Confronta la run vera (colpi dal video) con la strategia: assegna i colpi alle posizioni nell'ordine dello schema
 * e misura per ognuna quanto ci hai messo ad arrivarci (dal colpo prima) e quanto a sparare.
 */
export function confrontaRun(st: Strategia, sc: SchemaStage, colpi: number[], tempoFinale: number | null): Confronto {
  const pos = sc.posizioni.filter((p) => p.bersagli.length)
  const attesi = pos.reduce((t, p) => t + colpiPosizione(p), 0)
  const reale = tempoFinale ?? colpi[colpi.length - 1] ?? 0
  const stimati = pos.map((p) => {
    const arrivo = st.passi.filter((x) => x.posizione === p.id && (x.tipo === 'partenza' || x.tipo === 'movimento')).reduce((t, x) => t + x.tempo, 0)
    const tiro = st.passi.filter((x) => x.posizione === p.id && x.tipo === 'tiro').reduce((t, x) => t + x.tempo, 0)
    return { arrivo, tiro }
  })
  let perPosizione: ConfrontoPosizione[] | null = null
  if (colpi.length === attesi && attesi > 0) {
    let k = 0
    perPosizione = pos.map((p, i) => {
      const n = colpiPosizione(p)
      const primo = colpi[k], ultimo = colpi[k + n - 1]
      const prima = k > 0 ? colpi[k - 1] : 0
      k += n
      // il primo colpo della posizione chiude l'arrivo; il resto è tiro
      return { id: p.id, nome: p.nome, colpi: n, arrivoStimato: stimati[i].arrivo, arrivoReale: primo - prima, tiroStimato: stimati[i].tiro, tiroReale: ultimo - primo }
    })
  }
  return { stile: st.stile, stimato: st.tempo, reale, colpiAttesi: attesi, colpiRilevati: colpi.length, perPosizione }
}

/**
 * Correzione personale delle stime: dai video delle gare già collegati allo studio dello stage.
 * Mediana di reale/stimato, pesata sul numero di video (con 1 video conta poco), tra -20% e +25%.
 */
export function correzioneDaVideo(rapporti: number[]) {
  const r = rapporti.filter((x) => Number.isFinite(x) && x > 0.5 && x < 2).sort((a, b) => a - b)
  if (!r.length) return { fattore: 1, n: 0 }
  const med = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2
  const peso = r.length / (r.length + 2)
  return { fattore: Math.min(1.25, Math.max(0.8, 1 + (med - 1) * peso)), n: r.length }
}
