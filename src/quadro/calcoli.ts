/** "Il mio quadro": storico, crescita e livello, messi insieme da gare, allenamenti, diario e obiettivi. */
import type { Evento, Obiettivo, Profilo, VoceDiario } from '../db/types'
import type { RisultatoGara } from '../risultati/motore'
import { realeTutti } from '../risultati/reale'
import { valuta, ETICHETTE_STATO } from '../obiettivi/valuta'
import { pendenza, puntiForzaDebolezza, type PuntoGara } from '../statistiche/calcoli'

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0)
const mediana = (v: number[]) => {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const devStd = (v: number[]) => {
  if (v.length < 2) return 0
  const m = media(v)
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1))
}

export const ORDINE_CLASSI = ['GM', 'M', 'A', 'B', 'C', 'D']
export const NOMI_CLASSI: Record<string, string> = { GM: 'Grand Master', M: 'Master', A: 'A', B: 'B', C: 'C', D: 'D' }

export interface Quadro {
  periodo: { da: string; a: string } | null
  gare: number
  mediaPct: number
  mediaReale: number
  migliore: PuntoGara | null
  crescita: { primeReale: number; ultimeReale: number; trendReale: number; trendPct: number } | null
  regolarita: number
  allenamento: { sessioni: number; fuoco: number; bianco: number; colpi: number; mesi: number; perMese: number; ultimi90: number }
  testa: { umore: number; energia: number; concentrazione: number; sonno: number | null; voci: number } | null
  /** Mediana del punteggio reale di ogni classe, tra i tiratori incontrati nelle tue gare */
  classi: { cls: string; mediana: number; tiratori: number }[]
  livello: { simile: string | null; sopra: string | null; percentile: Record<string, number> }
  ambizione: { realeTra: [number, number]; pctTra: [number, number]; forzaMedia: number } | null
  forti: string[]
  deboli: string[]
  obiettivi: { titolo: string; stato: string; frase: string }[]
}

export function costruisciQuadro(punti: PuntoGara[], risultati: RisultatoGara[], eventi: Evento[], diario: VoceDiario[], profilo: Profilo | undefined): Quadro {
  const ord = [...punti].sort((a, b) => a.data.localeCompare(b.data))
  const reali = ord.map((p) => p.reale)
  const n = ord.length

  // classi: il punteggio reale dei tiratori incontrati
  const perClasse = new Map<string, number[]>()
  for (const r of risultati) {
    for (const x of realeTutti(r)) {
      if (x.num === r.mioNum || !ORDINE_CLASSI.includes(x.cls)) continue
      const a = perClasse.get(x.cls) ?? []
      a.push(x.indice)
      perClasse.set(x.cls, a)
    }
  }
  const classi = ORDINE_CLASSI.filter((c) => (perClasse.get(c)?.length ?? 0) >= 3).map((c) => ({ cls: c, mediana: mediana(perClasse.get(c)!), tiratori: perClasse.get(c)!.length }))
  const recenteReale = media(reali.slice(-5))
  const percentile: Record<string, number> = {}
  for (const c of classi) {
    const v = perClasse.get(c.cls)!
    percentile[c.cls] = (v.filter((x) => x < recenteReale).length / v.length) * 100
  }
  // la classe la cui mediana è più vicina al tuo livello, e quella subito sopra
  const vicina = classi.length ? classi.reduce((a, c) => (Math.abs(c.mediana - recenteReale) < Math.abs(a.mediana - recenteReale) ? c : a)) : null
  const idx = vicina ? classi.indexOf(vicina) : -1
  const sopra = idx > 0 ? classi[idx - 1] : null

  // allenamento
  const sessioni = eventi.filter((e) => e.completato && (e.tipo === 'fuoco' || e.tipo === 'bianco'))
  const date = sessioni.map((e) => e.data).sort()
  const mesi = date.length ? Math.max(1, (Date.parse(date[date.length - 1]) - Date.parse(date[0])) / (30 * 86400000)) : 0
  const da90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

  // testa
  const testa = diario.length ? {
    umore: media(diario.map((v) => v.umore).filter(Boolean)),
    energia: media(diario.map((v) => v.energia).filter(Boolean)),
    concentrazione: media(diario.map((v) => v.concentrazione).filter(Boolean)),
    sonno: diario.some((v) => v.sonnoOre) ? media(diario.map((v) => v.sonnoOre ?? 0).filter(Boolean)) : null,
    voci: diario.length,
  } : null

  // a cosa puoi ambire: livello recente + tendenza (prudente), tradotto anche in percentuale su un campo medio
  let ambizione: Quadro['ambizione'] = null
  if (n >= 3) {
    const trend = pendenza(reali)
    const sd = devStd(reali)
    const base = recenteReale + Math.max(-2, Math.min(4, trend * 3))
    const forzaMedia = media(ord.map((p) => p.forzaCampo)) || 100
    const tra: [number, number] = [Math.max(0, base - sd * 0.5), Math.min(120, base + sd * 0.5 + 1.5)]
    // dal reale alla percentuale in classifica: il rapporto osservato nelle tue gare
    const k = media(ord.map((p) => p.pct)) / Math.max(1, media(reali))
    ambizione = { realeTra: tra, pctTra: [Math.min(100, tra[0] * k), Math.min(100, tra[1] * k)], forzaMedia }
  }

  const giudizi = puntiForzaDebolezza(ord)
  const dati = { punti: ord, eventi, diario }
  const obiettivi = (profilo?.obiettivi ?? []).map((o: Obiettivo) => {
    const v = valuta(o, dati)
    return { titolo: o.titolo, stato: ETICHETTE_STATO[v.stato], frase: v.titolo }
  })

  return {
    periodo: n ? { da: ord[0].data, a: ord[n - 1].data } : null,
    gare: n,
    mediaPct: media(ord.map((p) => p.pct)),
    mediaReale: media(reali),
    migliore: n ? ord.reduce((a, p) => (p.reale > a.reale ? p : a)) : null,
    crescita: n >= 3 ? {
      primeReale: media(reali.slice(0, Math.min(3, Math.floor(n / 2)))),
      ultimeReale: media(reali.slice(-Math.min(3, Math.ceil(n / 2)))),
      trendReale: pendenza(reali),
      trendPct: pendenza(ord.map((p) => p.pct)),
    } : null,
    regolarita: devStd(reali),
    allenamento: {
      sessioni: sessioni.length,
      fuoco: sessioni.filter((e) => e.tipo === 'fuoco').length,
      bianco: sessioni.filter((e) => e.tipo === 'bianco').length,
      colpi: sessioni.reduce((a, e) => a + (e.colpiSparati ?? 0), 0),
      mesi,
      perMese: mesi ? sessioni.length / mesi : 0,
      ultimi90: sessioni.filter((e) => e.data >= da90).length,
    },
    testa,
    classi,
    livello: { simile: vicina?.cls ?? null, sopra: sopra?.cls ?? null, percentile },
    ambizione,
    forti: giudizi.filter((g) => g.tipo === 'forte').map((g) => `${g.titolo}: ${g.testo}`),
    deboli: giudizi.filter((g) => g.tipo === 'debole').map((g) => `${g.titolo}: ${g.testo}`),
    obiettivi,
  }
}

