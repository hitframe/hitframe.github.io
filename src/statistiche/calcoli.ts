import type { AnalisiGara } from '../db/types'
import { leggiDateGara } from '../analisi/date'
import { analizza, type RisultatoGara } from '../risultati/motore'
import { punteggioReale } from '../risultati/reale'

export type Corso = 'Short' | 'Medium' | 'Long'

export interface PuntoGara {
  id: number
  gara: string
  breve: string
  data: string
  pct: number
  reale: number // punteggio reale (100 = GM in forma), indipendente da chi c'era
  realePrecisione: number | null
  realeVelocita: number | null
  forzaCampo: number // vincitore sulla stessa scala
  livelloCampo: string
  pos: number
  tot: number
  posClasse: number
  totClasse: number
  aPct: number
  aPctTop10: number
  precisione: number
  precisioneTop10: number
  tempoRel: number // tuo tempo / tempo medio dei primi 10 (sotto 1 = più veloce)
  mancati100: number // mancati ogni 100 colpi
  mancati100Top10: number
  ns: number
  pe: number
  costoErrori: number // punti gara persi per mancati, no-shoot, procedure
  puntiVincitore: number
  perCorso: Partial<Record<Corso, { pct: number; n: number }>>
}

const abbrevia = (g: string) => g
  .replace(/CAMPIONATO/gi, 'Camp.').replace(/NATIONAL/gi, 'Naz.').replace(/ITALIANO|ITALIAN/gi, 'Ita').replace(/FEDERALE/gi, 'Fed.')
  .replace(/PROVA/gi, 'prova').replace(/TROFEO/gi, 'Trofeo').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 26)

/** Tipo di corso dal libretto abbinato, se c'è. */
export function tipiDaLibretto(r: RisultatoGara, analisi: AnalisiGara[]): Record<number, Corso> | undefined {
  const an = r.abbinamento ? analisi.find((a) => a.id === r.abbinamento!.analisiId) : analisi.find((a) => {
    const sez = a.lettura.sezioni[a.sezione] ?? a.lettura.sezioni[0]
    const d = sez && leggiDateGara(sez.info.date)
    return d && r.data >= d.inizio && r.data <= d.fine
  })
  if (!an || !r.abbinamento) return undefined
  const sez = an.lettura.sezioni[an.sezione] ?? an.lettura.sezioni[0]
  const t: Record<number, Corso> = {}
  for (const [rn, bn] of Object.entries(r.abbinamento.mappa)) { const st = sez?.stages.find((z) => z.numero === bn); if (st) t[+rn] = st.tipo }
  return t
}

export function puntiGara(risultati: RisultatoGara[], analisi: AnalisiGara[]): PuntoGara[] {
  return [...risultati].sort((a, b) => a.data.localeCompare(b.data)).map((r) => {
    const a = analizza(r, tipiDaLibretto(r, analisi))
    const re = punteggioReale(r)
    const top10 = r.concorrenti.slice(0, 10)
    let mi10 = 0, h10 = 0
    for (const c of top10) for (const s of Object.values(c.stages)) { mi10 += s.MI ?? 0; h10 += (s.A ?? 0) + (s.C ?? 0) + (s.D ?? 0) + (s.MI ?? 0) }
    const perCorso: PuntoGara['perCorso'] = {}
    for (const s of a.stages) {
      const x = (perCorso[s.corso] ??= { pct: 0, n: 0 })
      x.pct += re?.stages.find((z) => z.n === s.n)?.indice ?? s.s.pct; x.n++
    }
    for (const k of Object.keys(perCorso) as Corso[]) perCorso[k]!.pct /= perCorso[k]!.n
    return {
      id: r.id!, gara: r.gara, breve: abbrevia(r.gara), data: r.data,
      pct: a.base.pct, pos: a.base.pos,
      reale: re?.indice ?? a.base.pct, realePrecisione: re?.precisione ?? null, realeVelocita: re?.velocita ?? null,
      forzaCampo: re?.forza ?? 100, livelloCampo: re?.livello ?? 'medio', tot: a.totale, posClasse: a.posClasse, totClasse: a.totClasse,
      aPct: a.mio.aPct, aPctTop10: a.top10.aPct, precisione: a.mio.precisione, precisioneTop10: a.top10.precisione,
      tempoRel: a.top10.tempo ? a.mio.tempo / a.top10.tempo : 1,
      mancati100: a.colpiTot ? (a.tot.MI / a.colpiTot) * 100 : 0,
      mancati100Top10: h10 ? (mi10 / h10) * 100 : 0,
      ns: a.tot.NS, pe: a.tot.PE,
      costoErrori: a.stages.reduce((x, s) => x + s.guadagnoErrori, 0),
      puntiVincitore: a.vincitore.punti,
      perCorso,
    }
  })
}

/** Pendenza della retta dei minimi quadrati (unità per gara). */
export function pendenza(y: number[]): number {
  const n = y.length
  if (n < 2) return 0
  const mx = (n - 1) / 2, my = y.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  y.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2 })
  return den ? num / den : 0
}

export interface Giudizio { titolo: string; testo: string; tipo: 'forte' | 'debole' }

