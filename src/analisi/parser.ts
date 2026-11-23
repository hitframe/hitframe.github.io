/**
 * Lettore dei PDF di gara FITDS / IPSC (modello standard, italiano o inglese).
 * Funziona solo sul testo con le posizioni: nessuna AI, nessuna rete.
 */
import { eStageClub, leggiInfoClub, leggiStageClub } from './parserClub'
import type { FlagStage, GaraLetta, InfoGara, PaginaPdf, SezioneGara, StageLetto, TestoPdf, TipoCorso } from './tipi'

type Riga = { y: number; items: TestoPdf[]; testo: string }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const isNum = (s: string) => /^\d{1,3}$/.test(s.trim())

/** Raggruppa gli elementi in righe (stessa y entro una tolleranza), ordinate dall'alto. */
export function righe(items: TestoPdf[], tol = 2.5): Riga[] {
  const ord = [...items].filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x)
  const out: Riga[] = []
  for (const it of ord) {
    const r = out.find((x) => Math.abs(x.y - it.y) <= tol)
    if (r) r.items.push(it)
    else out.push({ y: it.y, items: [it], testo: '' })
  }
  for (const r of out) {
    r.items.sort((a, b) => a.x - b.x)
    r.testo = norm(r.items.map((i) => i.str).join('  '))
  }
  return out.sort((a, b) => b.y - a.y)
}

const ETICHETTE = {
  tipo: /^(Tipo|Type)\s*:?$/i,
  colpi: /^(Minimo numero di colpi richiesti|Minimum number of rounds required|Rounds to be scored|Numero minimo di colpi|Colpi minimi)\s*:?$/i,
  punti: /^(Massimi punti possibili|Maximum Points|Punti massimi)\s*:?$/i,
  segnale: /^(Segnale di partenza|Time Starts?|Start Signal)\s*:?$/i,
}

const BERSAGLI: [keyof StageLetto['bersagli'], RegExp][] = [
  ['carta', /^IPSC Targets?$/i],
  ['miniCarta', /^IPSC Mini Targets?$/i],
  ['popper', /^IPSC Poppers?$/i],
  ['miniPopper', /^IPSC Mini Poppers?$/i],
  ['piastre', /^IPSC Metal Plates?$/i],
  ['noShoot', /^No-?Shoots?$/i],
]

/** Blocchi di testo: etichetta nella colonna di sinistra, valore a destra. */
const BLOCCHI: [keyof Pick<StageLetto, 'posizionePartenza' | 'prontoTiratore' | 'prontoArma' | 'procedura' | 'note'>, RegExp][] = [
  ['posizionePartenza', /^(Posizione di partenza|Start Position)/i],
  ['prontoTiratore', /^(Condizione di pronto del tiratore|Competitor ready condition)/i],
  ['prontoArma', /^(Condizione di pronto dell.arma|Firearm ready condition|Handgun\/PCC Ready|Ready Condition|Condizione dell.arma)/i],
  ['procedura', /^(Procedura|Procedure)/i],
  ['note', /^(Note|Briefing Notes|Design Notes|Notes)/i],
]

/** Valore numerico che segue un'etichetta sulla stessa riga (0 se la cella è vuota). */
function valoreDopo(riga: Riga, idx: number): number {
  const succ = riga.items[idx + 1]
  return succ && isNum(succ.str) ? Number(succ.str.trim()) : 0
}

function trovaEtichetta(rr: Riga[], re: RegExp): { riga: Riga; idx: number } | null {
  for (const riga of rr) {
    const idx = riga.items.findIndex((i) => re.test(norm(i.str)))
    if (idx >= 0) return { riga, idx }
  }
  return null
}

function testoDopo(riga: Riga, idx: number): string {
  const succ = riga.items[idx + 1]
  return succ ? norm(succ.str) : ''
}

