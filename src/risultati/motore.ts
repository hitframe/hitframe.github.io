import type { LetturaRisultati, Verify } from './parser'

export interface StageConc {
  pts: number // punti netti dello stage (dopo le penalità)
  tempo: number
  hf: number
  puntiStage: number
  pos: number
  pct: number
  // dalla Score Verification (se disponibile)
  lordi?: number
  A?: number; C?: number; D?: number; MI?: number; NS?: number; PE?: number
}

export interface Concorrente {
  num: number
  nome: string
  cls: string
  cat: string
  major: boolean
  pos: number
  pct: number
  punti: number
  stages: Record<number, StageConc>
}

/** Risultati di una gara salvati sul dispositivo (solo la divisione del tiratore). */
export interface RisultatoGara {
  id?: number
  creato: string
  gara: string
  data: string // YYYY-MM-DD (data di stampa delle classifiche)
  eventoId: number | null
  divisione: string
  mioNum: number
  valoreStage: Record<number, number> // punti stage massimi
  concorrenti: Concorrente[]
  conVerify: boolean
  avversari?: number[] // scelti dal tiratore
  /** Le altre divisioni della stessa gara, in forma leggera (per "e se fossi in un'altra divisione?") */
  altre?: Record<string, { valoreStage: Record<number, number>; conc: { num: number; nome: string; cls: string; hf: Record<number, number> }[] }>
  /** Abbinamento con il libretto di gara (Analisi gara): stage risultati → stage libretto */
  abbinamento?: { analisiId: number; mappa: Record<number, number>; incerti: number[]; manuale: boolean }
  /** Arma usata in questa gara (se non indicata, si deduce dalla data "dal" delle armi) */
  armaId?: number | null
  /** Da dove arrivano i dati: PDF completi o screenshot di PractiScore (solo i tiratori visibili) */
  fonte?: 'pdf' | 'screenshot'
}

const MESI: Record<string, string> = { gen: '01', feb: '02', mar: '03', apr: '04', mag: '05', giu: '06', lug: '07', ago: '08', set: '09', ott: '10', nov: '11', dic: '12', jan: '01', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', dec: '12' }

export function dataStampa(testi: string[]): string | null {
  for (const t of testi) {
    const m = t.match(/Printed\s+(\d{1,2})\s+([a-z]{3})\w*\s+(\d{4})/i)
    if (m && MESI[m[2].toLowerCase()]) return `${m[3]}-${MESI[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`
  }
  return null
}

export const pulisci = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean)

/** Trova il tiratore dal nome del profilo ("Giuseppe De Angelis" ↔ "DE ANGELIS, GIUSEPPE"). */
export function cercaTiratore(l: LetturaRisultati, nome: string): { divisione: string; num: number } | null {
  const parole = pulisci(nome)
  if (parole.length < 2) return null
  for (const [div, stages] of Object.entries(l.stage)) {
    for (const r of stages[1] ?? Object.values(stages)[0] ?? []) {
      const p = pulisci(r.nome.replace(/\bABSENT\b|\bDQ\b/gi, ''))
      if (parole.every((w) => p.includes(w)) && p.length <= parole.length + 1) return { divisione: div, num: r.num }
    }
  }
  return null
}

/** Elenco dei tiratori di tutte le divisioni, per sceglierlo a mano. */
export function elencoTiratori(l: LetturaRisultati) {
  const out: { divisione: string; num: number; nome: string }[] = []
  for (const [div, stages] of Object.entries(l.stage)) for (const r of Object.values(stages)[0] ?? []) out.push({ divisione: div, num: r.num, nome: r.nome })
  return out.sort((a, b) => a.nome.localeCompare(b.nome))
}

