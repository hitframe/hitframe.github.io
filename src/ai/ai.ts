/**
 * Collegamento all'AI scelta dall'utente, con la sua chiave. Le richieste partono dal dispositivo
 * direttamente verso il fornitore: nessun server di Hitframe in mezzo.
 */
import { getImp, setImp } from '../db/db'
import { richiesta } from '../lib/rete'
import { ErroreSolaLettura, solaLettura } from '../licenza/licenza'

export type Fornitore = 'claude' | 'gemini' | 'openai'

export interface ConfigAI {
  fornitore: Fornitore
  chiave: string
  modello: string
}

export const MODELLI_DEFAULT: Record<Fornitore, string> = {
  claude: 'claude-sonnet-5-5',
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-5-mini',
}

export const NOMI_FORNITORI: Record<Fornitore, string> = {
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  openai: 'ChatGPT (OpenAI)',
}

export const LINK_CHIAVI: Record<Fornitore, string> = {
  claude: 'https://platform.claude.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
}

export const getConfigAI = () => getImp<ConfigAI | null>('ai', null)
export const setConfigAI = (c: ConfigAI | null) => setImp('ai', c)

export class ErroreAI extends Error {}

interface Richiesta {
  sistema: string
  testo: string
  immagine?: { base64: string; mime: string }
  maxToken?: number
  /** 'testo' per risposte libere (chat); di base si chiede JSON */
  formato?: 'json' | 'testo'
  /** Conversazione precedente (chat): alternanza utente/assistente */
  storia?: { ruolo: 'utente' | 'ai'; testo: string }[]
}

/** Traduce gli errori più comuni in una frase che dice cosa fare. */
export function spiegaErrore(msg: string, status?: number): string {
  if (/referer|referrer/i.test(msg)) {
    return `La chiave accetta richieste solo da altri indirizzi: nelle impostazioni della chiave (Google Cloud → Credenziali) togli la restrizione "Siti web" o aggiungi ${window.location.origin}/*. Dettaglio: ${msg}`
  }
  if (/API key not valid|invalid.*api.?key|invalid x-api-key|Incorrect API key/i.test(msg) || status === 401) return `Chiave non valida: controlla di averla copiata tutta. Dettaglio: ${msg}`
  if (/quota|rate limit|RESOURCE_EXHAUSTED/i.test(msg) || status === 429) return `Limite di utilizzo raggiunto per ora: riprova più tardi. Dettaglio: ${msg}`
  if (/not found|is not supported|does not exist/i.test(msg) || status === 404) return `Modello non disponibile: lascia vuoto il campo modello per usare quello predefinito. Dettaglio: ${msg}`
  return msg
}

async function leggiErrore(r: Response): Promise<string> {
  let msg = `Errore ${r.status}`
  try {
    const j = await r.json()
    msg = j?.error?.message ?? j?.error?.status ?? msg
  } catch { /* ignore */ }
  return spiegaErrore(msg, r.status)
}

/** Invia testo (e un'immagine facoltativa) e restituisce il testo della risposta. */
export async function chiedi(cfg: ConfigAI, req: Richiesta): Promise<string> {
  if (solaLettura()) throw new ErroreAI(new ErroreSolaLettura().message)
  const modello = cfg.modello.trim() || MODELLI_DEFAULT[cfg.fornitore]
  const maxToken = req.maxToken ?? 4000
  let r: Response
  try {
    if (cfg.fornitore === 'claude') {
      const content: unknown[] = []
      if (req.immagine) content.push({ type: 'image', source: { type: 'base64', media_type: req.immagine.mime, data: req.immagine.base64 } })
      content.push({ type: 'text', text: req.testo })
      r = await richiesta('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.chiave.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: modello, max_tokens: maxToken, system: req.sistema, messages: [
          ...(req.storia ?? []).map((m) => ({ role: m.ruolo === 'utente' ? 'user' : 'assistant', content: m.testo })),
          { role: 'user', content },
        ] }),
      })
      if (!r.ok) throw new ErroreAI(await leggiErrore(r))
      const j = await r.json()
      const testo = (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n')
      ultimaRisposta = { testo, fine: j.stop_reason ?? null }
      return testo
    }
    if (cfg.fornitore === 'gemini') return await chiediGemini(cfg.chiave.trim(), modello, req, maxToken)
    // OpenAI
    const content: unknown[] = [{ type: 'text', text: req.testo }]
    if (req.immagine) content.push({ type: 'image_url', image_url: { url: `data:${req.immagine.mime};base64,${req.immagine.base64}` } })
    r = await richiesta('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.chiave.trim()}` },
      body: JSON.stringify({
        model: modello,
        max_completion_tokens: maxToken,
        ...(req.formato === 'testo' ? {} : { response_format: { type: 'json_object' } }),
        messages: [
          { role: 'system', content: req.sistema },
          ...(req.storia ?? []).map((m) => ({ role: m.ruolo === 'utente' ? 'user' : 'assistant', content: m.testo })),
          { role: 'user', content },
        ],
      }),
    })
    if (!r.ok) throw new ErroreAI(await leggiErrore(r))
    const j = await r.json()
    ultimaRisposta = { testo: j.choices?.[0]?.message?.content ?? '', fine: j.choices?.[0]?.finish_reason ?? null }
    return ultimaRisposta.testo
  } catch (e) {
    if (e instanceof ErroreAI) throw e
    const dettaglio = e instanceof Error && e.message ? ` (${e.message})` : ''
    throw new ErroreAI(`Connessione all’AI non riuscita${dettaglio}. Controlla la rete.`)
  }
}

