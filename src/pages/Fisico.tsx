import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, ChevronRight, Dumbbell, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import FiguraEsercizio from '../components/FiguraEsercizio'
import SpazioPartner from '../components/Partner'
import { PageHeader, useToast } from '../components/ui'
import { db } from '../db/db'
import {
  ALLENAMENTI, ATTREZZI, attrezziDi, durataMin, durataSec, esercizio, ESERCIZI, ESTRAZIONE, FORMATI, OBIETTIVI, sequenza,
  type Allenamento, type Attrezzo, type Momento, type Obiettivo,
} from '../fisico/dati'
import { oggiKey } from '../lib/date'

const K_ATTREZZI = 'hf-fisico-attrezzi'
const nomeDi = (id: string) => (id === 'estrazione' ? ESTRAZIONE.nome : esercizio(id)?.nome ?? id)
const cueDi = (id: string) => (id === 'estrazione' ? ESTRAZIONE.cue : esercizio(id)?.cue ?? '')
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`

export default function Fisico() {
  return (
    <Routes>
      <Route index element={<Elenco />} />
      <Route path="esercizi" element={<Libreria />} />
      <Route path="via/:id" element={<Lettore />} />
      <Route path=":id" element={<Dettaglio />} />
    </Routes>
  )
}

function leggiAttrezzi(): Attrezzo[] {
  try { const v = JSON.parse(localStorage.getItem(K_ATTREZZI) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

function Elenco() {
  const [tempo, setTempo] = useState<number | null>(null)
  const [attrezzi, setAttrezzi] = useState<Attrezzo[]>(leggiAttrezzi)
  const [obiettivo, setObiettivo] = useState<Obiettivo | null>(null)
  const gare = useLiveQuery(() => db.eventi.where('tipo').equals('gara').toArray()) ?? []
  const fatti = useLiveQuery(() => db.fisico.where('data').aboveOrEqual(lunediKey()).toArray()) ?? []
  const oggi = oggiKey()
  const gara = gare.filter((g) => (g.gara?.giornoGara ?? g.data) >= oggi).sort((a, b) => (a.gara?.giornoGara ?? a.data).localeCompare(b.gara?.giornoGara ?? b.data))[0]
  const giorniGara = gara ? Math.round((Date.parse(gara.gara?.giornoGara ?? gara.data) - Date.parse(oggi)) / 86400000) : null
  const vicinaGara = giorniGara != null && giorniGara <= 3

  const toggleAttrezzo = (a: Attrezzo) => {
    const n = attrezzi.includes(a) ? attrezzi.filter((x) => x !== a) : [...attrezzi, a]
    setAttrezzi(n)
    try { localStorage.setItem(K_ATTREZZI, JSON.stringify(n)) } catch { /* ignore */ }
  }
  const lista = ALLENAMENTI.filter((a) => !a.conTiro && a.id !== 'riscaldamento')
    .filter((a) => attrezziDi(a).every((x) => attrezzi.includes(x)))
    .filter((a) => tempo == null || (tempo === 30 ? durataMin(a) >= 25 : durataMin(a) <= tempo))
    .filter((a) => !obiettivo || a.obiettivo === obiettivo || a.blocchi.some((b) => b.passi.some((p) => esercizio(p.es)?.obiettivi.includes(obiettivo))))
    .sort((a, b) => (vicinaGara ? Number(!!b.leggero) - Number(!!a.leggero) : 0) || durataSec(a) - durataSec(b))
  const minuti = Math.round(fatti.reduce((s, f) => s + f.durataSec, 0) / 60)

  return (
    <div className="page">
      <PageHeader title="Fisico" sub={fatti.length ? `Questa settimana: ${fatti.length} ${fatti.length === 1 ? 'allenamento' : 'allenamenti'}, ${minuti} minuti` : 'Allenamento fisico per il tiro dinamico, a casa o al poligono'}
        actions={<Link to="/fisico/esercizi" className="btn ghost"><Dumbbell size={18} /> Esercizi</Link>} />

      {vicinaGara && gara && (
        <div className="card avviso">
          <div><b>{giorniGara === 0 ? 'Oggi c’è' : giorniGara === 1 ? 'Domani c’è' : `Tra ${giorniGara} giorni c’è`} {gara.titolo}.</b> Solo allenamenti leggeri: gambe fresche e spalle sciolte. Te li metto in cima.</div>
        </div>
      )}

      <section className="card fisico-tiro">
        <div className="card-title" style={{ color: 'var(--accent)' }}>Per il tiro</div>
        {ALLENAMENTI.filter((a) => a.id === 'riscaldamento' || a.conTiro).map((a) => (
          <Link key={a.id} to={`/fisico/${a.id}`} className="fisico-riga">
            <div><div className="t">{a.nome}</div><div className="s">{a.descrizione.split('.')[0]} · {durataMin(a)}'</div></div>
            <ChevronRight size={18} color="var(--faint)" aria-hidden="true" />
          </Link>
        ))}
      </section>

      <section className="card form">
        <div className="field">
          <span className="label">Quanto tempo hai</span>
          <div className="chips">
            {[null, 10, 20, 30].map((m) => (
              <button key={String(m)} type="button" className={`chip${tempo === m ? ' on' : ''}`} aria-pressed={tempo === m} onClick={() => setTempo(m)}>
                {m == null ? 'Tutti' : m === 30 ? '30\'+' : `fino a ${m}'`}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Cosa hai a disposizione</span>
          <div className="chips">
            {(Object.keys(ATTREZZI) as Attrezzo[]).filter((a) => a !== 'nessuno').map((a) => (
              <button key={a} type="button" className={`chip${attrezzi.includes(a) ? ' on' : ''}`} aria-pressed={attrezzi.includes(a)} onClick={() => toggleAttrezzo(a)}>{ATTREZZI[a]}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Su cosa vuoi lavorare</span>
          <div className="chips">
            <button type="button" className={`chip${!obiettivo ? ' on' : ''}`} aria-pressed={!obiettivo} onClick={() => setObiettivo(null)}>Tutto</button>
            {(Object.keys(OBIETTIVI) as Obiettivo[]).map((o) => (
              <button key={o} type="button" className={`chip${obiettivo === o ? ' on' : ''}`} aria-pressed={obiettivo === o} onClick={() => setObiettivo(obiettivo === o ? null : o)}>{OBIETTIVI[o].nome}</button>
            ))}
          </div>
          {obiettivo && <p className="meta" style={{ margin: '6px 0 0' }}>{OBIETTIVI[obiettivo].perche}.</p>}
        </div>
      </section>

      <SpazioPartner posto="fisico" />

      <div className="fisico-lista">
        {lista.length === 0 && <div className="card"><p className="prose" style={{ margin: 0 }}>Nessun allenamento con questi filtri. Prova ad allargare il tempo o ad aggiungere un attrezzo.</p></div>}
        {lista.map((a) => <SchedaAllenamento key={a.id} a={a} />)}
      </div>
    </div>
  )
}

function SchedaAllenamento({ a }: { a: Allenamento }) {
  const att = attrezziDi(a)
  return (
    <Link to={`/fisico/${a.id}`} className="card fisico-scheda">
      <div className="fisico-formato">{FORMATI[a.formato]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t">{a.nome}</div>
        <div className="s">{OBIETTIVI[a.obiettivo].perche} · {durataMin(a)}'{att.length ? ` · ${att.map((x) => ATTREZZI[x].toLowerCase()).join(', ')}` : ' · senza attrezzi'}{a.leggero ? ' · leggero' : ''}</div>
      </div>
      <ChevronRight size={18} color="var(--faint)" aria-hidden="true" />
    </Link>
  )
}

function Dettaglio() {
  const { id } = useParams()
  const a = ALLENAMENTI.find((x) => x.id === id)
  const [vedi, setVedi] = useState<string | null>(null)
  if (!a) return <div className="page"><Link to="/fisico" className="btn ghost"><ArrowLeft size={18} /> Fisico</Link><div className="card">Allenamento non trovato.</div></div>
  const passi = a.blocchi.flatMap((b, bi) => b.passi.map((p) => ({ ...p, bi, giri: b.giri })))
  return (
    <div className="page">
      <Link to="/fisico" className="btn ghost" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><ArrowLeft size={18} /> Fisico</Link>
      <PageHeader title={a.nome} sub={`${FORMATI[a.formato]} · ${durataMin(a)} minuti · ${OBIETTIVI[a.obiettivo].nome.toLowerCase()}`} />
      <p className="prose" style={{ margin: 0 }}>{a.descrizione}</p>
      <Link to={`/fisico/via/${a.id}`} className="btn primary btn-grande"><Play size={20} /> Inizia</Link>
      {a.blocchi.map((b, bi) => (
        <section key={bi} className="card">
          <div className="card-title"><span>{a.blocchi.length > 1 ? `Blocco ${bi + 1}` : 'Esercizi'}</span>{b.giri > 1 ? <span className="meta" style={{ fontFamily: 'Inter', textTransform: 'none', fontWeight: 500 }}>{b.giri} giri</span> : null}</div>
          <div className="list">
            {passi.filter((p) => p.bi === bi).map((p, k) => (
              <button key={k} type="button" className="item fisico-passo" onClick={() => setVedi(vedi === `${bi}-${k}` ? null : `${bi}-${k}`)} aria-expanded={vedi === `${bi}-${k}`}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="title">{nomeDi(p.es)}</div>
                  <div className="meta">{p.lavoro} s{p.recupero ? ` · recupero ${p.recupero} s` : ''}{esercizio(p.es)?.perLato ? ' · metà per lato' : ''}</div>
                  {vedi === `${bi}-${k}` && (
                    <div className="fisico-anteprima">
                      <FiguraEsercizio id={p.es} size={150} />
                      <p className="prose" style={{ margin: 0, fontSize: 14 }}>{cueDi(p.es)}</p>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Libreria() {
  const [aperto, setAperto] = useState<string | null>(null)
  return (
    <div className="page">
      <Link to="/fisico" className="btn ghost" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><ArrowLeft size={18} /> Fisico</Link>
      <PageHeader title="Esercizi" sub={`${ESERCIZI.length} esercizi scelti per il tiro dinamico`} />
      {(Object.keys(OBIETTIVI) as Obiettivo[]).map((o) => (
        <section key={o} className="card">
          <div className="card-title"><span>{OBIETTIVI[o].nome}</span></div>
          <p className="meta" style={{ margin: '-4px 0 10px' }}>{OBIETTIVI[o].perche}.</p>
          <div className="list">
            {ESERCIZI.filter((e) => e.obiettivi[0] === o).map((e) => (
              <button key={e.id} type="button" className="item fisico-passo" onClick={() => setAperto(aperto === e.id ? null : e.id)} aria-expanded={aperto === e.id}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="title">{e.nome}</div>
                  <div className="meta">{e.attrezzo === 'nessuno' ? 'Senza attrezzi' : ATTREZZI[e.attrezzo]}{e.perLato ? ' · per lato' : ''}</div>
                  {aperto === e.id && <div className="fisico-anteprima"><FiguraEsercizio id={e.id} size={150} /><p className="prose" style={{ margin: 0, fontSize: 14 }}>{e.cue}</p></div>}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/* ---------------- lettore ---------------- */

function lunediKey() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

class Suoni {
  ctx: AudioContext | null = null
  apri() {
    if (this.ctx) return
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (C) this.ctx = new C()
    void this.ctx?.resume()
  }
  beep(freq = 1000, durata = 0.12, vol = 0.5) {
    const c = this.ctx
    if (!c) return
    const o = c.createOscillator(), g = c.createGain()
    o.frequency.value = freq
    o.type = 'square'
    g.gain.setValueAtTime(0, c.currentTime)
    g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.005)
    g.gain.setValueAtTime(vol, c.currentTime + durata - 0.02)
    g.gain.linearRampToValueAtTime(0, c.currentTime + durata)
    o.connect(g).connect(c.destination)
    o.start()
    o.stop(c.currentTime + durata + 0.02)
  }
  chiudi() { void this.ctx?.close(); this.ctx = null }
}

function parla(testo: string) {
  try {
    const s = window.speechSynthesis
    if (!s) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(testo)
    u.lang = 'it-IT'
    u.rate = 1.05
    s.speak(u)
  } catch { /* nessuna voce */ }
}

function Lettore() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const a = ALLENAMENTI.find((x) => x.id === id)
  const seq = useMemo(() => (a ? sequenza(a) : []), [a])
  const [i, setI] = useState(0)
  const [resto, setResto] = useState(seq[0]?.durata ?? 0)
  const [stato, setStato] = useState<'pronto' | 'via' | 'pausa' | 'fine'>('pronto')
  const [audio, setAudio] = useState(true)
  const [tiro, setTiro] = useState<'attesa' | 'beep' | null>(null)
  const [fatica, setFatica] = useState<number | null>(null)
  const suoni = useRef(new Suoni())
  const inizio = useRef(0)
  const ultimo = useRef(0)
  const lock = useRef<{ release: () => Promise<void> } | null>(null)
  const beepTiro = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef(audio)
  audioRef.current = audio

  const m: Momento | undefined = seq[i]
  const prossimo = seq.slice(i + 1).find((x) => x.tipo === 'lavoro')

  // ogni nuovo momento: voce, beep, estrazione a secco
  useEffect(() => {
    if (stato !== 'via' || !m) return
    const es = esercizio(m.es)
    if (audioRef.current) {
      suoni.current.beep(m.tipo === 'lavoro' ? 1400 : 700, m.tipo === 'lavoro' ? 0.35 : 0.2)
      if (m.tipo === 'lavoro') parla(m.es === 'estrazione' ? 'Estrazione. Attendi il beep.' : `${nomeDi(m.es)}, ${m.durata} secondi${es?.perLato ? ', metà per lato' : ''}`)
      else if (m.tipo === 'recupero') parla(`Recupero. Poi ${nomeDi(m.es)}`)
      else parla(`Preparati: ${nomeDi(m.es)}`)
    }
    try { navigator.vibrate?.(m.tipo === 'lavoro' ? 300 : 120) } catch { /* ignore */ }
    if (m.tipo === 'lavoro' && m.es === 'estrazione') {
      setTiro('attesa')
      beepTiro.current = setTimeout(() => { setTiro('beep'); suoni.current.beep(3000, 0.3, 0.8) }, 1500 + Math.random() * 2000)
    } else setTiro(null)
    return () => { if (beepTiro.current) clearTimeout(beepTiro.current) }
  }, [i, stato]) // eslint-disable-line react-hooks/exhaustive-deps

  // il tempo che scorre
  useEffect(() => {
    if (stato !== 'via') return
    ultimo.current = performance.now()
    const t = setInterval(() => {
      const ora = performance.now()
      const dt = (ora - ultimo.current) / 1000
      ultimo.current = ora
      setResto((r) => {
        const n = r - dt
        const mm = seq[i]
        if (mm && audioRef.current && Math.ceil(n) !== Math.ceil(r) && Math.ceil(n) <= 3 && Math.ceil(n) >= 1) suoni.current.beep(880, 0.1, 0.35)
        if (mm && esercizio(mm.es)?.perLato && mm.tipo === 'lavoro' && r > mm.durata / 2 && n <= mm.durata / 2 && audioRef.current) parla('Cambia lato')
        if (n <= 0) {
          if (i + 1 >= seq.length) { fine(); return 0 }
          setI(i + 1)
          return seq[i + 1].durata
        }
        return n
      })
    }, 100)
    return () => clearInterval(t)
  }, [stato, i]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { suoni.current.chiudi(); void lock.current?.release().catch(() => {}); try { window.speechSynthesis?.cancel() } catch { /* ignore */ } }, [])

  async function avvia() {
    suoni.current.apri()
    inizio.current = Date.now()
    try { lock.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* lo schermo può spegnersi */ }
    setStato('via')
  }
  function fine() {
    setStato('fine')
    if (audioRef.current) { suoni.current.beep(1400, 0.6); parla('Fatto. Ottimo lavoro.') }
    void lock.current?.release().catch(() => {})
  }
  const vai = (k: number) => { if (k < 0 || k >= seq.length) return; setI(k); setResto(seq[k].durata) }

  async function salva() {
    if (!a) return
    const ora = new Date()
    await db.fisico.add({
      data: oggiKey(), ora: `${String(ora.getHours()).padStart(2, '0')}:${String(ora.getMinutes()).padStart(2, '0')}`,
      allenamentoId: a.id, titolo: a.nome, durataSec: Math.round((Date.now() - inizio.current) / 1000), fatica, completo: true, creato: ora.toISOString(),
    })
    toast('Allenamento salvato')
    nav('/fisico')
  }

  if (!a || !m) return <div className="page"><Link to="/fisico" className="btn ghost"><ArrowLeft size={18} /> Fisico</Link></div>
  const totale = durataSec(a)
  const passato = seq.slice(0, i).reduce((s, x) => s + x.durata, 0) + (m.durata - resto)
  const frazione = m.durata ? Math.max(0, Math.min(1, resto / m.durata)) : 0
  const R = 58, C = 2 * Math.PI * R
  const colore = m.tipo === 'lavoro' ? 'var(--accent)' : m.tipo === 'recupero' ? 'var(--ok)' : 'var(--text)'
  const mostra = m.tipo === 'lavoro' ? m.es : m.es

  return (
    <div className="lettore">
      <div className="lettore-alto">
        <button className="btn icon lettore-tondo" aria-label="Chiudi l'allenamento" onClick={() => nav(`/fisico/${a.id}`)}><X size={20} /></button>
        <div style={{ textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.nome}</div>
          <div className="meta">{FORMATI[a.formato]}{m.blocchi > 1 ? ` · blocco ${m.blocco} di ${m.blocchi}` : ''} · {mmss(totale - passato)} alla fine</div>
        </div>
        <button className="btn icon lettore-tondo" aria-label={audio ? 'Disattiva voce e beep' : 'Attiva voce e beep'} aria-pressed={audio} onClick={() => setAudio(!audio)}>{audio ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
      </div>

      {stato === 'fine' ? (
        <div className="lettore-fine">
          <Check size={44} color="var(--accent)" />
          <h1 className="lettore-nome">Fatto</h1>
          <p className="prose" style={{ margin: 0 }}>{a.nome} · {mmss((Date.now() - inizio.current) / 1000)}</p>
          <div className="field" style={{ width: '100%' }}>
            <span className="label">Com’è andata?</span>
            <div className="chips">
              {['Facile', 'Giusto', 'Impegnativo', 'Duro', 'Durissimo'].map((x, k) => (
                <button key={x} type="button" className={`chip${fatica === k + 1 ? ' on' : ''}`} aria-pressed={fatica === k + 1} onClick={() => setFatica(k + 1)}>{x}</button>
              ))}
            </div>
          </div>
          <SpazioPartner posto="fine-allenamento" />
          <button className="btn primary btn-grande" style={{ width: '100%' }} onClick={salva}><Check size={20} /> Salva e chiudi</button>
        </div>
      ) : (
        <>
          <div className={`lettore-figura${tiro === 'beep' ? ' via' : ''}`}>
            <FiguraEsercizio id={mostra} size={200} attiva={stato === 'via' && m.tipo === 'lavoro'} />
            <div className="lettore-etichetta">{m.tipo === 'lavoro' ? (tiro === 'attesa' ? 'Pronto…' : tiro === 'beep' ? 'VIA!' : 'In corso') : m.tipo === 'recupero' ? 'Prossimo' : 'Si parte con'}</div>
          </div>
          <div>
            <h1 className="lettore-nome">{nomeDi(mostra)}</h1>
            <p className="prose" style={{ margin: '6px 0 0', fontSize: 14 }}>{cueDi(mostra)}</p>
          </div>
          <div className="lettore-tempo">
            <div className="lettore-anello">
              <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
                <circle cx="66" cy="66" r={R} stroke="var(--border)" strokeWidth="10" fill="none" />
                <circle cx="66" cy="66" r={R} stroke={colore} strokeWidth="10" fill="none" strokeDasharray={C} strokeDashoffset={C * (1 - frazione)} strokeLinecap="round" transform="rotate(-90 66 66)" />
              </svg>
              <div className="lettore-num" aria-live="polite">
                <b>{Math.ceil(resto)}</b>
                <span style={{ color: colore }}>{m.tipo === 'lavoro' ? 'LAVORO' : m.tipo === 'recupero' ? 'RECUPERO' : 'PRONTI'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div className="meta">Giro <b style={{ color: 'var(--text)' }}>{m.giro}</b> di {m.giri}</div>
              <div className="lettore-giri" aria-hidden="true">{Array.from({ length: m.giri }, (_, k) => <span key={k} className={k < m.giro ? 'on' : ''} />)}</div>
              {prossimo && m.tipo === 'lavoro' && <div className="meta">Dopo: <b style={{ color: 'var(--text)' }}>{nomeDi(prossimo.es)}</b></div>}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div className="lettore-comandi">
            <button className="btn lettore-lato" aria-label="Indietro" onClick={() => vai(i - 1)} disabled={i === 0}><SkipBack size={22} /></button>
            {stato === 'pronto'
              ? <button className="btn primary lettore-centro" onClick={avvia}><Play size={20} /> Inizia</button>
              : stato === 'via'
                ? <button className="btn primary lettore-centro" onClick={() => setStato('pausa')}><Pause size={20} /> Pausa</button>
                : <button className="btn primary lettore-centro" onClick={() => setStato('via')}><Play size={20} /> Riprendi</button>}
            <button className="btn lettore-lato" aria-label="Avanti" onClick={() => vai(i + 1)} disabled={i >= seq.length - 1}><SkipForward size={22} /></button>
          </div>
        </>
      )}
    </div>
  )
}
