/**
 * Lo stage si segna sul disegno come a penna: P dove parti, A-B-C dove ti fermi, 1-2-3 i bersagli nell'ordine di tiro.
 * Un tocco = un segno. Tocca un segno per cambiarlo, spostarlo o toglierlo.
 */
import { Maximize2, Minimize2, Move, Trash2, Undo2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { TIPI_BERSAGLIO, type TipoBersaglio } from '../analisi/mappa'
import { DISTANZE, etichetteSegni, NOMI_MOV, NOMI_VIS, type Movimento, type Segno, type Visibilita } from '../analisi/schema'

type Modo = 'P' | 'pos' | 'carta' | 'metallo' | 'modifica'
const TIPI: TipoBersaglio[] = ['carta', 'mini', 'popper', 'miniPopper', 'piastra']

export default function SegniDisegno({ img, segni, distanze, profondita, onChange, onProfondita }: {
  img: { url: string; w: number; h: number }
  segni: Segno[]
  /** distanze calcolate (metri) per i bersagli, nello stesso ordine dei segni */
  distanze: (number | null)[]
  profondita: number
  onChange: (s: Segno[]) => void
  onProfondita: (m: number) => void
}) {
  const [modo, setModo] = useState<Modo>(segni.some((s) => s.k === 'P') ? (segni.some((s) => s.k === 'pos') ? 'carta' : 'pos') : 'P')
  const [sel, setSel] = useState<number | null>(null)
  const [sposta, setSposta] = useState(false)
  const [attiva, setAttiva] = useState<number | null>(() => { const i = segni.map((s) => s.k).lastIndexOf('pos'); return i >= 0 ? i : null })
  const [grande, setGrande] = useState(false)
  const storia = useRef<Segno[][]>([])
  const box = useRef<HTMLDivElement>(null)
  const etichette = etichetteSegni(segni)

  const salva = (n: Segno[]) => { storia.current.push(segni); if (storia.current.length > 40) storia.current.shift(); onChange(n) }
  const annulla = () => { const p = storia.current.pop(); if (p) { onChange(p); setSel(null); setSposta(false) } }

  function tocca(e: React.MouseEvent) {
    const r = box.current!.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000)
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000)
    if (x < 0 || y < 0 || x > 1000 || y > 1000) return
    if (sel != null && sposta) {
      salva(segni.map((s, i) => (i === sel ? { ...s, x, y } : s)))
      setSposta(false)
      return
    }
    if (sel != null) { setSel(null); return }
    if (modo === 'modifica') return
    if (modo === 'P') {
      salva([{ k: 'P', x, y }, ...segni.filter((s) => s.k !== 'P')])
      setModo('pos')
      return
    }
    if (modo === 'pos') {
      const n = [...segni, { k: 'pos' as const, x, y }]
      salva(n)
      setAttiva(n.length - 1)
      setModo('carta')
      return
    }
    const nuovo: Segno = { k: 'bers', x, y, tipo: modo === 'metallo' ? 'popper' : 'carta', vis: 'piena' }
    // il bersaglio va in coda alla posizione attiva (prima della posizione successiva)
    let dove = segni.length
    if (attiva != null && attiva < segni.length) {
      const dopo = segni.findIndex((s, i) => i > attiva && s.k === 'pos')
      if (dopo >= 0) dove = dopo
    }
    const n = [...segni.slice(0, dove), nuovo, ...segni.slice(dove)]
    if (attiva != null && dove <= attiva) setAttiva(attiva + 1)
    salva(n)
  }

  function scegli(i: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (sposta && sel != null) return
    setSel(sel === i ? null : i)
    setSposta(false)
    if (segni[i].k === 'pos') setAttiva(i)
  }

  const s = sel != null ? segni[sel] : null
  const aggiorna = (p: Partial<Segno>) => sel != null && salva(segni.map((x, i) => (i === sel ? { ...x, ...p } : x)))
  const togli = () => {
    if (sel == null) return
    salva(segni.filter((_, i) => i !== sel))
    if (attiva != null) setAttiva(attiva > sel ? attiva - 1 : attiva === sel ? null : attiva)
    setSel(null); setSposta(false)
  }

  // percorso: P e posizioni in ordine; linee sottili dalla posizione ai suoi bersagli
  const punti = segni.map((x, i) => ({ ...x, i })).filter((x) => x.k !== 'bers')
  const linee: { a: Segno; b: Segno }[] = []
  let corrente: Segno | undefined = segni.find((x) => x.k === 'P')
  for (const x of segni) {
    if (x.k === 'pos') corrente = x
    else if (x.k === 'bers' && corrente) linee.push({ a: corrente, b: x })
  }
  const prossimaLettera = etichette.filter((_, i) => segni[i].k === 'pos').length + (segni.some((x, i) => x.k === 'bers' && segni.slice(0, i).every((y) => y.k !== 'pos')) ? 1 : 0)
  const nomeAttiva = attiva != null && segni[attiva]?.k === 'pos' ? etichette[attiva] : (segni.some((x) => x.k === 'pos') ? null : 'A')
  const guida = sposta ? 'Tocca il punto dove spostarlo.'
    : modo === 'modifica' ? (sel == null ? 'Tocca un segno per cambiarlo, spostarlo o toglierlo.' : '')
    : modo === 'P' ? 'Tocca dove parti (P).'
    : modo === 'pos' ? `Tocca dove ti fermi: posizione ${String.fromCharCode(65 + prossimaLettera)}.`
    : `Tocca i bersagli che spari${nomeAttiva ? ` da ${nomeAttiva}` : ''}, nell’ordine. ${modo === 'metallo' ? '(metallo)' : ''}`

  return (
    <div className="segni">
      <div className="segni-barra" role="toolbar" aria-label="Cosa segni">
        {([['P', 'P'], ['pos', '+ Posizione'], ['carta', 'Carta'], ['metallo', 'Metallo'], ['modifica', 'Modifica']] as [Modo, string][]).map(([m, l]) => (
          <button key={m} type="button" className={`chip${modo === m && !sposta ? ' on' : ''}`} aria-pressed={modo === m} onClick={() => { setModo(m); setSel(null); setSposta(false) }}>{l}</button>
        ))}
        <span className="spacer" />
        <button type="button" className="btn ghost icon" onClick={annulla} disabled={!storia.current.length} aria-label="Annulla l’ultimo segno"><Undo2 size={18} /></button>
      </div>
      <p className="segni-guida" aria-live="polite">{guida}</p>

      <div className={`segni-scroll${grande ? ' grande' : ''}${modo === 'modifica' ? ' modifica' : ''}`}>
        <div className="segni-box" ref={box} onClick={tocca} style={{ aspectRatio: `${img.w} / ${img.h}` }}>
          <img src={img.url} alt="Disegno dello stage" draggable={false} />
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
            {linee.map((l, i) => <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} className="segni-mira" />)}
            {punti.length > 1 && <polyline points={punti.map((p) => `${p.x},${p.y}`).join(' ')} className="segni-percorso" />}
          </svg>
          {segni.map((x, i) => (
            <button key={i} type="button"
              className={`segno ${x.k}${x.k === 'bers' && TIPI_BERSAGLIO[x.tipo ?? 'carta'].metallo ? ' metallo' : ''}${x.vis && x.vis !== 'piena' ? ' parz' : ''}${x.mov ? ' mov' : ''}${sel === i ? ' sel' : ''}${attiva === i ? ' attiva' : ''}`}
              style={{ left: `${x.x / 10}%`, top: `${x.y / 10}%` }}
              onClick={(e) => scegli(i, e)}
              aria-label={x.k === 'P' ? 'Partenza' : x.k === 'pos' ? `Posizione ${etichette[i]}` : `Bersaglio ${etichette[i]}`}>
              {etichette[i]}
            </button>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="chips" aria-label="Profondità dello stage">
          {[15, 20, 25, 30].map((m) => <button key={m} type="button" className={`chip${profondita === m ? ' on' : ''}`} onClick={() => onProfondita(m)}>{m} m</button>)}
        </div>
        <button type="button" className="btn ghost icon" onClick={() => setGrande(!grande)} aria-label={grande ? 'Rimpicciolisci' : 'Ingrandisci'}>{grande ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
      </div>
      <p className="meta" style={{ margin: 0 }}>Profondità dalla fault line più bassa al parapalle: serve per i metri. Level II fino a 20 m, Level III fino a 30 m.</p>

      {s && sel != null && (
        <div className="segni-pannello">
          <div className="row">
            <b style={{ fontSize: 15 }}>{s.k === 'P' ? 'Partenza' : s.k === 'pos' ? `Posizione ${etichette[sel]}` : `Bersaglio ${etichette[sel]}`}</b>
            <span className="spacer" />
            <button type="button" className={`btn${sposta ? ' primary' : ''}`} onClick={() => setSposta(!sposta)}><Move size={16} /> Sposta</button>
            <button type="button" className="btn ghost icon" onClick={togli} aria-label="Togli"><Trash2 size={18} /></button>
          </div>
          {s.k === 'pos' && (
            <>
              <input className="input" value={s.nome ?? ''} placeholder="Nome (es. dietro i barili)" onChange={(e) => onChange(segni.map((x, i) => (i === sel ? { ...x, nome: e.target.value } : x)))} />
              <button type="button" className="btn" onClick={() => { setModo('carta'); setAttiva(sel); setSel(null) }}>Aggiungi bersagli da {etichette[sel]}</button>
            </>
          )}
          {s.k === 'bers' && (
            <>
              <div className="chips">{TIPI.map((t) => <button key={t} type="button" className={`chip${(s.tipo ?? 'carta') === t ? ' on' : ''}`} onClick={() => aggiorna({ tipo: t })}>{TIPI_BERSAGLIO[t].nome}</button>)}</div>
              <div className="chips">{(Object.keys(NOMI_VIS) as Visibilita[]).map((v) => <button key={v} type="button" className={`chip${(s.vis ?? 'piena') === v ? ' on' : ''}`} onClick={() => aggiorna({ vis: v })}>{NOMI_VIS[v]}</button>)}</div>
              <div className="chips">{(Object.keys(NOMI_MOV) as Movimento[]).map((m) => <button key={m} type="button" className={`chip${(s.mov ?? 'fermo') === m ? ' on' : ''}`} onClick={() => aggiorna({ mov: m === 'fermo' ? undefined : m })}>{NOMI_MOV[m]}</button>)}</div>
              <div className="chips">
                <button type="button" className={`chip${s.d == null ? ' on' : ''}`} onClick={() => aggiorna({ d: undefined })}>Dal disegno{distanze[sel] != null ? ` · ${distanze[sel]} m` : ''}</button>
                {DISTANZE.map((d) => <button key={d} type="button" className={`chip${s.d === d ? ' on' : ''}`} onClick={() => aggiorna({ d })}>{d} m</button>)}
              </div>
              <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={!!s.mobile} onChange={(e) => aggiorna({ mobile: e.target.checked })} /> Mobile o attivato</label>
            </>
          )}
          <button type="button" className="btn primary" onClick={() => { setSel(null); setSposta(false) }}>Fatto</button>
        </div>
      )}
    </div>
  )
}