/** Modelli gratuiti di riserva, provati se quello scelto è sovraccarico. */
export const RISERVE_GEMINI = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
const attesa = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

async function chiediGemini(chiave: string, modello: string, req: Richiesta, maxToken: number): Promise<string> {
  const parts: unknown[] = []
  if (req.immagine) parts.push({ inline_data: { mime_type: req.immagine.mime, data: req.immagine.base64 } })
  parts.push({ text: req.testo })
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: req.sistema }] },
    contents: [
      ...(req.storia ?? []).map((m) => ({ role: m.ruolo === 'utente' ? 'user' : 'model', parts: [{ text: m.testo }] })),
      { role: 'user', parts },
    ],
    generationConfig: { maxOutputTokens: maxToken, ...(req.formato === 'testo' ? {} : { responseMimeType: 'application/json' }) },
  })
  const modelli = [modello, ...RISERVE_GEMINI.filter((m) => m !== modello)]
  let ultimo = ''
  for (const m of modelli) {
    for (let tentativo = 0; tentativo < 3; tentativo++) {
      let r: Response
      try {
        r = await richiesta(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave },
          body,
        })
      } catch (e) {
        // quando Google è sovraccarico a volte la risposta arriva senza intestazioni e il browser la vede
        // come "connessione fallita": la trattiamo come un sovraccarico (riprova, poi modello di riserva)
        ultimo = e instanceof Error ? e.message : 'connessione interrotta'
        if (navigator.onLine === false) throw new ErroreAI('Sei senza rete: riprova quando torna la connessione.')
        await attesa(tentativo === 0 ? 2000 : 4000)
        continue
      }
      if (r.ok) {
        const j = await r.json()
        const testo = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('\n')
        ultimaRisposta = { testo, fine: j.candidates?.[0]?.finishReason ?? null }
        return testo
      }
      // modello inesistente: passa al successivo
      if (r.status === 404) { ultimo = await leggiErrore(r); break }
      ultimo = await leggiErrore(r)
      // chiave errata o richiesta non valida: inutile insistere
      if (r.status === 400 || r.status === 401 || r.status === 403) throw new ErroreAI(ultimo)
      // sovraccarico (503) o limite (429): aspetta e riprova, poi cambia modello
      await attesa(tentativo === 0 ? 2500 : 5000)
    }
  }
  throw new ErroreAI(`Google è sovraccarico in questo momento (${ultimo}). Riprova tra qualche minuto.`)
}

/** Ultima risposta grezza dell'AI (per capire cosa è andato storto). */
export let ultimaRisposta: { testo: string; fine: string | null } = { testo: '', fine: null }

/** Chiude un JSON troncato: taglia all'ultimo elemento completo e chiude parentesi e graffe aperte. */
function riparaJson(t: string): string | null {
  const pila: string[] = []
  let inStringa = false, esc = false
  let ultimoSicuro = -1, pilaSicura: string[] = []
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (inStringa) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStringa = false
      continue
    }
    if (ch === '"') inStringa = true
    else if (ch === '{' || ch === '[') pila.push(ch === '{' ? '}' : ']')
    else if (ch === '}' || ch === ']') {
      pila.pop()
      if (!pila.length) return t.slice(0, i + 1)
      ultimoSicuro = i + 1; pilaSicura = [...pila]
    } else if (ch === ',') { ultimoSicuro = i; pilaSicura = [...pila] }
  }
  if (ultimoSicuro < 0) return null
  return t.slice(0, ultimoSicuro).replace(/,\s*$/, '') + pilaSicura.reverse().join('')
}

/** Estrae il primo oggetto JSON da una risposta testuale (ripara le risposte tagliate a metà). */
export function estraiJson<T>(testo: string): T {
  const pulito = testo.replace(/```json|```/g, '')
  const a = pulito.indexOf('{')
  if (a < 0) {
    const inizio = pulito.trim().slice(0, 140)
    throw new ErroreAI(inizio ? `L’AI ha risposto senza dati: “${inizio}${pulito.trim().length > 140 ? '…' : ''}”` : 'L’AI ha restituito una risposta vuota: riprova.')
  }
  const b = pulito.lastIndexOf('}')
  if (b > a) {
    try { return JSON.parse(pulito.slice(a, b + 1)) as T } catch { /* provo a ripararlo */ }
  }
  const riparato = riparaJson(pulito.slice(a))
  if (riparato) {
    try { return JSON.parse(riparato) as T } catch { /* niente */ }
  }
  throw new ErroreAI(ultimaRisposta.fine === 'max_tokens' || ultimaRisposta.fine === 'length' || ultimaRisposta.fine === 'MAX_TOKENS'
    ? 'La risposta dell’AI è stata tagliata perché troppo lunga: riprova.'
    : 'L’AI ha restituito dati non validi: riprova.')
}

export async function provaCollegamento(cfg: ConfigAI): Promise<string> {
  const t = await chiedi(cfg, { sistema: 'Rispondi solo con JSON.', testo: 'Rispondi con {"ok": true}', maxToken: 2000 })
  estraiJson(t)
  return 'Collegamento riuscito'
}