export function costruisciRisultato(l: LetturaRisultati, divisione: string, mioNum: number, data: string): RisultatoGara {
  const stages = l.stage[divisione] ?? {}
  const ver = new Map<number, Verify>(l.verify.map((v) => [v.num, v]))
  const overall = l.overall[divisione] ?? []
  const valoreStage: Record<number, number> = {}
  const conc = new Map<number, Concorrente>()
  for (const [nStr, righe] of Object.entries(stages)) {
    const n = +nStr
    valoreStage[n] = Math.max(...righe.map((r) => r.puntiStage))
    for (const r of righe) {
      let c = conc.get(r.num)
      if (!c) {
        const v = ver.get(r.num)
        const nomePulito = r.nome.replace(/\s+(ABSENT|DQ|DNF)$/i, '')
        const ov = overall.find((o) => o.nome === nomePulito || o.nome === r.nome)
        c = { num: r.num, nome: nomePulito, cls: ov?.cls || v?.cls || '', cat: ov?.cat || v?.cat || '', major: /major/i.test(v?.factor ?? ''), pos: 0, pct: 0, punti: 0, stages: {} }
        conc.set(r.num, c)
      }
      const sv = ver.get(r.num)?.stages.find((x) => x.n === n)
      c.stages[n] = {
        pts: r.pts, tempo: r.tempo, hf: r.hf, puntiStage: r.puntiStage, pos: r.pos, pct: r.pct,
        ...(sv ? { lordi: sv.pts, A: sv.A, C: sv.C, D: sv.D, MI: sv.MI, NS: sv.NS, PE: sv.PE } : {}),
      }
    }
  }
  const lista = [...conc.values()]
  for (const c of lista) c.punti = Object.values(c.stages).reduce((a, s) => a + s.puntiStage, 0)
  lista.sort((a, b) => b.punti - a.punti)
  const max = lista[0]?.punti || 1
  lista.forEach((c, i) => { c.pos = i + 1; c.pct = (c.punti / max) * 100 })
  // Altre divisioni: solo HF per stage, quanto basta per inserirsi in classifica
  const altre: NonNullable<RisultatoGara['altre']> = {}
  for (const [div, st] of Object.entries(l.stage)) {
    if (div === divisione) continue
    const vs: Record<number, number> = {}
    const cm = new Map<number, { num: number; nome: string; cls: string; hf: Record<number, number> }>()
    for (const [nStr, righe] of Object.entries(st)) {
      const n = +nStr
      vs[n] = Math.max(...righe.map((x) => x.puntiStage))
      for (const x of righe) {
        let c = cm.get(x.num)
        if (!c) {
          const nome = x.nome.replace(/\s+(ABSENT|DQ|DNF)$/i, '')
          c = { num: x.num, nome, cls: (l.overall[div] ?? []).find((o) => o.nome === nome)?.cls || ver.get(x.num)?.cls || '', hf: {} }
          cm.set(x.num, c)
        }
        c.hf[n] = x.hf
      }
    }
    altre[div] = { valoreStage: vs, conc: [...cm.values()] }
  }
  return {
    altre,
    creato: new Date().toISOString(), gara: l.gara || 'Gara', data, eventoId: null, divisione, mioNum,
    valoreStage, concorrenti: lista, conVerify: lista.some((c) => Object.values(c.stages).some((s) => s.A !== undefined)),
  }
}

/**
 * Risultato da screenshot: negli stage si vedono solo i primi della tabella, quindi i totali
 * vengono dalla classifica generale (Match) quando c'è; chi non è visibile ovunque resta in coda.
 */
export function sistemaDaSchermate(r: RisultatoGara, l: LetturaRisultati): RisultatoGara {
  const ov = new Map((l.overall[r.divisione] ?? []).map((o) => [o.nome, o]))
  if (ov.size) {
    for (const c of r.concorrenti) { const o = ov.get(c.nome); if (o) c.punti = o.punti }
    const conOv = r.concorrenti.filter((c) => ov.has(c.nome)).sort((a, b) => ov.get(a.nome)!.pos - ov.get(b.nome)!.pos)
    const senza = r.concorrenti.filter((c) => !ov.has(c.nome)).sort((a, b) => b.punti - a.punti)
    r.concorrenti = [...conOv, ...senza]
    const max = conOv[0]?.punti || 1
    r.concorrenti.forEach((c, i) => { c.pos = i + 1; c.pct = ov.get(c.nome)?.pct ?? (c.punti / max) * 100 })
  }
  r.fonte = 'screenshot'
  return r
}

