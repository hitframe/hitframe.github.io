/**
 * Schema di uno stage: le posizioni nell'ordine in cui le fai e, per ognuna, i bersagli nell'ordine in cui li ingaggi.
 * È la base del motore di strategia: stringhe, ricariche, movimenti, tempi stimati sul profilo del tiratore.
 *
 * Regola FITDS di progettazione: ogni stage è pensato per la divisione Classic (10 colpi + 1 in canna se previsto),
 * quindi nessuna stringa supera i 10 colpi: tra una stringa e l'altra c'è sempre un punto naturale di ricarica.
 */
import { chiedi, estraiJson, getConfigAI, ErroreAI } from '../ai/ai'
import type { Classe, Profilo } from '../db/types'
import { CAPIENZA, PERC_PUNTI } from './motore'
import { TIPI_BERSAGLIO, type MappaStage, type TipoBersaglio } from './mappa'
import type { StageLetto } from './tipi'

export type Visibilita = 'piena' | 'parziale' | 'sporgersi'
export type Ingaggio = 'auto' | 'fermo' | 'movimento'
export type Stile = 'aggressivo' | 'equilibrato' | 'prudente'

export interface BersaglioSchema {
  id: string
  tipo: TipoBersaglio
  distanza: number // metri
  vis: Visibilita
  mobile?: boolean
  nota?: string
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

interface Ctx { cap: number; t: Profilo['tempi']; pend: number; st: typeof PARAMETRI[Stile] }

const fattoreDist = (c: Ctx, d: number) => 1 + Math.max(0, d - 7) * c.pend

/** Tiro in una posizione: tempi dei bersagli e ricariche da fermo se i colpi non bastano. */
function tiraPosizione(c: Ctx, p: PosizioneSchema, colpiIn: number, entraInMovimento: boolean) {
  let colpi = colpiIn
  let tempo = 0
  const dettagli: string[] = []
  const ricaricheFermo: string[] = []
  p.bersagli.forEach((b, i) => {
    const n = colpiDi(b)
    if (colpi < n) {
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
    if (b.vis === 'sporgersi') primo += 0.25
    let altri = (n - 1) * c.t.split * c.st.split * f
    if (b.vis !== 'piena') altri += n * 0.07
    if (b.mobile) primo += 0.3
    tempo += primo + altri
    colpi -= n
    dettagli.push(`${b.id}${metallo ? ' (metallo)' : ''}`)
  })
  return { tempo, colpi, dettagli, ricaricheFermo }
}

/** Calcola la strategia per uno stile: sceglie dove ricaricare (meglio in movimento) e stima tempi e punti. */
export function strategia(sc: SchemaStage, s: StageLetto, profilo: Profilo, stile: Stile, capienza?: number): Strategia | null {
  const pos = sc.posizioni.filter((p) => p.bersagli.length)
  if (!pos.length) return null
  const t = profilo.tempi
  const c: Ctx = { cap: capienza ?? capienzaDi(profilo), t, pend: profilo.pendenzaDistanza ?? 0.035, st: PARAMETRI[stile] }
  const inizio = colpiAllaPartenza(s, c.cap)

  const movimento = (i: number) => {
    const m = pos[i].metri
    return m > 0 ? t.uscitaPosizione * c.st.uscita + m / Math.max(1.2, t.velocitaMovimento) : 0
  }
  // tiro in movimento: deciso dal tiratore o, in automatico, solo per bersagli vicini e visibili con stile aggressivo
  const inMov = (p: PosizioneSchema) => p.ingaggio === 'movimento' || (p.ingaggio === 'auto' && stile === 'aggressivo' && p.metri > 0 && p.bersagli[0].distanza <= 8 && p.bersagli[0].vis === 'piena')

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
        const r = tiraPosizione(c, pos[i], entra, inMov(pos[i]))
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
    const r = tiraPosizione(c, p, scelta.entra, movimentoEntrando)
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
    const vis = p.bersagli.filter((b) => b.vis !== 'piena').map((b) => `${b.id} ${b.vis === 'sporgersi' ? '(sporgiti)' : '(parziale: mira precisa)'}`)
    passi.push({
      tipo: 'tiro', titolo: `${p.id}${p.nome ? ` · ${p.nome}` : ''}: ${colpiPosizione(p)} colpi`,
      dettaglio: [`Ordine: ${p.bersagli.map((b) => b.id).join(' → ')}.`, vis.length ? `Attenzione: ${vis.join(', ')}.` : '', r.ricaricheFermo.length ? `Ricarica da fermo prima del ${r.ricaricheFermo.join(', ')}.` : ''].filter(Boolean).join(' '),
      tempo: r.tempo, posizione: p.id,
    })
  })
  chiudiStringa()

