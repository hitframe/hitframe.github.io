/**
 * Le run di GDA Split dentro Hitframe: arrivo dei dati, tipi degli intervalli e abilità misurate.
 * Il video non viene salvato: solo i tempi dei colpi, che pesano pochi byte e si sincronizzano.
 */
import type { BersaglioColpo, Classe, Corsa, Prova, TempiPersonali, TipoBersaglioColpo, TipoIntervallo } from '../db/types'
import type { Drill } from '../allenamento/drills'
import { misuraTempi } from '../allenamento/drills'

/** Dati come li esporta GDA Split (JSON, storico, passaggio diretto). */
export interface RunSplit {
  stage?: string
  file?: string
  date?: string
  plan?: number | null
  expected?: number | null
  total?: number | null
  /** distanza tipica dei bersagli (m), se indicata in GDA Split */
  distTipica?: number | null
  shots: { n?: number; t: number; split?: number; kind?: string; flag?: string | null; tag?: string | null; bers?: string | null; dist?: number | null }[]
}

const TAG: Record<string, TipoIntervallo> = { Split: 'split', Transizione: 'transizione', Ricarica: 'ricarica', Movimento: 'movimento' }
const BERS = new Set<TipoBersaglioColpo>(['carta', 'mini', 'ferro'])

export const CHIAVE_ARRIVO = 'hf-split-in-arrivo'
export const CHIAVE_STORICO_SPLIT = 'gda-split-history'

export const NOMI_TIPO: Record<TipoIntervallo, string> = {
  primo: 'Primo colpo', split: 'Split', transizione: 'Transizione', ricarica: 'Ricarica', movimento: 'Movimento', lungo: 'Da indicare',
}

/** Prima classificazione dai soli tempi: sotto 0,5 s split, sotto 1 s transizione, oltre lo decide il tiratore. */
export function tipiAuto(colpi: number[]): TipoIntervallo[] {
  return colpi.map((t, i) => {
    if (i === 0) return 'primo'
    const g = t - colpi[i - 1]
    return g < 0.5 ? 'split' : g < 1 ? 'transizione' : 'lungo'
  })
}

export function valida(x: unknown): x is RunSplit {
  const r = x as RunSplit
  return !!r && Array.isArray(r.shots) && r.shots.every((s) => typeof s?.t === 'number' && isFinite(s.t))
}

/** Una run di GDA Split diventa una bozza di Corsa (da completare con il contesto). */
export function daRunSplit(r: RunSplit): Omit<Corsa, 'id'> {
  const ord = [...r.shots].filter((s) => s.t > 0).sort((a, b) => a.t - b.t)
  const colpi = ord.map((s) => Math.round(s.t * 1000) / 1000)
  const auto = tipiAuto(colpi)
  const tipi = ord.map((s, i) => (i === 0 ? 'primo' : (s.tag && TAG[s.tag]) || auto[i]))
  const bersagli: (BersaglioColpo | null)[] = ord.map((s) => {
    const tipo = s.bers && BERS.has(s.bers as TipoBersaglioColpo) ? (s.bers as TipoBersaglioColpo) : null
    const distanza = typeof s.dist === 'number' && s.dist > 0 ? s.dist : null
    return tipo || distanza ? { tipo: tipo ?? 'carta', distanza } : null
  })
  const data = (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date : new Date().toISOString()).slice(0, 10)
  return {
    creato: new Date().toISOString(),
    data,
    titolo: (r.stage || r.file || 'Run').trim(),
    file: r.file ?? '',
    colpi,
    tipi,
    daVerificare: ord.map((s, i) => (s.flag ? i : -1)).filter((i) => i >= 0),
    tempoTimer: r.plan ?? null,
    contesto: 'libero',
    partenzaStandard: false,
    eventoId: null, drillId: null, provaId: null, risultatoId: null, analisiId: null, stage: null,
    link: '',
    note: '',
    distanzaTipica: typeof r.distTipica === 'number' && r.distTipica > 0 ? r.distTipica : null,
    bersagli: bersagli.some(Boolean) ? bersagli : [],
  }
}