/* ---------- Ricalcolo con scenari ---------- */

type Override = Record<number, { pts?: number; tempo?: number }>

/** Classifica ricalcolata se il tiratore indicato avesse avuto altri punti/tempi negli stage. */
export function ricalcola(r: RisultatoGara, num: number, ov: Override) {
  const nStages = Object.keys(r.valoreStage).map(Number)
  const hf = (c: Concorrente, n: number) => {
    const s = c.stages[n]
    if (!s) return 0
    if (c.num !== num || !ov[n]) return s.hf
    const pts = ov[n].pts ?? s.pts
    const t = ov[n].tempo ?? s.tempo
    return t > 0 ? Math.max(0, pts) / t : 0
  }
  const tot = new Map<number, number>()
  for (const n of nStages) {
    const max = Math.max(...r.concorrenti.map((c) => hf(c, n)))
    for (const c of r.concorrenti) tot.set(c.num, (tot.get(c.num) ?? 0) + (max > 0 ? (r.valoreStage[n] * hf(c, n)) / max : 0))
  }
  const ord = [...tot.entries()].sort((a, b) => b[1] - a[1])
  const pos = ord.findIndex(([k]) => k === num) + 1
  const punti = tot.get(num) ?? 0
  const me = r.concorrenti.find((c) => c.num === num)!
  const posClasse = ord.filter(([k]) => r.concorrenti.find((c) => c.num === k)?.cls === me.cls).findIndex(([k]) => k === num) + 1
  return { pos, punti, pct: (punti / ord[0][1]) * 100, posClasse }
}

const valoriColpo = (major: boolean) => ({ A: 5, C: major ? 4 : 3, D: major ? 2 : 1 })
export const colpiStage = (s: StageConc) => (s.A ?? 0) + (s.C ?? 0) + (s.D ?? 0) + (s.MI ?? 0)

/** Punti stage senza mancati, no-shoot e procedure (i mancati diventano A). */
const ptsSenzaErrori = (s: StageConc) => (s.lordi ?? s.pts) + 5 * (s.MI ?? 0)
/** Punti stage con tutte A. */
const ptsTutteA = (s: StageConc) => 5 * colpiStage(s)

export interface AnalisiStage {
  n: number
  s: StageConc
  totale: number
  hfMax: number
  tempoVincitore: number
  colpi: number
  corso: 'Short' | 'Medium' | 'Long'
  persiPrecisione: number // punti stage persi tra C e D
  persiErrori: number // punti persi per mancati, no-shoot, procedure
  guadagnoErrori: number // punti gara recuperati senza errori in questo stage
  guadagnoPrecisione: number // punti gara recuperati con tutte A
  guadagnoTempo5: number // punti gara con il 5% di tempo in meno
}

