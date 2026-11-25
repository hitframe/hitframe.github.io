import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Mic, Play, Repeat, RotateCcw, Save, Settings2, Square, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProvaForm from '../components/ProvaForm'
import { PageHeader, Segmented, useToast } from '../components/ui'
import { obiettivoPer } from '../allenamento/drills'
import { fmt2, trovaDrill, tuttiDrill } from '../allenamento/servizi'
import { db, getImp, normalizzaProfilo, setImp } from '../db/db'
import { OPZIONI_DEFAULT, ShotTimer, type OpzioniTimer, type Ritardo, type StatoTimer } from '../timer/motore'

const ETICHETTE: Record<StatoTimer, string> = {
  pronto: 'Pronto',
  attesa: 'Standby…',
  ascolto: 'In ascolto',
  fermo: 'Fermo',
}

export default function Timer() {
  const [params] = useSearchParams()
  const toast = useToast()
  const personali = useLiveQuery(() => db.drillPersonali.toArray()) ?? []
  const profilo = useLiveQuery(async () => normalizzaProfilo(await db.profilo.get('me')))
  const [drillId, setDrillId] = useState(params.get('drill') ?? '')
  const drillParam = params.get('drill')
  useEffect(() => {
    if (drillParam !== null) setDrillId(drillParam)
  }, [drillParam])
  const drill = drillId ? trovaDrill(drillId, personali) : undefined

  const [modo, setModo] = useState<'fuoco' | 'bianco'>(drill?.modalita ?? 'fuoco')
  const [opz, setOpz] = useState<OpzioniTimer>(OPZIONI_DEFAULT)
  const [parTxt, setParTxt] = useState('')
  const [stato, setStato] = useState<StatoTimer>('pronto')
  const [colpi, setColpi] = useState<number[]>([])
  const [livello, setLivello] = useState(0)
  const [errore, setErrore] = useState('')
  const [impostazioni, setImpostazioni] = useState(false)
  const [salva, setSalva] = useState(false)
  const [parFlash, setParFlash] = useState(false)
  const timerRef = useRef<ShotTimer | null>(null)
  // ripetizione automatica: dopo ogni giro riparte da solo dopo il recupero
  const [ciclo, setCiclo] = useState<{ attivo: boolean; recupero: number; giri: number }>({ attivo: false, recupero: 5, giri: 0 })
  const [inCiclo, setInCiclo] = useState(false)
  const [giro, setGiro] = useState(0)
  const [conto, setConto] = useState<number | null>(null)
  const [esiti, setEsiti] = useState<{ ok: number; ko: number }>({ ok: 0, ko: 0 })
  const cicloRef = useRef({ inCiclo: false, attesa: 0 as number | undefined })
  useEffect(() => {
    getImp<Partial<typeof ciclo>>('timer-ciclo', {}).then((c) => setCiclo((p) => ({ ...p, ...c })))
  }, [])
  const salvaCiclo = (c: typeof ciclo) => { setCiclo(c); setImp('timer-ciclo', c) }

  // opzioni ricordate tra una sessione e l'altra
  useEffect(() => {
    getImp<Partial<OpzioniTimer>>('timer', {}).then((o) => setOpz((p) => ({ ...p, ...o, par: null })))
  }, [])
  const salvaOpzioni = useCallback((o: OpzioniTimer) => {
    setOpz(o)
    const { par: _par, ...resto } = o
    void _par
    setImp('timer', resto)
    timerRef.current?.impostaSoglia(o.soglia, o.intervalloMinimo)
  }, [])

  // par proposto dal drill scelto
  useEffect(() => {
    if (drill) {
      setModo(drill.modalita)
      if (drill.modalita === 'bianco' && profilo) setParTxt(obiettivoPer(drill, profilo.classe).toFixed(2).replace('.', ','))
    }
  }, [drill?.id, profilo?.classe]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = new ShotTimer({
      stato: setStato,
      colpo: () => setColpi([...t.colpi]),
      livello: setLivello,
      par: () => { setParFlash(true); setTimeout(() => setParFlash(false), 400) },
      errore: (m) => setErrore(m),
    })
    timerRef.current = t
    return () => t.chiudi()
  }, [])

  const par = (() => {
    const n = Number(parTxt.replace(',', '.'))
    return parTxt.trim() && Number.isFinite(n) && n > 0 ? n : null
  })()

  async function giroSingolo() {
    setColpi([])
    await timerRef.current?.avvia({ ...opz, par, microfono: modo === 'fuoco' })
  }

  async function avvia() {
    setErrore('')
    if (modo === 'bianco' && !par) {
      setErrore('In bianco serve un par time.')
      return
    }
    if (ciclo.attivo) {
      cicloRef.current.inCiclo = true
      setInCiclo(true)
      setGiro(1)
      setEsiti({ ok: 0, ko: 0 })
    }
    await giroSingolo()
  }

  function fermaTutto() {
    cicloRef.current.inCiclo = false
    window.clearInterval(cicloRef.current.attesa)
    setInCiclo(false)
    setConto(null)
    timerRef.current?.ferma()
  }

  // a fine giro, se la ripetizione è attiva, conta il recupero e riparte
  useEffect(() => {
    if (stato !== 'fermo' || !cicloRef.current.inCiclo) return
    if (ciclo.giri && giro >= ciclo.giri) { cicloRef.current.inCiclo = false; setInCiclo(false); toast(`Serie finita: ${giro} ripetizioni`); return }
    let resta = ciclo.recupero
    setConto(resta)
    window.clearInterval(cicloRef.current.attesa)
    cicloRef.current.attesa = window.setInterval(() => {
      resta -= 1
      if (!cicloRef.current.inCiclo) { window.clearInterval(cicloRef.current.attesa); setConto(null); return }
      if (resta <= 0) {
        window.clearInterval(cicloRef.current.attesa)
        setConto(null)
        setGiro((g) => g + 1)
        void giroSingolo()
      } else setConto(resta)
    }, 1000)
  }, [stato]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearInterval(cicloRef.current.attesa), [])

  async function provaMicrofono() {
    setErrore('')
    try {
      await timerRef.current?.apriMicrofono(opz.soglia, opz.intervalloMinimo)
      toast('Microfono attivo: guarda il livello')
    } catch {
      setErrore('Permesso del microfono negato.')
    }
  }

  function rimuovi(i: number) {
    timerRef.current?.rimuoviColpo(i)
    setColpi([...(timerRef.current?.colpi ?? [])])
  }

  const ultimo = colpi.length ? colpi[colpi.length - 1] : null
  const attivo = stato === 'attesa' || stato === 'ascolto'
  const elenco = useMemo(() => tuttiDrill(personali), [personali])
  const obiettivo = drill && profilo ? obiettivoPer(drill, profilo.classe) : null

  return (
    <div className="page">
      <PageHeader
        title="Timer"
        sub={modo === 'fuoco' ? 'Shot timer: i colpi si rilevano dal microfono' : 'In bianco: beep di partenza e par time'}
        actions={<button className="btn icon" onClick={() => setImpostazioni((v) => !v)} aria-label="Impostazioni timer" aria-expanded={impostazioni}><Settings2 size={20} /></button>}
      />

      <div className="fields-2">
        <Segmented label="Modalità" value={modo} onChange={(v) => { setModo(v); setColpi([]) }}
          options={[{ value: 'fuoco', label: 'A fuoco' }, { value: 'bianco', label: 'In bianco' }]} />
        <select className="select" aria-label="Drill" value={drillId} onChange={(e) => setDrillId(e.target.value)}>
          <option value="">Nessun drill</option>
          {elenco.filter((d) => d.modalita === modo).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
      </div>

      {impostazioni && (
        <section className="card form">
          <div className="field">
            <span className="label">Partenza</span>
            <Segmented<Ritardo> label="Ritardo partenza" value={opz.ritardo} onChange={(v) => salvaOpzioni({ ...opz, ritardo: v })}
              options={[{ value: 'casuale', label: `Casuale ${opz.ritardoMin}–${opz.ritardoMax} s` }, { value: 'fisso', label: `Fisso ${opz.ritardoFisso} s` }, { value: 'immediato', label: 'Subito' }]} />
          </div>
          {modo === 'fuoco' && (
            <>
              <div className="field">
                <label htmlFor="t-soglia">Sensibilità microfono</label>
                <input id="t-soglia" type="range" min={0.05} max={0.95} step={0.05} value={1 - opz.soglia + 0.05}
                  onChange={(e) => salvaOpzioni({ ...opz, soglia: Math.round((1.05 - Number(e.target.value)) * 100) / 100 })} />
                <div className="meter-mic" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, livello * 100)}%` }} />
                  <i style={{ left: `${opz.soglia * 100}%` }} />
                </div>
                <span className="hint">La linea gialla è la soglia: un colpo deve superarla, voci e rumori no. Con molti tiratori vicini abbassa la sensibilità.</span>
                <div className="row"><button className="btn" onClick={provaMicrofono}><Mic size={18} /> Prova microfono</button></div>
              </div>
              <div className="field">
                <label htmlFor="t-eco">Intervallo minimo tra colpi (anti eco): {Math.round(opz.intervalloMinimo * 1000)} ms</label>
                <input id="t-eco" type="range" min={0.04} max={0.15} step={0.01} value={opz.intervalloMinimo}
                  onChange={(e) => salvaOpzioni({ ...opz, intervalloMinimo: Number(e.target.value) })} />
              </div>
            </>
          )}
        </section>
      )}

      <section className={`timer-display${parFlash ? ' flash' : ''}`} aria-live="polite">
        <div className="timer-stato">
          {inCiclo && conto != null ? `Recupero · riparte tra ${conto} s` : ETICHETTE[stato]}{modo === 'fuoco' && attivo ? ` · ${colpi.length} colpi` : ''}
          {inCiclo && <> · ripetizione {giro}{ciclo.giri ? ` di ${ciclo.giri}` : ''}</>}
        </div>
        <div className="timer-tempo">{modo === 'fuoco' ? fmt2(ultimo ?? 0) : par ? fmt2(par) : '—'}</div>
        <div className="timer-sub">
          {modo === 'fuoco' && colpi.length > 0 && <>Primo {fmt2(colpi[0])} · Split medio {colpi.length > 1 ? fmt2((colpi[colpi.length - 1] - colpi[0]) / (colpi.length - 1)) : '—'}</>}
          {modo === 'bianco' && 'Il secondo beep è il par: lo scatto deve arrivare prima'}
        </div>
        {obiettivo && <div className="timer-sub">Obiettivo {profilo?.classe}: {fmt2(obiettivo)} s</div>}
        {modo === 'fuoco' && attivo && (
          <div className="meter-mic" aria-hidden="true" style={{ marginTop: 12 }}>
            <span style={{ width: `${Math.min(100, livello * 100)}%` }} />
            <i style={{ left: `${opz.soglia * 100}%` }} />
          </div>
        )}
      </section>

      {inCiclo && modo === 'bianco' && (
        <div className="row timer-esiti">
          <button className="btn grande" onClick={() => setEsiti((e) => ({ ...e, ok: e.ok + 1 }))}><Check size={20} /> Dentro il par · {esiti.ok}</button>
          <button className="btn grande" onClick={() => setEsiti((e) => ({ ...e, ko: e.ko + 1 }))}><X size={20} /> Fuori · {esiti.ko}</button>
        </div>
      )}

      <div className="field">
        <label htmlFor="t-par">Par time (s){modo === 'fuoco' ? ' · facoltativo' : ''}</label>
        <input id="t-par" className="input" inputMode="decimal" value={parTxt} onChange={(e) => setParTxt(e.target.value)} placeholder={modo === 'fuoco' ? 'Nessuno' : 'Es. 1,10'} disabled={attivo} />
      </div>

      {errore && <div role="alert" className="card" style={{ borderColor: 'var(--accent)', color: 'var(--accent-strong)', fontWeight: 600 }}>{errore}</div>}

      <div className="row timer-azioni">
        {attivo || inCiclo ? (
          <button className="btn primary grande" onClick={fermaTutto}><Square size={22} /> Stop{inCiclo ? ' serie' : ''}</button>
        ) : (
          <button className="btn primary grande" onClick={avvia}><Play size={22} /> Start</button>
        )}
        {!attivo && !inCiclo && colpi.length > 0 && (
          <button className="btn grande" onClick={() => { setColpi([]); setStato('pronto') }}><RotateCcw size={20} /> Azzera</button>
        )}
        {!attivo && !inCiclo && (colpi.length > 0 || (modo === 'bianco' && stato === 'fermo')) && (
          <button className="btn grande" onClick={() => setSalva(true)}><Save size={20} /> Salva prova</button>
        )}
      </div>

      <section className="card form timer-ciclo">
        <label className="row" style={{ gap: 10, fontWeight: 600 }}>
          <input type="checkbox" checked={ciclo.attivo} disabled={inCiclo} onChange={(e) => salvaCiclo({ ...ciclo, attivo: e.target.checked })} />
          <Repeat size={18} /> Ripeti da solo
        </label>
        {ciclo.attivo && !inCiclo && (
          <>
            <div className="field">
              <span className="label">Recupero tra una ripetizione e l’altra</span>
              <div className="chips">{[3, 5, 8, 10, 15, 20].map((r) => <button key={r} type="button" className={`chip${ciclo.recupero === r ? ' on' : ''}`} disabled={inCiclo} onClick={() => salvaCiclo({ ...ciclo, recupero: r })}>{r} s</button>)}</div>
            </div>
            <div className="field">
              <span className="label">Ripetizioni</span>
              <div className="chips">{[0, 5, 10, 20, 30].map((g) => <button key={g} type="button" className={`chip${ciclo.giri === g ? ' on' : ''}`} disabled={inCiclo} onClick={() => salvaCiclo({ ...ciclo, giri: g })}>{g === 0 ? 'Senza fine' : g}</button>)}</div>
            </div>
            <span className="hint">Premi Start una volta: dopo ogni ripetizione conta il recupero e riparte con un nuovo beep{opz.ritardo === 'casuale' ? ' casuale' : ''}. Stop ferma la serie.{modo === 'bianco' ? ' Durante il recupero puoi segnare se eri dentro il par.' : ''}</span>
          </>
        )}
      </section>

      {modo === 'fuoco' && colpi.length > 0 && (
        <section className="card">
          <div className="card-title">Colpi</div>
          <table className="colpi">
            <thead><tr><th>#</th><th>Tempo</th><th>Split</th><th><span className="sr-only">Elimina</span></th></tr></thead>
            <tbody>
              {colpi.map((c, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{fmt2(c)}</td>
                  <td>{i ? fmt2(c - colpi[i - 1]) : '—'}</td>
                  <td>{!attivo && <button className="btn icon ghost" onClick={() => rimuovi(i)} aria-label={`Elimina colpo ${i + 1} (eco)`}><X size={16} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="prose" style={{ fontSize: 12, margin: '8px 0 0' }}>Un colpo in più rilevato è quasi sempre un’eco o il colpo del vicino: eliminalo con la ×.</p>
        </section>
      )}

      {salva && (
        <ProvaForm
          drillId={drillId || undefined}
          colpi={modo === 'fuoco' ? colpi : []}
          tempo={modo === 'fuoco' ? ultimo : par}
          par={par}
          modalita={modo}
          onClose={() => setSalva(false)}
        />
      )}
    </div>
  )
}
