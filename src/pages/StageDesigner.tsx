import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, Copy, Crosshair, Dumbbell, Eye, EyeOff, Play, Plus, Printer, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Schema } from '../allenamento/schemi'
import { calcolaPiano, consiglio, type Piano, type Stile } from '../analisi/piano'
import { fmtHf, fmtS } from '../analisi/motore'
import { DrillSchema, EditorSchema } from '../components/DrillSchema'
import { Empty, PageHeader, Segmented, useToast } from '../components/ui'
import { db, normalizzaProfilo, nowIso } from '../db/db'
import type { StageAllenamento } from '../db/types'
import { fmtMedio, oggiKey } from '../lib/date'
import { colpi, corso, etichettaPosizione, isBersaglio, isPosizione, versoMappa, vede } from '../stage/geometria'

const nuovoStage = (): StageAllenamento => ({
  nome: 'Nuovo stage', larghezza: 20, profondita: 25, partenza: 'In piedi nel box, mani rilassate lungo i fianchi',
  schema: { elementi: [{ t: 'tiratore', x: 0, y: 0 }, { t: 'box', x: 0, y: 0, id: 'P1' }, { t: 'carta', x: -1.5, y: 8, id: 'T1', nota: '×2' }, { t: 'carta', x: 1.5, y: 8, id: 'T2', nota: '×2' }] },
  note: '', creato: nowIso(), aggiornato: nowIso(),
})

export default function StageDesigner() {
  const { id } = useParams()
  return id ? <EditorStage id={Number(id)} /> : <ElencoStage />
}

