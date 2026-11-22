/**
 * Motore del piano d'azione di uno stage.
 * Dalla mappa (posizioni, bersagli, visibilità) e dal profilo (tempi tecnici, abilità, arma)
 * cerca la sequenza di posizioni e l'ordine di ingaggio che massimizzano l'hit factor atteso,
 * con due stili: aggressivo (meno soste, più rischio) e conservativo (soste stabili, margini).
 */
import { livello, type Abilita } from '../abilita/questionario'
import type { Profilo } from '../db/types'
import { metri, TIPI_BERSAGLIO, type BersaglioMappa, type MappaStage, type PosizioneMappa } from './mappa'
import { CAPIENZA, PERC_PUNTI } from './motore'
import type { StageLetto } from './tipi'

export type Stile = 'aggressivo' | 'conservativo'

export interface Ingaggio { bersaglio: string; colpi: number; tempo: number; nota?: string }

export interface Passo {
  tipo: 'partenza' | 'posizione' | 'movimento' | 'ricarica'
  titolo: string
  dettaglio: string
  tempo: number
  posizione?: string
  ingaggi?: Ingaggio[]
}

export interface Piano {
  stile: Stile
  percorso: string[] // id posizioni in ordine
  passi: Passo[]
  ordine: Record<string, number>
  inMovimento: string[]
  ricariche: { x: number; y: number }[]
  tempo: number
  puntiAttesi: number
  penalitaAttese: number
  hf: number
  rischi: string[]
  colpiTotali: number
  avvisi: string[]
}

type ProfiloPiano = Pick<Profilo, 'tempi' | 'divisione' | 'classe' | 'armaDettagli' | 'pendenzaDistanza'> & { abilita?: Abilita }

interface Parametri {
  aggressivo: boolean
  ab: (a: Parameters<typeof livello>[1]) => number
}

const fmt = (n: number) => n.toFixed(1).replace('.', ',')

/* ---------- Costi elementari ---------- */

function velocita(p: ProfiloPiano, k: Parametri) {
  const atl = k.ab('atletica')
  return p.tempi.velocitaMovimento * (0.8 + 0.07 * atl) * (k.aggressivo ? 1.05 : 0.95)
}

function entrata(p: ProfiloPiano, k: Parametri) {
  const ing = k.ab('ingressi')
  return p.tempi.entrataPosizione * (k.aggressivo ? 1.2 - 0.08 * ing : 1.15 - 0.03 * ing)
}

function uscita(p: ProfiloPiano, k: Parametri) {
  const ing = k.ab('ingressi')
  return p.tempi.uscitaPosizione * (k.aggressivo ? 1.15 - 0.07 * ing : 1.1)
}

/** Distanza effettiva tra posizione e bersaglio, a partire dalla distanza indicata sul bersaglio. */
function distanzaDa(m: MappaStage, pos: PosizioneMappa, b: BersaglioMappa, vicina: PosizioneMappa) {
  const extra = Math.max(0, metri(m, pos, b) - metri(m, vicina, b))
  return b.distanza + extra
}

interface CostoTiro { tempo: number; puntiPersi: number; penalita: number; colpiExtra: number }

