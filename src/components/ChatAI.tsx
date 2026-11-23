import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2, MessageCircle, Send, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { chiedi, ErroreAI, getConfigAI, NOMI_FORNITORI } from '../ai/ai'
import { db, getImp, normalizzaProfilo } from '../db/db'
import { costruisciQuadro, riassuntoPerAI } from '../quadro/calcoli'
import { campioni, pendenzaDistanza, statistiche } from '../video/corse'
import { abilitaPerAI } from '../video/useAbilita'
import { trovaDrill } from '../allenamento/servizi'
import { analizza } from '../risultati/motore'
import { puntiGara, tipiDaLibretto } from '../statistiche/calcoli'

interface Messaggio { ruolo: 'utente' | 'ai'; testo: string }
const K_STORIA = 'hf-chat-storia'

const SISTEMA = `Sei il coach di tiro dinamico IPSC (FITDS, Italia) dentro l'app Hitframe. Parli in italiano, in modo diretto e concreto.
Hai i dati del tiratore in JSON (gare con percentuale e "punteggio reale" — 100 = Grand Master in forma sugli stessi stage, indipendente da chi c'era —, precisione, velocità, errori, allenamento, diario, obiettivi) e, se c'è, la pagina che sta guardando.
Rispondi solo su tiro sportivo, allenamento, gare, materiale, preparazione mentale e sui suoi dati. Basa le risposte sui numeri; se un dato non c'è, dillo.
Risposte brevi (massimo 8-10 righe) salvo richiesta di dettaglio; usa elenchi solo quando servono. Niente consigli su modifiche ad armi non consentite dal regolamento.`

/** Contesto della pagina attuale (per ora: il dettaglio di una gara). */
async function contestoPagina(path: string) {
  const m = path.match(/^\/risultati\/(\d+)/)
  if (!m) return { pagina: path }
  const r = await db.risultati.get(+m[1])
  if (!r) return { pagina: path }
  const analisi = await db.analisi.toArray()
  const a = analizza(r, tipiDaLibretto(r, analisi))
  return {
    pagina: 'dettaglio gara',
    gara: { nome: r.gara, data: r.data, pct: a.base.pct, pos: `${a.base.pos}/${r.concorrenti.length}` },
    stage: a.stages.map((s) => ({ n: s.n, corso: s.corso, pct: Math.round(s.s.pct * 10) / 10, hf: s.s.hf, tempo: s.s.tempo, pos: s.s.pos, puntiPersiErrori: Math.round(s.guadagnoErrori) })),
  }
}

/** Pulsante flottante e pannello di chat con l'AI scelta dall'utente (si accende in Impostazioni). */
export default function ChatAI() {
  const attiva = useLiveQuery(() => getImp<boolean>('chatAI', false))
  const cfg = useLiveQuery(() => getConfigAI())
  const [aperta, setAperta] = useState(false)
  const [storia, setStoria] = useState<Messaggio[]>(() => { try { return JSON.parse(sessionStorage.getItem(K_STORIA) || '[]') } catch { return [] } })
  const [testo, setTesto] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState('')
  const fondo = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useEffect(() => { sessionStorage.setItem(K_STORIA, JSON.stringify(storia.slice(-30))) }, [storia])
  useEffect(() => { fondo.current?.scrollIntoView({ behavior: 'smooth' }) }, [storia, occupato, aperta])

  if (!attiva || !cfg) return null

  async function invia() {
    const domanda = testo.trim()
    if (!domanda || occupato || !cfg) return
    setTesto('')
    setErrore('')
    const prima = storia
    setStoria([...prima, { ruolo: 'utente', testo: domanda }])
    setOccupato(true)
    try {
      const [risultati, analisi, eventi, diario, p, corse, personali] = await Promise.all([db.risultati.toArray(), db.analisi.toArray(), db.eventi.toArray(), db.diario.toArray(), db.profilo.get('me'), db.corse.toArray(), db.drillPersonali.toArray()])
      const profilo = normalizzaProfilo(p)
      const punti = puntiGara(risultati, analisi)
      const q = costruisciQuadro(punti, risultati, eventi, diario, profilo)
      const camp = campioni(corse, (id) => trovaDrill(id, personali))
      const abilita = abilitaPerAI({ stat: statistiche(camp), run: corse.length, pendenza: pendenzaDistanza(camp) })
      const contesto = { atleta: riassuntoPerAI(q, punti, profilo, abilita), ...(await contestoPagina(pathname)) }
      const sistema = `${SISTEMA}\n\nDATI DEL TIRATORE (JSON):\n${JSON.stringify(contesto)}`
      const risposta = await chiedi(cfg, { sistema, testo: domanda, storia: prima.slice(-12), formato: 'testo', maxToken: 6000 })
      setStoria([...prima, { ruolo: 'utente', testo: domanda }, { ruolo: 'ai', testo: risposta.trim() || '…' }])
    } catch (e) {
      setErrore(e instanceof ErroreAI ? e.message : 'Risposta non riuscita, riprova.')
      setStoria(prima)
      setTesto(domanda)
    } finally {
      setOccupato(false)
    }
  }

  return (
    <>
      {!aperta && (
        <button className="chat-fab" aria-label="Chat con il coach AI" onClick={() => setAperta(true)}><MessageCircle size={24} /></button>
      )}
      {aperta && (
        <div className="chat-pannello" role="dialog" aria-label="Chat con il coach AI">
          <div className="chat-testa">
            <div>
              <div style={{ fontWeight: 800 }}>Coach AI</div>
              <div className="meta">{NOMI_FORNITORI[cfg.fornitore]} · vede i tuoi dati</div>
            </div>
            {storia.length > 0 && <button className="btn icon ghost" aria-label="Nuova conversazione" onClick={() => { setStoria([]); setErrore('') }}><Trash2 size={18} /></button>}
            <button className="btn icon ghost" aria-label="Chiudi chat" onClick={() => setAperta(false)}><X size={20} /></button>
          </div>
          <div className="chat-corpo">
            {storia.length === 0 && (
              <div className="chat-vuota">
                <p>Chiedimi qualcosa sui tuoi dati. Per esempio:</p>
                {['Su cosa dovrei lavorare questo mese?', 'Perché nell’ultima gara ho perso più punti?', 'Sono in linea con l’obiettivo Master?', 'Che drill mi consigli per i miss?'].map((d) => (
                  <button key={d} className="chip" onClick={() => setTesto(d)}>{d}</button>
                ))}
              </div>
            )}
            {storia.map((m, i) => <div key={i} className={`chat-msg ${m.ruolo}`}>{m.testo}</div>)}
            {occupato && <div className="chat-msg ai"><Loader2 size={16} className="spin" /></div>}
            {errore && <div role="alert" className="chat-errore">{errore}</div>}
            <div ref={fondo} />
          </div>
          <form className="chat-piede" onSubmit={(e) => { e.preventDefault(); void invia() }}>
            <textarea className="input" rows={1} value={testo} placeholder="Scrivi al coach…" onChange={(e) => setTesto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void invia() } }} />
            <button className="btn primary icon" type="submit" aria-label="Invia" disabled={occupato || !testo.trim()}><Send size={18} /></button>
          </form>
        </div>
      )}
    </>
  )
}
