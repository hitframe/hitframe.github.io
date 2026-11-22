/** Le run di GDA Split di un giorno (o di una sessione), con i tempi principali: per il diario. */
import { useLiveQuery } from 'dexie-react-hooks'
import { Clapperboard } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { sintesiCorsa } from '../video/corse'

const f2 = (n: number | null) => (n == null ? '—' : n.toFixed(2).replace('.', ','))

export default function RunDelGiorno({ data, eventoId }: { data: string; eventoId: number | null }) {
  const corse = useLiveQuery(async () => {
    const delGiorno = await db.corse.where('data').equals(data).toArray()
    const diSessione = eventoId ? await db.corse.where('eventoId').equals(eventoId).toArray() : []
    const visti = new Set<number>()
    return [...delGiorno, ...diSessione].filter((c) => c.id != null && !visti.has(c.id) && (visti.add(c.id), true))
  }, [data, eventoId]) ?? []
  if (!corse.length) return null
  const tutti = corse.map(sintesiCorsa)
  const splits = tutti.map((s) => s.split).filter((x): x is number => x != null)
  return (
    <div className="field">
      <span className="label"><Clapperboard size={14} style={{ verticalAlign: -2 }} /> Run del giorno dai video · {corse.length}{splits.length ? ` · split medio ${f2(splits.reduce((a, b) => a + b, 0) / splits.length)}` : ''}</span>
      <div className="list">
        {corse.map((c, i) => (
          <Link key={c.id} to={`/video/run/${c.id}`} className="item" style={{ minHeight: 44 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title">{c.titolo}</div>
              <div className="meta">{tutti[i].colpi} colpi · {f2(c.tempoTimer ?? tutti[i].totale)} s · primo {f2(tutti[i].primo)}{tutti[i].split != null ? ` · split ${f2(tutti[i].split)}` : ''}{tutti[i].ricariche.length ? ` · ricarica ${f2(tutti[i].ricariche[0])}` : ''}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Solo il conteggio, per l'elenco del diario. */
export function useRunPerGiorno() {
  return useLiveQuery(async () => {
    const m = new Map<string, number>()
    for (const c of await db.corse.toArray()) m.set(c.data, (m.get(c.data) ?? 0) + 1)
    return m
  }) ?? new Map<string, number>()
}