export function analizza(r: RisultatoGara, tipi?: Record<number, 'Short' | 'Medium' | 'Long'>) {
  const me = r.concorrenti.find((c) => c.num === r.mioNum)!
  const nStages = Object.keys(r.valoreStage).map(Number).sort((a, b) => a - b)
  const base = { pos: me.pos, punti: me.punti, pct: me.pct }
  const classe = r.concorrenti.filter((c) => c.cls === me.cls)
  const posClasse = classe.findIndex((c) => c.num === me.num) + 1
  const v = valoriColpo(me.major)

  const stages: AnalisiStage[] = nStages.map((n) => {
    const s = me.stages[n]
    const righe = r.concorrenti.map((c) => c.stages[n]).filter(Boolean)
    const vincitore = r.concorrenti.find((c) => c.stages[n]?.pos === 1)?.stages[n]
    const colpi = colpiStage(s) || Math.round(r.valoreStage[n] / 5)
    const gain = (o: Override) => ricalcola(r, me.num, o).punti - me.punti
    return {
      n, s,
      totale: righe.length,
      hfMax: Math.max(...righe.map((x) => x.hf)),
      tempoVincitore: vincitore?.tempo ?? 0,
      colpi,
      corso: tipi?.[n] ?? (colpi <= 12 ? 'Short' : colpi <= 24 ? 'Medium' : 'Long'),
      persiPrecisione: (s.C ?? 0) * (5 - v.C) + (s.D ?? 0) * (5 - v.D),
      persiErrori: (s.MI ?? 0) * 15 + (s.NS ?? 0) * 10 + (s.PE ?? 0) * 10,
      guadagnoErrori: r.conVerify ? gain({ [n]: { pts: ptsSenzaErrori(s) } }) : 0,
      guadagnoPrecisione: r.conVerify ? gain({ [n]: { pts: ptsTutteA(s) } }) : 0,
      guadagnoTempo5: gain({ [n]: { tempo: s.tempo * 0.95 } }),
    }
  })

  const tutti = (f: (s: StageConc) => { pts?: number; tempo?: number }) => Object.fromEntries(nStages.map((n) => [n, f(me.stages[n])])) as Override
  const profiloMio = (() => {
    let pts = 0, max = 0
    for (const n of nStages) { const s = me.stages[n]; pts += Math.max(0, s.pts); max += 5 * (colpiStage(s) || r.valoreStage[n] / 5) }
    return max ? pts / max : 1
  })()
  const precTop10 = (() => {
    let pts = 0, max = 0
    for (const c of r.concorrenti.slice(0, 10)) for (const n of nStages) { const s = c.stages[n]; if (!s) continue; pts += Math.max(0, s.pts); max += 5 * (colpiStage(s) || r.valoreStage[n] / 5) }
    return max ? pts / max : 1
  })()
  const scenari = {
    precisioneTop10: r.conVerify && precTop10 > profiloMio
      ? ricalcola(r, me.num, tutti((s) => ({ pts: Math.min(ptsTutteA(s), Math.max(0, s.pts) * (precTop10 / profiloMio)) })))
      : null,
    senzaErrori: r.conVerify ? ricalcola(r, me.num, tutti((s) => ({ pts: ptsSenzaErrori(s) }))) : null,
    tutteA: r.conVerify ? ricalcola(r, me.num, tutti((s) => ({ pts: ptsTutteA(s) }))) : null,
    veloce5: ricalcola(r, me.num, tutti((s) => ({ tempo: s.tempo * 0.95 }))),
  }

  // Totali colpi
  const somma = (k: 'A' | 'C' | 'D' | 'MI' | 'NS' | 'PE') => nStages.reduce((a, n) => a + (me.stages[n][k] ?? 0), 0)
  const tot = { A: somma('A'), C: somma('C'), D: somma('D'), MI: somma('MI'), NS: somma('NS'), PE: somma('PE') }
  const colpiTot = tot.A + tot.C + tot.D + tot.MI

  // Precisione e velocità rispetto a un gruppo di riferimento
  const profiloDi = (c: Concorrente) => {
    let pts = 0, max = 0, t = 0, A = 0, h = 0
    for (const n of nStages) {
      const s = c.stages[n]
      if (!s) continue
      pts += Math.max(0, s.pts); max += 5 * (colpiStage(s) || r.valoreStage[n] / 5); t += s.tempo
      A += s.A ?? 0; h += colpiStage(s)
    }
    return { precisione: max ? pts / max : 0, tempo: t, aPct: h ? A / h : 0 }
  }
  const media = (cs: Concorrente[]) => {
    const p = cs.map(profiloDi)
    const m = (k: 'precisione' | 'tempo' | 'aPct') => p.reduce((a, x) => a + x[k], 0) / Math.max(1, p.length)
    return { precisione: m('precisione'), tempo: m('tempo'), aPct: m('aPct') }
  }
  const mio = profiloDi(me)
  const top10 = media(r.concorrenti.slice(0, 10))
  const mediaClasse = media(classe.filter((c) => c.num !== me.num))

  // Scomposizione del distacco dal 10° posto (o dal primo, se sei già tra i primi 10)
  const rif = me.pos > 10 ? r.concorrenti[9] : r.concorrenti[0].num === me.num ? r.concorrenti[1] : r.concorrenti[0]
  let dPunti = 0, dTempo = 0
  for (const n of nStages) {
    const a = me.stages[n], b = rif?.stages[n]
    if (!a || !b || a.pts <= 0 || b.pts <= 0) continue
    dPunti += Math.log(b.pts / a.pts)
    dTempo += Math.log(a.tempo / b.tempo)
  }
  const totD = Math.abs(dPunti) + Math.abs(dTempo) || 1
  const distacco = { rif, quotaPrecisione: Math.max(0, dPunti) / totD, quotaVelocita: Math.max(0, dTempo) / totD }

  return {
    me, base, posClasse, totClasse: classe.length, totale: r.concorrenti.length, stages, scenari, tot, colpiTot,
    mio, top10, mediaClasse, distacco, vincitore: r.concorrenti[0],
    sopra: r.concorrenti[me.pos - 2] ?? null, sotto: r.concorrenti[me.pos] ?? null,
  }
}

