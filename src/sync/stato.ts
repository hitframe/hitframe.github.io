/**
 * Quando sincronizzare e cosa mostrare nell'indicatore (la nuvoletta in alto).
 * - all'apertura dell'app (se serve, rinnova l'accesso con un passaggio lampo da Google);
 * - qualche secondo dopo ogni modifica;
 * - quando l'app va in secondo piano, quando torna la rete e ogni pochi minuti.
 */
import { useSyncExternalStore } from 'react'
import { AccessoRichiesto, avviaAccesso, getAccount, puoRinnovareDaSolo, rinnovaSilenzioso, tokenValido } from '../google/auth'
import { leggiBase, modificheInSospeso, sincronizza } from './motore'
import { suModifica } from './segnali'
import { allineaPdf } from './pdf'

export type Fase = 'spento' | 'ok' | 'in-corso' | 'in-attesa' | 'offline' | 'accesso' | 'errore'

export interface StatoSync {
  fase: Fase
  ultima: string | null // ISO dell'ultima sincronizzazione riuscita
  messaggio: string
  ricevute: number // modifiche arrivate da altri dispositivi nell'ultimo giro
}

const K_ULTIMA = 'hf-sync-ultima'
const K_TENTATO = 'hf-rinnovo-tentato'
const RITARDO_MODIFICA = 8_000
const OGNI = 3 * 60_000

let stato: StatoSync = {
  fase: 'spento',
  ultima: (() => { try { return localStorage.getItem(K_ULTIMA) } catch { return null } })(),
  messaggio: '',
  ricevute: 0,
}
const ascoltatori = new Set<() => void>()
function imposta(p: Partial<StatoSync>) {
  stato = { ...stato, ...p }
  for (const f of ascoltatori) f()
}
export const getStato = () => stato
export function useStatoSync(): StatoSync {
  return useSyncExternalStore((f) => { ascoltatori.add(f); return () => { ascoltatori.delete(f) } }, getStato)
}

let timer: ReturnType<typeof setTimeout> | undefined
let inCorso: Promise<void> | null = null
let ancora = false
let avviato = false

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

async function fasePerRiposo(): Promise<Fase> {
  if (!getAccount()) return 'spento'
  if (!online()) return 'offline'
  if (!tokenValido()) return (await modificheInSospeso()) ? 'accesso' : 'ok'
  return 'ok'
}

/** Esegue una sincronizzazione ora (una alla volta: se ne arriva un'altra, la accoda). */
export function sincronizzaOra(): Promise<void> {
  if (inCorso) { ancora = true; return inCorso }
  inCorso = (async () => {
    clearTimeout(timer)
    if (!getAccount() || !leggiBase()) { imposta({ fase: await fasePerRiposo() }); return }
    if (!online()) { imposta({ fase: 'offline' }); return }
    if (!tokenValido() && puoRinnovareDaSolo()) await rinnovaSilenzioso()
    if (!tokenValido()) { imposta({ fase: await fasePerRiposo() }); return }
    imposta({ fase: 'in-corso', messaggio: '' })
    try {
      const r = await sincronizza()
      // i PDF delle gare: quelli nuovi vanno nel Drive, poi l'id arriva agli altri dispositivi
      try { if (await allineaPdf()) await sincronizza() } catch (e) { console.warn('PDF nel Drive non riusciti', e) }
      const ora = new Date().toISOString()
      try { localStorage.setItem(K_ULTIMA, ora) } catch { /* ignore */ }
      imposta({ fase: 'ok', ultima: ora, ricevute: r.ricevute })
      if (r.ricevute) window.dispatchEvent(new CustomEvent('hf-sync-ricevute', { detail: r.ricevute }))
      void calendarioInCoda()
    } catch (e) {
      if (e instanceof AccessoRichiesto) imposta({ fase: 'accesso' })
      else if (!online()) imposta({ fase: 'offline' })
      else imposta({ fase: 'errore', messaggio: e instanceof Error ? e.message : 'Sincronizzazione non riuscita' })
    }
  })().finally(() => {
    inCorso = null
    if (ancora) { ancora = false; void sincronizzaOra() }
  })
  return inCorso
}

/** Se il calendario Google è attivo e l'accesso lo consente, invia anche gli eventi in coda. */
async function calendarioInCoda() {
  try {
    const c = await import('../google/calendar')
    await c.allineaFlagCalendario()
    if (!c.calendarioAttivo() || !c.tokenValido()) return
    if (await c.contaInSospeso()) await c.sincronizzaTutto()
  } catch (e) {
    console.warn(e)
  }
}

function programma(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => { void sincronizzaOra() }, ms)
}

/** Rinnova l'accesso passando da Google. Se Google chiede qualcosa, si fa con un tocco. */
export function rinnovaAccesso(silenzioso = true) {
  if (puoRinnovareDaSolo()) {
    // app desktop: niente browser, basta il refresh token
    void rinnovaSilenzioso().then((ok) => (ok ? sincronizzaOra() : avviaAccesso({ dopo: 'sync' })))
    return
  }
  sessionStorage.setItem(K_TENTATO, '1')
  avviaAccesso({ silenzioso, dopo: 'sync' })
}

/** Da chiamare una volta, quando l'app è pronta e l'account è collegato. */
export function avviaSincronizzazione() {
  if (avviato) return
  avviato = true

  suModifica(() => {
    if (!getAccount()) return
    if (stato.fase === 'ok' || stato.fase === 'errore') imposta({ fase: tokenValido() && online() ? 'in-attesa' : stato.fase })
    if (!tokenValido() && online() && stato.fase !== 'in-corso') imposta({ fase: 'accesso' })
    programma(RITARDO_MODIFICA)
  })
  window.addEventListener('online', () => { void sincronizzaOra() })
  window.addEventListener('offline', () => imposta({ fase: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (stato.fase === 'in-attesa') void sincronizzaOra()
    } else {
      void sincronizzaOra()
    }
  })
  setInterval(() => { if (document.visibilityState === 'visible') void sincronizzaOra() }, OGNI)

  // all'apertura non si passa MAI da Google da soli: con poco segnale (poligono) la pagina di Google
  // non carica e l'app resterebbe bianca. Se l'accesso è scaduto compare la nuvola "Accedi": un tocco quando c'è rete.
  void sincronizzaOra()
}