function ElencoStage() {
  const navigate = useNavigate()
  const stage = useLiveQuery(() => db.stageLab.orderBy('aggiornato').reverse().toArray())
  async function crea() {
    const id = (await db.stageLab.add(nuovoStage())) as number
    navigate(`/stage-designer/${id}`)
  }
  return (
    <div className="page">
      <PageHeader title="Stage designer" sub="Progetta gli stage di allenamento, controlla visibilità e tempi"
        actions={<button className="btn primary" onClick={crea}><Plus size={18} /> Nuovo stage</button>} />
      {stage && stage.length === 0 && (
        <div className="card"><Empty icon={<Crosshair size={28} />} text="Disegna lo stage del tuo poligono: bersagli, metalli, pareti, barili, box. Hitframe controlla cosa si vede da ogni posizione, conta i colpi e stima il tempo con il tuo profilo." action={<button className="btn primary" onClick={crea}><Plus size={18} /> Disegna il primo</button>} /></div>
      )}
      <div className="list">
        {stage?.map((s) => {
          const n = colpi(s.schema)
          return (
            <Link key={s.id} to={`/stage-designer/${s.id}`} className="item" style={{ alignItems: 'center' }}>
              <div style={{ width: 70, flexShrink: 0, pointerEvents: 'none' }}><DrillSchema schema={s.schema} titolo={s.nome} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title">{s.nome}</div>
                <div className="meta">{corso(n).tipo} · {n} colpi · {s.larghezza}×{s.profondita} m · {fmtMedio(s.aggiornato.slice(0, 10))}</div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function EditorStage({ id }: { id: number }) {
  const toast = useToast()
  const navigate = useNavigate()
  const salvato = useLiveQuery(() => db.stageLab.get(id), [id])
  const profilo = useLiveQuery(async () => normalizzaProfilo(await db.profilo.get('me')))
  const [st, setSt] = useState<StageAllenamento | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [raggi, setRaggi] = useState(true)
  const [ignoraColpi, setIgnoraColpi] = useState(false)
  const [piano, setPiano] = useState<Stile | null>(null)
  const [conferma, setConferma] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => { if (salvato && !st) setSt(salvato) }, [salvato, st])
  // salvataggio automatico
  useEffect(() => {
    if (!st?.id) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { void db.stageLab.put({ ...st, aggiornato: nowIso() }) }, 500)
    return () => window.clearTimeout(timer.current)
  }, [st])

  const sim = useMemo(() => {
    if (!st || !profilo) return null
    const m = versoMappa(st.schema)
    if (!m) return null
    const ag = calcolaPiano(m.mappa, m.stage, profilo, 'aggressivo')
    const co = calcolaPiano(m.mappa, m.stage, profilo, 'conservativo')
    return ag && co ? { m, aggressivo: ag, conservativo: co, consiglio: consiglio(ag, co) } : { m, aggressivo: null, conservativo: null, consiglio: null }
  }, [st, profilo])

  if (salvato === undefined || !st || !profilo) return <div className="page" />
  if (!salvato) return <div className="page"><Link to="/stage-designer" className="btn ghost"><ArrowLeft size={18} /> Stage</Link><div className="card">Stage non trovato.</div></div>

  const el = st.schema.elementi
  const n = colpi(st.schema)
  const c = corso(n)
  const posizioni = el.filter(isPosizione)
  const bersagli = el.filter(isBersaglio)
  const selEl = sel !== null ? el[sel] : null
  const posSel = selEl && isPosizione(selEl) ? selEl : null
  const nonVisti = bersagli.filter((b) => !posizioni.some((p) => vede(st.schema, p, b)))
  const pianoScelto: Piano | null = piano && sim?.[piano] ? sim[piano] : null
  const set = (patch: Partial<StageAllenamento>) => setSt({ ...st, ...patch })

  // percorso del piano in metri: dalle posizioni della mappa ai box del disegno
  const percorsoMetri = pianoScelto && sim ? (() => {
    const boxes = el.filter((e) => e.t === 'box')
    const start = el.find((e) => e.t === 'tiratore') ?? boxes[0]
    const daId = (pid: string) => boxes[Number(pid.slice(1)) - 1] ?? start
    return [start, ...pianoScelto.percorso.map(daId)].filter(Boolean)
  })() : null

  async function portaInAllenamento() {
    if (!pianoScelto) return
    const did = (await db.drillPersonali.add({
      nome: st!.nome.slice(0, 60), categoria: 'Movimento', modalita: 'fuoco',
      descrizione: `Stage di allenamento disegnato in Hitframe, piano ${pianoScelto.stile}.`,
      distanza: `${Math.round(Math.min(...bersagli.map((b) => b.y)))}–${Math.round(Math.max(...bersagli.map((b) => b.y)))} m`,
      bersagli: `${bersagli.length} bersagli`, colpi: n, partenza: st!.partenza,
      obiettivo: Math.round(pianoScelto.tempo * 100) / 100, creato: nowIso(),
      schema: st!.schema, allestimento: `Campo ${st!.larghezza}×${st!.profondita} m. ${st!.note}`.trim(),
      passi: pianoScelto.passi.map((x) => `${x.titolo}: ${x.dettaglio}`), attenzione: pianoScelto.rischi,
    })) as number
    const sessione = (await db.eventi.where('data').aboveOrEqual(oggiKey()).filter((e) => e.tipo === 'fuoco' && !e.completato).sortBy('data'))[0]
    if (sessione?.id) {
      await db.eventi.update(sessione.id, { drill: [...(sessione.drill ?? []), `p-${did}`] })
      toast(`Drill creato e aggiunto alla sessione del ${fmtMedio(sessione.data)}`)
    } else toast('Drill creato in Allenamento')
  }

  async function duplica() {
    const nid = (await db.stageLab.add({ ...st!, id: undefined, nome: `${st!.nome} (copia)`, creato: nowIso(), aggiornato: nowIso() })) as number
    setSt(null)
    navigate(`/stage-designer/${nid}`)
  }

  return (
    <div className="page stage-designer">
      <Link to="/stage-designer" className="btn ghost noprint" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><ArrowLeft size={18} /> Stage</Link>
      <input className="input titolo-stage" value={st.nome} onChange={(e) => set({ nome: e.target.value })} aria-label="Nome dello stage" />

      <div className="chips">
        <span className="badge" style={{ color: c.oltre ? 'var(--fuoco)' : 'var(--accent)' }}>{c.tipo} course</span>
        <span className="badge">{n} colpi · {n * 5} punti</span>
        <span className="badge">{bersagli.length} bersagli · {posizioni.filter((p) => p.t === 'box').length} posizioni</span>
      </div>
      {c.oltre && !ignoraColpi && (
        <div className="card avviso noprint">
          <AlertTriangle size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>Oltre 32 colpi: in gara un long course non li supera. In allenamento va bene lo stesso.</div>
          <button className="btn ghost" style={{ minHeight: 34 }} onClick={() => setIgnoraColpi(true)}>Ignora</button>
        </div>
      )}
      {nonVisti.length > 0 && (
        <div className="card avviso noprint"><AlertTriangle size={18} color="var(--accent)" style={{ flexShrink: 0 }} /> Non si vedono da nessuna posizione: {nonVisti.map((b) => b.id || b.t).join(', ')}. Aggiungi un box o sposta pareti e barili.</div>
      )}

      <section className="card form">
        <div className="noprint">
          <EditorSchema schema={st.schema} onChange={(schema: Schema) => set({ schema })} campo={{ larghezza: st.larghezza, profondita: st.profondita }} onSelect={setSel}
            extra={(m) => (
              <g pointerEvents="none">
                {raggi && posSel && bersagli.map((b, i) => {
                  const ok = vede(st.schema, posSel, b)
                  const [x1, y1] = m(posSel.x, posSel.y), [x2, y2] = m(b.x, b.y)
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ok ? 'var(--ok)' : 'var(--fuoco)'} strokeWidth={ok ? 1.5 : 1} strokeDasharray={ok ? undefined : '3 4'} opacity={0.8} />
                })}
                {percorsoMetri && percorsoMetri.length > 1 && (
                  <polyline points={percorsoMetri.map((p) => m(p.x, p.y).join(',')).join(' ')} fill="none" stroke="var(--gara)" strokeWidth={3} strokeDasharray="7 4" />
                )}
              </g>
            )} />
        </div>
        <div className="soloprint"><DrillSchema schema={st.schema} titolo={st.nome} /></div>
        <div className="row noprint">
          <button className="btn ghost" style={{ minHeight: 36 }} onClick={() => setRaggi(!raggi)}>{raggi ? <Eye size={16} /> : <EyeOff size={16} />} Raggi visivi</button>
          <span className="prose" style={{ fontSize: 12 }}>{posSel ? `Da ${etichettaPosizione(st.schema, posSel)}: verde si vede, rosso coperto.` : 'Tocca un box o la partenza (strumento Sposta) per vedere cosa si vede da lì.'}</span>
        </div>
        <div className="fields-2 noprint">
          <div className="field"><label htmlFor="sd-l">Larghezza campo (m)</label>
            <select id="sd-l" className="select" value={st.larghezza} onChange={(e) => set({ larghezza: Number(e.target.value) })}>{[10, 15, 20, 25, 30].map((x) => <option key={x} value={x}>{x} m</option>)}</select></div>
          <div className="field"><label htmlFor="sd-p">Profondità (m)</label>
            <select id="sd-p" className="select" value={st.profondita} onChange={(e) => set({ profondita: Number(e.target.value) })}>{[10, 15, 20, 25, 30].map((x) => <option key={x} value={x}>{x} m</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="sd-part">Partenza</label><input id="sd-part" className="input" value={st.partenza} onChange={(e) => set({ partenza: e.target.value })} /></div>
        <div className="field"><label htmlFor="sd-note">Procedura e note</label><textarea id="sd-note" className="textarea" value={st.note} onChange={(e) => set({ note: e.target.value })} placeholder="Es. al segnale ingaggia T1–T4 dal box P1, poi le piastre da P2…" /></div>
      </section>

      <section className="card">
        <div className="card-title"><span><Play size={18} style={{ verticalAlign: -3 }} /> Simulazione con il tuo profilo</span></div>
        {!sim?.aggressivo || !sim.conservativo ? (
          <p className="prose" style={{ margin: 0 }}>Servono almeno un box e un bersaglio visibile da un box per stimare i tempi.</p>
        ) : (
          <>
            <div className="confronto">
              {(['aggressivo', 'conservativo'] as Stile[]).map((x) => {
                const p = sim[x]!
                return (
                  <button key={x} className={`stat${sim.consiglio!.scelta === x ? ' vince' : ''}`} onClick={() => setPiano(piano === x ? null : x)} aria-pressed={piano === x}
                    style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--text)', outline: piano === x ? '2px solid var(--text)' : undefined }}>
                    <div className="l" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{x}</div>
                    <div className="v">{fmtS(p.tempo)}</div>
                    <div className="l">HF {fmtHf(p.hf)} · {Math.round(p.puntiAttesi)} punti attesi</div>
                  </button>
                )
              })}
            </div>
            <p style={{ margin: '12px 0 0' }}><b>Consiglio:</b> {sim.consiglio!.testo}</p>
            <p className="prose noprint" style={{ fontSize: 12, margin: '6px 0 0' }}>Tocca un piano per vedere il percorso sul disegno e i passi. I punti attesi tengono conto di A/C/D e del rischio di miss per la tua classe e le tue abilità.</p>
            {pianoScelto && (
              <>
                <div style={{ marginTop: 12 }}><Segmented<Stile> label="Piano" value={pianoScelto.stile} onChange={setPiano} options={[{ value: 'aggressivo', label: 'Aggressivo' }, { value: 'conservativo', label: 'Conservativo' }]} /></div>
                <div className="piano-passi" style={{ marginTop: 10 }}>
                  {pianoScelto.passi.map((x, i) => (
                    <div key={i} className={`passo ${x.tipo}`}>
                      <span className="ic">{x.tipo === 'partenza' ? 'S' : x.tipo === 'movimento' ? '→' : x.tipo === 'ricarica' ? 'R' : x.posizione?.replace('P', '') ?? i}</span>
                      <div><div className="t">{x.titolo}</div><div className="d">{x.dettaglio}</div></div>
                      <span className="s">{fmtS(x.tempo)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      <div className="row noprint">
        <button className="btn" onClick={portaInAllenamento} disabled={!pianoScelto} title={pianoScelto ? '' : 'Scegli prima un piano'}><Dumbbell size={18} /> Porta in allenamento</button>
        <button className="btn" onClick={() => window.print()}><Printer size={18} /> Stampa / PDF</button>
        <button className="btn ghost" onClick={duplica}><Copy size={16} /> Duplica</button>
        <div className="spacer" />
        {conferma
          ? <button className="btn danger" onClick={async () => { await db.stageLab.delete(id); navigate('/stage-designer') }}>Conferma eliminazione</button>
          : <button className="btn ghost" onClick={() => setConferma(true)}><Trash2 size={16} /> Elimina</button>}
      </div>
    </div>
  )
}
