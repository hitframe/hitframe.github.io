import { addDays } from 'date-fns'
import { collegaAnalisiPerGara } from '../analisi/collega'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, BellRing, Package, Wrench, BookOpen, FileSearch, PenLine, Timer as TimerIcon, Trophy, UserRound, Dumbbell, Clapperboard } from 'lucide-react'
import SpazioPartner from '../components/Partner'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DiarioForm from '../components/DiarioForm'
import EventoForm from '../components/EventoForm'
import EventoItem from '../components/EventoItem'
import { Empty, Sheet } from '../components/ui'
import { db } from '../db/db'
import { MARE_URL } from '../lib/mare'
import { avvisiArma, colpiArma } from '../attrezzatura/calcoli'
import { fabbisogno, scorta } from '../munizioni/calcoli'
import { profiloGara } from '../analisi/motore'
import type { Evento, VoceDiario } from '../db/types'
import { capitalize, fmtLungo, giorniDa, oggiKey, quando, toKey } from '../lib/date'
import { RigaProva } from '../licenza/ui'

export default function Home() {
  const oggi = oggiKey()
  const tra14 = toKey(addDays(new Date(), 14))
  const meseInizio = `${oggi.slice(0, 7)}-01`
  const [eventoAperto, setEventoAperto] = useState<Evento | null>(null)
  const [diario, setDiario] = useState<{ voce?: VoceDiario } | null>(null)

  const profilo = useLiveQuery(() => db.profilo.get('me'))
  const prossimi = useLiveQuery(() => db.eventi.where('data').between(oggi, tra14, true, true).sortBy('data')) ?? []
  const prossimaGara = useLiveQuery(async () => {
    const gare = await db.eventi.where('data').aboveOrEqual(oggi).filter((e) => e.tipo === 'gara').sortBy('data')
    return gare[0] ?? null
  })
  const daRegistrare = useLiveQuery(() =>
    db.eventi.where('data').between(toKey(addDays(new Date(), -10)), oggi, true, false)
      .filter((e) => !e.completato && e.tipo !== 'altro').sortBy('data'),
  ) ?? []
  const delMese = useLiveQuery(() => db.eventi.where('data').between(meseInizio, oggi, true, true).toArray()) ?? []
  const ultimeVoci = useLiveQuery(() => db.diario.orderBy('data').reverse().limit(3).toArray()) ?? []

  const fuoco = delMese.filter((e) => e.tipo === 'fuoco' && e.completato).length
  const bianco = delMese.filter((e) => e.tipo === 'bianco' && e.completato).length
  const colpi = delMese.reduce((s, e) => s + (e.completato ? e.colpiSparati ?? 0 : 0), 0)

  const analisiGara = useLiveQuery(
    async () => (prossimaGara?.id ? (await db.analisi.where('eventoId').equals(prossimaGara.id).first()) ?? null : null),
    [prossimaGara?.id],
  )
  const giorniGara = prossimaGara ? giorniDa(prossimaGara.data) : null
  // un PDF già caricato (anche da un altro dispositivo) per questa gara: lo collega da solo
  useEffect(() => {
    if (prossimaGara?.id && analisiGara === null) void collegaAnalisiPerGara(prossimaGara.id).catch(() => null)
  }, [prossimaGara?.id, analisiGara])

  // Promemoria iscrizioni: aperture e scadenze nei prossimi 30 giorni, per gare non ancora iscritte
  const iscrizioni = (useLiveQuery(() =>
    db.eventi.where('data').aboveOrEqual(oggi).filter((e) => e.tipo === 'gara' && !e.gara?.iscritto).toArray(),
  ) ?? []).flatMap((e) => {
    const out: { e: Evento; tipo: 'apertura' | 'scadenza'; data: string; giorni: number }[] = []
    const ap = e.gara?.aperturaIscrizione
    const sc = e.gara?.scadenzaIscrizione
    if (ap && giorniDa(ap) >= 0 && giorniDa(ap) <= 30) out.push({ e, tipo: 'apertura', data: ap, giorni: giorniDa(ap) })
    if (sc && giorniDa(sc) >= 0 && giorniDa(sc) <= 30 && !(ap && giorniDa(ap) > 0)) out.push({ e, tipo: 'scadenza', data: sc, giorni: giorniDa(sc) })
    return out
  }).sort((a, b) => a.data.localeCompare(b.data))
  const nome = profilo?.nome?.split(' ')[0]

  return (
    <div className="page">

      <header className="page-header">
        <div>
          <h1>{nome ? `Ciao ${nome}` : 'Benvenuto'}</h1>
          <div className="sub">{capitalize(fmtLungo(oggi))}</div>
          <RigaProva />
        </div>
        <AvvisiMateriale />
      </header>

      {!profilo && (
        <Link to="/io/atleta" className="item" style={{ borderColor: 'var(--accent)' }}>
          <UserRound size={22} color="var(--accent)" />
          <div style={{ flex: 1 }}>
            <div className="title">Completa il tuo profilo</div>
            <div className="meta">Divisione, classe e tempi personali: servono per stime e piani di allenamento.</div>
          </div>
        </Link>
      )}

      <section className="hero">
        {prossimaGara ? (
          <button onClick={() => setEventoAperto(prossimaGara)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div className="kicker"><Trophy size={14} style={{ verticalAlign: -2 }} /> Prossima gara</div>
            <h2>{prossimaGara.titolo}</h2>
            <div className="meta" style={{ color: 'var(--muted)', marginTop: 4 }}>
              {capitalize(fmtLungo(prossimaGara.data))}{prossimaGara.luogo ? ` · ${prossimaGara.luogo}` : ''}
            </div>
            <div className="countdown">
              {giorniGara === 0 ? <span className="n">Oggi</span> : (
                <>
                  <span className="n">{giorniGara}</span>
                  <span className="u">{giorniGara === 1 ? 'giorno' : 'giorni'}</span>
                </>
              )}
              <span className="spacer" />
              {prossimaGara.gara && !prossimaGara.gara.iscritto && <span className="badge">Da iscrivere</span>}
            </div>
          </button>
        ) : null}
        {prossimaGara && (
          <div className="row" style={{ marginTop: 14 }}>
            {analisiGara ? (
              <Link to={`/analisi-gara/${analisiGara.id}`} className="btn"><FileSearch size={18} /> Apri analisi gara</Link>
            ) : (
              <Link to={`/analisi-gara?evento=${prossimaGara.id}`} className="btn"><FileSearch size={18} /> Carica il PDF della gara</Link>
            )}
          </div>
        )}
        {!prossimaGara && (
          <>
            <div className="kicker">Obiettivo</div>
            <h2>Nessuna gara in calendario</h2>
            <p className="prose" style={{ margin: '8px 0 14px' }}>Aggiungi la prossima gara: Hitframe conterà i giorni e, nelle prossime fasi, costruirà il piano di allenamento attorno a lei.</p>
            <div className="row">
              <Link to="/calendario?nuovo=gara" className="btn primary"><Trophy size={18} /> Aggiungi gara</Link>
              <Link to="/analisi-gara" className="btn"><FileSearch size={18} /> Da PDF</Link>
            </div>
          </>
        )}
      </section>

      <div className="stats zone" aria-label="Questo mese" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="stat"><div className="v" style={{ color: 'var(--fuoco)' }}>{fuoco}</div><div className="l">A fuoco questo mese</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--bianco)' }}>{bianco}</div><div className="l">In bianco questo mese</div></div>
        <div className="stat"><div className="v">{colpi}</div><div className="l">Colpi sparati</div></div>
      </div>

      <div className="row">
        <Link to="/calendario?nuovo=fuoco" className="btn" style={{ flex: 1 }}><span className="dot fuoco" /> Fuoco</Link>
        <Link to="/calendario?nuovo=bianco" className="btn" style={{ flex: 1 }}><span className="dot bianco" /> In bianco</Link>
        <Link to="/timer" className="btn" style={{ flex: 1 }}><TimerIcon size={16} /> Timer</Link>
        <button className="btn" style={{ flex: 1 }} onClick={() => setDiario({})}><PenLine size={16} /> Diario</button>
      </div>
      <div className="row">
        <Link to="/fisico" className="btn" style={{ flex: 1 }}><Dumbbell size={16} /> Fisico</Link>
        <Link to="/video" className="btn" style={{ flex: 1 }}><Clapperboard size={16} /> Analizza video</Link>
      </div>
      <SpazioPartner posto="oggi" />

      {iscrizioni.length > 0 && (
        <section className="card">
          <div className="card-title"><span><BellRing size={18} style={{ verticalAlign: -3 }} /> Iscrizioni</span><a href={MARE_URL} target="_blank" rel="noreferrer">Apri MA.RE.</a></div>
          <div className="list">
            {iscrizioni.map((x) => (
              <button key={`${x.e.id}-${x.tipo}`} className="item" onClick={() => setEventoAperto(x.e)} style={x.tipo === 'scadenza' && x.giorni <= 3 ? { borderColor: 'var(--accent)' } : undefined}>
                <span className="dot gara" aria-hidden="true" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{x.tipo === 'apertura' ? 'Aprono le iscrizioni' : 'Scade l’iscrizione'}: {x.e.titolo}</div>
                  <div className="meta">{quando(x.data)}{x.e.gara?.iscrizioneUrl ? ' · link iscrizione nell’evento' : ''}</div>
                </div>
                {x.tipo === 'scadenza' && x.giorni <= 3 && <span className="badge" style={{ color: 'var(--accent)' }}>Urgente</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {daRegistrare.length > 0 && (
        <section className="card">
          <div className="card-title"><span>Da registrare</span></div>
          <p className="prose" style={{ margin: '0 0 10px', fontSize: 13 }}>Segna come svolti e annota i colpi sparati.</p>
          <div className="list">
            {daRegistrare.map((e) => <EventoItem key={e.id} e={e} onClick={() => setEventoAperto(e)} />)}
          </div>
        </section>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-title"><span>Prossimi 14 giorni</span><Link to="/calendario">Calendario</Link></div>
          {prossimi.length ? (
            <div className="list">{prossimi.map((e) => <EventoItem key={e.id} e={e} onClick={() => setEventoAperto(e)} />)}</div>
          ) : (
            <Empty text="Nessun allenamento in programma." action={<Link to="/calendario?nuovo=fuoco" className="btn">Pianifica</Link>} />
          )}
        </section>

        <section className="card">
          <div className="card-title"><span>Dal diario</span><Link to="/diario">Tutto</Link></div>
          {ultimeVoci.length ? (
            <div className="list">
              {ultimeVoci.map((v) => (
                <button key={v.id} className="item" onClick={() => setDiario({ voce: v })}>
                  <BookOpen size={18} color="var(--faint)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title">{v.titolo}</div>
                    <div className="meta">{quando(v.data)} · umore {v.umore}/5</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty text="Ancora nessuna voce." action={<button className="btn" onClick={() => setDiario({})}>Scrivi</button>} />
          )}
        </section>
      </div>

      {eventoAperto && <EventoForm key={eventoAperto.id} evento={eventoAperto} onClose={() => setEventoAperto(null)} />}
      {diario && <DiarioForm voce={diario.voce} onClose={() => setDiario(null)} />}
    </div>
  )
}

/** Manutenzioni scadute, munizioni che mancano per la prossima gara, componenti da riordinare. */
function AvvisiMateriale() {
  const oggi = oggiKey()
  const dati = useLiveQuery(async () => {
    const [armi, eventi, interventi, lotti, comp, analisi] = await Promise.all([
      db.armi.toArray(), db.eventi.toArray(), db.interventi.toArray(), db.lotti.toArray(), db.componenti.toArray(), db.analisi.toArray(),
    ])
    const out: { testo: string; to: string; tipo: 'arma' | 'munizioni' }[] = []
    for (const a of armi) {
      const c = colpiArma(a, eventi, interventi)
      for (const x of avvisiArma(a, c, oggi).filter((v) => v.stato.livello === 'scaduta').slice(0, 2)) out.push({ testo: `${a.nome}: ${x.voce.toLowerCase()}`, to: `/attrezzatura/${a.id}`, tipo: 'arma' })
    }
    if (lotti.length) {
      const sc = scorta(lotti, eventi)
      const colpiA = new Map<number, number>()
      for (const a of analisi) {
        const sez = a.lettura.sezioni[a.sezione] ?? a.lettura.sezioni[0]
        if (a.eventoId && sez) colpiA.set(a.eventoId, profiloGara(sez.stages).colpi)
      }
      const f = fabbisogno(eventi, sc.pronte, oggi, (g) => colpiA.get(g.id!) ?? null)
      if (f && f.mancano > 0) out.push({ testo: `Munizioni: ne mancano circa ${f.mancano} per ${f.gara.titolo}`, to: '/munizioni', tipo: 'munizioni' })
    }
    const basso = comp.filter((c) => c.sogliaMinima !== null && c.quantita <= c.sogliaMinima)
    if (basso.length) out.push({ testo: `Da riordinare: ${basso.map((c) => c.nome).join(', ')}`, to: '/munizioni?vista=magazzino', tipo: 'munizioni' })
    return out
  }, [oggi]) ?? []
  const [aperto, setAperto] = useState(false)
  if (!dati.length) return null
  return (
    <>
      <button className="btn icon ghost avviso-triangolo" aria-label={`Attenzione: ${dati.length} avvisi sul materiale`} title="Materiale" onClick={() => setAperto(true)}>
        <AlertTriangle size={24} />
        {dati.length > 1 && <span className="avviso-numero">{dati.length}</span>}
      </button>
      {aperto && (
        <Sheet title="Materiale" onClose={() => setAperto(false)}>
          <div className="list">
            {dati.map((d) => (
              <Link key={d.testo} to={d.to} className="item">
                {d.tipo === 'arma' ? <Wrench size={18} color="var(--accent)" /> : <Package size={18} color="var(--accent)" />}
                <div className="title" style={{ fontSize: 14, flex: 1 }}>{d.testo}</div>
              </Link>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