export type Analisi = ReturnType<typeof analizza>

/** Avversari diretti predefiniti: 3 sopra e 3 sotto in classifica. */
export function avversariVicini(r: RisultatoGara) {
  const me = r.concorrenti.find((c) => c.num === r.mioNum)!
  return r.concorrenti.filter((c) => c.num !== me.num && Math.abs(c.pos - me.pos) <= 3).map((c) => c.num)
}

export function confronto(r: RisultatoGara, num: number) {
  const me = r.concorrenti.find((c) => c.num === r.mioNum)!
  const o = r.concorrenti.find((c) => c.num === num)!
  const nStages = Object.keys(r.valoreStage).map(Number).sort((a, b) => a - b)
  const perStage = nStages.map((n) => ({
    n,
    diff: (me.stages[n]?.puntiStage ?? 0) - (o.stages[n]?.puntiStage ?? 0),
    mio: me.stages[n], suo: o.stages[n],
  }))
  return { o, diff: me.punti - o.punti, perStage }
}

/**
 * Confronto con il tiratore di riferimento (uno costante, che usi come metro gara dopo gara):
 * statino stage per stage, dove sta la differenza (tempo o punti) e cosa valgono i suoi numeri sui tuoi.
 */
export function controRiferimento(r: RisultatoGara, num: number) {
  const me = r.concorrenti.find((c) => c.num === r.mioNum)!
  const o = r.concorrenti.find((c) => c.num === num)!
  const nStages = Object.keys(r.valoreStage).map(Number).sort((a, b) => a - b)
  const stages = nStages.map((n) => {
    const mio = me.stages[n], suo = o.stages[n]
    return {
      n, mio, suo,
      hfPct: mio && suo && suo.hf > 0 ? (mio.hf / suo.hf) * 100 : null,
      dTempo: mio && suo ? mio.tempo - suo.tempo : null,
      dPts: mio && suo ? mio.pts - suo.pts : null,
      dStage: (mio?.puntiStage ?? 0) - (suo?.puntiStage ?? 0),
    }
  })
  const comuni = stages.filter((x) => x.mio && x.suo)
  const somma = (f: (x: (typeof stages)[number]) => number) => comuni.reduce((a, x) => a + f(x), 0)
  const colpi = (c: Concorrente) => {
    const st = comuni.map((x) => c.stages[x.n]).filter((s) => s?.A !== undefined)
    const tot = st.reduce((a, s) => a + colpiStage(s), 0)
    return tot ? { aPct: st.reduce((a, s) => a + (s.A ?? 0), 0) / tot, mancati: st.reduce((a, s) => a + (s.MI ?? 0) + (s.NS ?? 0), 0) } : null
  }
  // scenari: i suoi punti con i tuoi tempi, i suoi tempi con i tuoi punti
  const ovPunti: Override = {}, ovTempi: Override = {}
  for (const x of comuni) { ovPunti[x.n] = { pts: x.suo!.pts }; ovTempi[x.n] = { tempo: x.suo!.tempo } }
  return {
    o, stages,
    indice: o.punti ? (me.punti / o.punti) * 100 : 0,
    diff: me.punti - o.punti,
    dTempo: somma((x) => x.dTempo!),
    dPts: somma((x) => x.dPts!),
    mio: colpi(me), suo: colpi(o),
    conSuoiPunti: comuni.length ? ricalcola(r, r.mioNum, ovPunti) : null,
    conSuoiTempi: comuni.length ? ricalcola(r, r.mioNum, ovTempi) : null,
    completo: comuni.length === nStages.length,
  }
}

