/**
 * Lettura degli screenshot dei risultati PractiScore (pagina web dei risultati: "Match" e "Stage N").
 * Il testo arriva dall'OCR con le posizioni delle parole: le colonne si riconoscono dalle intestazioni
 * (Name, %, Stg Pts, Pts, HF, Time, Div, Class, Cats, PF, A, C, D, M, NPM, NS, Proc).
 * Ogni riga si controlla con l'aritmetica del punteggio (5A + 3C + 1D − 10 per mancati, no-shoot e procedure,
 * HF = punti / tempo): le righe tagliate o lette male vengono corrette o scartate.
 */
import type { LetturaRisultati, RigaOverall, RigaStage, Verify } from './parser'

export interface ParolaOcr { t: string; x0: number; x1: number; y0: number; y1: number }
export interface RigaOcr { y0: number; y1: number; parole: ParolaOcr[] }

type Col = 'nome' | 'pct' | 'stg' | 'pts' | 'hf' | 'tempo' | 'psbl' | 'div' | 'cls' | 'cats' | 'pf' | 'mem'
  | 'A' | 'C' | 'D' | 'M' | 'NPM' | 'NS' | 'Proc' | 'Apen'
interface Intestazione { k: Col; x0: number; x1: number; cx: number }

const COLPI: Col[] = ['A', 'C', 'D', 'M', 'NPM', 'NS', 'Proc']
const TESTO: Col[] = ['div', 'cls', 'cats']

