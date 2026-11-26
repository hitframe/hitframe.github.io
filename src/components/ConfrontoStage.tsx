/** Il video di gara confrontato con lo studio dello stage: tempo stimato e reale, posizione per posizione. */
import { useLiveQuery } from 'dexie-react-hooks'
import { Clapperboard, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { confrontaRun, NOMI_STILE, strategie } from '../analisi/schema'
import { stageDellaRun } from '../analisi/useCorrezione'
import { db, normalizzaProfilo } from '../db/db'
import type { Corsa } from '../db/types'
import { fmt } from '../lib/date'

const f2 = (n: number) => n.toFixed(2).replace('.', ',')
const delta = (stim: number, real: number | null) => {
  if (real == null) return null
  const d = real - stim
  return <i className={d > 0.15 ? 'peggio' : d < -0.15 ? 'meglio' : ''}>{d > 0 ? '+' : ''}{f2(d)}</i>
}

export default function ConfrontoStage({ c, mostraRun = false }: { c: Corsa; mostraRun?: boolean }) {
  const dati = useLiveQuery(async () => {
    if (c.analisiId == null) return null
    const [a, p] = await Promise.all([db.analisi.get(c.analisiId), db.profilo.get('me')])
    return { a, profilo: normalizzaProfilo(p) }
  }, [c.analisiId])
  if (!dati?.a) return null
  const x = stageDellaRun(c, dati.a)
  if (!x) return null
  const link = `/analisi-gara/${c.analisiId}/stage/${c.stage}`
  if (!x.schema) {
    return (
      <section className="card">
        <div className="card-title"><span><MapPin size={18} style={{ verticalAlign: -3 }} /> Studio dello stage {c.stage}</span></div>
        <p className="prose" style={{ margin: 0 }}>Questo stage non è ancora segnato sul disegno: segnalo (P, posizioni, bersagli) e qui vedrai il confronto tra la strategia e quello che hai fatto davvero.</p>
        <Link to={link} className="btn" style={{ marginTop: 10 }}>Apri lo studio dello stage</Link>
      </section>
    )
  }
  const piani = strategie(x.schema, x.s, dati.profilo, undefined, 1)
  const st = piani?.tutte.find((y) => y.stile === piani.consigliata)
  if (!st) return null
  const k = confrontaRun(st, x.schema, c.colpi, c.tempoTimer)
  const d = k.reale - k.stimato
  return (
    <section className="card confronto-video">
      <div className="card-title">
        <span>{mostraRun ? <><Clapperboard size={18} style={{ verticalAlign: -3 }} /> {c.titolo}</> : <>Video e studio · stage {c.stage}</>}</span>
        {mostraRun ? <Link to={`/video/run/${c.id}`}>Apri la run</Link> : <Link to={link}>Studio</Link>}
      </div>
      {mostraRun && <p className="meta" style={{ margin: '-4px 0 8px' }}>{fmt(c.data, 'd MMM yyyy')} · {c.file}</p>}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="stat"><div className="v">{f2(k.stimato)}</div><div className="l">stimato ({NOMI_STILE[k.stile].toLowerCase()})</div></div>
        <div className="stat"><div className="v">{f2(k.reale)}</div><div className="l">reale{c.tempoTimer != null ? ' (timer)' : ' (ultimo colpo)'}</div></div>
        <div className="stat"><div className="v" style={{ color: d > 0.3 ? 'var(--fuoco)' : d < -0.3 ? 'var(--ok)' : undefined }}>{d > 0 ? '+' : ''}{f2(d)}</div><div className="l">{d > 0.3 ? 'più lento della stima' : d < -0.3 ? 'più veloce della stima' : 'come previsto'}</div></div>
      </div>
      {k.perPosizione ? (
        <table className="tabella-storico" style={{ marginTop: 12 }}>
          <thead><tr><th>Pos.</th><th>Arrivo stim. → reale</th><th>Tiro stim. → reale</th></tr></thead>
          <tbody>
            {k.perPosizione.map((p) => (
              <tr key={p.id}>
                <td><b>{p.id}</b> <span className="meta">{p.colpi} c.</span></td>
                <td>{f2(p.arrivoStimato)} → {p.arrivoReale != null ? f2(p.arrivoReale) : '—'} {delta(p.arrivoStimato, p.arrivoReale)}</td>
                <td>{f2(p.tiroStimato)} → {p.tiroReale != null ? f2(p.tiroReale) : '—'} {delta(p.tiroStimato, p.tiroReale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="prose" style={{ margin: '10px 0 0', fontSize: 13 }}>
          Nel video ci sono {k.colpiRilevati} colpi, lo schema ne prevede {k.colpiAttesi}: il confronto posizione per posizione si attiva quando coincidono
          (togli gli echi o aggiungi le ribattute nella run).
        </p>
      )}
      <p className="meta" style={{ margin: '8px 0 0' }}>Arrivo = dal colpo prima (o dal beep) al primo colpo nella posizione, movimenti e ricariche compresi. Le stime dei prossimi stage si correggono con i tuoi video.</p>
    </section>
  )
}
