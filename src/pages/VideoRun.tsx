/** Una run di GDA Split in Hitframe: la colleghi all'allenamento, a un drill o allo stage di una gara, e i tempi entrano nelle tue abilità. */
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, Check, Clapperboard, Link2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader, Segmented, useToast } from '../components/ui'
import { db } from '../db/db'
import type { BersaglioColpo, Corsa, TipoBersaglioColpo, TipoIntervallo } from '../db/types'
import { trovaDrill, tuttiDrill, majorDiDefault } from '../allenamento/servizi'
import { fmt } from '../lib/date'
import { CHIAVE_ARRIVO, daRunSplit, metriDa, NOMI_TIPO, provaDaCorsa, sintesiCorsa, valida } from '../video/corse'

const f2 = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2).replace('.', ','))
const TIPI_SCELTA: TipoIntervallo[] = ['split', 'transizione', 'ricarica', 'movimento', 'ricaricaMov', 'lungo']

function leggiArrivo(): Omit<Corsa, 'id'> | null {
  try {
    const raw = localStorage.getItem(CHIAVE_ARRIVO)
    if (!raw) return null
    const r = JSON.parse(raw) as unknown
    return valida(r) ? daRunSplit(r) : null
  } catch {
    return null
  }
}

/** Pagina con chiave sull'id: una run nuova o un'altra run ripartono da zero. */
const FONTE_DATA: Record<NonNullable<Corsa['dataFonte']>, string> = {
  video: 'Presa dai dati del video.',
  file: 'Presa dalla data del file: controlla che sia giusta.',
  manuale: 'Scelta da te.',
  evento: 'Presa dalla sessione o gara collegata.',
  oggi: 'Data da verificare: scegli il giorno in cui hai girato il video.',
}
const dataSicura = (c: Pick<Corsa, 'dataFonte'>) => c.dataFonte === 'video' || c.dataFonte === 'manuale' || c.dataFonte === 'evento'

export default function VideoRunPagina() {
  const { id } = useParams()
  return <VideoRun key={id ?? 'nuova'} id={id} />
}