/* ---------- Da portare in allenamento ---------- */

export interface Indicazione { titolo: string; perche: string; drill: string[]; peso: number }

export function indicazioni(a: Analisi): Indicazione[] {
  const out: Indicazione[] = []
  const { tot, colpiTot, mio, top10, distacco, stages } = a
  if (colpiTot) {
    const persiCD = stages.reduce((x, s) => x + s.persiPrecisione, 0)
    const gapA = top10.aPct - mio.aPct
    if (gapA > 0.03 || mio.aPct < 0.75) {
      out.push({
        titolo: 'Precisione sulle zone A',
        perche: `A al ${Math.round(mio.aPct * 100)}% contro il ${Math.round(top10.aPct * 100)}% dei primi 10: tra C e D hai lasciato ${persiCD} punti.`,
        drill: ['doppiette', 'parziali', 'accelerator', 'b-transizioni'], peso: gapA * 100 + persiCD / 10,
      })
    }
  }
  if (tot.MI + tot.NS > 0) {
    const g = stages.reduce((x, s) => x + s.guadagnoErrori, 0)
    out.push({
      titolo: 'Zero mancati e no-shoot',
      perche: `${tot.MI} mancat${tot.MI === 1 ? 'o' : 'i'}${tot.NS ? ` e ${tot.NS} no-shoot` : ''}: senza, avresti preso ${g.toFixed(1).replace('.', ',')} punti gara in più.`,
      drill: ['parziali', 'carta-metallo', 'piastre'], peso: g,
    })
  }
  if (tot.PE > 0) {
    out.push({
      titolo: 'Procedure: piano dello stage',
      perche: `${tot.PE} procedur${tot.PE === 1 ? 'a' : 'e'}: studia gli stage prima della gara (Analisi gara → Studia lo stage) e allena ingressi e fault line.`,
      drill: ['ingresso', 'box-box', 'b-ingressi'], peso: tot.PE * 8,
    })
  }
  if (distacco.quotaVelocita > 0.55) {
    const lenti = [...stages].sort((x, y) => y.guadagnoTempo5 - x.guadagnoTempo5).slice(0, 3)
    out.push({
      titolo: 'Velocità e movimento',
      perche: `Il ${Math.round(distacco.quotaVelocita * 100)}% del distacco da ${distacco.rif?.nome ?? 'chi ti precede'} viene dal tempo. Stage dove la velocità rende di più: ${lenti.map((s) => s.n).join(', ')}.`,
      drill: ['movimento', 'box-box', 'blake', 'accelerator', 'b-ingressi'], peso: distacco.quotaVelocita * 30,
    })
  }
  // Tipi di stage peggiori
  const perCorso = (['Short', 'Medium', 'Long'] as const).map((c) => {
    const ss = stages.filter((s) => s.corso === c)
    return { c, n: ss.length, pct: ss.length ? ss.reduce((x, s) => x + s.s.pct, 0) / ss.length : 100 }
  }).filter((x) => x.n > 0)
  const mediaPct = stages.reduce((x, s) => x + s.s.pct, 0) / Math.max(1, stages.length)
  const peggiore = perCorso.sort((x, y) => x.pct - y.pct)[0]
  if (peggiore && peggiore.pct < mediaPct - 4) {
    out.push({
      titolo: `Stage ${peggiore.c === 'Short' ? 'corti' : peggiore.c === 'Medium' ? 'medi' : 'lunghi'}`,
      perche: `Negli stage ${peggiore.c} fai il ${peggiore.pct.toFixed(0)}% contro una media del ${mediaPct.toFixed(0)}%.`,
      drill: peggiore.c === 'Short' ? ['estrazione', 'doppiette', 'b-estrazione'] : peggiore.c === 'Long' ? ['movimento', 'ricarica', 'b-ricarica'] : ['box-box', 'blake', 'ricarica'],
      peso: mediaPct - peggiore.pct,
    })
  }
  return out.sort((x, y) => y.peso - x.peso)
}

