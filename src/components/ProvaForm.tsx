import { useLiveQuery } from 'dexie-react-hooks'
import { Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { misuraTempi, type Drill } from '../allenamento/drills'
import { fmt2, hitFactor, majorDiDefault, trovaDrill, tuttiDrill } from '../allenamento/servizi'
import { db, normalizzaProfilo, nowIso } from '../db/db'
import type { Prova, TempiPersonali } from '../db/types'
import { oggiKey } from '../lib/date'
import { numOrNull, Segmented, Sheet, useToast } from './ui'

const NOMI_TEMPI: Partial<Record<keyof TempiPersonali, string>> = {
  estrazione: 'Estrazione', split: 'Split', transizioneVicina: 'Transizione vicina', transizioneLontana: 'Transizione lontana',
  ricarica: 'Ricarica', colpoPiastra: 'Colpo su piastra',
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <span className="label">{label}</span>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
        <button type="button" className="btn icon" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Meno ${label}`}><Minus size={18} /></button>
        <span className="stepper-v" aria-live="polite">{value}</span>
        <button type="button" className="btn icon" onClick={() => onChange(value + 1)} aria-label={`Più ${label}`}><Plus size={18} /></button>
      </div>
    </div>
  )
}

export default function ProvaForm({
  drillId, colpi = [], tempo, par, modalita, onClose, onSalvata, eventoId: eventoIniziale = null,
}: {
  drillId?: string; colpi?: number[]; tempo?: number | null; par?: number | null; modalita?: 'fuoco' | 'bianco'; eventoId?: number | null
  onClose: () => void; onSalvata?: (id: number) => void
}) {
  const toast = useToast()
  const personali = useLiveQuery(() => db.drillPersonali.toArray()) ?? []
  const profilo = useLiveQuery(async () => normalizzaProfilo(await db.profilo.get('me')))
  const oggi = oggiKey()
  const eventiOggi = useLiveQuery(async () => {
    const l = await db.eventi.where('data').equals(oggi).filter((e) => e.tipo === 'fuoco' || e.tipo === 'bianco').toArray()
    // la sessione da cui arrivi compare sempre, anche se è di un altro giorno
    if (eventoIniziale && !l.some((e) => e.id === eventoIniziale)) { const e = await db.eventi.get(eventoIniziale); if (e) l.unshift(e) }
    return l
  }, [oggi, eventoIniziale]) ?? []

  const [did, setDid] = useState(drillId ?? 'bill')
  const drill = trovaDrill(did, personali)
  const mod = modalita ?? drill?.modalita ?? 'fuoco'
  const [tempoTxt, setTempoTxt] = useState(tempo ? tempo.toFixed(2).replace('.', ',') : '')
  const [zone, setZone] = useState({ A: drill?.colpi ?? 0, C: 0, D: 0, M: 0, NS: 0 })
  const [major, setMajor] = useState<boolean | null>(null)
  const [pulite, setPulite] = useState(1)
  const [ripetizioni, setRipetizioni] = useState(1)
  const [note, setNote] = useState('')
  const [eventoId, setEventoId] = useState<number | null>(eventoIniziale)
  const [salvata, setSalvata] = useState<{ suggeriti: [keyof TempiPersonali, number, number][] } | null>(null)

  const isMajor = major ?? (profilo ? majorDiDefault(profilo.divisione) : false)
  const t = numOrNull(tempoTxt)
  const hf = mod === 'fuoco' ? hitFactor(zone, isMajor, t) : null
  const totColpi = zone.A + zone.C + zone.D + zone.M

  const cambiaDrill = (id: string) => {
    setDid(id)
    const d = trovaDrill(id, personali)
    if (d && !colpi.length) setZone({ A: d.colpi, C: 0, D: 0, M: 0, NS: 0 })
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    const prova: Prova = {
      drillId: did,
      data: oggi,
      creato: nowIso(),
      modalita: mod,
      tempo: t,
      colpi,
      zone: mod === 'fuoco' ? zone : { A: 0, C: 0, D: 0, M: 0, NS: 0 },
      major: isMajor,
      hf,
      riuscita: mod === 'bianco' ? pulite >= ripetizioni : undefined,
      par: par ?? null,
      eventoId,
      note: mod === 'bianco' ? [`${pulite}/${ripetizioni} pulite entro il par`, note].filter(Boolean).join(' · ') : note,
    }
    const id = (await db.prove.add(prova)) as number
    onSalvata?.(id)
    toast('Prova salvata')
    // tempi tecnici: media delle ultime 5 prove con colpi registrati
    const sugg: [keyof TempiPersonali, number, number][] = []
    if (drill && colpi.length && profilo) {
      const recenti = (await db.prove.where('drillId').equals(did).toArray())
        .filter((p) => p.colpi.length && (drill.personale || p.colpi.length === drill.colpi)).sort((a, b) => b.creato.localeCompare(a.creato)).slice(0, 5)
      const somme: Partial<Record<keyof TempiPersonali, number[]>> = {}
      for (const p of recenti) {
        const m = misuraTempi(drill, p.colpi)
        for (const [k, v] of Object.entries(m) as [keyof TempiPersonali, number][]) (somme[k] ??= []).push(v)
      }
      for (const [k, arr] of Object.entries(somme) as [keyof TempiPersonali, number[]][]) {
        const media = arr.reduce((a, b) => a + b, 0) / arr.length
        if (Math.abs(media - profilo.tempi[k]) >= 0.01) sugg.push([k, profilo.tempi[k], media])
      }
    }
    if (sugg.length) setSalvata({ suggeriti: sugg })
    else onClose()
  }

  async function aggiornaProfilo() {
    if (!profilo || !salvata) return
    const tempi = { ...profilo.tempi }
    for (const [k, , nuovo] of salvata.suggeriti) tempi[k] = Math.round(nuovo * 100) / 100
    await db.profilo.put({ ...profilo, tempi, aggiornato: nowIso() })
    toast('Tempi del profilo aggiornati')
    onClose()
  }

  const elenco = useMemo(() => tuttiDrill(personali), [personali])

  if (salvata) {
    return (
      <Sheet title="Aggiorna i tuoi tempi" onClose={onClose}>
        <div className="form">
          <p className="prose" style={{ margin: 0 }}>Dalla media delle ultime prove di questo drill:</p>
          <div className="list">
            {salvata.suggeriti.map(([k, vecchio, nuovo]) => (
              <div key={k} className="item" style={{ cursor: 'default' }}>
                <div style={{ flex: 1 }} className="title">{NOMI_TEMPI[k] ?? k}</div>
                <span className="meta">{fmt2(vecchio)} s →</span>
                <b>{fmt2(nuovo)} s</b>
              </div>
            ))}
          </div>
          <div className="row">
            <div className="spacer" />
            <button className="btn" onClick={onClose}>Lascia così</button>
            <button className="btn primary" onClick={aggiornaProfilo}>Aggiorna profilo</button>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Registra prova" onClose={onClose}>
      <form className="form" onSubmit={salva}>
        <div className="field">
          <label htmlFor="pr-drill">Drill</label>
          <select id="pr-drill" className="select" value={did} onChange={(e) => cambiaDrill(e.target.value)}>
            {(['fuoco', 'bianco'] as const).map((m) => (
              <optgroup key={m} label={m === 'fuoco' ? 'A fuoco' : 'In bianco'}>
                {elenco.filter((d) => d.modalita === m).map((d: Drill) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="fields-2">
          <div className="field">
            <label htmlFor="pr-tempo">{mod === 'bianco' ? 'Par (s)' : 'Tempo (s)'}</label>
            <input id="pr-tempo" className="input" inputMode="decimal" value={tempoTxt} onChange={(e) => setTempoTxt(e.target.value)} required={mod === 'fuoco'} />
          </div>
          {mod === 'fuoco' ? (
            <div className="field">
              <span className="label">Fattore</span>
              <Segmented label="Fattore di potenza" value={isMajor ? 'major' : 'minor'} onChange={(v) => setMajor(v === 'major')}
                options={[{ value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }]} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="pr-rip">Ripetizioni</label>
              <input id="pr-rip" className="input" inputMode="numeric" value={ripetizioni} onChange={(e) => setRipetizioni(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          )}
        </div>

        {mod === 'fuoco' ? (
          <>
            <div className="zone-grid">
              <Stepper label="A" value={zone.A} onChange={(n) => setZone({ ...zone, A: n })} />
              <Stepper label="C" value={zone.C} onChange={(n) => setZone({ ...zone, C: n })} />
              <Stepper label="D" value={zone.D} onChange={(n) => setZone({ ...zone, D: n })} />
              <Stepper label="Miss" value={zone.M} onChange={(n) => setZone({ ...zone, M: n })} />
              <Stepper label="No-shoot" value={zone.NS} onChange={(n) => setZone({ ...zone, NS: n })} />
            </div>
            <div className="row">
              <span className="meta" style={{ color: 'var(--muted)', fontSize: 13 }}>
                {totColpi} colpi a bersaglio{drill && totColpi !== drill.colpi ? ` (il drill ne prevede ${drill.colpi})` : ''}{colpi.length ? ` · ${colpi.length} rilevati dal timer` : ''}
              </span>
              <div className="spacer" />
              <span className="hf-big">HF {fmt2(hf)}</span>
            </div>
          </>
        ) : (
          <Stepper label="Pulite entro il par" value={pulite} onChange={(n) => setPulite(Math.min(ripetizioni, n))} />
        )}

        {eventiOggi.length > 0 && (
          <div className="field">
            <label htmlFor="pr-ev">Sessione</label>
            <select id="pr-ev" className="select" value={eventoId ?? ''} onChange={(e) => setEventoId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Nessuna</option>
              {eventiOggi.map((ev) => <option key={ev.id} value={ev.id}>{ev.titolo}</option>)}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="pr-note">Note</label>
          <input id="pr-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sensazioni, errori, distanza diversa…" />
        </div>

        <div className="row">
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="btn primary" disabled={mod === 'fuoco' && !t}>Salva prova</button>
        </div>
      </form>
    </Sheet>
  )
}
