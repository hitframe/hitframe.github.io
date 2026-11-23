import { useLiveQuery } from 'dexie-react-hooks'
import { Check, FileSearch, Medal, Plus, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import EventoForm from '../components/EventoForm'
import { Empty, PageHeader } from '../components/ui'
import { db } from '../db/db'
import type { Evento } from '../db/types'
import { capitalize, fmtLungo, giorniDa, oggiKey } from '../lib/date'
import { MARE_URL, linkIscrizione } from '../lib/mare'
import { ExternalLink } from 'lucide-react'

/** Una gara è una scheda sola: prima (libretto, studio) e dopo (risultati). */
export default function Gare() {
  const oggi = oggiKey()
  const gare = useLiveQuery(() => db.eventi.where('tipo').equals('gara').toArray()) ?? []
  const analisi = useLiveQuery(() => db.analisi.toArray()) ?? []
  const risultati = useLiveQuery(() => db.risultati.toArray()) ?? []
  const [form, setForm] = useState<{ e?: Evento } | null>(null)

  const prossime = gare.filter((g) => (g.dataFine || g.data) >= oggi).sort((a, b) => a.data.localeCompare(b.data))
  const passate = gare.filter((g) => (g.dataFine || g.data) < oggi).sort((a, b) => b.data.localeCompare(a.data))
  const vicino = (g: Evento, data: string) => Math.abs(Date.parse(data) - Date.parse(g.dataFine || g.data)) <= 3 * 86400000
  const risultatoDi = (g: Evento) => risultati.find((r) => r.eventoId === g.id) ?? risultati.find((r) => !r.eventoId && vicino(g, r.data))
  const analisiDi = (g: Evento) => analisi.find((a) => a.eventoId === g.id)
  const collegati = new Set(gare.flatMap((g) => [risultatoDi(g)?.id]).filter(Boolean))
  const sciolti = risultati.filter((r) => !collegati.has(r.id))

  const scheda = (g: Evento, futura: boolean) => {
    const an = analisiDi(g)
    const ri = risultatoDi(g)
    const me = ri?.concorrenti.find((c) => c.num === ri.mioNum)
    const gg = giorniDa(g.data)
    return (
      <div key={g.id} className="card" style={{ padding: 14 }}>
        <button onClick={() => setForm({ e: g })} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
          <div className="row">
            <Trophy size={18} color="var(--gara)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title" style={{ fontWeight: 700 }}>{g.titolo}</div>
              <div className="meta" style={{ color: 'var(--muted)', fontSize: 13 }}>{capitalize(fmtLungo(g.data))}{g.luogo ? ` · ${g.luogo}` : ''}</div>
            </div>
            {futura && <span className="badge" style={{ color: gg <= 7 ? 'var(--accent)' : undefined }}>{gg === 0 ? 'oggi' : `tra ${gg} g`}</span>}
          </div>
        </button>
        <div className="chips" style={{ marginTop: 10 }}>
          {g.gara?.iscritto ? <span className="badge" style={{ color: 'var(--ok)' }}><Check size={12} /> iscritto</span> : futura ? (
            <a href={linkIscrizione(g.gara?.iscrizioneUrl)} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--accent)', padding: '6px 10px' }}><ExternalLink size={12} /> Iscriviti su MA.RE.</a>
          ) : null}
          {an ? <Link to={`/analisi-gara/${an.id}`} className="badge" style={{ padding: '6px 10px' }}><FileSearch size={12} /> Locandina e studio</Link>
            : <Link to="/analisi-gara" className="badge" style={{ padding: '6px 10px' }}><Plus size={12} /> Carica la locandina</Link>}
          {ri ? <Link to={`/risultati/${ri.id}`} className="badge" style={{ padding: '6px 10px', color: 'var(--accent)' }}><Medal size={12} /> {me ? `${me.pos}° · ${me.pct.toFixed(1).replace('.', ',')}%` : 'Risultati'}</Link>
            : !futura ? <Link to="/risultati" className="badge" style={{ padding: '6px 10px' }}><Plus size={12} /> Carica i risultati</Link> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Le mie gare" sub="Prima della gara la locandina e lo studio, dopo i risultati"
        actions={<>
          <button className="btn primary" onClick={() => setForm({})}><Plus size={18} /> Gara</button>
          <a className="btn" href={MARE_URL} target="_blank" rel="noreferrer"><ExternalLink size={16} /> MA.RE.</a>
        </>} />
      <div className="card-title" style={{ marginBottom: -8 }}>In arrivo</div>
      {prossime.length ? prossime.map((g) => scheda(g, true)) : <div className="card"><Empty text="Nessuna gara in calendario." action={<Link to="/analisi-gara" className="btn"><FileSearch size={18} /> Crea dal PDF della locandina</Link>} /></div>}
      {passate.length > 0 && <><div className="card-title" style={{ marginBottom: -8 }}>Disputate</div>{passate.map((g) => scheda(g, false))}</>}
      {sciolti.length > 0 && (
        <section className="card">
          <div className="card-title">Risultati non collegati al calendario</div>
          <div className="list">
            {sciolti.sort((a, b) => b.data.localeCompare(a.data)).map((r) => {
              const me = r.concorrenti.find((c) => c.num === r.mioNum)
              return (
                <Link key={r.id} to={`/risultati/${r.id}`} className="item">
                  <Medal size={18} color="var(--accent)" />
                  <div style={{ flex: 1 }}><div className="title">{r.gara}</div><div className="meta">{r.data.split('-').reverse().join('/')} · {me?.pos}° su {r.concorrenti.length}</div></div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
      {form && <EventoForm key={form.e?.id ?? 'nuova'} evento={form.e} tipo="gara" onClose={() => setForm(null)} />}
    </div>
  )
}
