/** Area Video: porta a GDA Split, l'analisi dei video POV (beep, colpi, split, grafica per i social). */
import { useLiveQuery } from 'dexie-react-hooks'
import { AudioWaveform, ChevronRight, Clapperboard, Download, Film, Gauge, Share2, Timer, Upload, WifiOff } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, useToast } from '../components/ui'
import { db } from '../db/db'
import { fmt } from '../lib/date'
import { CHIAVE_STORICO_SPLIT, daRunSplit, impronta, sintesiCorsa, valida, type RunSplit } from '../video/corse'

// GDA Split è una pagina a sé dentro l'app (public/split): con ?hf=1 mostra il tasto per tornare a Hitframe
const SPLIT = 'split/index.html?hf=1'

const PUNTI = [
  { icon: AudioWaveform, t: 'Beep e colpi da soli', d: 'Carichi il video della camera e l’app trova la partenza, ogni colpo e gli split leggendo l’audio.' },
  { icon: Timer, t: 'Tempo ufficiale', d: 'Scrivi il tempo del timer dell’RO e il tempo finale coincide con il Verify.' },
  { icon: Film, t: 'Grafica sul video', d: 'Colpi, split e tempo stampati sul video, con i tuoi loghi, pronti da esportare.' },
  { icon: Share2, t: 'Social', d: 'Caption e hashtag per Instagram a partire dai dati della prova.' },
  { icon: WifiOff, t: 'Anche offline', d: 'Il video non esce dal telefono: l’analisi avviene tutta sul dispositivo.' },
]

const f2 = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2).replace('.', ','))
const CONTESTO = { allenamento: 'Allenamento', gara: 'Gara', libero: 'Altro' } as const

function storicoSplit(): RunSplit[] {
  try {
    const h = JSON.parse(localStorage.getItem(CHIAVE_STORICO_SPLIT) || '[]') as unknown[]
    return h.filter(valida)
  } catch {
    return []
  }
}

export default function Video() {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const corse = useLiveQuery(() => db.corse.orderBy('data').reverse().toArray()) ?? []
  const eventi = useLiveQuery(() => db.eventi.toArray()) ?? []
  const gia = new Set(corse.map(impronta))
  const daImportare = storicoSplit().map(daRunSplit).filter((c) => !gia.has(impronta(c)))

  async function importa(lista: ReturnType<typeof daRunSplit>[]) {
    const nuove = lista.filter((c) => !gia.has(impronta(c)) && c.colpi.length)
    if (!nuove.length) { toast('Niente di nuovo da importare'); return }
    await db.corse.bulkAdd(nuove)
    toast(`${nuove.length} run importate: aprile per collegarle ad allenamento o gara`)
  }

  async function daFile(f: File | undefined) {
    if (!f) return
    try {
      const j = JSON.parse(await f.text()) as unknown
      const lista = (Array.isArray(j) ? j : [j]).filter(valida).map(daRunSplit)
      if (!lista.length) throw new Error()
      await importa(lista)
    } catch {
      toast('Non è un file di GDA Split (JSON)')
    }
  }

  return (
    <div className="page">
      <PageHeader title="Video" sub="Analisi dei tuoi video POV con GDA Split" />
      <section className="card video-hero">
        <div className="card-title" style={{ marginBottom: 0 }}><span><Clapperboard size={20} style={{ verticalAlign: -3, color: 'var(--accent)' }} /> GDA Split</span></div>
        <p>Scegli un video di allenamento o di gara: in pochi secondi hai beep, colpi, split e tempo, da correggere a mano dove serve.</p>
        <a className="btn primary" href={SPLIT}><Clapperboard size={20} /> Analizza un video</a>
      </section>
      <section className="card">
        <div className="card-title"><span><Gauge size={18} style={{ verticalAlign: -3 }} /> Le tue run</span><Link to="/video/storico">Storico misure</Link></div>
        {daImportare.length > 0 && (
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => importa(daImportare)}>
            <Download size={18} /> Importa {daImportare.length} run dallo storico di GDA Split
          </button>
        )}
        {corse.length === 0 ? (
          <p className="prose" style={{ margin: 0 }}>Analizza un video e tocca <b>“Salva in Hitframe”</b> nella scheda Split: i tempi di estrazione, split, transizioni, ricariche e movimenti finiscono qui e nel tuo quadro.</p>
        ) : (
          <div className="list">
            {corse.map((c) => {
              const s = sintesiCorsa(c)
              const ev = eventi.find((e) => e.id === c.eventoId)
              return (
                <Link key={c.id} to={`/video/run/${c.id}`} className="item">
                  <Clapperboard size={20} color="var(--accent)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title">{c.titolo}</div>
                    <div className="meta">
                      {fmt(c.data, 'd MMM yy')}{c.dataFonte !== 'video' && c.dataFonte !== 'manuale' && c.dataFonte !== 'evento' ? <span className="run-badge"> (data da verificare)</span> : null} · {CONTESTO[c.contesto]}{ev ? ` · ${ev.titolo}` : ''}{c.stage ? ` · stage ${c.stage}` : ''} · {s.colpi} colpi · {f2(c.tempoTimer ?? s.totale)} s
                      {s.daIndicare > 0 && <span className="run-badge"> · {s.daIndicare} pause da indicare</span>}
                    </div>
                  </div>
                  <ChevronRight size={18} />
                </Link>
              )
            })}
          </div>
        )}
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => file.current?.click()}><Upload size={18} /> Importa un file JSON di GDA Split</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { void daFile(e.target.files?.[0]); e.target.value = '' }} />
      </section>

      <section className="card">
        <div className="video-punti">
          {PUNTI.map(({ icon: Icona, t, d }) => (
            <div key={t} className="video-punto"><Icona size={20} /><div><b>{t}</b><span>{d}</span></div></div>
          ))}
        </div>
      </section>
    </div>
  )
}