export type TipoSchermata = 'match' | 'stage'
export interface RigaLetta {
  pos: number
  nome: string
  div: string
  cls: string
  cat: string
  major: boolean
  pct: number | null
  stg: number | null
  pts: number | null
  hf: number | null
  tempo: number | null
  psbl: number | null
  A: number; C: number; D: number; M: number; NPM: number; NS: number; Proc: number
  /** righe con un controllo non riuscito (restano, ma segnalate) */
  dubbio: string | null
}
export interface Schermata {
  file: string
  tipo: TipoSchermata
  stage: number | null
  /** numero dello stage dedotto dall'ordine dei file, non letto */
  stageDedotto?: boolean
  righe: RigaLetta[]
  scartate: number
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%#]/g, '')
const centro = (p: { x0: number; x1: number }) => (p.x0 + p.x1) / 2

/** Riga delle intestazioni e colonne riconosciute. */
export function intestazioni(righe: RigaOcr[]): { riga: RigaOcr; col: Intestazione[]; tipo: TipoSchermata } | null {
  for (const riga of righe) {
    const w = [...riga.parole].sort((a, b) => a.x0 - b.x0)
    const n = w.map((p) => norm(p.t))
    if (!n.includes('name') || !n.some((x) => x === 'time') || !n.some((x) => x === 'pts')) continue
    const col: Intestazione[] = []
    const ignoti: ParolaOcr[] = []
    for (let i = 0; i < w.length; i++) {
      const t = n[i], p = w[i], q = w[i + 1], nq = n[i + 1]
      const add = (k: Col, fino = p) => col.push({ k, x0: p.x0, x1: fino.x1, cx: (p.x0 + fino.x1) / 2 })
      if (t === 'name') add('nome')
      else if (t === '%' && nq === 'psbl') { add('psbl', q); i++ }
      else if (t === '%') add('pct')
      else if (t === 'stg' && nq === 'pts') { add('stg', q); i++ }
      else if (t === 'stgpts') add('stg')
      else if (t === 'pts') add('pts')
      else if (t === 'hf') add('hf')
      else if (t === 'time') add('tempo')
      else if (t === 'div') add('div')
      else if (t === 'class') add('cls')
      else if (t === 'cats') add('cats')
      else if (t === 'pf') add('pf')
      else if (t === 'mem') { if (nq === '#') { add('mem', q); i++ } else add('mem') }
      else if (t === 'a') add('A')
      else if (t === 'c' || t === 'cc') add('C')
      else if (t === 'd') add('D')
      else if (t === 'm') add('M')
      else if (t === 'npm') add('NPM')
      else if (t === 'ns') add('NS')
      else if (t === 'proc') add('Proc')
      else if (t === 'apen') add('Apen')
      else ignoti.push(p)
    }
    // intestazioni dei colpi lette male (la "C" diventa "[+]", "Cc"…): la prima che manca nella sequenza
    for (const p of ignoti) {
      const prima = col.filter((c) => COLPI.includes(c.k) && c.x1 < p.x0).pop()
      const dopo = col.find((c) => COLPI.includes(c.k) && c.x0 > p.x1)
      if (!prima && !dopo) continue
      const iDa = prima ? COLPI.indexOf(prima.k) + 1 : 0
      const k = COLPI.slice(iDa).find((x) => !col.some((c) => c.k === x))
      if (k && (!dopo || COLPI.indexOf(k) < COLPI.indexOf(dopo.k))) col.push({ k, x0: p.x0, x1: p.x1, cx: centro(p) })
    }
    col.sort((a, b) => a.cx - b.cx)
    const tipo: TipoSchermata = col.some((c) => c.k === 'hf') || col.some((c) => c.k === 'stg') ? 'stage' : 'match'
    return { riga, col, tipo }
  }
  return null
}

const RE_RIGA = /^(\d{1,3})\s*[-–—~_]\s*(.*)$/
const RE_PCT = /^(\d{1,3}[.,]\d{1,2})%?$/
const RE_DEC = /^-?\d+[.,]\d+$/
const RE_INT = /^\d+$/
const decimali = (s: string) => (s.split(/[.,]/)[1] ?? '').length
const numero = (s: string) => Number(s.replace('%', '').replace(',', '.'))

/** Punti di uno stage dai colpi (al netto di mancati, no-shoot e procedure). */
export function puntiDaColpi(r: Pick<RigaLetta, 'A' | 'C' | 'D' | 'M' | 'NS' | 'Proc' | 'major'>) {
  return 5 * r.A + (r.major ? 4 : 3) * r.C + (r.major ? 2 : 1) * r.D - 10 * (r.M + r.NS + r.Proc)
}

/** Legge le righe dei tiratori di uno screenshot. */
export function leggiRighe(righe: RigaOcr[]): { tipo: TipoSchermata; righe: RigaLetta[]; scartate: number } | null {
  const h = intestazioni(righe)
  if (!h) return null
  const { col, tipo } = h
  const get = (k: Col) => col.find((c) => c.k === k)
  const primaNumerica = col.find((c) => c.k !== 'nome')
  const out: RigaLetta[] = []
  let scartate = 0
  for (const riga of righe) {
    if (riga.y0 <= h.riga.y1) continue
    const tutte = [...riga.parole].sort((a, b) => a.x0 - b.x0).filter((p) => p.t.trim())
    // sporco sul bordo dello schermo ("|", "~", ":") prima del "12-Nome"
    const fineNome = get('nome')?.x1 ?? 400
    const i0 = tutte.findIndex((p) => p.x0 < fineNome + 60 && RE_RIGA.test(p.t))
    if (i0 < 0) continue
    const w = tutte.slice(i0)
    const m = w[0].t.match(RE_RIGA)!
    const pos = +m[1]
    const nome: string[] = m[2] ? [m[2]] : []
    let i = 1
    const limite = primaNumerica ? primaNumerica.cx - 30 : Infinity
    for (; i < w.length; i++) {
      const p = w[i]
      if (p.x1 >= limite) break
      if (/^[A-Za-zÀ-ÿ'’.-]+,?$/.test(p.t) && !/^\d/.test(p.t)) nome.push(p.t)
      // il resto prima della prima colonna è il badge delle modifiche ("(1)", "@"…): si ignora
    }
    const resto = w.slice(i)
    const r: RigaLetta = {
      pos, nome: nome.join(' ').replace(/\s+/g, ' ').trim(), div: '', cls: '', cat: '', major: false,
      pct: null, stg: null, pts: null, hf: null, tempo: null, psbl: null,
      A: 0, C: 0, D: 0, M: 0, NPM: 0, NS: 0, Proc: 0, dubbio: null,
    }
    // parole di testo: colonne allineate a sinistra (Div, Class, Cats): ogni parola va nell'ultima colonna iniziata prima di lei
    const numeri: ParolaOcr[] = []
    const testi: Partial<Record<Col, string[]>> = {}
    const colTesto = col.filter((c) => TESTO.includes(c.k)).sort((a, b) => a.x0 - b.x0)
    for (const p of resto) {
      if (/^(MINOR|MAJOR)\.?$/i.test(p.t)) { r.major = /MAJOR/i.test(p.t); continue }
      if (RE_PCT.test(p.t) || RE_DEC.test(p.t) || RE_INT.test(p.t)) { numeri.push(p); continue }
      if (!/[A-Za-z]/.test(p.t)) continue
      const k = [...colTesto].filter((c) => c.x0 <= p.x0 + 30).pop() ?? colTesto[0]
      if (k) (testi[k.k] ??= []).push(p.t)
    }
    r.div = (testi.div ?? []).join(' ')
    const cl = (testi.cls ?? []).join(' ')
    r.cls = /^(GM|M|A|B|C|D|U)$/.test(cl) ? cl : ''
    r.cat = (testi.cats ?? []).join(' ').replace(/,$/, '')
    // numeri: colonna più vicina tra quelle compatibili con il formato
    const usate = new Map<Col, ParolaOcr>()
    const colpi: ParolaOcr[] = []
    for (const p0 of numeri) {
      // punto decimale perso dall'OCR ("59190" per 5.9190): lo rimetto se la colonna vuole decimali
      let p = p0
      if (RE_INT.test(p.t) && p.t.length >= 4) {
        const vic = col.filter((c) => ['pct', 'stg', 'pts', 'hf', 'tempo', 'psbl'].includes(c.k)).sort((a, b) => Math.abs(a.cx - centro(p)) - Math.abs(b.cx - centro(p)))[0]
        const dec = vic && (vic.k === 'hf' || vic.k === 'stg' || (vic.k === 'pts' && tipo === 'match')) ? 4 : vic && ['tempo', 'pct', 'psbl'].includes(vic.k) ? 2 : 0
        if (dec) p = { ...p, t: `${p.t.slice(0, -dec)}.${p.t.slice(-dec)}` }
      }
      const isPct = /%$/.test(p.t)
      const dec = RE_DEC.test(p.t.replace('%', '')) ? decimali(p.t.replace('%', '')) : 0
      const ammesse: Col[] = isPct ? ['pct', 'psbl']
        : dec >= 3 ? ['stg', 'hf', 'pts']
          : dec > 0 ? ['tempo', 'pct', 'psbl', 'pts']
            : ['pts', 'mem', ...COLPI, 'Apen']
      const cand = col.filter((c) => ammesse.includes(c.k)).sort((a, b) => Math.abs(a.cx - centro(p)) - Math.abs(b.cx - centro(p)))
      const k = cand.find((c) => !usate.has(c.k)) ?? cand[0]
      if (!k) continue
      if (COLPI.includes(k.k) || k.k === 'Apen') { colpi.push(p); continue }
      if (k.k === 'mem') continue
      usate.set(k.k, p)
    }
    const val = (k: Col) => { const p = usate.get(k); return p ? numero(p.t) : null }
    r.pct = val('pct'); r.stg = val('stg'); r.pts = val('pts'); r.hf = val('hf'); r.tempo = val('tempo'); r.psbl = val('psbl')
    assegnaColpi(r, colpi, col, tipo)

    // controlli
    if (!r.nome || r.tempo == null || r.pts == null || (tipo === 'stage' && r.hf == null)) { scartate++; continue }
    if (tipo === 'stage') {
      const hfCalc = r.tempo > 0 ? r.pts / r.tempo : 0
      if (Math.abs(hfCalc - (r.hf ?? 0)) > 0.002) {
        // un numero letto male: se due su tre tornano, il terzo si corregge
        const ptsColpi = puntiDaColpi(r)
        if (r.hf && Math.abs(ptsColpi / r.tempo - r.hf) <= 0.002) r.pts = ptsColpi
        else if (r.hf && Math.abs(r.pts / r.hf - r.tempo) <= 0.011) r.tempo = Math.round((r.pts / r.hf) * 100) / 100
        else r.dubbio = 'HF, punti e tempo non tornano'
      }
      if (!r.dubbio && puntiDaColpi(r) !== Math.max(0, r.pts) && r.pts > 0) r.dubbio = 'Colpi A/C/D/M da verificare'
    }
    out.push(r)
  }
  return { tipo, righe: out, scartate }
}

/** Distribuisce i numeri dei colpi sulle colonne A, C, D, M… usando posizione e aritmetica dei punti. */
function assegnaColpi(r: RigaLetta, colpi: ParolaOcr[], col: Intestazione[], tipo: TipoSchermata) {
  const hc = COLPI.map((k) => col.find((c) => c.k === k)).filter((c): c is Intestazione => !!c)
  if (!colpi.length || !hc.length) return
  const ord = [...colpi].sort((a, b) => a.x0 - b.x0).slice(0, hc.length)
  const vals = ord.map((p) => numero(p.t))
  // tutte le assegnazioni in ordine (k numeri su n colonne), dalla più vicina alle intestazioni
  const scelte: { cols: Col[]; costo: number }[] = []
  const rec = (i: number, da: number, acc: number[]) => {
    if (i === ord.length) { scelte.push({ cols: acc.map((j) => hc[j].k), costo: acc.reduce((s, j, z) => s + Math.abs(hc[j].cx - centro(ord[z])), 0) }); return }
    for (let j = da; j < hc.length; j++) rec(i + 1, j + 1, [...acc, j])
  }
  rec(0, 0, [])
  scelte.sort((a, b) => a.costo - b.costo)
  const applica = (cols: Col[]) => {
    const z = { ...r, A: 0, C: 0, D: 0, M: 0, NPM: 0, NS: 0, Proc: 0 }
    cols.forEach((k, i) => { (z as Record<string, unknown>)[k] = vals[i] })
    return z
  }
  let migliore = applica(scelte[0].cols)
  if (tipo === 'stage' && r.pts != null) {
    const giusta = scelte.find((s) => puntiDaColpi(applica(s.cols)) === Math.max(0, r.pts!))
    // la posizione vale più dell'aritmetica solo se è netta (meno di metà distanza tra due colonne)
    if (giusta) migliore = applica(giusta.cols)
  }
  for (const k of COLPI) (r as unknown as Record<string, number>)[k] = (migliore as unknown as Record<string, number>)[k]
}

/* ---------- da più screenshot a una lettura dei risultati ---------- */

const chiaveNome = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '')
function distanza(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = t
    }
  }
  return d[b.length]
}