export function leggiStage(p: PaginaPdf): Omit<StageLetto, 'numero'> | null {
  const rr = righe(p.items)
  const tipoE = trovaEtichetta(rr, ETICHETTE.tipo)
  if (!tipoE) return null
  const tipoTesto = testoDopo(tipoE.riga, tipoE.idx)
  const m = tipoTesto.match(/(Short|Medium|Long)/i)
  if (!m) return null
  const tipo = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as TipoCorso
  const lingua: 'it' | 'en' = /^Tipo/i.test(norm(tipoE.riga.items[tipoE.idx].str)) ? 'it' : 'en'
  const topY = tipoE.riga.y

  const num = (re: RegExp) => {
    const e = trovaEtichetta(rr, re)
    return e ? valoreDopo(e.riga, e.idx) : 0
  }
  const segE = trovaEtichetta(rr, ETICHETTE.segnale)

  const bersagli = { carta: 0, miniCarta: 0, popper: 0, miniPopper: 0, piastre: 0, noShoot: 0 }
  for (const [k, re] of BERSAGLI) bersagli[k] = num(re)

  // Blocchi di testo: etichette a sinistra (x piccola). Etichette su più righe vengono unite.
  const sinistra = p.items
    .filter((i) => i.x < 60 && i.y < topY - 4 && i.str.trim())
    .sort((a, b) => b.y - a.y)
  const etichette: { chiave: (typeof BLOCCHI)[number][0] | null; y: number; testo: string }[] = []
  for (const it of sinistra) {
    const prec = etichette[etichette.length - 1]
    const t = norm(it.str)
    // continuazione di un'etichetta spezzata ("Handgun/PCC Ready" + "Condition:")
    if (prec && !/:\s*$/.test(prec.testo) && prec.y - it.y < 16) {
      prec.testo = `${prec.testo} ${t}`
      prec.y = (prec.y + it.y) / 2
      continue
    }
    etichette.push({ chiave: null, y: it.y, testo: t })
  }
  for (const e of etichette) e.chiave = BLOCCHI.find(([, re]) => re.test(e.testo))?.[0] ?? null
  const valide = etichette.filter((e) => e.chiave)

  const blocchi: Record<string, TestoPdf[]> = {}
  const primaY = valide.length ? Math.max(...valide.map((e) => e.y)) : 0
  const valori = p.items.filter((i) => i.x >= 60 && i.y < topY - 4 && i.y <= primaY + 10 && i.str.trim())
  for (const v of valori) {
    let best: (typeof valide)[number] | null = null
    for (const e of valide) if (!best || Math.abs(e.y - v.y) < Math.abs(best.y - v.y)) best = e
    if (best?.chiave) (blocchi[best.chiave] ??= []).push(v)
  }
  const testoBlocco = (k: string) =>
    norm(righe(blocchi[k] ?? []).map((r) => r.testo).join(' \n '))
      .replace(/ ?\n ?/g, '\n')

  // Etichette del disegno (T1, MP2, PL1, NS3…) sopra la tabella
  const etichetteDisegno = [...new Set(
    p.items
      .filter((i) => i.y > topY + 12 && /^(T|MT|P|MP|PP|PL|NS|M|S|SW|D|R|W|A|B)\d{1,2}$/.test(i.str.trim()))
      .map((i) => i.str.trim()),
  )].sort((a, b) => a.localeCompare(b, 'it', { numeric: true }))

  const s = {
    pagina: p.numero,
    lingua,
    tipo,
    colpi: num(ETICHETTE.colpi),
    puntiMax: num(ETICHETTE.punti),
    segnalePartenza: segE ? testoDopo(segE.riga, segE.idx) : '',
    bersagli,
    posizionePartenza: testoBlocco('posizionePartenza'),
    prontoTiratore: testoBlocco('prontoTiratore'),
    prontoArma: testoBlocco('prontoArma'),
    procedura: testoBlocco('procedura'),
    note: testoBlocco('note'),
    etichetteDisegno,
    tabellaTopY: topY + 14,
    flag: {} as FlagStage,
    attivazioni: [] as string[],
  }
  s.flag = flagStage(s)
  s.attivazioni = attivazioni(s)
  return s
}

const RE_MOBILI = /\b(attiva|attivano|attivato|attivati|attivatore|activat\w*|mover|moving|in movimento|swinger|oscillant\w*|drop.?turn|a scomparsa|disappear\w*|bobber|flip.?flop|clamshell|swing\w*)\b/i

