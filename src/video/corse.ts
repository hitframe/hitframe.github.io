/**
 * Le run di GDA Split dentro Hitframe: arrivo dei dati, tipi degli intervalli e abilità misurate.
 * Il video non viene salvato: solo i tempi dei colpi, che pesano pochi byte e si sincronizzano.
 */
import type { Corsa, Prova, TempiPersonali, TipoIntervallo } from '../db/types'
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
  shots: { n?: number; t: number; split?: number; kind?: string; flag?: string | null }[]
}

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
  const data = (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date : new Date().toISOString()).slice(0, 10)
  return {
    creato: new Date().toISOString(),
    data,
    titolo: (r.stage || r.file || 'Run').trim(),
    file: r.file ?? '',
    colpi,
    tipi: tipiAuto(colpi),
    daVerificare: ord.map((s, i) => (s.flag ? i : -1)).filter((i) => i >= 0),
    tempoTimer: r.plan ?? null,
    contesto: 'libero',
    partenzaStandard: false,
    eventoId: null, drillId: null, provaId: null, risultatoId: null, analisiId: null, stage: null,
    link: '',
    note: '',
  }
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

export interface Campione { v: number; data: string; corsaId?: number }
export interface StatMetrica {
  k: Metrica
  n: number
  mediana: number
  migliore: number
  costanza: number // deviazione standard
  /** mediana degli ultimi 30 giorni meno quella dei 90 giorni prima: negativo = più veloce */
  tendenza: number | null
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
  const metti = (k: Metrica, v: number, c: Corsa) => { if (v > 0 && v < 10) out[k].push({ v, data: c.data, corsaId: c.id }) }
  for (const c of corse) {
    if (!c.colpi.length) continue
    const d = c.drillId ? trova(c.drillId) : undefined
    // drill con colpi giusti: le misure del drill sono le più precise
    if (d?.misure?.length && (!d.colpi || c.colpi.length === d.colpi)) {
      const m = misuraTempi(d, c.colpi)
      if (m.estrazione != null) metti('estrazione', m.estrazione, c)
      if (m.split != null) metti('split', m.split, c)
      if (m.transizioneVicina != null) metti('transizione', m.transizioneVicina, c)
      if (m.transizioneLontana != null) metti('transizione', m.transizioneLontana, c)
      if (m.ricarica != null) metti('ricarica', m.ricarica, c)
      continue
    }
    c.colpi.forEach((t, i) => {
      const tipo = c.tipi[i]
      if (c.daVerificare.includes(i)) return
      if (i === 0) {
        if (c.partenzaStandard) metti('estrazione', t, c)
        else if (c.contesto === 'gara') metti('primoColpo', t, c)
        return
      }
      const g = t - c.colpi[i - 1]
      if (tipo === 'split' || tipo === 'transizione' || tipo === 'ricarica' || tipo === 'movimento') metti(tipo, g, c)
    })
  }
  return out
}

export function statistiche(camp: Record<Metrica, Campione[]>, oggi = new Date()): StatMetrica[] {
  const giorno = 86_400_000
  const t0 = oggi.getTime()
  return METRICHE.map(({ k }) => {
    const v = camp[k].map((c) => c.v)
    if (!v.length) return { k, n: 0, mediana: 0, migliore: 0, costanza: 0, tendenza: null }
    const recenti = camp[k].filter((c) => t0 - Date.parse(c.data) <= 30 * giorno).map((c) => c.v)
    const prima = camp[k].filter((c) => { const d = t0 - Date.parse(c.data); return d > 30 * giorno && d <= 120 * giorno }).map((c) => c.v)
    return {
      k,
      n: v.length,
      mediana: mediana(v),
      migliore: Math.min(...v),
      costanza: devStd(v),
      tendenza: recenti.length >= 3 && prima.length >= 3 ? mediana(recenti) - mediana(prima) : null,
    }
  })
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
