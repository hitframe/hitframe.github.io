import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronRight, Crosshair, FileUp, Image as ImageIcon, Medal } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, PageHeader, Sheet, useToast } from '../components/ui'
import { db, normalizzaProfilo } from '../db/db'
import { fmtMedio, oggiKey } from '../lib/date'
import { leggiFileRisultati, type LetturaFile } from '../risultati/importa'
import { cercaTiratore, costruisciRisultato, elencoTiratori, nomeLeggibile, sistemaDaSchermate, trovaPerNome, type RisultatoGara } from '../risultati/motore'
import { componiLettura, type Schermata } from '../risultati/schermate'
import type { EsitoOcr } from '../risultati/ocr'
import { getImp, setImp } from '../db/db'
import { Plus, Star, X } from 'lucide-react'

const TIPI = { overall: 'Classifica generale', stage: 'Classifiche degli stage', verify: 'Statini (Score Verification)' }

export default function Risultati() {
  const toast = useToast()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const risultati = useLiveQuery(() => db.risultati.orderBy('data').reverse().toArray())
  const profilo = useLiveQuery(async () => normalizzaProfilo(await db.profilo.get('me')))
  const [stato, setStato] = useState<'' | 'lettura'>('')
  const [avanz, setAvanz] = useState('')
  const [revisione, setRevisione] = useState<(EsitoOcr & { gara: string }) | null>(null)
  const [errore, setErrore] = useState('')
  const [scelta, setScelta] = useState<LetturaFile | null>(null)
  const [coda, setCoda] = useState<LetturaFile[]>([])
  const [filtro, setFiltro] = useState('')

  async function salva(lf: LetturaFile, divisione: string, num: number, vai = true) {
    let r = costruisciRisultato(lf.lettura, divisione, num, lf.data ?? oggiKey())
    if (lf.schermate) r = sistemaDaSchermate(r, lf.lettura)
    // collega la gara del calendario più vicina alla data
    const gare = await db.eventi.where('tipo').equals('gara').toArray()
    const vicina = gare.filter((g) => Math.abs(Date.parse(g.data) - Date.parse(r.data)) <= 3 * 86400000).sort((a, b) => Math.abs(Date.parse(a.data) - Date.parse(r.data)) - Math.abs(Date.parse(b.data) - Date.parse(r.data)))[0]
    r.eventoId = vicina?.id ?? null
    // stessa gara già importata: la sostituisco
    const doppia = (await db.risultati.toArray()).find((x) => x.gara === r.gara && x.data === r.data)
    if (doppia) { r.avversari = doppia.avversari; await db.risultati.delete(doppia.id!) }
    const id = (await db.risultati.add(r)) as number
    if (vai) { toast('Risultati importati'); navigate(`/risultati/${id}`) }
    return id
  }

  /** Dopo una scelta manuale, passa alla gara successiva della coda. */
  function prossima(resto: LetturaFile[]) {
    const [p, ...altre] = resto
    setCoda(altre)
    setScelta(p ?? null)
    setFiltro('')
    if (!p) toast('Risultati importati')
  }

  /** Screenshot di PractiScore: OCR sul dispositivo, poi un controllo prima di importare. */
  async function caricaScreenshot(immagini: File[]) {
    setErrore('')
    setStato('lettura')
    try {
      const { leggiScreenshot } = await import('../risultati/ocr')
      const esito = await leggiScreenshot(immagini, setAvanz)
      if (!esito.schermate.some((x) => x.tipo === 'stage')) {
        setErrore(esito.schermate.length
          ? 'Ho letto la classifica generale ma nessuno stage: aggiungi gli screenshot di ogni stage (menu in alto su “Stage 1”, “Stage 2”…).'
          : 'Non riconosco questi screenshot. Servono quelli della pagina dei risultati di PractiScore, con la tabella intera (Name, %, Pts, Time, A, C, D, M).')
        return
      }
      const data = esito.data ?? oggiKey()
      const gare = await db.eventi.where('tipo').equals('gara').toArray()
      const vicina = gare.filter((g) => Math.abs(Date.parse(g.data) - Date.parse(data)) <= 3 * 86400000)
        .sort((a, b) => Math.abs(Date.parse(a.data) - Date.parse(data)) - Math.abs(Date.parse(b.data) - Date.parse(data)))[0]
      setRevisione({ ...esito, data, gara: vicina?.titolo ?? `Gara del ${fmtMedio(data)}` })
    } catch (e) {
      console.error(e)
      setErrore(navigator.onLine ? 'Non riesco a leggere questi screenshot.' : 'La prima lettura degli screenshot scarica il motore di lettura (circa 6 MB): collegati a internet e riprova. Dopo funziona anche offline.')
    } finally {
      setStato('')
      setAvanz('')
      if (input.current) input.current.value = ''
    }
  }

  async function importaScreenshot(rev: EsitoOcr & { gara: string }) {
    const { lettura } = componiLettura(rev.schermate, rev.gara.trim() || 'Gara')
    const lf: LetturaFile = { lettura, data: rev.data, scartati: rev.scartati, schermate: true }
    setRevisione(null)
    const io = profilo?.nome ? cercaTiratore(lettura, profilo.nome) : null
    if (io) await salva(lf, io.divisione, io.num)
    else prossima([lf])
  }

  async function carica(files: FileList | null) {
    if (!files?.length) return
    const immagini = [...files].filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|heic|webp)$/i.test(f.name))
    if (immagini.length) return caricaScreenshot(immagini)
    setErrore('')
    setStato('lettura')
    try {
      const { gare } = await leggiFileRisultati([...files])
      const valide = gare.filter((g) => Object.keys(g.lettura.stage).length)
      if (!valide.length) {
        setErrore(gare.length
          ? 'Manca il PDF delle classifiche degli stage (Stage Results): serve per i calcoli. Aggiungilo insieme agli altri.'
          : 'Non riconosco questi PDF. Servono i risultati esportati dal sistema di gara: Overall, Stage Results e Score Verification.')
        return
      }
      const daScegliere: LetturaFile[] = []
      let ultimo = 0
      for (const lf of valide) {
        const io = profilo?.nome ? cercaTiratore(lf.lettura, profilo.nome) : null
        if (io) ultimo = await salva(lf, io.divisione, io.num, false)
        else daScegliere.push(lf)
      }
      if (daScegliere.length) prossima(daScegliere)
      else if (valide.length === 1) { toast('Risultati importati'); navigate(`/risultati/${ultimo}`) }
      else toast(`${valide.length} gare importate`)
    } catch (e) {
      console.error(e)
      setErrore('Non riesco a leggere questi PDF.')
    } finally {
      setStato('')
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="page">
      <PageHeader title="Risultati" sub="Classifiche, errori, avversari e cosa allenare" />
      <section className="card form">
        <p className="prose" style={{ margin: 0 }}>
          Carica insieme i PDF dei risultati, anche di più gare in una volta: <b>classifica generale</b> (Overall), <b>classifiche degli stage</b> (Stage Results) e <b>statini</b> (Score Verification).
          Oppure gli <b>screenshot di PractiScore</b>: la pagina Match e quella di ogni stage, con la tabella fino alle colonne A, C, D, M.
          Ti trovo dal nome del profilo e calcolo dove hai perso punti e quanto pesa ogni errore.
        </p>
        <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => carica(e.target.files)} />
        <div className="row">
          <button className="btn primary" onClick={() => input.current?.click()} disabled={stato === 'lettura'}>
            <FileUp size={18} /> {stato === 'lettura' ? (avanz || 'Leggo…') : 'Carica PDF o screenshot'}
          </button>
        </div>
        {stato === 'lettura' && avanz && <p className="prose" style={{ margin: 0, fontSize: 13 }}>La lettura avviene sul telefono: nessun dato esce dal dispositivo.</p>}
        {errore && <div className="card avviso"><AlertTriangle size={18} color="var(--accent)" style={{ flexShrink: 0 }} /> {errore}</div>}
      </section>

      {risultati && risultati.length === 0 && <div className="card"><Empty icon={<Medal size={28} />} text="Nessuna gara importata." /></div>}
      {risultati && risultati.length > 0 && (
        <div className="list">
          {risultati.map((r) => {
            const me = r.concorrenti.find((c) => c.num === r.mioNum)
            return (
              <Link key={r.id} to={`/risultati/${r.id}`} className="item">
                <Medal size={22} color="var(--accent)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{r.gara}</div>
                  <div className="meta">{fmtMedio(r.data)} · {r.divisione} · {me ? `${me.pos}° su ${r.concorrenti.length}${r.fonte === 'screenshot' ? '+' : ''} · ${me.pct.toFixed(2).replace('.', ',')}%` : ''}</div>
                </div>
                <ChevronRight size={18} color="var(--faint)" />
              </Link>
            )
          })}
        </div>
      )}

      {risultati && risultati.length > 0 && <Rivali risultati={risultati} />}

      {revisione && <RevisioneScreenshot rev={revisione} onChange={setRevisione} onClose={() => setRevisione(null)} onImporta={importaScreenshot} />}

      {scelta && (
        <Sheet title="Chi sei in classifica?" onClose={() => prossima(coda)}>
          <p className="prose" style={{ marginTop: 0 }}><b>{scelta.lettura.gara}</b></p>
          <p className="prose" style={{ marginTop: 0 }}>
            {profilo?.nome ? `Non trovo “${profilo.nome}”.` : 'Nel profilo manca il nome.'} Scegli il tuo nome: {scelta.lettura.tipi.map((t) => TIPI[t]).join(', ')} letti.
          </p>
          <input className="input" placeholder="Cerca cognome" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Cerca cognome" />
          <div className="list" style={{ marginTop: 10, maxHeight: 360, overflow: 'auto' }}>
            {elencoTiratori(scelta.lettura).filter((t) => t.nome.toLowerCase().includes(filtro.toLowerCase())).slice(0, 60).map((t) => (
              <button key={`${t.divisione}-${t.num}`} className="item" style={{ textAlign: 'left', color: 'var(--text)' }} onClick={async () => { const s = scelta; const id = await salva(s, t.divisione, t.num, false); if (coda.length) prossima(coda); else { setScelta(null); toast('Risultati importati'); navigate(`/risultati/${id}`) } }}>
                <div className="title">{t.nome}</div>
                <div className="meta">{t.divisione} · #{t.num}</div>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}

function Rivali({ risultati }: { risultati: RisultatoGara[] }) {
  const rivali = useLiveQuery(() => getImp<string[]>('rivali', [])) ?? []
  const riferimento = useLiveQuery(() => getImp<string>('riferimento', '')) ?? ''
  const [nome, setNome] = useState('')
  const nomi = [...new Set(risultati.flatMap((r) => r.concorrenti.filter((c) => c.num !== r.mioNum).map((c) => nomeLeggibile(c.nome))))].sort()
  const aggiungi = async () => {
    const n = nome.trim()
    if (!n) return
    await setImp('rivali', [...new Set([...rivali, n])])
    setNome('')
  }
  return (
    <section className="card form">
      <div className="card-title" style={{ marginBottom: 0 }}><span><Star size={18} style={{ verticalAlign: -3 }} /> Avversari che segui</span></div>
      <p className="prose" style={{ margin: 0, fontSize: 13 }}>
        Scrivi i nomi con cui vuoi il confronto diretto: li ritrovo in ogni gara importata, nella sezione Avversari.
        Con il mirino scegli il tuo <b>riferimento</b>: un tiratore costante che usi come metro, gara dopo gara, con lo statino stage per stage.
      </p>
      <div className="row">
        <input className="input" style={{ flex: 1 }} list="nomi-rivali" placeholder="Nome e cognome" aria-label="Nome avversario" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aggiungi()} />
        <datalist id="nomi-rivali">{nomi.map((n) => <option key={n} value={n} />)}</datalist>
        <button className="btn" onClick={aggiungi} disabled={!nome.trim()}><Plus size={16} /> Aggiungi</button>
      </div>
      {rivali.length > 0 && (
        <div className="list">
          {rivali.map((n) => {
            const gare = risultati.map((r) => ({ r, c: trovaPerNome(r, n), io: r.concorrenti.find((x) => x.num === r.mioNum) })).filter((x) => x.c)
            return (
              <div key={n} className="item" style={{ display: 'block' }}>
                <div className="row">
                  <div className="title" style={{ flex: 1 }}>{n}{riferimento === n && <span className="badge" style={{ marginLeft: 8, color: 'var(--accent)' }}>Riferimento</span>}</div>
                  <button className="btn ghost icon" aria-pressed={riferimento === n} aria-label={riferimento === n ? `${n} non è più il riferimento` : `Usa ${n} come riferimento`}
                    onClick={() => setImp('riferimento', riferimento === n ? '' : n)}><Crosshair size={16} color={riferimento === n ? 'var(--accent)' : undefined} /></button>
                  <button className="btn ghost icon" aria-label={`Smetti di seguire ${n}`} onClick={async () => { await setImp('rivali', rivali.filter((x) => x !== n)); if (riferimento === n) await setImp('riferimento', '') }}><X size={16} /></button>
                </div>
                <div className="meta">
                  {gare.length === 0 ? 'Non presente nelle gare importate (stessa divisione).' : gare.map(({ r, c, io }) => {
                    const d = (io?.punti ?? 0) - c!.punti
                    const pct = c!.punti ? ((io?.punti ?? 0) / c!.punti) * 100 : 0
                    return <div key={r.id}>{r.gara}: {c!.pos}° · tu {io?.pos}° · {d >= 0 ? `+${d.toFixed(1).replace('.', ',')}` : d.toFixed(1).replace('.', ',')} punti{riferimento === n ? ` · sei al ${pct.toFixed(1).replace('.', ',')}%` : ''}</div>
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function RevisioneScreenshot({ rev, onChange, onClose, onImporta }: {
  rev: EsitoOcr & { gara: string }
  onChange: (r: EsitoOcr & { gara: string }) => void
  onClose: () => void
  onImporta: (r: EsitoOcr & { gara: string }) => void
}) {
  const { riepilogo } = componiLettura(rev.schermate, rev.gara)
  const cambiaStage = (i: number, n: number) => onChange({ ...rev, schermate: rev.schermate.map((x, j): Schermata => (j === i ? { ...x, stage: n, stageDedotto: false } : x)) })
  const doppi = rev.schermate.filter((x) => x.tipo === 'stage').map((x) => x.stage)
  return (
    <Sheet title="Screenshot letti" onClose={onClose}>
      <p className="prose" style={{ marginTop: 0 }}>
        Controlla che ogni screenshot sia lo stage giusto. Più screenshot dello stesso stage (tabella scorsa) si uniscono da soli.
      </p>
      <div className="list">
        {rev.schermate.map((x, i) => (
          <div key={x.file + i} className="item" style={{ alignItems: 'center' }}>
            <ImageIcon size={18} color="var(--faint)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title">{x.tipo === 'match' ? 'Classifica generale' : `Stage ${x.stage}`}{x.stageDedotto ? <span className="meta" style={{ color: 'var(--accent)' }}> · numero dedotto, controlla</span> : null}</div>
              <div className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.righe.length} tiratori · {x.file}</div>
            </div>
            {x.tipo === 'stage' && (
              <select className="select" style={{ width: 'auto', minHeight: 36 }} aria-label={`Stage di ${x.file}`} value={String(x.stage)} onChange={(e) => cambiaStage(i, +e.target.value)}>
                {Array.from({ length: Math.max(12, ...doppi.map((n) => n ?? 0)) }, (_, k) => k + 1).map((n) => <option key={n} value={n}>Stage {n}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
      {riepilogo.dubbi.length > 0 && (
        <div className="card avviso" style={{ marginTop: 10 }}>
          <AlertTriangle size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
          <div>Da verificare: {riepilogo.dubbi.map((d) => `${d.nome} (stage ${d.stage})`).join(', ')}. Gli altri numeri tornano con l’aritmetica del punteggio.</div>
        </div>
      )}
      {rev.scartati.length > 0 && <p className="prose" style={{ fontSize: 13 }}>Non riconosciuti: {rev.scartati.join(', ')}.</p>}
      {!riepilogo.match && <p className="prose" style={{ fontSize: 13 }}>Manca la pagina Match: la classifica finale la ricostruisco dagli stage, con i soli tiratori visibili.</p>}
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="rev-gara">Nome della gara</label>
        <input id="rev-gara" className="input" value={rev.gara} onChange={(e) => onChange({ ...rev, gara: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="rev-data">Data</label>
        <input id="rev-data" className="input" type="date" value={rev.data ?? ''} onChange={(e) => onChange({ ...rev, data: e.target.value || null })} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Annulla</button>
        <button className="btn primary" onClick={() => onImporta(rev)}>Importa</button>
      </div>
    </Sheet>
  )
}