function flagStage(s: Pick<StageLetto, 'procedura' | 'note' | 'posizionePartenza' | 'prontoTiratore' | 'prontoArma'>): FlagStage {
  const proc = `${s.procedura}\n${s.note}`
  const tutto = `${s.posizionePartenza}\n${s.prontoTiratore}\n${s.prontoArma}\n${proc}`
  // nella condizione dell'arma consideriamo solo la parte Handgun quando c'è anche il PCC
  const armaHg = s.prontoArma.split(/PCC\s*:/i)[0]
  return {
    manoForte: /strong hand|mano forte/i.test(proc),
    manoDebole: /weak hand(?! the)|mano debole/i.test(proc) && !/not permitted to hold a spare magazine in the weak hand/i.test(proc),
    mobili: RE_MOBILI.test(tutto),
    armaSuTavolo: /tavol|table|tavolo|sedia|chair|cassett|box|scatol|barile|barrel/i.test(`${s.prontoArma}\n${s.posizionePartenza}`) && /arma|handgun|pistola|firearm|gun/i.test(s.prontoArma),
    armaScarica: /scaric|unloaded|empty|caricatore non inserito|magazine (?:out|removed)/i.test(armaHg) && !/colpo non camerato/i.test(armaHg),
    colpoNonCamerato: /colpo non camerato|camera vuota|empty chamber|chamber empty|non camerat/i.test(armaHg),
    partenzaGirato: /spalle|rivolto verso|uprange|facing (?:up|back)|girat|voltat|backwards/i.test(`${s.posizionePartenza}\n${s.prontoTiratore}`),
    seduto: /sedut|seated|sitting/i.test(`${s.posizionePartenza}\n${s.prontoTiratore}`),
    ricaricaObbligatoria: /ricarica obbligatoria|mandatory reload|reload is mandatory|cambio caricatore obbligatorio/i.test(proc),
    partenzaLibera: /ovunque|anywhere/i.test(s.posizionePartenza),
  }
}

function attivazioni(s: Pick<StageLetto, 'procedura' | 'note'>): string[] {
  return `${s.procedura}. ${s.note}`
    .split(/(?<=[.;])\s+|\n/)
    .map(norm)
    .filter((f) => f && RE_MOBILI.test(f))
}

function leggiInfo(pagine: PaginaPdf[]): InfoGara {
  const info: InfoGara = { nome: '', campo: '', date: '', tipoEvento: '', livello: '', matchDirector: '', esercizi: null, colpi: null, punti: null }
  const campi: [keyof InfoGara, RegExp][] = [
    ['nome', /^(Evento|Event|Nome gara|Match)\s*:$/i],
    ['campo', /^(Campo di tiro|Range|Luogo|Location)\s*:$/i],
    ['date', /^(Date|Dates|Date evento|Data|Data evento)\s*:$/i],
    ['tipoEvento', /^(Tipo evento|Type event|Event type)\s*:$/i],
    ['matchDirector', /^Match Director\s*:$/i],
  ]
  for (const p of pagine) {
    for (const r of righe(p.items)) {
      const prima = norm(r.items[0].str)
      for (const [k, re] of campi) {
        if (!info[k] && re.test(prima) && r.items.length > 1) {
          ;(info as unknown as Record<string, string>)[k] = norm(r.items.slice(1).map((i) => i.str).join(' '))
        }
      }
      const t = r.testo
      const es = t.match(/^(\d{1,2})\s+(Esercizi|Stages|Exercises)$/i)
      if (es && info.esercizi === null) info.esercizi = Number(es[1])
      const co = t.match(/^(\d{2,4})\s+(Colpi|Rounds)$/i)
      if (co && info.colpi === null) info.colpi = Number(co[1])
      const pu = t.match(/^(\d{2,5})\s+(Punti|Points)$/i)
      if (pu && info.punti === null) info.punti = Number(pu[1])
    }
  }
  const liv = `${info.tipoEvento}`.match(/LEVEL\s+(I{1,3}|IV|V)\b/i)
  if (liv) info.livello = `Level ${liv[1].toUpperCase()}`
  return info
}

const firma = (s: Omit<StageLetto, 'numero'>) =>
  [s.tipo, s.colpi, s.puntiMax, ...Object.values(s.bersagli)].join('|')

