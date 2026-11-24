import { useLiveQuery } from 'dexie-react-hooks'
import { MSG_PDF, usePdfAnalisi } from '../sync/pdf'
import AvvisoPdf from './AvvisoPdf'
import { ListChecks, MapPinned } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ISTRUZIONI, type Istruzioni } from '../allenamento/schemi'
import type { Drill } from '../allenamento/drills'
import { chiaveMappa, immagineDisegno } from '../analisi/mappa'
import { calcolaPiano } from '../analisi/piano'
import { db, normalizzaProfilo } from '../db/db'
import type { DrillPersonale } from '../db/types'
import { DrillSchema } from './DrillSchema'
import StageMappa from './StageMappa'
import { Segmented } from './ui'
const Drill3D = lazy(() => import('./Drill3D'))

/** Disegno dello stage con il piano sovrapposto, per i drill nati dallo studio di uno stage. */
function DisegnoStage({ rif }: { rif: NonNullable<DrillPersonale['stage']> }) {
  const a = useLiveQuery(() => db.analisi.get(rif.analisiId), [rif.analisiId])
  const profilo = useLiveQuery(async () => normalizzaProfilo(await db.profilo.get('me')))
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(null)
  const sez = a ? a.lettura.sezioni[a.sezione] ?? a.lettura.sezioni[0] : null
  const s = sez?.stages.find((x) => x.numero === rif.numero)
  const mappa = a?.mappe?.[chiaveMappa(a.sezione, rif.numero)]
  const statoPdf = usePdfAnalisi(a)
  useEffect(() => {
    if (!a?.pdf || !s) return
    let ok = true
    immagineDisegno(String(a.id), a.pdf, s.pagina, s.tabellaTopY, s.disegnoTopY).then((r) => ok && setImg(r)).catch(() => {})
    return () => { ok = false }
  }, [a?.id, a?.pdf, s?.pagina, s?.tabellaTopY]) // eslint-disable-line react-hooks/exhaustive-deps
  const piano = useMemo(() => (mappa && s && profilo ? calcolaPiano(mappa, s, profilo, rif.stile) : null), [mappa, s, profilo, rif.stile])
  if (!a || !s) return <p className="prose" style={{ margin: 0 }}>L’analisi della gara di questo stage non c’è più.</p>
  if (!img || !mappa) return <p className="prose" style={{ margin: 0 }}>{statoPdf === 'pronto' ? 'Carico il disegno…' : (a ? <AvvisoPdf stato={statoPdf} a={a} /> : MSG_PDF[statoPdf])}</p>
  const sovra = piano ? {
    punti: [mappa.partenza, ...piano.percorso.map((pid) => mappa.posizioni.find((p) => p.id === pid)!)].map((p) => ({ x: p.x, y: p.y, etichetta: p.id })),
    ordine: piano.ordine, inMovimento: piano.inMovimento, ricariche: piano.ricariche,
  } : null
  return (
    <>
      <StageMappa img={img} mappa={mappa} modifica={false} sovra={sovra} />
      <Link to={`/analisi-gara/${rif.analisiId}/stage/${rif.numero}`} className="btn ghost" style={{ alignSelf: 'flex-start' }}><MapPinned size={16} /> Apri lo studio dello stage</Link>
    </>
  )
}

export default function DrillIstruzioni({ d, personale }: { d: Drill; personale?: DrillPersonale }) {
  const ist: Partial<Istruzioni> | undefined = personale
    ? { allestimento: personale.allestimento, passi: personale.passi, attenzione: personale.attenzione, schema: personale.schema }
    : ISTRUZIONI[d.id]
  const haSchema = !!ist?.schema?.elementi.length
  const haTesto = !!(ist?.allestimento || ist?.passi?.length || ist?.attenzione?.length)
  const [vista, setVista] = useState<'2d' | '3d'>('2d')
  if (!personale?.stage && !haSchema && !haTesto) return null
  return (
    <section className="card form">
      <div className="card-title" style={{ marginBottom: 0 }}><span><ListChecks size={18} style={{ verticalAlign: -3 }} /> Come si fa</span></div>
      {haSchema && !personale?.stage && (
        <Segmented<'2d' | '3d'> label="Vista" value={vista} onChange={setVista} options={[{ value: '2d', label: 'Pianta' }, { value: '3d', label: '3D' }]} />
      )}
      {personale?.stage ? <DisegnoStage rif={personale.stage} />
        : haSchema && (vista === '3d'
          ? <Suspense fallback={<p className="prose">Carico la vista 3D…</p>}><Drill3D schema={ist!.schema!} /></Suspense>
          : <DrillSchema schema={ist!.schema!} titolo={d.nome} />)}
      {haSchema && !personale?.stage && vista === '2d' && (
        <div className="legenda-schema">
          <span><i style={{ background: 'var(--accent)', borderRadius: 99 }} /> tu</span>
          <span><i style={{ background: '#c9a77a' }} /> carta</span>
          <span><i style={{ background: '#2f6fd6', borderRadius: 99 }} /> metallo</span>
          <span><i style={{ background: '#f4f4f2' }} /> no-shoot</span>
          <span><i style={{ background: 'var(--gara)', height: 3 }} /> movimento</span>
        </div>
      )}
      {ist?.allestimento && <div><div className="label">Allestimento</div><p style={{ margin: '4px 0 0' }}>{ist.allestimento}</p></div>}
      {!!ist?.passi?.length && (
        <div>
          <div className="label">Esecuzione</div>
          <ol className="passi-drill">{ist.passi.map((p, i) => <li key={i}>{p}</li>)}</ol>
        </div>
      )}
      {!!ist?.attenzione?.length && (
        <div>
          <div className="label">Attenzione a</div>
          <ul className="drill" style={{ marginLeft: 0 }}>{ist.attenzione.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
