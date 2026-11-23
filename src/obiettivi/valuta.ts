/**
 * Valutazione degli obiettivi: confronta l'andamento di gare e allenamenti con quello che serve
 * per arrivare all'obiettivo entro la scadenza, e dice cosa correggere.
 */
import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'
import type { Evento, Obiettivo, VoceDiario } from '../db/types'
import { fromKey, oggiKey } from '../lib/date'
import { pendenza, puntiForzaDebolezza, type PuntoGara } from '../statistiche/calcoli'

export type Stato = 'raggiunto' | 'in-linea' | 'attenzione' | 'fuori-strada' | 'pochi-dati'

export interface Valutazione {
  stato: Stato
  titolo: string // frase breve
  avanzamento: number | null // 0–100
  dettagli: string[]
  azioni: string[]
  valoreAttuale: number | null
  proiezione: number | null
}

export const ETICHETTE_STATO: Record<Stato, string> = {
  raggiunto: 'Raggiunto',
  'in-linea': 'In linea',
  attenzione: 'Da tenere d’occhio',
  'fuori-strada': 'Da correggere',
  'pochi-dati': 'Servono più dati',
}

const f1 = (n: number) => n.toFixed(1).replace('.', ',')
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0)
const devStd = (v: number[]) => {
  if (v.length < 2) return 0
  const m = media(v)
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1))
}

export interface DatiAtleta {
  punti: PuntoGara[]
  eventi: Evento[]
  diario: VoceDiario[]
}

/** Sessioni completate al mese negli ultimi `giorni` giorni. */
function ritmoAllenamento(eventi: Evento[], giorni: number) {
  const da = new Date(Date.now() - giorni * 86400000).toISOString().slice(0, 10)
  const s = eventi.filter((e) => e.completato && e.data >= da && e.data <= oggiKey() && (e.tipo === 'fuoco' || e.tipo === 'bianco'))
  const mesi = giorni / 30
  return {
    fuoco: s.filter((e) => e.tipo === 'fuoco').length / mesi,
    bianco: s.filter((e) => e.tipo === 'bianco').length / mesi,
    colpi: s.reduce((a, e) => a + (e.colpiSparati ?? 0), 0) / mesi,
  }
}

/** Gare in calendario da qui alla scadenza (o una stima di una al mese). */
function gareFuture(eventi: Evento[], entro: string) {
  const oggi = oggiKey()
  const n = eventi.filter((e) => e.tipo === 'gara' && e.data > oggi && e.data <= entro).length
  const mesi = Math.max(0, differenceInCalendarMonths(fromKey(entro), new Date()))
  return { inCalendario: n, stimate: Math.max(n, Math.round(mesi * 0.8)) }
}

function valutaMedia(o: Obiettivo, d: DatiAtleta, campo: 'pct' | 'reale'): Valutazione {
  const unita = campo === 'pct' ? '%' : ''
  const min = o.min ?? 0
  const max = o.max ?? 100
  // le gare dell'ultimo anno, al massimo le ultime 8
  const unAnno = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
  const recenti = d.punti.filter((p) => p.data >= unAnno).slice(-8)
  if (recenti.length < 2) {
    return {
      stato: 'pochi-dati', titolo: 'Importa almeno due gare per valutare l’obiettivo', avanzamento: null, valoreAttuale: null, proiezione: null,
      dettagli: ['Carica i PDF dei risultati in Gare → Risultati: da lì calcolo media, tendenza e distanza dalla fascia.'], azioni: [],
    }
  }
  const valori = recenti.map((p) => p[campo])
  const attuale = media(valori.slice(-5))
  const trend = pendenza(valori)
  const sd = devStd(valori)
  const fut = gareFuture(d.eventi, o.entro)
  const proiezione = Math.min(100, attuale + trend * Math.min(fut.stimate, 6) * 0.6)
  const giorni = differenceInCalendarDays(fromKey(o.entro), new Date())
  const dettagli: string[] = []
  const azioni: string[] = []

  dettagli.push(`Media delle ultime ${Math.min(5, valori.length)} gare: ${f1(attuale)}${unita} (fascia obiettivo ${f1(min)}–${f1(max)}${unita}).`)
  dettagli.push(`Tendenza: ${trend >= 0 ? '+' : ''}${f1(trend)}${unita} a gara · regolarità: ±${f1(sd)}${unita} tra una gara e l’altra.`)
  if (giorni > 0) dettagli.push(`Mancano ${giorni} giorni: ${fut.inCalendario ? `${fut.inCalendario} gare già in calendario` : 'nessuna gara ancora in calendario'}, ne stimo circa ${fut.stimate}.`)

  // quanto vale un errore in termini di percentuale
  const costoPct = media(recenti.map((p) => (p.puntiVincitore ? (p.costoErrori / p.puntiVincitore) * 100 : 0)))
  const sopra = attuale >= min
  const distanza = min - attuale

  let stato: Stato
  if (giorni < 0) stato = sopra ? 'raggiunto' : 'fuori-strada'
  else if (sopra && proiezione >= min && attuale - sd >= min - 2) stato = 'in-linea'
  else if (sopra || proiezione >= min) stato = 'attenzione'
  else stato = distanza <= 4 && trend > 0 ? 'attenzione' : 'fuori-strada'

  const titolo = sopra
    ? `Sei nella fascia: ${f1(attuale)}${unita} di media`
    : `Ti mancano ${f1(distanza)}${unita} di media per entrare nella fascia`

  if (campo === 'pct' && costoPct > 0.5) {
    if (!sopra && costoPct >= distanza) azioni.push(`Gli errori (miss, no-shoot, procedure) ti costano in media ${f1(costoPct)}% a gara: da soli bastano a colmare la distanza. Priorità: drill di conferma della mira e lettura dello stage.`)
    else azioni.push(`Gli errori ti costano in media ${f1(costoPct)}% a gara: ridurli è il guadagno più veloce.`)
  }
  if (sd > 6) azioni.push(`Risultati molto variabili (±${f1(sd)}${unita}): lavora sulla costanza con routine pre-gara fissa e la sezione Mente.`)
  if (trend < -0.3) azioni.push('L’andamento è in calo: rivedi carico di allenamento e riposo prima delle gare.')

  // punti deboli emersi dalle statistiche
  for (const g of puntiForzaDebolezza(recenti).filter((x) => x.tipo === 'debole').slice(0, 2)) azioni.push(`${g.titolo}: ${g.testo}`)

  // allenamento
  const ora = ritmoAllenamento(d.eventi, 60)
  const prima = ritmoAllenamento(d.eventi.filter((e) => e.data < new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)), 120)
  dettagli.push(`Allenamento negli ultimi 2 mesi: ${f1(ora.fuoco)} sessioni a fuoco e ${f1(ora.bianco)} in bianco al mese.`)
  if (stato !== 'in-linea' && stato !== 'raggiunto' && ora.fuoco + ora.bianco < 4) azioni.push('Allenamento sotto le 4 sessioni al mese: per spostare la media servono almeno 2 sessioni in bianco a settimana più 2–3 a fuoco al mese.')
  else if (ora.fuoco + ora.bianco < (prima.fuoco + prima.bianco) * 0.7) azioni.push('Ti stai allenando meno rispetto ai mesi scorsi: riporta il ritmo di prima.')

  // diario: concentrazione nei giorni di gara
  const conc = d.diario.filter((v) => v.concentrazione).slice(-10).map((v) => v.concentrazione)
  if (conc.length >= 3 && media(conc) < 3) azioni.push('Nel diario la concentrazione è spesso bassa: inserisci visualizzazione e respirazione (sezione Mente) nei giorni prima della gara.')

  const avanzamento = Math.max(0, Math.min(100, (attuale / Math.max(min, 1)) * 100))
  return { stato, titolo, avanzamento, dettagli, azioni: azioni.slice(0, 4), valoreAttuale: attuale, proiezione }
}