/** Pagina di copertina o di info gara: segna l'inizio di un "libretto". */
function eCopertina(p: PaginaPdf): boolean {
  return righe(p.items).some((r) => /^(Evento|Event)\s*:$/i.test(norm(r.items[0].str)) || /^\d{1,2}\s+(Esercizi|Stages|Exercises)$/i.test(r.testo))
}

function etichettaSezione(info: InfoGara, i: number): string {
  const t = info.tipoEvento.toUpperCase()
  const hg = /HANDGUN/.test(t)
  const pcc = /PCC/.test(t)
  if (hg && pcc) return 'Handgun / PCC'
  if (pcc) return 'PCC'
  if (hg) return 'Handgun'
  return `Locandina ${i + 1}`
}

function leggiSezione(pagine: PaginaPdf[], trovati: Omit<StageLetto, 'numero'>[]): SezioneGara {
  const avvisi: string[] = []
  const primaStage = trovati.length ? Math.min(...trovati.map((s) => s.pagina)) : Infinity
  const prima = pagine.filter((p) => p.numero < primaStage)
  let info = leggiInfo(prima)
  if (!info.nome && trovati.some((s) => s.disegnoTopY != null)) info = leggiInfoClub(prima)

  // Briefing bilingue: stessi stage ripetuti in due lingue. Teniamo l'italiano.
  let tenuti = trovati
  const n = trovati.length
  if (n >= 2 && n % 2 === 0) {
    const a = trovati.slice(0, n / 2)
    const b = trovati.slice(n / 2)
    if (a[0].lingua !== b[0].lingua && a.every((s, i) => firma(s) === firma(b[i]))) {
      tenuti = a[0].lingua === 'it' ? a : b
      avvisi.push('Gli stage sono ripetuti in due lingue: ho tenuto una sola versione.')
    }
  }
  const stages = tenuti.map((s, i) => ({ ...s, numero: i + 1 }))
  const totColpi = stages.reduce((t, s) => t + s.colpi, 0)
  if (info.esercizi !== null && info.esercizi !== stages.length) {
    avvisi.push(`La copertina indica ${info.esercizi} esercizi, ne ho letti ${stages.length}.`)
  }
  if (info.colpi !== null && stages.length && info.colpi !== totColpi) {
    avvisi.push(`La copertina indica ${info.colpi} colpi, la somma degli stage è ${totColpi}.`)
  }
  for (const s of stages) if (!s.colpi) avvisi.push(`Stage ${s.numero}: numero di colpi non letto.`)
  return { etichetta: '', info, stages, avvisi }
}

function stageClub(p: PaginaPdf): Omit<StageLetto, 'numero'> | null {
  if (!eStageClub(p)) return null
  const c = leggiStageClub(p)
  if (!c) return null
  const { numeroLetto: _n, ...s } = c
  void _n
  s.flag = flagStage(s)
  s.attivazioni = attivazioni(s)
  return s
}

export function leggiGara(pagine: PaginaPdf[]): GaraLetta {
  // Un PDF può contenere più libretti (es. Handgun e PCC): li separiamo alle copertine.
  const gruppi: { pagine: PaginaPdf[]; stages: Omit<StageLetto, 'numero'>[] }[] = [{ pagine: [], stages: [] }]
  for (const p of pagine) {
    const s = leggiStage(p) ?? stageClub(p)
    let g = gruppi[gruppi.length - 1]
    if (!s && g.stages.length && eCopertina(p)) {
      g = { pagine: [], stages: [] }
      gruppi.push(g)
    }
    g.pagine.push(p)
    if (s) g.stages.push(s)
  }
  const sezioni = gruppi
    .filter((g) => g.stages.length)
    .map((g, i) => {
      const sez = leggiSezione(g.pagine, g.stages)
      sez.etichetta = etichettaSezione(sez.info, i)
      return sez
    })
  const avvisi: string[] = []
  if (!sezioni.length) avvisi.push('Non ho trovato stage in un formato che conosco (locandina FITDS/IPSC o locandina da club con "Stage N … COURSE").')
  if (sezioni.length > 1) avvisi.push(`Il PDF contiene ${sezioni.length} locandine (${sezioni.map((s) => s.etichetta).join(', ')}).`)
  return { sezioni, avvisi, pagineTotali: pagine.length }
}