/** Tempo e rischio per ingaggiare un bersaglio (senza la transizione). */
function costoTiro(b: BersaglioMappa, d: number, p: ProfiloPiano, k: Parametri, inMovimento: boolean): CostoTiro {
  const t = p.tempi
  // costo della distanza: il tuo, misurato dai video, oppure +3,5% al metro oltre i 7 m
  const fd = 1 + Math.max(0, d - 7) * (p.pendenzaDistanza ?? 0.035)
  const metallo = TIPI_BERSAGLIO[b.tipo].metallo
  // abilità che contano per questo bersaglio
  const L = metallo
    ? (b.tipo === 'miniPopper' ? k.ab('miniPopper') : k.ab('piastre'))
    : b.parziale ? k.ab('parziali') : d > 12 ? k.ab('lunghe') : Math.round((k.ab('lunghe') + k.ab('parziali')) / 2)
  // ritmo: l'aggressivo è più veloce solo se l'abilità lo sostiene
  const ritmo = k.aggressivo ? 1.08 - 0.035 * L : 1.08
  // rischio: l'aggressivo rischia di più, tanto più quanto l'abilità è bassa
  const rischio = k.aggressivo ? 1.1 + 0.18 * (5 - L) : 0.8
  let tempo: number
  let puntiPersi = 0
  let penalita = 0
  let colpiExtra = 0
  if (metallo) {
    const mini = b.tipo === 'miniPopper'
    const qBase = mini ? [0.45, 0.3, 0.2, 0.1, 0.04][L - 1] : [0.35, 0.22, 0.12, 0.06, 0.03][L - 1]
    const q = Math.min(0.7, qBase * (d / (mini ? 15 : 10)) * rischio * (inMovimento ? 1.5 : 1))
    tempo = Math.max(t.split, t.colpoPiastra) * fd * (mini ? 1.15 : 1) * ritmo + q * (t.split + 0.2)
    colpiExtra = q
  } else {
    let f = fd * (b.tipo === 'mini' ? 1.25 : 1) * ritmo
    if (b.parziale) f *= 1.3
    tempo = t.split * f
    // punti persi rispetto alla media di classe: distanza, movimento, ritmo spinto
    const fattoreDist = d > 12 ? (6 - k.ab('lunghe')) * 0.12 * ((d - 12) / 8) : 0
    const fattoreMov = inMovimento ? (6 - k.ab('movimento')) * 0.25 : 0
    const fattoreRitmo = k.aggressivo ? 0.24 * (5 - L) : 0
    puntiPersi = (fattoreDist + fattoreMov) * rischio + fattoreRitmo
    if (b.parziale) {
      const pNs = [0.12, 0.08, 0.05, 0.03, 0.015][L - 1] * rischio
      penalita = pNs * 20 // NS (-10) più il colpo perso
    }
    if (inMovimento) tempo *= 1.1
  }
  return { tempo, puntiPersi, penalita, colpiExtra }
}

function transizione(a: BersaglioMappa | null, b: BersaglioMappa, p: ProfiloPiano, k: Parametri) {
  if (!a) return 0
  const dt = Math.hypot(a.x - b.x, a.y - b.y)
  const t = p.tempi
  if (dt < 0.12) return t.transizioneVicina
  if (dt < 0.35) return t.transizioneLontana
  return t.transizioneLontana * (1.35 - 0.07 * k.ab('transizioniLarghe'))
}

/* ---------- Ordine dentro una posizione ---------- */

/**
 * Ordina i bersagli di una posizione: attivatori per primi, poi una passata nella direzione
 * che porta verso l'uscita (verso la posizione successiva), così l'ultimo colpo è già orientato.
 */
function ordinaInPosizione(bs: BersaglioMappa[], verso: { x: number; y: number } | null, da: { x: number; y: number } | null): BersaglioMappa[] {
  const attivatori = bs.filter((b) => b.attiva.length)
  const resto = bs.filter((b) => !b.attiva.length)
  const dirX = verso && da ? Math.sign(verso.x - da.x) || 1 : 1
  resto.sort((a, b) => (a.x - b.x) * dirX || a.y - b.y)
  // i bersagli attivati vengono dopo il loro attivatore
  const attivati = new Set(attivatori.flatMap((a) => a.attiva))
  const prima = resto.filter((b) => !attivati.has(b.id))
  const dopo = resto.filter((b) => attivati.has(b.id))
  return [...attivatori, ...prima, ...dopo]
}

/* ---------- Ricerca della sequenza migliore ---------- */

function permutazioni<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const out: T[][] = []
  arr.forEach((x, i) => {
    for (const r of permutazioni([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...r])
  })
  return out
}

