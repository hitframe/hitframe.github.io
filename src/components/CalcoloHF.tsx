/** Calcolatore di Hit Factor sempre a portata di mano (barra in alto): pensato per la gara, con pulsanti grandi. */
import { useCallback, useState } from 'react'
import { Calculator, Minus, Plus, RotateCcw } from 'lucide-react'
import { Segmented, Sheet } from './ui'

type Fattore = 'minor' | 'major'
const VOCI = [
  { k: 'a', label: 'A', nota: '5' },
  { k: 'c', label: 'C', nota: '' },
  { k: 'd', label: 'D', nota: '' },
  { k: 'm', label: 'Miss', nota: '−10' },
  { k: 'ns', label: 'No-shoot', nota: '−10' },
  { k: 'pe', label: 'Procedurali', nota: '−10' },
] as const
type Chiave = (typeof VOCI)[number]['k']
const ZERO: Record<Chiave, number> = { a: 0, c: 0, d: 0, m: 0, ns: 0, pe: 0 }

function punteggio(v: Record<Chiave, number>, f: Fattore) {
  const pc = f === 'major' ? 4 : 3
  const pd = f === 'major' ? 2 : 1
  return v.a * 5 + v.c * pc + v.d * pd - 10 * (v.m + v.ns + v.pe)
}

function leggiFattore(): Fattore {
  try { return localStorage.getItem('hf-calc-fattore') === 'major' ? 'major' : 'minor' } catch { return 'minor' }
}

export default function CalcoloHF({ classe = 'btn icon ghost topbar-btn', conTesto = false }: { classe?: string; conTesto?: boolean }) {
  const [aperto, setAperto] = useState(false)
  const chiudi = useCallback(() => setAperto(false), [])
  return (
    <>
      <button type="button" className={classe} aria-label="Calcolo hit factor" title="Calcolo hit factor" onClick={() => setAperto(true)}>
        <Calculator size={conTesto ? 20 : 21} />{conTesto && ' Calcolo HF'}
      </button>
      {aperto && <Sheet title="Calcolo hit factor" onClose={chiudi}><Pannello /></Sheet>}
    </>
  )
}

function Pannello() {
  const [f, setF] = useState<Fattore>(leggiFattore)
  const [v, setV] = useState(ZERO)
  const [tempo, setTempo] = useState('')
  const t = Number(tempo.replace(',', '.'))
  const punti = punteggio(v, f)
  const hf = t > 0 ? Math.max(0, punti) / t : null
  const colpi = v.a + v.c + v.d + v.m

  const cambiaF = (x: Fattore) => {
    setF(x)
    try { localStorage.setItem('hf-calc-fattore', x) } catch { /* niente */ }
  }
  const passo = (k: Chiave, d: number) => setV((o) => ({ ...o, [k]: Math.max(0, o[k] + d) }))

  return (
    <div className="form calc-hf">
      <Segmented label="Fattore di potenza" value={f} onChange={cambiaF} options={[{ value: 'minor' as Fattore, label: 'Minor' }, { value: 'major' as Fattore, label: 'Major' }]} />
      <div className="calc-righe">
        {VOCI.map(({ k, label, nota }) => (
          <div key={k} className={`calc-riga${['m', 'ns', 'pe'].includes(k) ? ' penalita' : ''}`}>
            <div className="calc-nome">
              <b>{label}</b>
              <span>{k === 'c' ? (f === 'major' ? '4' : '3') : k === 'd' ? (f === 'major' ? '2' : '1') : nota}</span>
            </div>
            <button type="button" className="btn icon" aria-label={`Togli un ${label}`} onClick={() => passo(k, -1)} disabled={!v[k]}><Minus size={20} /></button>
            <output className="calc-num" aria-live="polite" aria-label={`${label}: ${v[k]}`}>{v[k]}</output>
            <button type="button" className="btn icon primary" aria-label={`Aggiungi un ${label}`} onClick={() => passo(k, 1)}><Plus size={20} /></button>
          </div>
        ))}
      </div>
      <label className="field">
        <span>Tempo (secondi)</span>
        <input inputMode="decimal" placeholder="es. 14,32" value={tempo} onChange={(e) => setTempo(e.target.value)} />
      </label>
      <div className="calc-esito" role="status">
        <div><span>Punti</span><b>{punti}</b></div>
        <div><span>Colpi</span><b>{colpi}</b></div>
        <div className="calc-hf-valore"><span>Hit factor</span><b>{hf === null ? '–' : hf.toFixed(4)}</b></div>
      </div>
      <button type="button" className="btn ghost" onClick={() => { setV(ZERO); setTempo('') }}><RotateCcw size={18} /> Azzera</button>
    </div>
  )
}
