/** Schema dello stage a schede: posizioni in ordine, bersagli in ordine di ingaggio. Si tocca, non si trascina. */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { TIPI_BERSAGLIO, type TipoBersaglio } from '../analisi/mappa'
import { colpiDi, colpiPosizione, DISTANZE, lettera, METRI, NOMI_VIS, type BersaglioSchema, type Ingaggio, type SchemaStage, type Visibilita } from '../analisi/schema'
import { Sheet } from './ui'

const TIPI: TipoBersaglio[] = ['carta', 'mini', 'popper', 'miniPopper', 'piastra']
const ABBR: Record<TipoBersaglio, string> = { carta: 'carta', mini: 'mini', popper: 'popper', miniPopper: 'mini popper', piastra: 'piastra', noshoot: 'NS' }

function rinumera(sc: SchemaStage): SchemaStage {
  return { ...sc, posizioni: sc.posizioni.map((p, i) => ({ ...p, id: lettera(i), metri: i === 0 ? p.metri : p.metri })) }
}

export default function SchemaEditor({ schema, onChange }: { schema: SchemaStage; onChange: (s: SchemaStage) => void }) {
  const [sel, setSel] = useState<{ p: number; b: number } | null>(null)
  const [metriAperti, setMetriAperti] = useState<number | null>(null)
  const cambia = (f: (s: SchemaStage) => SchemaStage) => onChange(rinumera(f(structuredClone(schema))))

  const prossimoId = () => {
    const nums = schema.posizioni.flatMap((p) => p.bersagli).map((b) => Number(b.id)).filter((n) => Number.isFinite(n))
    return String((nums.length ? Math.max(...nums) : 0) + 1)
  }
  const aggiungiBersaglio = (pi: number) => {
    const id = prossimoId()
    cambia((s) => { s.posizioni[pi].bersagli.push({ id, tipo: 'carta', distanza: 7, vis: 'piena' }); return s })
    setSel({ p: pi, b: schema.posizioni[pi].bersagli.length })
  }
  const b = sel ? schema.posizioni[sel.p]?.bersagli[sel.b] : null
  const setB = (patch: Partial<BersaglioSchema>) => sel && cambia((s) => { Object.assign(s.posizioni[sel.p].bersagli[sel.b], patch); return s })
  const sposta = (dir: -1 | 1) => {
    if (!sel) return
    const lista = schema.posizioni[sel.p].bersagli
    const j = sel.b + dir
    if (j < 0 || j >= lista.length) return
    cambia((s) => { const l = s.posizioni[sel.p].bersagli; [l[sel.b], l[j]] = [l[j], l[sel.b]]; return s })
    setSel({ p: sel.p, b: j })
  }
  const portaIn = (pi: number) => {
    if (!sel || pi === sel.p) return
    cambia((s) => { const [x] = s.posizioni[sel.p].bersagli.splice(sel.b, 1); s.posizioni[pi].bersagli.push(x); return s })
    setSel({ p: pi, b: schema.posizioni[pi].bersagli.length })
  }

  let progressivo = 0
  return (
    <div className="schema">
      {schema.posizioni.map((p, pi) => {
        const colpi = colpiPosizione(p)
        progressivo += colpi
        return (
          <div key={pi} className="schema-pos">
            {pi > 0 || p.metri > 0 ? (
              <button type="button" className="schema-mov" onClick={() => setMetriAperti(metriAperti === pi ? null : pi)} aria-expanded={metriAperti === pi}>
                <span className="linea" /> {p.metri} m {pi === 0 ? 'dalla partenza' : `da ${lettera(pi - 1)}`} · {p.ingaggio === 'movimento' ? 'ingresso sparando' : p.ingaggio === 'fermo' ? 'ingresso da fermo' : 'ingresso: decide il motore'}
              </button>
            ) : null}
            {metriAperti === pi && (
              <div className="schema-metri">
                <div className="chips">
                  {METRI.map((m) => <button key={m} type="button" className={`chip${p.metri === m ? ' on' : ''}`} onClick={() => cambia((s) => { s.posizioni[pi].metri = m; return s })}>{m} m</button>)}
                </div>
                <div className="chips">
                  {([['auto', 'Decide il motore'], ['fermo', 'Mi fermo'], ['movimento', 'Sparo entrando']] as [Ingaggio, string][]).map(([v, l]) => (
                    <button key={v} type="button" className={`chip${p.ingaggio === v ? ' on' : ''}`} onClick={() => cambia((s) => { s.posizioni[pi].ingaggio = v; return s })}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="schema-card">
              <div className="schema-testa">
                <span className="schema-lettera">{p.id}</span>
                <input className="input schema-nome" value={p.nome} placeholder="Dov’è (es. dietro i barili)" aria-label={`Nome della posizione ${p.id}`}
                  onChange={(e) => cambia((s) => { s.posizioni[pi].nome = e.target.value; return s })} />
                <span className="schema-colpi">{colpi} colpi</span>
              </div>
              <div className="schema-bersagli">
                {p.bersagli.map((x, bi) => (
                  <button key={x.id} type="button" className={`schema-b ${TIPI_BERSAGLIO[x.tipo].metallo ? 'metallo' : ''} ${x.vis}`} onClick={() => setSel({ p: pi, b: bi })}>
                    <b>{x.id}</b><span>{ABBR[x.tipo]} · {x.distanza} m{x.vis === 'parziale' ? ' · parz.' : x.vis === 'sporgersi' ? ' · sporgiti' : ''}</span>
                  </button>
                ))}
                <button type="button" className="schema-b nuovo" onClick={() => aggiungiBersaglio(pi)} aria-label={`Aggiungi un bersaglio in ${p.id}`}><Plus size={16} /></button>
              </div>
              <div className="schema-piede">
                <span className="meta">Colpi sparati fin qui: {progressivo}</span>
                <span className="spacer" />
                <button type="button" className="btn ghost icon" aria-label="Sposta su" disabled={pi === 0} onClick={() => cambia((s) => { [s.posizioni[pi - 1], s.posizioni[pi]] = [s.posizioni[pi], s.posizioni[pi - 1]]; return s })}><ArrowUp size={16} /></button>
                <button type="button" className="btn ghost icon" aria-label="Sposta giù" disabled={pi === schema.posizioni.length - 1} onClick={() => cambia((s) => { [s.posizioni[pi + 1], s.posizioni[pi]] = [s.posizioni[pi], s.posizioni[pi + 1]]; return s })}><ArrowDown size={16} /></button>
                <button type="button" className="btn ghost icon" aria-label={`Elimina la posizione ${p.id}`} disabled={schema.posizioni.length === 1}
                  onClick={() => cambia((s) => { const [x] = s.posizioni.splice(pi, 1); (s.posizioni[Math.max(0, pi - 1)] ?? s.posizioni[0]).bersagli.push(...x.bersagli); return s })}><Trash2 size={16} /></button>
              </div>
            </div>
          </div>
        )
      })}
      <button type="button" className="btn" onClick={() => cambia((s) => { s.posizioni.push({ id: '', nome: '', metri: 4, ingaggio: 'auto', bersagli: [] }); return s })}><Plus size={18} /> Aggiungi posizione</button>

      {sel && b && (
        <Sheet title={`Bersaglio ${b.id} · posizione ${schema.posizioni[sel.p].id}`} onClose={() => setSel(null)}>
          <div className="form">
            <label className="field"><span>Nome o numero</span>
              <input className="input" value={b.id} onChange={(e) => setB({ id: e.target.value.toUpperCase().replace(/\s+/g, '') || b.id })} />
            </label>
            <div className="field"><span className="label">Tipo</span>
              <div className="chips">{TIPI.map((t) => <button key={t} type="button" className={`chip${b.tipo === t ? ' on' : ''}`} onClick={() => setB({ tipo: t })}>{TIPI_BERSAGLIO[t].nome} · {colpiDi({ tipo: t })}</button>)}</div>
            </div>
            <div className="field"><span className="label">Distanza</span>
              <div className="chips">{DISTANZE.map((d) => <button key={d} type="button" className={`chip${b.distanza === d ? ' on' : ''}`} onClick={() => setB({ distanza: d })}>{d} m</button>)}</div>
            </div>
            <div className="field"><span className="label">Come lo vedi</span>
              <div className="chips">{(Object.keys(NOMI_VIS) as Visibilita[]).map((v) => <button key={v} type="button" className={`chip${b.vis === v ? ' on' : ''}`} onClick={() => setB({ vis: v })}>{NOMI_VIS[v]}</button>)}</div>
            </div>
            <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={!!b.mobile} onChange={(e) => setB({ mobile: e.target.checked })} /> Bersaglio mobile o attivato</label>
            <div className="field"><span className="label">Lo ingaggi da</span>
              <div className="chips">{schema.posizioni.map((p, pi) => <button key={pi} type="button" className={`chip${pi === sel.p ? ' on' : ''}`} onClick={() => portaIn(pi)}>{p.id}{p.nome ? ` · ${p.nome.slice(0, 18)}` : ''}</button>)}</div>
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => sposta(-1)} disabled={sel.b === 0}><ArrowUp size={16} /> Prima</button>
              <button type="button" className="btn" onClick={() => sposta(1)} disabled={sel.b === schema.posizioni[sel.p].bersagli.length - 1}><ArrowDown size={16} /> Dopo</button>
              <span className="spacer" />
              <button type="button" className="btn ghost" onClick={() => { cambia((s) => { s.posizioni[sel.p].bersagli.splice(sel.b, 1); return s }); setSel(null) }}><Trash2 size={16} /> Elimina</button>
            </div>
            <button type="button" className="btn primary" onClick={() => setSel(null)}>Fatto</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