export interface RiepilogoSchermate {
  match: number // tiratori nella classifica generale
  stage: Record<number, number> // tiratori letti per stage
  dubbi: { stage: number | null; nome: string; perche: string }[]
  scartate: number
  dedotti: number[] // stage numerati dall'ordine dei file
}

/** Unisce gli screenshot (anche più di uno per stage, scorrendo la tabella) in una lettura dei risultati. */
export function componiLettura(schermate: Schermata[], gara: string): { lettura: LetturaRisultati; riepilogo: RiepilogoSchermate } {
  const canonici: string[] = []
  const nomeCanonico = (n: string) => {
    const k = chiaveNome(n)
    const trovato = canonici.find((c) => { const kc = chiaveNome(c); return kc === k || distanza(kc, k) <= Math.max(1, Math.floor(Math.min(k.length, kc.length) / 9)) })
    if (trovato) return trovato
    canonici.push(n)
    return n
  }
  const lettura: LetturaRisultati = { gara, overall: {}, stage: {}, verify: [], tipi: [] }
  const riepilogo: RiepilogoSchermate = { match: 0, stage: {}, dubbi: [], scartate: 0, dedotti: [] }
  // prima i nomi della classifica generale (più completi), poi gli stage
  const ordinate = [...schermate].sort((a, b) => (a.tipo === 'match' ? 0 : 1) - (b.tipo === 'match' ? 0 : 1))
  const perStage = new Map<number, Map<string, RigaLetta>>()
  const overall = new Map<string, RigaLetta>()
  for (const s of ordinate) {
    riepilogo.scartate += s.scartate
    if (s.stageDedotto && s.stage != null) riepilogo.dedotti.push(s.stage)
    for (const r0 of s.righe) {
      const r = { ...r0, nome: nomeCanonico(r0.nome) }
      if (s.tipo === 'match') {
        const g = overall.get(r.nome)
        if (!g || (g.dubbio && !r.dubbio)) overall.set(r.nome, r)
      } else if (s.stage != null) {
        const m = perStage.get(s.stage) ?? new Map<string, RigaLetta>()
        const g = m.get(r.nome)
        if (!g || (g.dubbio && !r.dubbio)) m.set(r.nome, r)
        perStage.set(s.stage, m)
      }
    }
  }
  const num = (n: string) => canonici.indexOf(n) + 1
  const divDi = (r: RigaLetta) => r.div || 'Production'
  if (overall.size) {
    lettura.tipi.push('overall')
    riepilogo.match = overall.size
    for (const r of overall.values()) {
      const o: RigaOverall = { pos: r.pos, pct: r.pct ?? 0, punti: r.pts ?? 0, nome: r.nome, cat: r.cat, reg: '', cls: r.cls }
      ;(lettura.overall[divDi(r)] ??= []).push(o)
    }
    for (const v of Object.values(lettura.overall)) v.sort((a, b) => a.pos - b.pos)
  }
  if (perStage.size) lettura.tipi.push('stage', 'verify')
  const verify = new Map<string, Verify>()
  for (const [n, m] of [...perStage.entries()].sort((a, b) => a[0] - b[0])) {
    riepilogo.stage[n] = m.size
    const righe = [...m.values()].sort((a, b) => a.pos - b.pos)
    correggiColpi(righe)
    // valore dello stage: i punti stage del vincitore (100%)
    const vinc = righe.find((r) => r.pct != null && r.pct >= 99.995) ?? righe[0]
    const hfMax = vinc?.hf ?? Math.max(...righe.map((r) => r.hf ?? 0))
    const valore = vinc?.stg ?? 0
    for (const r of righe) {
      if (r.dubbio) riepilogo.dubbi.push({ stage: n, nome: r.nome, perche: r.dubbio })
      const hf = r.hf ?? 0
      const rs: RigaStage = {
        pos: r.pos, pts: r.pts ?? 0, tempo: r.tempo ?? 0, hf,
        puntiStage: r.stg ?? (hfMax ? (valore * hf) / hfMax : 0),
        pct: r.pct ?? (hfMax ? (hf / hfMax) * 100 : 0), num: num(r.nome), nome: r.nome,
      }
      ;((lettura.stage[divDi(r)] ??= {})[n] ??= []).push(rs)
      let v = verify.get(r.nome)
      if (!v) {
        const ov = overall.get(r.nome)
        v = { num: num(r.nome), nome: r.nome, div: divDi(r), cls: r.cls || ov?.cls || '', factor: r.major ? 'Major' : 'Minor', cat: r.cat || ov?.cat || '', stages: [] }
        verify.set(r.nome, v)
      }
      v.stages.push({ n, hf, pts: 5 * r.A + (r.major ? 4 : 3) * r.C + (r.major ? 2 : 1) * r.D, A: r.A, C: r.C, D: r.D, MI: r.M, NS: r.NS, PE: r.Proc, tempo: r.tempo ?? 0 })
    }
  }
  lettura.verify = [...verify.values()]
  return { lettura, riepilogo }
}

