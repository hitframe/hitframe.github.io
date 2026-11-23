import { useLiveQuery } from 'dexie-react-hooks'
import { FileSearch, FileUp, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Empty, PageHeader } from '../components/ui'
import { importaPdf } from '../analisi/importa'
import { db } from '../db/db'

export default function AnalisiGare() {
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [lettura, setLettura] = useState(false)
  const [errore, setErrore] = useState('')
  const [trascina, setTrascina] = useState(false)
  const analisi = useLiveQuery(() => db.analisi.orderBy('creato').reverse().toArray()) ?? []
  const [sp] = useSearchParams()
  const eventoId = Number(sp.get('evento')) || null
  const gara = useLiveQuery(async () => (eventoId ? (await db.eventi.get(eventoId)) ?? null : null), [eventoId])

  async function carica(file: File | undefined) {
    if (!file) return
    setErrore('')
    setLettura(true)
    try {
      const id = await importaPdf(file, gara?.id ?? null)
      nav(`/analisi-gara/${id}`)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Lettura non riuscita.')
    } finally {
      setLettura(false)
    }
  }

  return (
    <div className="page">
      <PageHeader title="Analisi gara" sub="Carica la locandina della gara (PDF): Hitframe legge gli stage e prepara il tuo piano" />

      <div
        className={`dropzone${trascina ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setTrascina(true) }}
        onDragLeave={() => setTrascina(false)}
        onDrop={(e) => { e.preventDefault(); setTrascina(false); carica(e.dataTransfer.files[0]) }}
      >
        {lettura ? (
          <>
            <Loader2 size={34} className="spin" color="var(--accent)" />
            <div className="title">Sto leggendo il PDF…</div>
          </>
        ) : (
          <>
            <FileUp size={34} color="var(--accent)" />
            <div className="title">PDF della gara (briefing FITDS)</div>
            <div className="meta">{gara ? <>Lo collego alla gara <b>{gara.titolo}</b>.</> : 'Funziona offline e arriva anche sugli altri tuoi dispositivi.'}</div>
            <button className="btn primary" onClick={() => fileRef.current?.click()}><FileUp size={18} /> Scegli PDF</button>
          </>
        )}
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; carica(f) }} />
      </div>
      {errore && <div role="alert" className="card" style={{ borderColor: 'var(--accent)', color: 'var(--accent-strong)', fontWeight: 600 }}>{errore}</div>}

      <section className="card">
        <div className="card-title">Gare analizzate</div>
        {analisi.length ? (
          <div className="list">
            {analisi.map((a) => {
              const sez = a.lettura.sezioni[a.sezione] ?? a.lettura.sezioni[0]
              const colpi = sez.stages.reduce((t, s) => t + s.colpi, 0)
              return (
                <Link key={a.id} to={`/analisi-gara/${a.id}`} className="item">
                  <FileSearch size={22} color="var(--accent)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title">{sez.info.nome || a.nomeFile}</div>
                    <div className="meta">
                      {[sez.info.date, sez.info.livello, `${sez.stages.length} stage · ${colpi} colpi`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {a.lettura.sezioni.length > 1 && <span className="badge">{sez.etichetta}</span>}
                </Link>
              )
            })}
          </div>
        ) : (
          <Empty text="Nessuna gara ancora. Carica il PDF di briefing: lo trovi sulla pagina della gara su MA.RE. o sul sito del club." />
        )}
      </section>
    </div>
  )
}
