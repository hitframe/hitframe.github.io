import { addDays } from 'date-fns'
import RunDelGiorno from './RunDelGiorno'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, nowIso } from '../db/db'
import type { VoceDiario } from '../db/types'
import { fmtMedio, fromKey, oggiKey, toKey } from '../lib/date'
import { numOrNull, Rating, Sheet, useToast } from './ui'

export const TAG_SUGGERITI = ['Fuoco', 'In bianco', 'Gara', 'Tecnica', 'Movimento', 'Mentale', 'Attrezzatura']

function nuovaVoce(data: string, eventoId: number | null): VoceDiario {
  return {
    data,
    titolo: '',
    testo: '',
    umore: 3,
    energia: 3,
    concentrazione: 3,
    sonnoOre: null,
    tag: [],
    eventoId,
    videoUrl: '',
    creato: nowIso(),
    aggiornato: nowIso(),
  }
}

export default function DiarioForm({
  voce, data, eventoId = null, onClose,
}: { voce?: VoceDiario; data?: string; eventoId?: number | null; onClose: () => void }) {
  const toast = useToast()
  const [v, setV] = useState<VoceDiario>(() => voce ?? nuovaVoce(data ?? oggiKey(), eventoId))
  const [confermaElimina, setConfermaElimina] = useState(false)
  const set = <K extends keyof VoceDiario>(k: K, val: VoceDiario[K]) => setV((p) => ({ ...p, [k]: val }))

  // Eventi vicini alla data, per collegare la voce a un allenamento o a una gara
  const vicini = useLiveQuery(() => {
    const d = fromKey(v.data || oggiKey())
    return db.eventi.where('data').between(toKey(addDays(d, -7)), toKey(addDays(d, 1)), true, true).reverse().sortBy('data')
  }, [v.data]) ?? []

  const toggleTag = (t: string) => set('tag', v.tag.includes(t) ? v.tag.filter((x) => x !== t) : [...v.tag, t])
  const valido = v.data !== '' && (v.titolo.trim() !== '' || v.testo.trim() !== '')

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    const pulita = { ...v, titolo: v.titolo.trim() || 'Nota', aggiornato: nowIso() }
    if (pulita.id) await db.diario.put(pulita)
    else await db.diario.add(pulita)
    toast(voce ? 'Voce aggiornata' : 'Voce salvata')
    onClose()
  }

  async function elimina() {
    if (!v.id) return
    await db.diario.delete(v.id)
    toast('Voce eliminata')
    onClose()
  }

  return (
    <Sheet title={voce ? 'Modifica voce' : 'Nuova voce'} onClose={onClose}>
      <form className="form" onSubmit={salva}>
        <div className="fields-2">
          <div className="field">
            <label htmlFor="d-data">Data</label>
            <input id="d-data" type="date" className="input" value={v.data} onChange={(e) => set('data', e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="d-evento">Collegata a</label>
            <select id="d-evento" className="select" value={v.eventoId ?? ''} onChange={(e) => set('eventoId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Nessun evento</option>
              {vicini.map((ev) => (
                <option key={ev.id} value={ev.id}>{fmtMedio(ev.data)} · {ev.titolo}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="d-titolo">Titolo</label>
          <input id="d-titolo" className="input" value={v.titolo} onChange={(e) => set('titolo', e.target.value)} placeholder="Es. Lavoro su transizioni e ingressi" />
        </div>

        <div className="field">
          <label htmlFor="d-testo">Cosa è andato bene, cosa migliorare</label>
          <textarea id="d-testo" className="textarea" value={v.testo} onChange={(e) => set('testo', e.target.value)}
            placeholder={'Drill fatti, tempi, sensazioni, errori ricorrenti…'} />
        </div>

        <div className="fields-3">
          <Rating label="Umore" value={v.umore} onChange={(n) => set('umore', n)} />
          <Rating label="Energia" value={v.energia} onChange={(n) => set('energia', n)} />
          <Rating label="Concentrazione" value={v.concentrazione} onChange={(n) => set('concentrazione', n)} />
        </div>

        <div className="fields-2">
          <div className="field">
            <label htmlFor="d-sonno">Ore di sonno</label>
            <input id="d-sonno" inputMode="decimal" className="input" value={v.sonnoOre ?? ''} onChange={(e) => set('sonnoOre', numOrNull(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="d-video">Link video</label>
            <input id="d-video" type="url" className="input" value={v.videoUrl} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://…" />
          </div>
        </div>

        <RunDelGiorno data={v.data} eventoId={v.eventoId} />

        <div className="field">
          <span className="label">Tag</span>
          <div className="chips">
            {TAG_SUGGERITI.map((t) => (
              <button type="button" key={t} className="btn" style={{ minHeight: 36, padding: '0 12px', ...(v.tag.includes(t) ? { background: 'var(--accent-fill)', borderColor: 'var(--accent-fill)', color: 'var(--accent-ink)' } : {}) }}
                aria-pressed={v.tag.includes(t)} onClick={() => toggleTag(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          {voce && (confermaElimina ? (
            <button type="button" className="btn danger" onClick={elimina}>Conferma eliminazione</button>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setConfermaElimina(true)}>Elimina</button>
          ))}
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="btn primary" disabled={!valido}>Salva</button>
        </div>
      </form>
    </Sheet>
  )
}