/** Cerca un tiratore per nome ("Enea Grigoli" o "GRIGOLI, ENEA") tra i concorrenti. */
export function trovaPerNome(r: RisultatoGara, nome: string): Concorrente | undefined {
  const parole = pulisci(nome)
  if (!parole.length) return undefined
  return r.concorrenti.find((c) => { const p = pulisci(c.nome); return parole.every((w) => p.includes(w)) })
}

export const nomeLeggibile = (n: string) => n.split(',').map((x) => x.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())).reverse().join(' ').trim()

/* ---------- E se fossi in un'altra divisione? ---------- */

export interface InAltraDivisione {
  divisione: string
  pos: number
  tot: number
  pct: number
  posClasse: number
  totClasse: number
  /** stesso calcolo con punteggio major (solo divisioni che lo ammettono) */
  major?: { pos: number; pct: number }
}

const DIV_MAJOR = /^(Standard|Open|Classic|Revolver|Optics)$/i

/**
 * Il tiratore inserito nella classifica di un'altra divisione, con i suoi HF stage per stage.
 * Solo divisioni con gli stessi stage e gli stessi punti (handgun dello stesso match).
 */
export function inAltreDivisioni(r: RisultatoGara): InAltraDivisione[] {
  if (!r.altre) return []
  const me = r.concorrenti.find((c) => c.num === r.mioNum)!
  const nMiei = Object.keys(r.valoreStage).map(Number)
  const out: InAltraDivisione[] = []
  for (const [div, d] of Object.entries(r.altre)) {
    const nD = Object.keys(d.valoreStage).map(Number)
    if (nD.length !== nMiei.length || nMiei.some((n) => d.valoreStage[n] !== r.valoreStage[n])) continue
    if (d.conc.length < 3) continue
    const classifica = (mioHf: Record<number, number>) => {
      const tot = new Map<number, number>()
      for (const n of nMiei) {
        const max = Math.max(mioHf[n] ?? 0, ...d.conc.map((c) => c.hf[n] ?? 0))
        if (max <= 0) continue
        for (const c of d.conc) tot.set(c.num, (tot.get(c.num) ?? 0) + (d.valoreStage[n] * (c.hf[n] ?? 0)) / max)
        tot.set(-1, (tot.get(-1) ?? 0) + (d.valoreStage[n] * (mioHf[n] ?? 0)) / max)
      }
      const ord = [...tot.entries()].sort((a, b) => b[1] - a[1])
      const pos = ord.findIndex(([k]) => k === -1) + 1
      return { pos, pct: (tot.get(-1)! / ord[0][1]) * 100, ord }
    }
    const hfMinor = Object.fromEntries(nMiei.map((n) => [n, me.stages[n]?.hf ?? 0]))
    const base = classifica(hfMinor)
    const classe = base.ord.filter(([k]) => k === -1 || d.conc.find((c) => c.num === k)?.cls === me.cls)
    const ris: InAltraDivisione = {
      divisione: div, pos: base.pos, tot: d.conc.length + 1, pct: base.pct,
      posClasse: classe.findIndex(([k]) => k === -1) + 1, totClasse: classe.length,
    }
    if (!me.major && DIV_MAJOR.test(div) && r.conVerify) {
      const hfMaj = Object.fromEntries(nMiei.map((n) => {
        const s = me.stages[n]
        if (!s || s.A === undefined || s.tempo <= 0) return [n, s?.hf ?? 0]
        const pts = 5 * s.A + 4 * (s.C ?? 0) + 2 * (s.D ?? 0) - 10 * ((s.MI ?? 0) + (s.NS ?? 0) + (s.PE ?? 0))
        return [n, Math.max(0, pts) / s.tempo]
      }))
      const m = classifica(hfMaj)
      ris.major = { pos: m.pos, pct: m.pct }
    }
    out.push(ris)
  }
  return out.sort((a, b) => b.pct - a.pct)
}