interface Valutazione {
  percorso: PosizioneMappa[]
  assegnazione: Map<string, PosizioneMappa>
  tempo: number
  punti: number
  hf: number
}

export function calcolaPiano(m: MappaStage, s: StageLetto, profilo: ProfiloPiano, stile: Stile): Piano | null {
  const k: Parametri = { aggressivo: stile === 'aggressivo', ab: (a) => livello(profilo.abilita, a) }
  const avvisi: string[] = []
  const bersagli = m.bersagli.filter((b) => b.tipo !== 'noshoot')
  if (!bersagli.length || !m.posizioni.length) return null

  // visibilità: chi non è visto da nessuna posizione va alla più vicina
  const vede = new Map<string, Set<string>>(m.posizioni.map((p) => [p.id, new Set(p.vede)]))
  for (const b of bersagli) {
    if (![...vede.values()].some((v) => v.has(b.id))) {
      const vicina = [...m.posizioni].sort((x, y) => metri(m, x, b) - metri(m, y, b))[0]
      vede.get(vicina.id)!.add(b.id)
      avvisi.push(`${b.id} non risulta visibile da nessuna posizione: assegnato a ${vicina.id}.`)
    }
  }
  const vicinaPer = new Map<string, PosizioneMappa>()
  for (const b of bersagli) {
    const cand = m.posizioni.filter((p) => vede.get(p.id)!.has(b.id))
    vicinaPer.set(b.id, cand.sort((x, y) => metri(m, x, b) - metri(m, y, b))[0])
  }

  const puntiPerColpo = 5 * (PERC_PUNTI[profilo.classe] ?? 0.85)

  function valuta(percorso: PosizioneMappa[]): Valutazione | null {
    // assegnazione
    const ass = new Map<string, PosizioneMappa>()
    for (const b of bersagli) {
      const cand = percorso.filter((p) => vede.get(p.id)!.has(b.id))
      if (!cand.length) return null
      if (k.aggressivo) {
        // il primo punto del percorso da cui si vede, se la distanza è gestibile
        const limite = 10 + 2.5 * k.ab('lunghe')
        const ok = cand.find((p) => distanzaDa(m, p, b, vicinaPer.get(b.id)!) <= limite)
        ass.set(b.id, ok ?? cand[0])
      } else {
        ass.set(b.id, [...cand].sort((x, y) => distanzaDa(m, x, b, vicinaPer.get(b.id)!) - distanzaDa(m, y, b, vicinaPer.get(b.id)!))[0])
      }
    }
    // gli attivati non possono stare prima del loro attivatore
    for (const a of bersagli) {
      for (const idB of a.attiva) {
        const pa = percorso.indexOf(ass.get(a.id)!)
        const pb = ass.get(idB) ? percorso.indexOf(ass.get(idB)!) : -1
        if (pb >= 0 && pb < pa) return null
      }
    }
    if (percorso.some((p) => ![...ass.values()].includes(p))) return null // posizione inutile
    let tempo = 0
    let punti = 0
    let prec: { x: number; y: number } = m.partenza
    percorso.forEach((p, i) => {
      if (i > 0 || metri(m, m.partenza, p) > 1.5) tempo += uscita(profilo, k) * (i ? 1 : 0) + metri(m, prec, p) / velocita(profilo, k) + entrata(profilo, k)
      const bs = bersagli.filter((b) => ass.get(b.id) === p)
      let ultimo: BersaglioMappa | null = null
      for (const b of bs) {
        const c = costoTiro(b, distanzaDa(m, p, b, vicinaPer.get(b.id)!), profilo, k, false)
        tempo += transizione(ultimo, b, profilo, k) + c.tempo
        punti += (TIPI_BERSAGLIO[b.tipo].metallo ? 5 : TIPI_BERSAGLIO[b.tipo].colpi * puntiPerColpo) - c.puntiPersi - c.penalita
        ultimo = b
      }
      prec = p
    })
    tempo += profilo.tempi.estrazione
    return { percorso, assegnazione: ass, tempo, punti, hf: punti / tempo }
  }

  // tutte le combinazioni di posizioni che coprono i bersagli, in tutti gli ordini (fino a 6 posizioni)
  const pos = m.posizioni
  let migliore: Valutazione | null = null
  const n = pos.length
  for (let mask = 1; mask < 1 << n; mask++) {
    const sub = pos.filter((_, i) => mask & (1 << i))
    const copre = bersagli.every((b) => sub.some((p) => vede.get(p.id)!.has(b.id)))
    if (!copre) continue
    const ordini = sub.length <= 6 ? permutazioni(sub) : [greedy(sub)]
    for (const o of ordini) {
      const v = valuta(o)
      if (v && (!migliore || v.hf > migliore.hf)) migliore = v
    }
  }
  if (!migliore) return null

  function greedy(sub: PosizioneMappa[]): PosizioneMappa[] {
    const resto = [...sub]
    const out: PosizioneMappa[] = []
    let cur: { x: number; y: number } = m.partenza
    while (resto.length) {
      resto.sort((a, b) => metri(m, cur, a) - metri(m, cur, b))
      cur = resto.shift()!
      out.push(cur as PosizioneMappa)
    }
    return out
  }

  return costruisciPassi(m, s, profilo, k, stile, migliore, vicinaPer, avvisi)
}