function VideoRun({ id }: { id?: string }) {
  const nuova = !id
  const navigate = useNavigate()
  const toast = useToast()
  const salvata = useLiveQuery(async () => (id ? (await db.corse.get(Number(id))) ?? null : null), [id])
  const [c, setC] = useState<Omit<Corsa, 'id'> | null>(() => (nuova ? leggiArrivo() : null))
  const [comeProva, setComeProva] = useState(true)
  useEffect(() => { if (!nuova && salvata && !c) setC(salvata) }, [nuova, salvata, c])

  const personali = useLiveQuery(() => db.drillPersonali.toArray()) ?? []
  const profilo = useLiveQuery(() => db.profilo.get('me'))
  const eventi = useLiveQuery(async () => {
    if (!c) return []
    const d0 = new Date(Date.parse(c.data) - 180 * 86_400_000).toISOString().slice(0, 10)
    const d1 = new Date(Date.parse(c.data) + 2 * 86_400_000).toISOString().slice(0, 10)
    return (await db.eventi.where('data').between(d0, d1, true, true).toArray()).sort((a, b) => b.data.localeCompare(a.data))
  }, [c?.data]) ?? []
  const evento = eventi.find((e) => e.id === c?.eventoId)
  const risultato = useLiveQuery(async () => (c?.eventoId ? (await db.risultati.where('eventoId').equals(c.eventoId).first()) ?? null : null), [c?.eventoId])
  const analisi = useLiveQuery(async () => (c?.eventoId ? (await db.analisi.where('eventoId').equals(c.eventoId).first()) ?? null : null), [c?.eventoId])

  const drill = c?.drillId ? trovaDrill(c.drillId, personali) : undefined
  const drillFuoco = useMemo(() => tuttiDrill(personali).filter((d) => d.modalita === 'fuoco'), [personali])
  const drillSessione = evento?.drill?.map((x) => trovaDrill(x, personali)).filter((d): d is NonNullable<typeof d> => !!d && d.modalita === 'fuoco') ?? []
  const numeriStage = risultato ? Object.keys(risultato.valoreStage).map(Number).sort((a, b) => a - b)
    : analisi ? analisi.lettura.sezioni[analisi.sezione]?.stages.map((s) => s.numero) ?? [] : []
  const mioStage = risultato && c?.stage ? risultato.concorrenti.find((x) => x.num === risultato.mioNum)?.stages[c.stage] : undefined

  if (!c) {
    return (
      <div className="page">
        <PageHeader title="Run" />
        <div className="card">
          {nuova ? <p>Non ci sono dati in arrivo da GDA Split. Analizza un video e tocca “Salva in Hitframe”.</p> : <p>Carico…</p>}
          <Link to="/video" className="btn">Torna a Video</Link>
        </div>
      </div>
    )
  }

  const set = <K extends keyof Corsa>(k: K, v: Corsa[K]) => setC((o) => (o ? { ...o, [k]: v } : o))
  const s = sintesiCorsa(c as Corsa)
  // collegando la run a una sessione o a una gara, se la data non viene dal video prende quella dell'evento
  const scegliEvento = (eid: number | null) => setC((o) => {
    if (!o) return o
    const ev = eventi.find((e) => e.id === eid)
    const giorno = ev ? (ev.tipo === 'gara' ? ev.gara?.giornoGara || ev.data : ev.data) : null
    if (ev && giorno && !dataSicura(o)) return { ...o, eventoId: eid, data: giorno, dataFonte: 'evento' }
    return { ...o, eventoId: eid }
  })
  const sceltaDrill = (did: string) => {
    const d = did ? trovaDrill(did, personali) : undefined
    setC((o) => o && { ...o, drillId: did || null, partenzaStandard: d ? /fondina/i.test(d.partenza ?? '') && /resa/i.test(d.partenza ?? '') : o.partenzaStandard, distanzaTipica: o.distanzaTipica ?? metriDa(d?.distanza) })
  }

  const bers = (i: number): BersaglioColpo | null => c.bersagli?.[i] ?? null
  const setBers = (i: number, b: Partial<BersaglioColpo>) => {
    const lista = c.colpi.map((_, j) => c.bersagli?.[j] ?? null)
    const prima = lista[i] ?? { tipo: 'carta' as TipoBersaglioColpo, distanza: null }
    const nuovo = { ...prima, ...b }
    lista[i] = nuovo.tipo === 'carta' && nuovo.distanza == null ? null : nuovo
    set('bersagli', lista)
  }
  const distanzaShot = (i: number) => bers(i)?.distanza ?? null

  async function salva() {
    if (!c) return
    try {
      let dati: Omit<Corsa, 'id'> = { ...c, risultatoId: risultato?.id ?? null, analisiId: analisi?.id ?? null }
      if (c.contesto !== 'gara') dati = { ...dati, stage: null, risultatoId: null, analisiId: null }
      if (c.contesto !== 'allenamento') dati = { ...dati, drillId: null }
      if (c.contesto === 'libero') dati = { ...dati, eventoId: null }
      if (dati.contesto === 'allenamento' && dati.drillId && comeProva && !dati.provaId) {
        const major = profilo ? majorDiDefault(profilo.divisione) : false
        dati.provaId = (await db.prove.add(provaDaCorsa(dati as Corsa, dati.drillId, major))) as number
      }
      if (nuova) {
        const nid = (await db.corse.add(dati as Corsa)) as number
        try { localStorage.removeItem(CHIAVE_ARRIVO) } catch { /* niente */ }
        toast('Run salvata: i tempi entrano nelle tue abilità')
        navigate(`/video/run/${nid}`, { replace: true })
      } else {
        await db.corse.update(Number(id), dati)
        toast('Run aggiornata')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Salvataggio non riuscito')
    }
  }

  async function elimina() {
    if (!id || !confirm('Eliminare questa run? I tempi escono dalle tue abilità.')) return
    await db.corse.delete(Number(id))
    toast('Run eliminata')
    navigate('/video')
  }

  return (
    <div className="page">
      <Link to="/video" className="btn ghost" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><ArrowLeft size={18} /> Video</Link>
      <PageHeader title={nuova ? 'Salva la run' : c.titolo} sub={`${fmt(c.data, 'd MMM yyyy')}${c.file ? ` · ${c.file}` : ''}`} />

      <div className="stats zone" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="stat"><div className="v">{s.colpi}</div><div className="l">Colpi</div></div>
        <div className="stat"><div className="v">{f2(c.tempoTimer ?? s.totale)}</div><div className="l">Tempo</div></div>
        <div className="stat"><div className="v">{f2(s.primo)}</div><div className="l">Primo colpo</div></div>
        <div className="stat"><div className="v">{f2(s.split)}</div><div className="l">Split medio</div></div>
      </div>

      <section className="card form">
        <label className="field"><span>Nome</span><input className="input" value={c.titolo} onChange={(e) => set('titolo', e.target.value)} /></label>
        <label className="field"><span>Data della run</span>
          <input className="input" type="date" value={c.data} onChange={(e) => setC((o) => o && { ...o, data: e.target.value, dataFonte: 'manuale' })} />
          <span className="meta" style={{ color: dataSicura(c) ? undefined : 'var(--accent)' }}>{FONTE_DATA[c.dataFonte ?? 'oggi']}</span>
        </label>
        <div className="field">
          <span>È di</span>
          <Segmented label="Contesto della run" value={c.contesto} onChange={(v) => set('contesto', v)}
            options={[{ value: 'allenamento', label: 'Allenamento' }, { value: 'gara', label: 'Gara' }, { value: 'libero', label: 'Altro' }]} />
        </div>

        {c.contesto === 'allenamento' && (
          <>
            <label className="field"><span>Sessione</span>
              <select className="select" value={c.eventoId ?? ''} onChange={(e) => scegliEvento(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Nessuna sessione in calendario</option>
                {eventi.filter((e) => e.tipo === 'fuoco').map((e) => <option key={e.id} value={e.id}>{fmt(e.data, 'd MMM')} · {e.titolo}</option>)}
              </select>
            </label>
            <label className="field"><span>Drill</span>
              <select className="select" value={c.drillId ?? ''} onChange={(e) => sceltaDrill(e.target.value)}>
                <option value="">Nessun drill (es. stage di allenamento)</option>
                {drillSessione.length > 0 && <optgroup label="Della sessione">{drillSessione.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</optgroup>}
                <optgroup label="Tutti i drill a fuoco">{drillFuoco.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</optgroup>
              </select>
            </label>
            {drill && (
              <p className="prose" style={{ margin: 0, fontSize: 13 }}>
                {drill.misure?.length && c.colpi.length === drill.colpi
                  ? <>I tempi si misurano con le regole del drill ({drill.colpi} colpi): sono i dati più precisi.</>
                  : <><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> Il drill prevede {drill.colpi} colpi, qui ne ho {c.colpi.length}: uso i tipi qui sotto.</>}
              </p>
            )}
            {drill && nuova && (
              <label className="check"><input type="checkbox" checked={comeProva} onChange={(e) => setComeProva(e.target.checked)} /> Aggiungi anche come prova del drill</label>
            )}
          </>
        )}

        {c.contesto === 'gara' && (
          <>
            <label className="field"><span>Gara</span>
              <select className="select" value={c.eventoId ?? ''} onChange={(e) => scegliEvento(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Scegli la gara</option>
                {eventi.filter((e) => e.tipo === 'gara').map((e) => <option key={e.id} value={e.id}>{fmt(e.data, 'd MMM yyyy')} · {e.titolo}</option>)}
              </select>
            </label>
            <label className="field"><span>Stage</span>
              {numeriStage.length ? (
                <select className="select" value={c.stage ?? ''} onChange={(e) => set('stage', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Quale stage?</option>
                  {numeriStage.map((n) => <option key={n} value={n}>Stage {n}</option>)}
                </select>
              ) : (
                <input className="input" inputMode="numeric" placeholder="numero dello stage" value={c.stage ?? ''} onChange={(e) => set('stage', Number(e.target.value) || null)} />
              )}
            </label>
            {mioStage && (
              <p className="prose" style={{ margin: 0, fontSize: 13 }}>
                Dal Verify: {f2(mioStage.tempo)} s, HF {mioStage.hf.toFixed(4).replace('.', ',')}.
                {c.tempoTimer == null && <> <button type="button" className="btn ghost" onClick={() => set('tempoTimer', mioStage.tempo)}>Usa il tempo ufficiale</button></>}
              </p>
            )}
          </>
        )}

        <label className="field"><span>Distanza tipica dei bersagli (m)</span>
          <input className="input" inputMode="numeric" placeholder="es. 7" value={c.distanzaTipica ?? ''} onChange={(e) => set('distanzaTipica', Number(e.target.value.replace(',', '.')) || null)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={c.partenzaStandard} onChange={(e) => set('partenzaStandard', e.target.checked)} />
          Partenza da mani in resa e arma in fondina: il primo colpo vale come estrazione
        </label>
      </section>

      <section className="card">
        <div className="card-title" style={{ marginBottom: 4 }}><span>Colpi e intervalli</span></div>
        <p className="prose" style={{ margin: '0 0 10px', fontSize: 13 }}>
          Sotto 0,5 s è uno split, fino a 1 s una transizione. Le pause più lunghe dimmi tu se sono una ricarica o un movimento: senza, restano fuori dalle statistiche.
          Per ogni colpo puoi indicare se il bersaglio è un ferro, un mini o è più lontano: i tempi finiscono nella fascia giusta e lo split a 15 m non sporca quello a 5 m.
        </p>
        <div className="run-tabella">
          {c.colpi.map((t, i) => {
            const gap = i ? t - c.colpi[i - 1] : t
            const dubbio = c.daVerificare.includes(i)
            return (
              <div key={i} className={`run-riga${c.tipi[i] === 'lungo' ? ' da-indicare' : ''}`}>
                <span className="run-n">{i + 1}</span>
                <span className="run-t">{f2(t)}</span>
                <span className="run-g">{i ? `+${f2(gap)}` : f2(gap)}</span>
                {i === 0 ? <span className="run-tipo">{c.partenzaStandard ? 'Estrazione' : NOMI_TIPO.primo}</span> : (
                  <select className="select run-tipo" aria-label={`Tipo dell'intervallo prima del colpo ${i + 1}`} value={c.tipi[i]}
                    onChange={(e) => set('tipi', c.tipi.map((x, j) => (j === i ? (e.target.value as TipoIntervallo) : x)))}>
                    {TIPI_SCELTA.map((k) => <option key={k} value={k}>{NOMI_TIPO[k]}</option>)}
                  </select>
                )}
                <div className="run-bers">
                  <select className="select" aria-label={`Bersaglio del colpo ${i + 1}`} value={bers(i)?.tipo ?? 'carta'}
                    onChange={(e) => setBers(i, { tipo: e.target.value as TipoBersaglioColpo })}>
                    <option value="carta">Carta</option>
                    <option value="mini">Mini</option>
                    <option value="ferro">Ferro</option>
                  </select>
                  <input className="input" inputMode="numeric" aria-label={`Distanza del colpo ${i + 1} in metri`}
                    placeholder={c.distanzaTipica ? `${c.distanzaTipica} m` : 'm'} value={distanzaShot(i) ?? ''}
                    onChange={(e) => setBers(i, { distanza: Number(e.target.value.replace(',', '.')) || null })} />
                </div>
                {dubbio && (
                  <button type="button" className="btn ghost run-dubbio" title="GDA Split l'aveva segnato da verificare: escluso dalle statistiche"
                    onClick={() => set('daVerificare', c.daVerificare.filter((x) => x !== i))}>
                    <AlertTriangle size={15} /> Da verificare: tocca se il colpo è giusto
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card form">
        <label className="field"><span><Link2 size={14} style={{ verticalAlign: -2 }} /> Link al video (facoltativo)</span>
          <input className="input" type="url" placeholder="YouTube, Instagram, Drive…" value={c.link} onChange={(e) => set('link', e.target.value)} />
        </label>
        <label className="field"><span>Note</span><textarea className="input" rows={2} value={c.note} onChange={(e) => set('note', e.target.value)} /></label>
        <p className="prose" style={{ margin: 0, fontSize: 12.5 }}>Il video non viene salvato in Hitframe: restano solo i tempi dei colpi, che si sincronizzano tra i tuoi dispositivi.</p>
      </section>

      <div className="row">
        {!nuova && <button className="btn ghost" onClick={elimina}><Trash2 size={18} /> Elimina</button>}
        <div className="spacer" />
        <Link to="/video" className="btn">Annulla</Link>
        <button className="btn primary" onClick={salva}><Check size={18} /> {nuova ? 'Salva in Hitframe' : 'Salva modifiche'}</button>
      </div>
      {!nuova && c.provaId && c.drillId && (
        <Link to={`/allenamento/${c.drillId}`} className="item"><Clapperboard size={18} /> <span>Vedi la prova nel drill {drill?.nome}</span></Link>
      )}
    </div>
  )
}
