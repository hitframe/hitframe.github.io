import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Clapperboard, PenLine, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import DiarioForm from '../components/DiarioForm'
import { useRunPerGiorno } from '../components/RunDelGiorno'
import { Empty, PageHeader } from '../components/ui'
import { db } from '../db/db'
import type { VoceDiario } from '../db/types'
import { capitalize, fmt, quando } from '../lib/date'

export default function Diario() {
  const runGiorno = useRunPerGiorno()
  const [form, setForm] = useState<{ voce?: VoceDiario } | null>(null)
  const [cerca, setCerca] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const voci = useLiveQuery(() => db.diario.orderBy('data').reverse().toArray()) ?? []
  const eventi = useLiveQuery(() => db.eventi.toArray()) ?? []
  const nomeEvento = useMemo(() => new Map(eventi.map((e) => [e.id, e.titolo])), [eventi])
  const tuttiTag = useMemo(() => [...new Set(voci.flatMap((v) => v.tag))].sort(), [voci])

  const filtrate = voci.filter((v) => {
    if (tag && !v.tag.includes(tag)) return false
    if (!cerca.trim()) return true
    const q = cerca.toLowerCase()
    return v.titolo.toLowerCase().includes(q) || v.testo.toLowerCase().includes(q)
  })

  const perMese = useMemo(() => {
    const gruppi: { mese: string; voci: VoceDiario[] }[] = []
    for (const v of filtrate) {
      const m = v.data.slice(0, 7)
      const ultimo = gruppi[gruppi.length - 1]
      if (ultimo?.mese === m) ultimo.voci.push(v)
      else gruppi.push({ mese: m, voci: [v] })
    }
    return gruppi
  }, [filtrate])

  return (
    <div className="page">
      <PageHeader
        title="Diario"
        sub="Sessioni, sensazioni e lezioni imparate"
        actions={<button className="btn primary" onClick={() => setForm({})}><PenLine size={18} /> Scrivi</button>}
      />

      {voci.length > 0 && (
        <div className="form" style={{ gap: 10 }}>
          <div className="field" style={{ position: 'relative' }}>
            <label htmlFor="cerca" className="sr-only">Cerca nel diario</label>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--faint)' }} aria-hidden="true" />
            <input id="cerca" className="input" style={{ paddingLeft: 38 }} placeholder="Cerca nel diario" value={cerca} onChange={(e) => setCerca(e.target.value)} />
          </div>
          {tuttiTag.length > 0 && (
            <div className="chips">
              <button className="btn" style={{ minHeight: 34, padding: '0 12px' }} aria-pressed={tag === null} onClick={() => setTag(null)}>Tutte</button>
              {tuttiTag.map((t) => (
                <button key={t} className="btn" style={{ minHeight: 34, padding: '0 12px', ...(tag === t ? { borderColor: 'var(--accent)', color: 'var(--text)' } : {}) }}
                  aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {voci.length === 0 ? (
        <div className="card">
          <Empty
            icon={<BookOpen size={36} color="var(--faint)" />}
            text="Il diario è vuoto. Scrivi dopo ogni sessione: cosa ha funzionato, cosa no, come ti sentivi."
            action={<button className="btn primary" onClick={() => setForm({})}><PenLine size={18} /> Prima voce</button>}
          />
        </div>
      ) : filtrate.length === 0 ? (
        <div className="card"><Empty text="Nessuna voce trovata." /></div>
      ) : (
        perMese.map((g) => (
          <section key={g.mese} className="form" style={{ gap: 8 }}>
            <div className="nav-section" style={{ padding: '4px 2px' }}>{capitalize(fmt(`${g.mese}-01`, 'MMMM yyyy'))}</div>
            <div className="list">
              {g.voci.map((v) => (
                <button key={v.id} className="item" onClick={() => setForm({ voce: v })} style={{ alignItems: 'flex-start' }}>
                  <div className="datebox" aria-hidden="true">
                    <div className="d">{fmt(v.data, 'd')}</div>
                    <div className="m">{fmt(v.data, 'EEE')}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title">{v.titolo}</div>
                    <div className="meta">
                      {quando(v.data)}
                      {v.eventoId && nomeEvento.get(v.eventoId) ? ` · ${nomeEvento.get(v.eventoId)}` : ''}
                    </div>
                    {v.testo && (
                      <div className="meta" style={{ marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {v.testo}
                      </div>
                    )}
                    <div className="chips" style={{ marginTop: 8 }}>
                      <span className="badge">Umore {v.umore}/5</span>
                      <span className="badge">Focus {v.concentrazione}/5</span>
                      {runGiorno.get(v.data) ? <span className="badge"><Clapperboard size={12} style={{ verticalAlign: -1 }} /> {runGiorno.get(v.data)} run dal video</span> : null}
                      {v.tag.map((t) => <span key={t} className="badge">{t}</span>)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {form && <DiarioForm key={form.voce?.id ?? 'nuova'} voce={form.voce} onClose={() => setForm(null)} />}
    </div>
  )
}
