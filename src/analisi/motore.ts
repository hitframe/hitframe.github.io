/**
 * Motore di analisi: profilo della gara, stime di tempo dai tempi personali,
 * priorità di allenamento. Tutto deterministico, niente AI.
 */
import type { Classe, Divisione, Profilo } from '../db/types'
import type { StageLetto } from './tipi'

/* ---------- Profilo gara ---------- */

export interface ProfiloGara {
  stage: number
  colpi: number
  punti: number
  perTipo: Record<'Short' | 'Medium' | 'Long', number>
  colpiCarta: number
  colpiMetallo: number
  quotaMetallo: number // 0-1
  bersagliCarta: number
  miniCarta: number
  miniPopper: number
  noShoot: number
  stageConNoShoot: number
  stageMobili: number
  stageManoForte: number
  stageManoDebole: number
  partenzeSpeciali: number
  stageMovimento: number // medium + long
}

export const metalli = (s: StageLetto) => s.bersagli.popper + s.bersagli.miniPopper + s.bersagli.piastre
export const carte = (s: StageLetto) => s.bersagli.carta + s.bersagli.miniCarta

export function partenzaSpeciale(s: StageLetto): string[] {
  const out: string[] = []
  if (s.flag.armaSuTavolo) out.push('arma su tavolo/oggetto')
  if (s.flag.armaScarica) out.push('arma scarica')
  if (s.flag.colpoNonCamerato) out.push('colpo non camerato')
  if (s.flag.partenzaGirato) out.push('partenza girato')
  if (s.flag.seduto) out.push('seduto')
  return out
}

export function profiloGara(stages: StageLetto[]): ProfiloGara {
  const p: ProfiloGara = {
    stage: stages.length, colpi: 0, punti: 0, perTipo: { Short: 0, Medium: 0, Long: 0 },
    colpiCarta: 0, colpiMetallo: 0, quotaMetallo: 0, bersagliCarta: 0, miniCarta: 0, miniPopper: 0,
    noShoot: 0, stageConNoShoot: 0, stageMobili: 0, stageManoForte: 0, stageManoDebole: 0,
    partenzeSpeciali: 0, stageMovimento: 0,
  }
  for (const s of stages) {
    p.colpi += s.colpi
    p.punti += s.puntiMax
    p.perTipo[s.tipo]++
    const m = metalli(s)
    p.colpiMetallo += m
    p.colpiCarta += Math.max(0, s.colpi - m)
    p.bersagliCarta += carte(s)
    p.miniCarta += s.bersagli.miniCarta
    p.miniPopper += s.bersagli.miniPopper
    p.noShoot += s.bersagli.noShoot
    if (s.bersagli.noShoot) p.stageConNoShoot++
    if (s.flag.mobili) p.stageMobili++
    if (s.flag.manoForte) p.stageManoForte++
    if (s.flag.manoDebole) p.stageManoDebole++
    if (partenzaSpeciale(s).length) p.partenzeSpeciali++
    if (s.tipo !== 'Short') p.stageMovimento++
  }
  p.quotaMetallo = p.colpi ? p.colpiMetallo / p.colpi : 0
  return p
}

/* ---------- Stima del tempo per stage ---------- */

/** Capienza indicativa del caricatore per divisione (pistola 9 mm). */
export const CAPIENZA: Record<Divisione, number> = {
  Production: 15,
  'Production Optics': 15,
  Standard: 20,
  Open: 27,
  Classic: 10,
  Revolver: 8,
  Optics: 21,
  PCC: 30,
}

/** Percentuale indicativa dei punti ottenuti per classe. */
export const PERC_PUNTI: Record<Classe, number> = {
  D: 0.72, C: 0.78, B: 0.83, A: 0.87, Master: 0.91, 'Grand Master': 0.94,
}

export interface StimaStage {
  min: number
  max: number
  obiettivo: number
  hfObiettivo: number
  hfMin: number // al tempo massimo
  hfMax: number // al tempo minimo
  puntiAttesi: number
  fattori: string[]
}

/**
 * Stima calibrata sui tempi di riferimento personali (stage puliti) per tipo di esercizio,
 * adattata al numero di colpi e alle particolarità dello stage.
 */
export function stimaStage(s: StageLetto, profilo: Pick<Profilo, 'classe' | 'riferimenti' | 'armaDettagli'>): StimaStage {
  const ref = profilo.riferimenti[s.tipo]
  const fattori: string[] = []
  const scala = s.colpi > 0 && ref.colpi > 0 ? Math.pow(s.colpi / ref.colpi, 0.85) : 1
  if (Math.abs(scala - 1) > 0.02) fattori.push(`${s.colpi} colpi invece di ${ref.colpi}`)

  let extra = 0
  let molt = 1
  if (s.flag.armaScarica) { extra += 0.8; fattori.push('arma scarica: caricatore e cameratura (+0,8 s)') }
  else if (s.flag.colpoNonCamerato) { extra += 0.4; fattori.push('colpo non camerato (+0,4 s)') }
  if (s.flag.armaSuTavolo) { extra += 0.3; fattori.push('arma da prendere (+0,3 s)') }
  if (s.flag.partenzaGirato) { extra += 0.4; fattori.push('partenza girato (+0,4 s)') }
  if (s.flag.seduto) { extra += 0.4; fattori.push('partenza seduto (+0,4 s)') }
  if (s.flag.manoDebole) { molt *= 1.15; fattori.push('mano debole (+15%)') }
  else if (s.flag.manoForte) { molt *= 1.08; fattori.push('mano forte (+8%)') }
  const f = profilo.armaDettagli.funzionamento
  if (f === 'dasa') { extra += 0.1; fattori.push('primo colpo in doppia azione (+0,1 s)') }
  else if (f === 'dao') { molt *= 1.06; fattori.push('scatto in sola doppia azione (+6%)') }
  else if (f === 'lem') { extra += 0.05 }

  const min = ref.min * scala * molt + extra
  const max = ref.max * scala * molt + extra
  const obiettivo = min + 0.25 * (max - min)
  const puntiAttesi = s.puntiMax * (PERC_PUNTI[profilo.classe] ?? 0.85)
  return {
    min, max, obiettivo, puntiAttesi, fattori,
    hfObiettivo: puntiAttesi / obiettivo,
    hfMin: puntiAttesi / max,
    hfMax: puntiAttesi / min,
  }
}