/** Metri da una descrizione tipo "7 m", "5-10 m", "10 metri". */
export function metriDa(testo: string | undefined): number | null {
  const m = testo?.match(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*m/i)
  if (!m) return null
  return m[2] ? Math.round((Number(m[1]) + Number(m[2])) / 2) : Number(m[1])
}

/** Bersaglio e distanza di un colpo: quello indicato, altrimenti la distanza tipica della run (o del drill). */
export function bersaglioDi(c: Corsa, i: number, distanzaDrill: number | null = null): { tipo: TipoBersaglioColpo; distanza: number | null } {
  const b = c.bersagli?.[i]
  return { tipo: b?.tipo ?? 'carta', distanza: b?.distanza ?? c.distanzaTipica ?? distanzaDrill }
}

/** Impronta per non importare due volte la stessa run dallo storico di GDA Split. */
export const impronta = (c: Pick<Corsa, 'file' | 'colpi'>) => `${c.file}|${c.colpi.length}|${c.colpi[c.colpi.length - 1] ?? 0}`

/* ---------------- abilità misurate ---------------- */

export type Metrica = 'estrazione' | 'primoColpo' | 'split' | 'transizione' | 'ricarica' | 'movimento'

export const METRICHE: { k: Metrica; nome: string; desc: string; profilo?: keyof TempiPersonali }[] = [
  { k: 'estrazione', nome: 'Estrazione', desc: 'Dal beep al primo colpo, da mani in resa e arma in fondina', profilo: 'estrazione' },
  { k: 'primoColpo', nome: 'Primo colpo in gara', desc: 'Dal beep al primo colpo negli stage, qualunque partenza' },
  { k: 'split', nome: 'Split', desc: 'Tra due colpi sullo stesso bersaglio', profilo: 'split' },
  { k: 'transizione', nome: 'Transizione', desc: 'Tra un bersaglio e il successivo, senza spostarti' },
  { k: 'ricarica', nome: 'Ricarica', desc: 'Dall’ultimo colpo al primo dopo il cambio caricatore', profilo: 'ricarica' },
  { k: 'movimento', nome: 'Movimento', desc: 'Dall’ultimo colpo in una posizione al primo nella successiva' },
]

export interface Campione { v: number; data: string; corsaId?: number; d: number | null; bers: TipoBersaglioColpo }

/** Fasce per confrontare tempi omogenei: la base è "carta fino a 8 m" (come i tempi del profilo). */
export type Fascia = 'base' | 'media' | 'lunga' | 'ferro' | 'mini'
export const NOMI_FASCIA: Record<Fascia, string> = { base: 'carta fino a 8\u00a0m', media: 'carta 9–15\u00a0m', lunga: 'carta oltre 15\u00a0m', ferro: 'su ferro', mini: 'mini carta' }
export function fasciaDi(c: Pick<Campione, 'd' | 'bers'>): Fascia {
  if (c.bers === 'ferro') return 'ferro'
  if (c.bers === 'mini') return 'mini'
  if (c.d == null || c.d <= 8) return 'base'
  return c.d <= 15 ? 'media' : 'lunga'
}

export interface StatFascia { f: Fascia; n: number; mediana: number }
export interface StatMetrica {
  k: Metrica
  n: number
  /** quante misure stanno nella fascia base (se 0, i valori sotto sono su tutte le misure) */
  nBase: number
  mediana: number
  migliore: number
  costanza: number // deviazione standard
  /** mediana degli ultimi 30 giorni meno quella dei 90 giorni prima: negativo = più veloce */
  tendenza: number | null
  fasce: StatFascia[]
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const devStd = (v: number[]) => {
  if (v.length < 2) return 0
  const m = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1))
}