export function puntiForzaDebolezza(p: PuntoGara[]): Giudizio[] {
  if (!p.length) return []
  const out: Giudizio[] = []
  const m = (f: (x: PuntoGara) => number) => p.reduce((a, x) => a + f(x), 0) / p.length
  const n = p.length
  const veloce = p.filter((x) => x.tempoRel < 1).length
  const tr = m((x) => x.tempoRel)
  if (veloce >= Math.ceil(n / 2)) out.push({ tipo: 'forte', titolo: 'Velocità', testo: `Più veloce della media dei primi 10 in ${veloce} gare su ${n} (in media ${Math.round((1 - tr) * 100)}% di tempo in meno).` })
  else if (tr > 1.08) out.push({ tipo: 'debole', titolo: 'Velocità', testo: `In media il ${Math.round((tr - 1) * 100)}% più lento dei primi 10: movimento e transizioni sono il margine da recuperare.` })
  const gapA = m((x) => x.aPctTop10 - x.aPct)
  if (gapA > 0.03) out.push({ tipo: 'debole', titolo: 'Zone A', testo: `Colpi in A al ${Math.round(m((x) => x.aPct) * 100)}% contro il ${Math.round(m((x) => x.aPctTop10) * 100)}% dei primi 10: è il distacco più costante.` })
  else if (gapA < 0) out.push({ tipo: 'forte', titolo: 'Zone A', testo: `Precisione in A pari o migliore dei primi 10 (${Math.round(m((x) => x.aPct) * 100)}%).` })
  const mi = m((x) => x.mancati100), mi10 = m((x) => x.mancati100Top10)
  const costo = p.reduce((a, x) => a + x.costoErrori, 0)
  if (mi > mi10 * 1.2 && mi > 0.8) out.push({ tipo: 'debole', titolo: 'Miss', testo: `${mi.toFixed(1).replace('.', ',')} miss ogni 100 colpi contro ${mi10.toFixed(1).replace('.', ',')} dei primi 10. In ${n} gare ti sono costati ${costo.toFixed(0)} punti gara.` })
  else if (mi <= mi10) out.push({ tipo: 'forte', titolo: 'Miss', testo: `Miss sotto la media dei primi 10 (${mi.toFixed(1).replace('.', ',')} ogni 100 colpi).` })
  // Tendenze nel tempo
  if (n >= 3) {
    const pr = pendenza(p.map((x) => x.reale))
    if (pr > 0.5) out.push({ tipo: 'forte', titolo: 'Livello in crescita', testo: `Il punteggio reale sale di circa ${pr.toFixed(1).replace('.', ',')} a gara: dal ${p[0].reale.toFixed(1).replace('.', ',')} al ${p[n - 1].reale.toFixed(1).replace('.', ',')}, al netto di chi c'era in gara.` })
    else if (pr < -0.5) out.push({ tipo: 'debole', titolo: 'Livello in calo', testo: `Il punteggio reale scende di circa ${(-pr).toFixed(1).replace('.', ',')} a gara, al netto della forza del campo.` })
    const pa = pendenza(p.map((x) => x.aPct)), pt = pendenza(p.map((x) => x.tempoRel)), pm = pendenza(p.map((x) => x.mancati100))
    if (pa > 0.01) out.push({ tipo: 'forte', titolo: 'Precisione in crescita', testo: `Le A salgono di circa ${Math.round(pa * 100)} punti a gara: dal ${Math.round(p[0].aPct * 100)}% al ${Math.round(p[n - 1].aPct * 100)}%.` })
    if (pm < -0.15) out.push({ tipo: 'forte', titolo: 'Meno miss', testo: `Da ${p[0].mancati100.toFixed(1).replace('.', ',')} a ${p[n - 1].mancati100.toFixed(1).replace('.', ',')} miss ogni 100 colpi.` })
    if (pt > 0.02 && pa > 0) out.push({ tipo: 'debole', titolo: 'Velocità in calo', testo: `Stai guadagnando precisione ma perdi tempo: dal ${Math.round(p[0].tempoRel * 100)} al ${Math.round(p[n - 1].tempoRel * 100)} rispetto ai primi 10 (100 = loro media). Ora che le A tengono, rialza il ritmo.` })
    else if (pt > 0.02) out.push({ tipo: 'debole', titolo: 'Velocità in calo', testo: `Tempo relativo ai primi 10 in aumento gara dopo gara.` })
  }
  const corsi: Corso[] = ['Short', 'Medium', 'Long']
  const perCorso = corsi.map((c) => {
    let s = 0, k = 0
    for (const x of p) { const v = x.perCorso[c]; if (v) { s += v.pct * v.n; k += v.n } }
    return { c, pct: k ? s / k : 0, k }
  }).filter((x) => x.k >= 2)
  if (perCorso.length >= 2) {
    const ord = [...perCorso].sort((a, b) => b.pct - a.pct)
    const nome = (c: Corso) => (c === 'Short' ? 'corti' : c === 'Medium' ? 'medi' : 'lunghi')
    if (ord[0].pct - ord[ord.length - 1].pct > 3) {
      out.push({ tipo: 'forte', titolo: `Stage ${nome(ord[0].c)}`, testo: `Il tuo terreno: ${ord[0].pct.toFixed(1).replace('.', ',')} di punteggio reale medio su ${ord[0].k} stage.` })
      out.push({ tipo: 'debole', titolo: `Stage ${nome(ord[ord.length - 1].c)}`, testo: `${ord[ord.length - 1].pct.toFixed(1).replace('.', ',')} di punteggio reale medio su ${ord[ord.length - 1].k} stage: qui perdi di più.` })
    }
  }
  return out
}