  const perc = PERC_PUNTI[profilo.classe] - c.st.rischio * PENALITA_CLASSE[profilo.classe]
  const parziali = pos.flatMap((p) => p.bersagli).filter((b) => b.vis !== 'piena').length
  const punti = Math.max(0, s.puntiMax * perc - parziali * 0.6)
  const consigli = consigliBase(pos, ricariche, stile, c.cap)
  return { stile, capienza: c.cap, tempo, punti, hf: punti / tempo, stringhe, ricariche, passi, consigli }
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

/** Le tre strategie e quella consigliata (miglior hit factor atteso per il tuo livello). */
export function strategie(sc: SchemaStage, s: StageLetto, profilo: Profilo) {
  const tutte = (['aggressivo', 'equilibrato', 'prudente'] as Stile[]).map((st) => strategia(sc, s, profilo, st)).filter(Boolean) as Strategia[]
  if (!tutte.length) return null
  const consigliata = tutte.reduce((a, b) => (b.hf > a.hf ? b : a)).stile
  return { tutte, consigliata }
}

/* ---------------- AI ---------------- */

const SISTEMA = `Sei un tiratore IPSC Grand Master, istruttore e Range Officer FITDS. Leggi disegni di stage IPSC e costruisci
la strategia più veloce e sicura. Ragioni sempre così:
- La FITDS progetta ogni stage sulla divisione Classic (10 colpi + 1 in canna se previsto): lo stage è diviso in stringhe
  che non superano mai 10 colpi. Le stringhe ti dicono dove sono le posizioni e dove cade la ricarica naturale.
- Carta = 2 colpi, metallo (popper, mini popper, piastre) = 1 colpo, no-shoot = 0.
- Una posizione è il punto da cui ingaggi un gruppo di bersagli. L'ordine delle posizioni è il percorso; l'ordine dei
  bersagli dentro la posizione è la sequenza di tiro.
- Nei disegni FITDS i bersagli stanno tra 3 e 20 metri; le distanze non sono scritte: stimale dalle proporzioni.
Rispondi SOLO con JSON valido, senza testo fuori.`

function briefing(s: StageLetto) {
  const b = s.bersagli
  return `Stage ${s.numero}, ${s.tipo} course, ${s.colpi} colpi minimi, ${s.puntiMax} punti.
Bersagli dal briefing: ${b.carta} carta, ${b.miniCarta} mini carta, ${b.popper} popper, ${b.miniPopper} mini popper, ${b.piastre} piastre, ${b.noShoot} no-shoot.
Etichette nel disegno: ${s.etichetteDisegno.join(' ') || 'non lette'}.
Partenza: ${s.posizionePartenza}. Pronto: ${s.prontoTiratore} / ${s.prontoArma}.
Procedura: ${s.procedura}
Note: ${s.note}`
}

const FORMATO = `{
  "lettura": "2-3 frasi: com'è fatto lo stage, percorso, insidie",
  "partenza": "dove e come si parte",
  "posizioni": [
    {"nome": "descrizione breve del punto (es. 'davanti ai barili, a destra del muro')", "metri": metri dalla posizione precedente (la prima dalla partenza, 0 se si spara dalla partenza),
     "bersagli": [{"id": "etichetta del disegno o numero", "tipo": "carta|mini|popper|miniPopper|piastra", "distanza": metri, "vis": "piena|parziale|sporgersi", "mobile": false}]}
  ],
  "domande": [{"domanda": "...", "opzioni": ["...", "...", "..."]}]
}`

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

/** Prima lettura: schema ragionato a stringhe e domande mirate su ciò che cambia la strategia. */
export async function leggiStageAI(img: { url: string }, s: StageLetto, profilo: Profilo) {
  const cfg = await getConfigAI()
  if (!cfg?.chiave) throw new ErroreAI('Collega un assistente AI in Impostazioni.')
  const testo = `${briefing(s)}

Il tiratore è in ${profilo.divisione} (${capienzaDi(profilo)} colpi nel caricatore), classe ${profilo.classe}.

Leggi il disegno e costruisci lo schema: posizioni nell'ordine del percorso più veloce, bersagli nell'ordine di ingaggio.
Usa la regola delle stringhe da massimo 10 colpi per capire come lo stage è stato pensato. Il totale dei colpi deve fare ${s.colpi}
e i bersagli per tipo devono corrispondere al briefing. Usa gli id scritti nel disegno; se non ce ne sono, numera i bersagli 1, 2, 3…
nell'ordine in cui li ingaggeresti.

Poi scrivi da 3 a 6 "domande" a scelta rapida (2-4 opzioni brevi) SOLO su ciò che il disegno non chiarisce e che cambia la strategia:
da quale posizione si vede davvero un bersaglio, distanze tra posizioni e dei bersagli più lontani, ostacoli che coprono,
attivazioni (popper che attivano mobili), se un bersaglio si può ingaggiare in movimento. Cita sempre i bersagli con il loro id
e dove sono ("il 7, sul muro al centro").

Rispondi con questo JSON:
${FORMATO}`
  const risposta = await chiedi(cfg, { sistema: SISTEMA, testo, immagine: { mime: 'image/jpeg', base64: img.url.split(',')[1] }, maxToken: 5000 })
  const raw = estraiJson(risposta) as Record<string, unknown>
  const schema = normalizzaSchema(raw, 'ai')
  if (!schema.posizioni.some((p) => p.bersagli.length)) throw new ErroreAI('L’AI non ha trovato bersagli nel disegno: costruisci lo schema a mano.')
  return { schema, domande: leggiDomande(raw.domande) }
}

/** Seconda lettura con le risposte del tiratore. */
export async function rifinisciStageAI(img: { url: string }, s: StageLetto, profilo: Profilo, bozza: SchemaStage, risposte: { domanda: string; risposta: string }[]) {
  const cfg = await getConfigAI()
  if (!cfg?.chiave) throw new ErroreAI('Collega un assistente AI in Impostazioni.')
  const { fonte: _f, aggiornato: _a, risposte: _r, ...corpo } = bozza
  void _f; void _a; void _r
  const testo = `${briefing(s)}

Il tiratore è in ${profilo.divisione} (${capienzaDi(profilo)} colpi), classe ${profilo.classe}.
La tua prima lettura:
${JSON.stringify(corpo)}

Risposte del tiratore:
${risposte.map((r) => `- ${r.domanda} → ${r.risposta}`).join('\n')}

Correggi lo schema tenendo conto delle risposte (sono più affidabili del disegno) e restituisci SOLO il JSON completo,
con "domande": [] se non hai altri dubbi importanti:
${FORMATO}`
  const risposta = await chiedi(cfg, { sistema: SISTEMA, testo, immagine: { mime: 'image/jpeg', base64: img.url.split(',')[1] }, maxToken: 5000 })
  const raw = estraiJson(risposta) as Record<string, unknown>
  const schema = normalizzaSchema(raw, 'ai')
  return { schema: { ...schema, risposte: [...(bozza.risposte ?? []), ...risposte] }, domande: leggiDomande(raw.domande) }
}

/** Consigli del coach sulla strategia calcolata, per il livello del tiratore. */
export async function consigliCoachAI(s: StageLetto, profilo: Profilo, sc: SchemaStage, st: Strategia): Promise<string[]> {
  const cfg = await getConfigAI()
  if (!cfg?.chiave) throw new ErroreAI('Collega un assistente AI in Impostazioni.')
  const t = profilo.tempi
  const testo = `${briefing(s)}

Tiratore: ${profilo.divisione}, classe ${profilo.classe}, ${st.capienza} colpi nel caricatore.
Tempi tecnici: estrazione ${t.estrazione}s, split ${t.split}s, transizione ${t.transizioneVicina}/${t.transizioneLontana}s, ricarica ${t.ricarica}s,
entrata ${t.entrataPosizione}s, uscita ${t.uscitaPosizione}s, velocità ${t.velocitaMovimento} m/s.

Schema dello stage: ${JSON.stringify(sc.posizioni)}
Strategia ${st.stile} calcolata: stringhe ${JSON.stringify(st.stringhe)}, ricariche ${JSON.stringify(st.ricariche)}, tempo stimato ${st.tempo.toFixed(1)} s.

Scrivi da 5 a 8 consigli pratici e specifici per QUESTO stage e QUESTO tiratore, in italiano, ognuno di una o due frasi:
dove guadagnare tempo (ingressi/uscite, tiro in movimento, ordine dei bersagli, dove guardare durante lo spostamento),
dove non rischiare, dove fare la ricarica e come, cosa provare nel walkthrough. Cita posizioni (A, B…) e bersagli con il loro id.
Rispondi SOLO con JSON: {"consigli": ["...", "..."]}`
  const risposta = await chiedi(cfg, { sistema: SISTEMA, testo, maxToken: 1800 })
  const raw = estraiJson(risposta) as Record<string, unknown>
  return Array.isArray(raw.consigli) ? (raw.consigli as unknown[]).map(String).filter(Boolean).slice(0, 8) : []
}