function valutaTappe(o: Obiettivo): Valutazione {
  const tot = o.tappe.length
  const fatte = o.tappe.filter((t) => t.fatto).length
  const inizio = fromKey(o.creato.slice(0, 10))
  const fine = fromKey(o.entro)
  const durata = Math.max(1, differenceInCalendarDays(fine, inizio))
  const trascorso = Math.max(0, Math.min(1, differenceInCalendarDays(new Date(), inizio) / durata))
  const giorni = differenceInCalendarDays(fine, new Date())
  const fatto = tot ? fatte / tot : 0
  const anni = giorni / 365
  const dettagli = [
    giorni >= 0 ? `Mancano ${giorni > 400 ? `circa ${f1(anni)} anni` : `${giorni} giorni`}.` : 'Scadenza passata.',
    tot ? `Tappe completate: ${fatte} su ${tot}.` : 'Aggiungi le tappe intermedie: senza, posso solo contare il tempo che manca.',
  ]
  const prossima = o.tappe.find((t) => !t.fatto)
  const azioni = prossima ? [`Prossima tappa: ${prossima.testo}.`] : []
  let stato: Stato
  if (tot && fatte === tot) stato = 'raggiunto'
  else if (!tot) stato = 'pochi-dati'
  else if (fatto + 0.15 >= trascorso) stato = 'in-linea'
  else if (fatto + 0.35 >= trascorso) stato = 'attenzione'
  else stato = 'fuori-strada'
  return {
    stato, titolo: tot ? `${fatte} ${fatte === 1 ? 'tappa' : 'tappe'} su ${tot}` : 'Obiettivo senza tappe', avanzamento: tot ? fatto * 100 : null,
    dettagli, azioni, valoreAttuale: null, proiezione: null,
  }
}

export function valuta(o: Obiettivo, d: DatiAtleta): Valutazione {
  if (o.tipo === 'media') {
    const v = valutaMedia(o, d, 'pct')
    if (o.tappe.length) v.dettagli.push(`Tappe: ${o.tappe.filter((t) => t.fatto).length} su ${o.tappe.length}.`)
    return v
  }
  if (o.tipo === 'reale') return valutaMedia(o, d, 'reale')
  return valutaTappe(o)
}

/** Tappe consigliate per i tipi di obiettivo più comuni. */
export function tappeSuggerite(o: Pick<Obiettivo, 'tipo' | 'titolo' | 'classe'>): string[] {
  const t = o.titolo.toLowerCase()
  if (o.tipo === 'evento' && /mondial|world|europe|europ/.test(t)) {
    return [
      'Leggere il regolamento di selezione della squadra nazionale FITDS',
      'Classe Master confermata',
      'Media sopra l’85% nelle gare Level III',
      'Almeno 3 gare Level III all’anno',
      'Una gara internazionale all’estero (Level III–IV)',
      'Piazzamento nei primi della ranking nazionale di divisione',
      'Convocazione / iscrizione all’evento',
    ]
  }
  if (o.tipo === 'media' || o.classe) {
    return ['Partecipare ad almeno 6 gare valide nell’anno', 'Ridurre i miss sotto 1 ogni 100 colpi', 'Routine pre-gara fissa in tutte le gare']
  }
  return []
}

export const nuovoObiettivo = (): Obiettivo => ({
  id: crypto.randomUUID(), titolo: '', orizzonte: 'breve', entro: `${new Date().getFullYear() + 1}-12-31`,
  tipo: 'media', min: undefined, max: undefined, classe: undefined, tappe: [], note: '', creato: new Date().toISOString(),
})