/** I campioni di ogni abilità, da tutte le run salvate. */
export function campioni(corse: Corsa[], trova: (id: string) => Drill | undefined): Record<Metrica, Campione[]> {
  const out: Record<Metrica, Campione[]> = { estrazione: [], primoColpo: [], split: [], transizione: [], ricarica: [], movimento: [] }
  for (const c of corse) {
    if (!c.colpi.length) continue
    const d = c.drillId ? trova(c.drillId) : undefined
    const dDrill = metriDa(d?.distanza)
    const metti = (k: Metrica, v: number, i: number) => {
      if (!(v > 0 && v < 10)) return
      const b = bersaglioDi(c, i, dDrill)
      out[k].push({ v, data: c.data, corsaId: c.id, d: b.distanza, bers: b.tipo })
    }
    // drill con colpi giusti e nessun dettaglio sui bersagli: le misure del drill sono le più precise
    if (d?.misure?.length && (!d.colpi || c.colpi.length === d.colpi) && !c.bersagli?.some(Boolean)) {
      const m = misuraTempi(d, c.colpi)
      if (m.estrazione != null) metti('estrazione', m.estrazione, 0)
      if (m.split != null) metti('split', m.split, 1)
      if (m.transizioneVicina != null) metti('transizione', m.transizioneVicina, 1)
      if (m.transizioneLontana != null) metti('transizione', m.transizioneLontana, 1)
      if (m.ricarica != null) metti('ricarica', m.ricarica, 1)
      continue
    }
    c.colpi.forEach((t, i) => {
      const tipo = c.tipi[i]
      if (c.daVerificare.includes(i)) return
      if (i === 0) {
        if (c.partenzaStandard) metti('estrazione', t, 0)
        else if (c.contesto === 'gara') metti('primoColpo', t, 0)
        return
      }
      const g = t - c.colpi[i - 1]
      if (tipo === 'split' || tipo === 'transizione' || tipo === 'ricarica' || tipo === 'movimento') metti(tipo, g, i)
    })
  }
  return out
}

/** Le ricariche e i movimenti non dipendono dal bersaglio: per loro conta tutto. */
const SENZA_FASCE = new Set<Metrica>(['ricarica', 'movimento'])

export function statistiche(camp: Record<Metrica, Campione[]>, oggi = new Date()): StatMetrica[] {
  const giorno = 86_400_000
  const t0 = oggi.getTime()
  return METRICHE.map(({ k }) => {
    const tutti = camp[k]
    if (!tutti.length) return { k, n: 0, nBase: 0, mediana: 0, migliore: 0, costanza: 0, tendenza: null, fasce: [] }
    const base = SENZA_FASCE.has(k) ? tutti : tutti.filter((c) => fasciaDi(c) === 'base')
    const rif = base.length ? base : tutti
    const v = rif.map((c) => c.v)
    const recenti = rif.filter((c) => t0 - Date.parse(c.data) <= 30 * giorno).map((c) => c.v)
    const prima = rif.filter((c) => { const d = t0 - Date.parse(c.data); return d > 30 * giorno && d <= 120 * giorno }).map((c) => c.v)
    const fasce: StatFascia[] = SENZA_FASCE.has(k) ? [] : (['media', 'lunga', 'mini', 'ferro'] as Fascia[]).flatMap((f) => {
      const x = tutti.filter((c) => fasciaDi(c) === f).map((c) => c.v)
      return x.length ? [{ f, n: x.length, mediana: mediana(x) }] : []
    })
    return {
      k,
      n: tutti.length,
      nBase: base.length,
      mediana: mediana(v),
      migliore: Math.min(...v),
      costanza: devStd(v),
      tendenza: recenti.length >= 3 && prima.length >= 3 ? mediana(recenti) - mediana(prima) : null,
      fasce,
    }
  })
}

/**
 * Quanto ti costa la distanza: retta dei tempi (split e transizioni su carta) rispetto ai metri,
 * espressa come frazione per metro oltre i 7 m (0,035 = +3,5% al metro, il valore usato finora nei piani).
 */