/** Riassunto compatto da mandare all'AI (niente nomi di altri tiratori). */
export function riassuntoPerAI(q: Quadro, punti: PuntoGara[], profilo: Profilo | undefined, abilitaVideo?: unknown) {
  const r1 = (x: number) => Math.round(x * 10) / 10
  return {
    atleta: { divisione: profilo?.divisione, classe: profilo?.classe, arma: profilo?.arma },
    periodo: q.periodo,
    gare: punti.map((p) => ({ data: p.data, gara: p.breve, pct: r1(p.pct), reale: r1(p.reale), pos: `${p.pos}/${p.tot}`, campo: p.livelloCampo, colpiA: r1(p.aPct * 100), mancatiOgni100: r1(p.mancati100), tempoVsPrimi10: r1(p.tempoRel * 100) })),
    sintesi: { mediaPct: r1(q.mediaPct), mediaReale: r1(q.mediaReale), regolarita: r1(q.regolarita), crescita: q.crescita && { primeReale: r1(q.crescita.primeReale), ultimeReale: r1(q.crescita.ultimeReale), trendRealePerGara: r1(q.crescita.trendReale) } },
    classiIncontrate: q.classi.map((c) => ({ classe: c.cls, medianaReale: r1(c.mediana), tiratori: c.tiratori })),
    allenamento: { ...q.allenamento, perMese: r1(q.allenamento.perMese), mesi: r1(q.allenamento.mesi) },
    diario: q.testa && { umore: r1(q.testa.umore), energia: r1(q.testa.energia), concentrazione: r1(q.testa.concentrazione), sonno: q.testa.sonno && r1(q.testa.sonno), voci: q.testa.voci },
    puntiForza: q.forti,
    daMigliorare: q.deboli,
    obiettivi: (profilo?.obiettivi ?? []).map((o) => ({ titolo: o.titolo, entro: o.entro, orizzonte: o.orizzonte, fascia: o.min ? `${o.min}-${o.max ?? ''}` : undefined, tappe: o.tappe })),
    statoObiettivi: q.obiettivi,
    abilitaMisurateDaiVideo: abilitaVideo,
  }
}

export interface CommentoAI {
  sintesi: string
  crescita: string
  ambizione: string
  puntiForza: string[]
  daMigliorare: string[]
  prossimi30giorni: string[]
  mente: string
}

export const ISTRUZIONI_AI = `Sei un allenatore esperto di tiro dinamico sportivo IPSC (FITDS, Italia) e un mental coach.
Ricevi in JSON lo storico di un tiratore: gare con percentuale in classifica (pct) e "punteggio reale" (reale: hit factor rispetto a un Grand Master in forma sugli stessi stage, 100 = GM in forma, indipendente da chi c'era in gara), statistiche di precisione e velocità, tempi tecnici reali misurati dai video POV (estrazione, split, transizioni, ricariche, movimenti: mediana, migliore, costanza e tendenza, se presenti), volume di allenamento, diario (umore, energia, concentrazione 1-5, sonno), obiettivi con tappe.
Scrivi in italiano, tono diretto, concreto e incoraggiante ma onesto: niente lodi generiche, ogni frase deve poggiare sui numeri.
Ragiona sul punteggio reale più che sulla percentuale: una gara al 76% con un campo fortissimo può valere più di un 90% con un campo debole.
Rispondi SOLO con un oggetto JSON con queste chiavi:
{"sintesi": "3-4 frasi sul quadro generale", "crescita": "2-3 frasi su come è cambiato nel tempo", "ambizione": "2-3 frasi su a cosa può realisticamente ambire nei prossimi 6-12 mesi e rispetto agli obiettivi", "puntiForza": ["max 3"], "daMigliorare": ["max 3"], "prossimi30giorni": ["3-5 azioni concrete di allenamento, con drill o numeri"], "mente": "1-2 frasi di consiglio mentale personalizzato in base al diario"}`