/* ---------- Passi, ricariche, movimento ---------- */

function costruisciPassi(
  m: MappaStage, s: StageLetto, profilo: ProfiloPiano, k: Parametri, stile: Stile,
  v: Valutazione, vicinaPer: Map<string, PosizioneMappa>, avvisi: string[],
): Piano {
  const t = profilo.tempi
  const bersagli = m.bersagli.filter((b) => b.tipo !== 'noshoot')
  const cap = profilo.armaDettagli.capienza ?? CAPIENZA[profilo.divisione] ?? 15
  const caricaIniziale = s.flag.armaScarica || s.flag.colpoNonCamerato ? cap : cap + 1
  const riserva = k.aggressivo ? (k.ab('gestioneColpi') >= 4 ? 1 : 2) : 3
  const ricMov = k.ab('ricaricaMovimento')
  const puntiPerColpo = 5 * (PERC_PUNTI[profilo.classe] ?? 0.85)

  const passi: Passo[] = []
  const ordine: Record<string, number> = {}
  const inMovimento: string[] = []
  const ricariche: { x: number; y: number }[] = []
  const rischi: string[] = []
  let tempo = 0
  let punti = 0
  let penalitaAttese = 0
  let colpiTot = 0
  let nOrdine = 1
  let rimasti = caricaIniziale
  let ricaricaObbligatoriaFatta = !s.flag.ricaricaObbligatoria

  // partenza
  const partenzaTesto = [s.posizionePartenza, s.prontoTiratore].filter(Boolean).join(' · ')
  let tPart = t.estrazione
  if (s.flag.armaScarica) tPart += 0.8
  else if (s.flag.colpoNonCamerato) tPart += 0.4
  if (s.flag.armaSuTavolo) tPart += 0.3
  if (s.flag.partenzaGirato) tPart += 0.4
  if (s.flag.seduto) tPart += 0.4
  const primo = v.percorso[0]
  const partiInPosizione = metri(m, m.partenza, primo) <= 1.5
  passi.push({
    tipo: 'partenza',
    titolo: partiInPosizione ? `Partenza in ${primo.id}` : 'Partenza',
    dettaglio: [
      partenzaTesto || m.partenza.nota || 'Posizione di partenza da briefing',
      !partiInPosizione ? (k.aggressivo ? `Primo passo verso ${primo.id} con l’estrazione: arma in mano entro due passi.` : `Estrai mentre ti muovi verso ${primo.id}, mire pronte all’arrivo.`) : 'Piedi già orientati verso il primo bersaglio.',
    ].join(' '),
    tempo: tPart,
  })
  tempo += tPart

  let prec: { x: number; y: number; id?: string } = m.partenza
  v.percorso.forEach((p, i) => {
    const bs = bersagli.filter((b) => v.assegnazione.get(b.id) === p)
    const prossima = v.percorso[i + 1] ?? null
    const ordinati = ordinaInPosizione(bs, prossima, prec)
    const colpiQui = ordinati.reduce((a, b) => a + TIPI_BERSAGLIO[b.tipo].colpi, 0)
    const extraAttesi = Math.ceil(ordinati.filter((b) => TIPI_BERSAGLIO[b.tipo].metallo).length * 0.3)

    // spostamento
    if (i > 0 || !partiInPosizione) {
      const d = metri(m, prec, p)
      let tMov = (i > 0 ? uscita(profilo, k) : 0) + d / velocita(profilo, k) + entrata(profilo, k)
      let dett = `${fmt(d)} m verso ${p.id}${p.nota ? ` (${p.nota})` : ''}.`

      // ricarica durante lo spostamento?
      const serve = rimasti < colpiQui + extraAttesi + riserva - (k.aggressivo ? 1 : 0)
      const obbligo = !ricaricaObbligatoriaFatta
      if ((serve || obbligo) && i > 0) {
        const corsa = d / velocita(profilo, k)
        let costo: number
        if (ricMov >= 3 || k.aggressivo && ricMov >= 2) {
          costo = Math.max(0.15, t.ricarica - corsa * (ricMov >= 4 ? 0.9 : 0.7))
          dett += ` Ricarica in movimento appena lasci ${prec.id ?? 'la posizione'}${rimasti > 0 ? ` (ne restano ${rimasti})` : ''}.`
        } else {
          costo = t.ricarica
          dett += ` Ricarica da fermo prima di muoverti${rimasti > 0 ? ` (ne restano ${rimasti})` : ''}.`
        }
        tMov += costo
        rimasti = cap
        ricaricaObbligatoriaFatta = true
        ricariche.push({ x: (prec.x + p.x) / 2, y: (prec.y + p.y) / 2 })
      }

      // ingaggio in movimento (solo aggressivo, distanze brevi)
      const mov = k.ab('movimento')
      const daMovimento = k.aggressivo && mov >= 3 && i > 0 && d <= 6
        ? ordinati.filter((b) => !TIPI_BERSAGLIO[b.tipo].metallo && !b.parziale && b.distanza <= 7 + mov).slice(0, mov >= 4 ? 2 : 1)
        : []
      if (daMovimento.length) {
        const risparmio = Math.min(entrata(profilo, k) * 0.8, 0.25 * daMovimento.length * (mov - 2))
        tMov -= risparmio
        inMovimento.push(...daMovimento.map((b) => b.id))
        dett += ` Ingaggia ${daMovimento.map((b) => b.id).join(' e ')} mentre arrivi, senza fermarti.`
      }
      passi.push({ tipo: 'movimento', titolo: `Verso ${p.id}`, dettaglio: dett, tempo: tMov })
      tempo += tMov
    }

    // tiro dalla posizione
    const ingaggi: Ingaggio[] = []
    let ultimo: BersaglioMappa | null = null
    let tPos = 0
    for (const b of ordinati) {
      const d = distanzaDa(m, p, b, vicinaPer.get(b.id)!)
      const mov = inMovimento.includes(b.id)
      const c = costoTiro(b, d, profilo, k, mov)
      const tt = transizione(ultimo, b, profilo, k) + c.tempo
      const colpi = TIPI_BERSAGLIO[b.tipo].colpi
      const note: string[] = []
      if (b.attiva.length) note.push(`attiva ${b.attiva.join(', ')}`)
      if (b.mobile) note.push(k.ab('mobili') >= 3 && k.aggressivo ? 'al primo passaggio' : 'aspetta il momento giusto')
      if (b.parziale) note.push('coperto: mira stretta')
      if (d >= 15) note.push(`${Math.round(d)} m`)
      ingaggi.push({ bersaglio: b.id, colpi, tempo: tt, nota: note.join(' · ') || undefined })
      ordine[b.id] = nOrdine++
      tPos += tt
      colpiTot += colpi
      rimasti -= colpi
      punti += (TIPI_BERSAGLIO[b.tipo].metallo ? 5 : colpi * puntiPerColpo) - c.puntiPersi - c.penalita
      penalitaAttese += c.penalita
      if (TIPI_BERSAGLIO[b.tipo].metallo && c.colpiExtra > 0.2) rischi.push(`${b.id} (${TIPI_BERSAGLIO[b.tipo].nome.toLowerCase()} a ${Math.round(d)} m): circa ${Math.round(c.colpiExtra * 100)}% di colpo in più.`)
      if (b.parziale && c.penalita > 1.2) rischi.push(`${b.id} coperto: rischio no-shoot o mancato.`)
      ultimo = b
    }
    rimasti -= extraAttesi
    passi.push({
      tipo: 'posizione',
      titolo: `${p.id}${p.nota ? ` · ${p.nota}` : ''}`,
      dettaglio: ordinati.length
        ? `${ordinati.map((b) => `${b.id}${TIPI_BERSAGLIO[b.tipo].colpi > 1 ? '×2' : ''}`).join(' → ')}${prossima ? `. Esci verso ${prossima.id} con l’ultimo colpo.` : '. Fine stage.'}`
        : '—',
      tempo: tPos,
      posizione: p.id,
      ingaggi,
    })
    tempo += tPos
    prec = p
  })

  if (colpiTot < s.colpi) avvisi.push(`La mappa conta ${colpiTot} colpi, il briefing ne indica ${s.colpi}: controlla i bersagli.`)
  if (bersagli.length !== s.bersagli.carta + s.bersagli.miniCarta + s.bersagli.popper + s.bersagli.miniPopper + s.bersagli.piastre) {
    avvisi.push('Il numero di bersagli sulla mappa non corrisponde al briefing.')
  }
  if (inMovimento.length && k.ab('movimento') <= 3) rischi.push('Tiro in movimento: punti a rischio se il ritmo dei piedi non è costante.')
  const puntiAttesi = Math.max(0, Math.min(s.puntiMax || punti, punti))
  return {
    stile,
    percorso: v.percorso.map((p) => p.id),
    passi,
    ordine,
    inMovimento,
    ricariche,
    tempo,
    puntiAttesi,
    penalitaAttese,
    hf: tempo > 0 ? puntiAttesi / tempo : 0,
    rischi: [...new Set(rischi)],
    colpiTotali: colpiTot,
    avvisi,
  }
}

/** Confronto tra i due piani, con il consiglio. */
export function consiglio(a: Piano, c: Piano): { scelta: Stile; testo: string } {
  const diffT = c.tempo - a.tempo
  const diffHf = (a.hf - c.hf) / (c.hf || 1)
  if (diffHf > 0.04) {
    return { scelta: 'aggressivo', testo: `L’aggressivo fa risparmiare ${fmt(diffT)} s e alza l’hit factor atteso del ${Math.round(diffHf * 100)}%: con le tue abilità il rischio vale.` }
  }
  if (diffHf < -0.01) {
    return { scelta: 'conservativo', testo: `Il conservativo rende di più: l’aggressivo rischia più punti di quanto fa guadagnare in tempo.` }
  }
  return { scelta: 'conservativo', testo: `Differenza minima (${fmt(Math.max(0, diffT))} s): vai sul conservativo e porta a casa i punti.` }
}