export function pendenzaDistanza(camp: Record<Metrica, Campione[]>): { pendenza: number; n: number; da: number; a: number } | null {
  const punti = [...camp.split].filter((c) => c.d != null && c.bers === 'carta') as (Campione & { d: number })[]
  if (punti.length < 8) return null
  const xs = punti.map((p) => p.d), ys = punti.map((p) => p.v)
  const da = Math.min(...xs), a = Math.max(...xs)
  if (a - da < 5) return null
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length
  const my = ys.reduce((s, y) => s + y, 0) / ys.length
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx
  const a7 = my + b * (7 - mx)
  if (a7 <= 0) return null
  return { pendenza: Math.max(0, Math.min(0.1, b / a7)), n: punti.length, da, a }
}

/** Mediane settimanali nella fascia base, per il grafico di crescita. */
export function serieSettimanale(camp: Campione[], k: Metrica): { etichette: string[]; valori: number[] } {
  const rif = SENZA_FASCE.has(k) ? camp : camp.filter((c) => fasciaDi(c) === 'base')
  const usa = rif.length ? rif : camp
  const perSett = new Map<string, number[]>()
  for (const c of usa) {
    const d = new Date(c.data)
    const lun = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10)
    perSett.set(lun, [...(perSett.get(lun) ?? []), c.v])
  }
  const chiavi = [...perSett.keys()].sort()
  return { etichette: chiavi, valori: chiavi.map((k2) => mediana(perSett.get(k2)!)) }
}

/**
 * Riferimenti indicativi per classe (carta a circa 7 m, valori tipici, non ufficiali):
 * servono per orientarsi, non per giudicare.
 */
export const RIFERIMENTI: Partial<Record<Metrica, Record<Classe, number>>> = {
  estrazione: { D: 1.7, C: 1.5, B: 1.3, A: 1.15, Master: 1.05, 'Grand Master': 0.95 },
  split: { D: 0.35, C: 0.3, B: 0.25, A: 0.22, Master: 0.19, 'Grand Master': 0.17 },
  transizione: { D: 0.45, C: 0.38, B: 0.32, A: 0.27, Master: 0.23, 'Grand Master': 0.2 },
  ricarica: { D: 1.8, C: 1.5, B: 1.3, A: 1.1, Master: 0.95, 'Grand Master': 0.85 },
}

/** A che livello di classe corrisponde un tempo (il più alto che raggiungi). */
export function livelloDi(k: Metrica, v: number): Classe | null {
  const r = RIFERIMENTI[k]
  if (!r) return null
  const ordine: Classe[] = ['Grand Master', 'Master', 'A', 'B', 'C', 'D']
  return ordine.find((c) => v <= r[c]) ?? 'D'
}

/** Riassunto di una run: per le liste e lo statino. */
export function sintesiCorsa(c: Corsa) {
  const gaps = (tipo: TipoIntervallo) => c.colpi.map((t, i) => (i && c.tipi[i] === tipo ? t - c.colpi[i - 1] : null)).filter((x): x is number => x != null)
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)
  return {
    colpi: c.colpi.length,
    totale: c.colpi.length ? c.colpi[c.colpi.length - 1] : null,
    primo: c.colpi[0] ?? null,
    split: media(gaps('split')),
    transizione: media(gaps('transizione')),
    ricariche: gaps('ricarica'),
    movimenti: gaps('movimento'),
    daIndicare: gaps('lungo').length,
  }
}

/** Prova del drill creata da una run (zone e punti si completano dal drill, se servono). */
export function provaDaCorsa(c: Corsa, drillId: string, major: boolean): Omit<Prova, 'id'> {
  return {
    drillId,
    data: c.data,
    creato: new Date().toISOString(),
    modalita: 'fuoco',
    tempo: c.tempoTimer ?? (c.colpi.length ? c.colpi[c.colpi.length - 1] : null),
    colpi: c.colpi,
    zone: { A: 0, C: 0, D: 0, M: 0, NS: 0 },
    major,
    hf: null,
    eventoId: c.eventoId,
    note: `Da GDA Split${c.file ? ` · ${c.file}` : ''}`,
  }
}