/* ---------- Priorità di allenamento ---------- */

export interface Focus {
  id: string
  titolo: string
  perche: string
  drill: string[]
  peso: number // 0-100
}

const pct = (n: number) => `${Math.round(n * 100)}%`

export function focusAllenamento(stages: StageLetto[], pg: ProfiloGara = profiloGara(stages)): Focus[] {
  const f: Focus[] = []
  const tot = Math.max(1, pg.stage)

  if (pg.colpiMetallo > 0) {
    f.push({
      id: 'metallo',
      titolo: 'Transizioni carta–metallo',
      perche: `${pg.colpiMetallo} colpi su metallo (${pct(pg.quotaMetallo)} del totale), ${pg.miniPopper} mini popper.`,
      drill: ['Due carte e un mini popper a 10–15 m: cambio di ritmo tra doppietta e colpo singolo', 'Plate rack o 4 piastre in fila, tempo sotto 3 s', 'Mini popper a 15 m: colpo singolo dal pronto'],
      peso: Math.min(100, 30 + pg.quotaMetallo * 250 + pg.miniPopper * 1.5),
    })
  }
  if (pg.noShoot > 0) {
    f.push({
      id: 'noshoot',
      titolo: 'Precisione vicino ai no-shoot',
      perche: `${pg.noShoot} no-shoot in ${pg.stageConNoShoot} stage su ${tot}.`,
      drill: ['Bersagli parzialmente coperti a 10 m: solo zone A', 'Teste coperte a 7 m dopo un movimento', 'Doppiette rallentate: accettare il tempo, non il rischio'],
      peso: Math.min(100, 25 + (pg.noShoot / tot) * 35),
    })
  }
  if (pg.stageMovimento > 0) {
    f.push({
      id: 'movimento',
      titolo: 'Ingressi, uscite e movimento',
      perche: `${pg.perTipo.Medium} medium e ${pg.perTipo.Long} long: ${pct(pg.stageMovimento / tot)} degli stage richiede spostamenti.`,
      drill: ['Ingresso in box con primo colpo sotto 1 s dall’arresto', 'Uscita: primo passo mentre parte l’ultimo colpo', 'Tiro in movimento su bersagli larghi a 5–7 m'],
      peso: Math.min(100, 20 + (pg.stageMovimento / tot) * 60),
    })
  }
  if (pg.perTipo.Long > 0 || pg.colpi / tot > 20) {
    f.push({
      id: 'ricariche',
      titolo: 'Ricariche in movimento',
      perche: `${pg.perTipo.Long} stage long: ricariche da pianificare tra le posizioni.`,
      drill: ['Ricarica camminando tra due box a 5 m', 'Ricarica di sicurezza dopo 12–15 colpi', 'In bianco: 50 ricariche lente, 50 a ritmo gara'],
      peso: Math.min(100, 15 + pg.perTipo.Long * 15),
    })
  }
  if (pg.stageMobili > 0) {
    f.push({
      id: 'mobili',
      titolo: 'Bersagli attivati e mobili',
      perche: `${pg.stageMobili} stage su ${tot} hanno attivazioni o bersagli mobili.`,
      drill: ['Attivare con il popper e ingaggiare subito altri bersagli', 'Contare i tempi del mover in allenamento', 'Decidere prima: aspettare o tornare dopo'],
      peso: Math.min(100, 15 + (pg.stageMobili / tot) * 45),
    })
  }
  if (pg.stageManoForte + pg.stageManoDebole > 0) {
    f.push({
      id: 'mano',
      titolo: 'Mano forte e mano debole',
      perche: `${pg.stageManoForte} stage a mano forte, ${pg.stageManoDebole} a mano debole.`,
      drill: ['6 colpi a mano forte su 3 bersagli a 7 m', 'Passaggio di mano dopo l’estrazione (mano debole)', 'In bianco: impugnatura a una mano, 10 min a sessione'],
      peso: 35 + (pg.stageManoForte + pg.stageManoDebole) * 12,
    })
  }
  if (pg.partenzeSpeciali > 0) {
    f.push({
      id: 'partenze',
      titolo: 'Partenze particolari',
      perche: `${pg.partenzeSpeciali} stage con partenza non standard (arma sul tavolo, scarica, colpo non camerato, girati o seduti).`,
      drill: ['Presa dal tavolo e primo colpo', 'Caricatore e cameratura sotto il timer', 'Giro e estrazione a 180°'],
      peso: 20 + pg.partenzeSpeciali * 8,
    })
  }
  if (pg.perTipo.Short > 0) {
    f.push({
      id: 'short',
      titolo: 'Velocità pura su short',
      perche: `${pg.perTipo.Short} stage short: estrazione e split pesano di più.`,
      drill: ['Bill Drill', 'Estrazioni su bersaglio a 7 m', 'Blake Drill (3 bersagli, 2 colpi)'],
      peso: 15 + (pg.perTipo.Short / tot) * 40,
    })
  }
  return f.sort((a, b) => b.peso - a.peso)
}

export const fmtS = (n: number) => `${n.toFixed(1).replace('.', ',')} s`
export const fmtHf = (n: number) => n.toFixed(2).replace('.', ',')