/**
 * In uno stage tutti tirano lo stesso numero di colpi validi (A+C+D+M): con questo e con i punti
 * si corregge un numero letto male (tipico: "11" letto "1").
 */
export function correggiColpi(righe: RigaLetta[]) {
  const totali = righe.filter((r) => !r.dubbio).map((r) => r.A + r.C + r.D + r.M)
  const conta = new Map<number, number>()
  for (const t of totali) conta.set(t, (conta.get(t) ?? 0) + 1)
  const [tot, quanti] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
  if (!tot || quanti < Math.max(3, totali.length / 2)) return
  for (const r of righe) {
    if (r.pts == null || (puntiDaColpi(r) === Math.max(0, r.pts) && r.A + r.C + r.D + r.M === tot)) continue
    const valori: Record<'A' | 'C' | 'D' | 'M', number> = { A: 5, C: r.major ? 4 : 3, D: r.major ? 2 : 1, M: -10 }
    const soluzioni: { k: 'A' | 'C' | 'D' | 'M'; v: number }[] = []
    for (const k of ['A', 'C', 'D', 'M'] as const) {
      const senza = puntiDaColpi({ ...r, [k]: 0 })
      const v = (r.pts - senza) / valori[k]
      if (Number.isInteger(v) && v >= 0 && v <= 60 && r.A + r.C + r.D + r.M - r[k] + v === tot) soluzioni.push({ k, v })
    }
    if (soluzioni.length === 1) { r[soluzioni[0].k] = soluzioni[0].v; r.dubbio = null }
    else if (!r.dubbio && r.A + r.C + r.D + r.M !== tot) r.dubbio = 'Colpi A/C/D/M da verificare'
  }
}

/** Numero dello stage dal menu in alto ("Stage 3 Stage 3"); null per la pagina "Match". */
export function stageDaEtichetta(testo: string): number | null {
  const m = testo.match(/stage\s*0*(\d{1,2})/i)
  return m ? +m[1] : null
}

/** Data dal nome del file ("Screenshot 2026-11-22 alle 23.51.31.png", "Schermata 2026-11-22…", "IMG_20261122_…"). */
export function dataDaFile(nome: string): string | null {
  const m = nome.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/)
  if (!m) return null
  const [, a, me, g] = m
  return +me >= 1 && +me <= 12 && +g >= 1 && +g <= 31 ? `${a}-${me}-${g}` : null
}
