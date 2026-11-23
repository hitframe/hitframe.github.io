import { useLiveQuery } from 'dexie-react-hooks'
import { sintesiCorsa } from '../video/corse'
import { ArrowLeft, Shuffle, CalendarCheck, Dumbbell, Plus, Trash2, X, Clapperboard } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DRILLS } from '../allenamento/drills'
import { Segmented, Sheet, useToast } from '../components/ui'
import StageDisegno from '../components/StageDisegno'
import { abbinaStage } from '../risultati/abbinamento'
import { db } from '../db/db'
import { fmtMedio, oggiKey } from '../lib/date'
import { leggiDateGara } from '../analisi/date'
import { metalli } from '../analisi/motore'
import type { StageLetto } from '../analisi/tipi'
import DiarioCollegato from '../components/DiarioCollegato'
import { descriviCampo, punteggioReale } from '../risultati/reale'
import { armaDiGara } from '../statistiche/filtri'
import { inAltreDivisioni, analizza, avversariVicini, colpiStage, confronto, controRiferimento, indicazioni, nomeLeggibile, trovaPerNome, type Analisi, type RisultatoGara, type StageConc } from '../risultati/motore'
import { Crosshair } from 'lucide-react'
import { getImp, setImp } from '../db/db'
import { Star } from 'lucide-react'

type Vista = 'riepilogo' | 'stage' | 'avversari' | 'allenamento'
const addGiorni = (k: string, g: number) => new Date(Date.parse(k) + g * 86400000).toISOString().slice(0, 10)
const f1 = (n: number) => n.toFixed(1).replace('.', ',')
const f2 = (n: number) => n.toFixed(2).replace('.', ',')
const pc = (n: number) => `${Math.round(n * 100)}%`
const nomeBreve = (n: string) => n.split(',').map((x) => x.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())).reverse().join(' ')

export default function RisultatoDettaglio() {
  const { id } = useParams()
  const rid = Number(id)
  const r = useLiveQuery(() => db.risultati.get(rid), [rid])
  const armi = useLiveQuery(() => db.armi.toArray()) ?? []
  const [vista, setVista] = useState<Vista>('riepilogo')
  const navigate = useNavigate()
  const [conferma, setConferma] = useState(false)
  // Libretto della stessa gara (Analisi gara): tipo di bersagli per stage
  const libretto = useLiveQuery(async () => {
    if (!r) return null
    for (const an of await db.analisi.toArray()) {
      const sez = an.lettura.sezioni[an.sezione] ?? an.lettura.sezioni[0]
      if (!sez) continue
      const d = leggiDateGara(sez.info.date)
      const stessaData = d && r.data >= d.inizio && r.data <= addGiorni(d.fine, 2)
      if ((r.eventoId && an.eventoId === r.eventoId) || stessaData) return { id: an.id!, stages: sez.stages, pdf: an.pdf }
    }
    return null
  }, [r?.id, r?.eventoId, r?.data])
  // abbinamento automatico degli stage (la numerazione dei risultati non segue il libretto)
  useEffect(() => {
    if (!r || !libretto || (r.abbinamento && r.abbinamento.analisiId === libretto.id)) return
    const ab = abbinaStage(r, libretto.stages)
    if (ab) void db.risultati.update(r.id!, { abbinamento: { analisiId: libretto.id, ...ab, manuale: false } })
  }, [r, libretto])
  const tipi = useMemo(() => {
    if (!r?.abbinamento || !libretto || r.abbinamento.analisiId !== libretto.id) return undefined
    const t: Record<number, 'Short' | 'Medium' | 'Long'> = {}
    for (const [rn, bn] of Object.entries(r.abbinamento.mappa)) { const st = libretto.stages.find((z) => z.numero === bn); if (st) t[+rn] = st.tipo }
    return t
  }, [r?.abbinamento, libretto]) // eslint-disable-line react-hooks/exhaustive-deps

  const a = r ? analizza(r, tipi) : null
  if (r === undefined) return <div className="page" />
  if (!r || !a) return <div className="page"><Link to="/risultati" className="btn ghost"><ArrowLeft size={18} /> Risultati</Link><div className="card">Risultato non trovato.</div></div>

  return (
    <div className="page">
      <Link to="/risultati" className="btn ghost" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><ArrowLeft size={18} /> Risultati</Link>
      <header className="page-header">
        <div>
          <h1>{r.gara}</h1>
          <div className="sub">{fmtMedio(r.data)} · {r.divisione} · {nomeBreve(a.me.nome)} #{a.me.num}{a.me.cls ? ` · classe ${a.me.cls}` : ''}</div>
        </div>
      </header>

      <section className="hero">
        <div className="kicker">Classifica {r.divisione}</div>
        <div className="countdown" style={{ marginTop: 6 }}>
          <span className="n">{a.base.pos}°</span><span className="u">su {a.totale}{r.fonte === 'screenshot' ? '+' : ''}</span>
          <span className="spacer" />
          <span className="badge" style={{ fontSize: 14 }}>{f2(a.base.pct)}%</span>
        </div>
        <div className="meta" style={{ color: 'var(--muted)', marginTop: 6 }}>
          {f1(a.base.punti)} punti{a.me.cls ? ` · ${a.posClasse}° di ${a.totClasse} in classe ${a.me.cls}` : ''}
          {a.sopra ? ` · ${f1(a.sopra.punti - a.base.punti)} punti dal ${a.sopra.pos}°` : ''}
        </div>
      </section>

      {r.fonte === 'screenshot' && (
        <p className="prose" style={{ margin: 0, fontSize: 13 }}>
          Dagli screenshot di PractiScore: conosco i tiratori visibili nelle tabelle. Per avere tutti, scorri la tabella e carica anche gli screenshot successivi.
        </p>
      )}
      {!r.conVerify && (
        <div className="card avviso">Senza gli statini (Score Verification) non conosco A, C, D e mancati: carica anche quel PDF per l’analisi degli errori.</div>
      )}

      <Segmented<Vista> label="Sezione" value={vista} onChange={setVista}
        options={[{ value: 'riepilogo', label: 'Riepilogo' }, { value: 'stage', label: 'Stage' }, { value: 'avversari', label: 'Avversari' }, { value: 'allenamento', label: 'Allena' }]} />

      {vista === 'riepilogo' && armi.length > 0 && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="ris-arma">Arma usata in questa gara</label>
          <select id="ris-arma" className="input" value={r.armaId ?? ''} onChange={(e) => db.risultati.update(r.id!, { armaId: e.target.value ? +e.target.value : null })}>
            <option value="">{`Automatica (${armaDiGara({ data: r.data, armaId: null }, armi)?.nome || 'nessuna'})`}</option>
            {armi.map((x) => <option key={x.id} value={x.id}>{x.nome || x.modello}</option>)}
          </select>
        </div>
      )}
      {vista === 'riepilogo' && <Riferimento r={r} />}
      {vista === 'riepilogo' && <PunteggioReale r={r} pct={a.base.pct} />}
      {vista === 'riepilogo' && <Riepilogo a={a} r={r} />}
      {vista === 'riepilogo' && <AltreDivisioni r={r} />}
      {vista === 'riepilogo' && (
        <DiarioCollegato eventoId={r.eventoId} date={[addGiorni(r.data, -2), addGiorni(r.data, -1), r.data]} titolo="Testa e sensazioni"
          invito="Com’eri arrivato a questa gara? Sonno, concentrazione, cosa è andato bene: scrivilo, entra nelle statistiche." />
      )}
      {vista === 'stage' && <Stage a={a} r={r} libretto={libretto ?? null} />}
      {vista === 'avversari' && <Avversari r={r} />}
      {vista === 'allenamento' && <Allenamento a={a} r={r} />}

      <div className="row">
        <div className="spacer" />
        {conferma
          ? <button className="btn danger" onClick={async () => { await db.risultati.delete(rid); navigate('/risultati') }}>Conferma eliminazione</button>
          : <button className="btn ghost" onClick={() => setConferma(true)}><Trash2 size={16} /> Elimina</button>}
      </div>
    </div>
  )
}

function PunteggioReale({ r, pct }: { r: RisultatoGara; pct: number }) {
  const x = useMemo(() => punteggioReale(r), [r])
  if (!x) return null
  const diff = x.indice - pct
  return (
    <section className="card">
      <div className="card-title"><span>Punteggio reale</span><span className="badge" style={{ fontSize: 15, color: 'var(--accent)' }}>{f1(x.indice)}</span></div>
      <p className="prose" style={{ margin: 0 }}>
        {descriviCampo(x)}. Il vincitore ha fatto {Math.round(x.forza)} sulla stessa scala.
        {Math.abs(diff) >= 3 && (diff < 0
          ? <> Il tuo {f1(pct)}% è “gonfiato” da un campo {x.livello === 'basso' || x.livello === 'medio' ? 'non fortissimo' : 'favorevole'}: in termini assoluti la gara vale {f1(x.indice)}.</>
          : <> Il tuo {f1(pct)}% sottostima la gara: davanti c’erano tiratori molto forti, in termini assoluti vale {f1(x.indice)}.</>)}
      </p>
      {(x.precisione !== null || x.velocita !== null) && (
        <div className="stats" style={{ marginTop: 10 }}>
          <div className="stat"><div className="v">{f1(x.indice)}</div><div className="l">Reale</div></div>
          {x.precisione !== null && <div className="stat"><div className="v">{f1(x.precisione)}</div><div className="l">Precisione</div></div>}
          {x.velocita !== null && <div className="stat"><div className="v">{f1(x.velocita)}</div><div className="l">Velocità</div></div>}
        </div>
      )}
      <p className="prose" style={{ fontSize: 12, margin: '8px 0 0' }}>
        100 = un Grand Master in forma sugli stessi stage, stimato da tutti i tiratori presenti e dalla loro classe. Non dipende da chi ha vinto:
        si confrontano gare diverse in modo onesto.{!x.affidabile && ' Pochi tiratori con classe nota: stima indicativa.'}
      </p>
    </section>
  )
}

function AltreDivisioni({ r }: { r: RisultatoGara }) {
  const [aperto, setAperto] = useState(false)
  if (!aperto) {
    return (
      <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAperto(true)}>
        <Shuffle size={16} /> E se fossi in un’altra divisione?
      </button>
    )
  }
  const lista = inAltreDivisioni(r)
  return (
    <section className="card">
      <div className="card-title"><span>E se fossi in un’altra divisione?</span><button className="btn ghost" style={{ minHeight: 32, padding: '0 8px' }} onClick={() => setAperto(false)}>Chiudi</button></div>
      {!r.altre ? (
        <p className="prose" style={{ margin: 0, fontSize: 13 }}>Ricarica i PDF dei risultati di questa gara: ora salvo anche le altre divisioni per questo confronto.</p>
      ) : lista.length === 0 ? (
        <p className="prose" style={{ margin: 0, fontSize: 13 }}>Nessun’altra divisione con gli stessi stage in questa gara.</p>
      ) : (
        <>
          <div className="list">
            {lista.map((x) => (
              <div key={x.divisione} className="item" style={{ padding: '10px 12px' }}>
                <div style={{ flex: 1 }}>
                  <div className="title">{x.divisione}</div>
                  <div className="meta">{x.pos}° su {x.tot}{r.concorrenti.find((c) => c.num === r.mioNum)?.cls ? ` · ${x.posClasse}° tra i ${x.totClasse} di classe ${r.concorrenti.find((c) => c.num === r.mioNum)!.cls}` : ''}{x.major ? ` · in major ${x.major.pos}° (${f1(x.major.pct)}%)` : ''}</div>
                </div>
                <b>{f1(x.pct)}%</b>
              </div>
            ))}
          </div>
          <p className="prose" style={{ fontSize: 12, margin: '10px 0 0' }}>
            Con i tuoi hit factor stage per stage, inseriti nella classifica di quella divisione. È una sbirciata: con un’altra arma (ottica, capienza, major) i tuoi tempi cambierebbero.
            Per le divisioni che ammettono il major ricalcolo anche i tuoi colpi con C da 4 e D da 2.
          </p>
        </>
      )}
    </section>
  )
}

function Scenario({ titolo, sotto, ris, base }: { titolo: string; sotto: string; ris: { pos: number; pct: number; posClasse: number } | null; base: Analisi['base'] }) {
  if (!ris) return null
  const salto = base.pos - ris.pos
  return (
    <div className="item" style={{ padding: '10px 12px' }}>
      <div style={{ flex: 1 }}>
        <div className="title">{titolo}</div>
        <div className="meta">{sotto}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 800, fontSize: 24, color: salto > 0 ? 'var(--accent)' : undefined }}>{ris.pos}°</div>
        <div className="meta">{f1(ris.pct)}%{salto > 0 ? ` · +${salto}` : ''}</div>
      </div>
    </div>
  )
}

function Riepilogo({ a, r }: { a: Analisi; r: RisultatoGara }) {
  const persiCD = a.stages.reduce((x, s) => x + s.persiPrecisione, 0)
  const persiErr = a.stages.reduce((x, s) => x + s.persiErrori, 0)
  const tempoVsTop = a.mio.tempo - a.top10.tempo
  return (
    <>
      <section className="card">
        <div className="card-title">E se…</div>
        <div className="list">
          <Scenario titolo="Senza mancati e procedure" sotto="I mancati diventano A, via le penalità" ris={a.scenari.senzaErrori} base={a.base} />
          <Scenario titolo="Con la precisione dei primi 10" sotto={`Stessi tempi, punti al ${pc(a.top10.precisione)} del massimo`} ris={a.scenari.precisioneTop10} base={a.base} />
          <Scenario titolo="Il 5% più veloce" sotto="Stessi punti, tempi ridotti del 5%" ris={a.scenari.veloce5} base={a.base} />
          <Scenario titolo="Tutte A (limite teorico)" sotto="Stessi tempi, ogni colpo in A" ris={a.scenari.tutteA} base={a.base} />
        </div>
        {a.scenari.senzaErrori && a.me.cls && <p className="prose" style={{ fontSize: 13, margin: '10px 0 0' }}>Senza errori saresti stato {a.scenari.senzaErrori.posClasse}° in classe {a.me.cls}.</p>}
      </section>

      {r.conVerify && (
        <section className="card">
          <div className="card-title">Precisione e velocità</div>
          <div className="tabella-confronto">
            <div /><div className="h">Tu</div><div className="h">Primi 10</div><div className="h">Classe {a.me.cls || '—'}</div>
            <div className="l">Colpi in A</div><div className="v">{pc(a.mio.aPct)}</div><div>{pc(a.top10.aPct)}</div><div>{pc(a.mediaClasse.aPct)}</div>
            <div className="l">Punti sul massimo</div><div className="v">{pc(a.mio.precisione)}</div><div>{pc(a.top10.precisione)}</div><div>{pc(a.mediaClasse.precisione)}</div>
            <div className="l">Tempo totale</div><div className="v">{f1(a.mio.tempo)} s</div><div>{f1(a.top10.tempo)} s</div><div>{f1(a.mediaClasse.tempo)} s</div>
          </div>
          <p style={{ margin: '12px 0 0' }}>
            {a.distacco.quotaPrecisione > 0.6
              ? <>Il distacco da {a.distacco.rif ? nomeBreve(a.distacco.rif.nome) : 'chi ti precede'} ({a.distacco.rif?.pos}°) viene soprattutto dai <b>punti</b>{tempoVsTop < 0 ? <>: sei più veloce dei primi 10 di {f1(-tempoVsTop)} s in totale, ma lasci punti per strada.</> : '.'}</>
              : a.distacco.quotaVelocita > 0.6
                ? <>Il distacco da {a.distacco.rif ? nomeBreve(a.distacco.rif.nome) : 'chi ti precede'} viene soprattutto dal <b>tempo</b>: i punti sono già in linea.</>
                : <>Il distacco da {a.distacco.rif ? nomeBreve(a.distacco.rif.nome) : 'chi ti precede'} si divide tra punti ({pc(a.distacco.quotaPrecisione)}) e tempo ({pc(a.distacco.quotaVelocita)}).</>}
          </p>
        </section>
      )}

      {r.conVerify && (
        <section className="card">
          <div className="card-title">Colpi</div>
          <div className="chips">
            <span className="badge zona-a">A {a.tot.A}</span>
            <span className="badge zona-c">C {a.tot.C}</span>
            <span className="badge zona-d">D {a.tot.D}</span>
            <span className={`badge${a.tot.MI ? ' zona-m' : ''}`}>Mancati {a.tot.MI}</span>
            <span className="badge" style={{ color: a.tot.NS ? 'var(--fuoco)' : undefined }}>No-shoot {a.tot.NS}</span>
            <span className="badge" style={{ color: a.tot.PE ? 'var(--fuoco)' : undefined }}>Procedure {a.tot.PE}</span>
          </div>
          <p className="prose" style={{ margin: '10px 0 0' }}>
            Punti stage persi: {persiCD} tra C e D, {persiErr} per mancati, no-shoot e procedure (un mancato costa 15 punti: 5 non presi più 10 di penalità).
          </p>
        </section>
      )}
    </>
  )
}

type Libretto = { id: number; stages: StageLetto[]; pdf: Blob | null }

function Stage({ a, r, libretto }: { a: Analisi; r: RisultatoGara; libretto: Libretto | null }) {
  const [ordine, setOrdine] = useState<'numero' | 'costo'>('costo')
  const nomeRif = useLiveQuery(() => getImp<string>('riferimento', '')) ?? ''
  const rif = nomeRif ? trovaPerNome(r, nomeRif) : undefined
  const cr = rif && rif.num !== r.mioNum ? controRiferimento(r, rif.num) : null
  const [verifica, setVerifica] = useState(false)
  const ab = libretto && r.abbinamento?.analisiId === libretto.id ? r.abbinamento : null
  const reale = useMemo(() => punteggioReale(r), [r])
  const corse = useLiveQuery(() => (r.id != null ? db.corse.where('risultatoId').equals(r.id).toArray() : []), [r.id]) ?? []
  const lista = [...a.stages].sort((x, y) => (ordine === 'numero' ? x.n - y.n : (y.guadagnoErrori + y.guadagnoPrecisione) - (x.guadagnoErrori + x.guadagnoPrecisione) || x.s.pct - y.s.pct))
  return (
    <section className="card">
      <div className="card-title">
        <span>Stage</span>
        <Segmented<'numero' | 'costo'> label="Ordine" value={ordine} onChange={setOrdine} options={[{ value: 'costo', label: 'Dove hai perso' }, { value: 'numero', label: 'In ordine' }]} />
      </div>
      {!libretto && <p className="prose" style={{ margin: '0 0 10px', fontSize: 13 }}>Carica il libretto della gara in Analisi gara per vedere anche metalli, no-shoot e attivazioni di ogni stage.</p>}
      {ab && (
        <div className="card avviso" style={{ marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            I numeri dei risultati non seguono il libretto: ho abbinato gli stage da punti, no-shoot, metalli e tempi.
            {ab.manuale ? ' Abbinamento verificato da te.' : ab.incerti.length ? ` ${ab.incerti.length} da verificare.` : ''}
          </div>
          <button className="btn" style={{ minHeight: 36 }} onClick={() => setVerifica(true)}>Verifica</button>
        </div>
      )}
      {verifica && ab && libretto && <VerificaAbbinamento r={r} libretto={libretto} onClose={() => setVerifica(false)} />}
      <div className="list">
        {lista.map((x) => {
          const s = x.s
          const colore = s.pct >= 85 ? 'var(--ok)' : s.pct >= 70 ? 'var(--accent)' : 'var(--fuoco)'
          return (
            <div key={x.n} className="item" style={{ display: 'block' }}>
              <div className="row">
                <div className="title" style={{ flex: 1 }}>Stage {x.n} <span className="meta">· {x.corso} · {colpiStage(s) || x.colpi} colpi</span></div>
                <b style={{ color: colore }}>{f1(s.pct)}%</b>
              </div>
              <div className="meta" style={{ marginTop: 2 }}>
                {s.pos}° su {x.totale} · HF {f2(s.hf)} (primo {f2(x.hfMax)}) · {f2(s.tempo)} s (il vincitore {f2(x.tempoVincitore)} s)
              </div>
              {(() => {
                const sr = reale?.stages.find((z) => z.n === x.n)
                if (!sr) return null
                return (
                  <div className="meta" style={{ marginTop: 2 }}>
                    Reale <b style={{ color: 'var(--text)' }}>{f1(sr.indice)}</b>
                    {sr.precisione !== null ? ` · precisione ${f1(sr.precisione)}` : ''}{sr.velocita !== null ? ` · velocità ${f1(sr.velocita)}` : ''}
                    {` · vincitore ${Math.round(sr.vincitore)}`}
                  </div>
                )
              })()}
              {(() => {
                const c = corse.find((z) => z.stage === x.n)
                if (!c) return null
                const v = sintesiCorsa(c)
                const p = (n: number | null) => (n == null ? null : n.toFixed(2).replace('.', ','))
                return (
                  <Link to={`/video/run/${c.id}`} className="meta video-stage" style={{ marginTop: 4, display: 'block' }}>
                    <Clapperboard size={13} style={{ verticalAlign: -2 }} /> <b style={{ color: 'var(--text)' }}>Dal video:</b>
                    {' '}primo colpo {p(v.primo)}{v.split != null ? ` · split ${p(v.split)}` : ''}{v.transizione != null ? ` · transizioni ${p(v.transizione)}` : ''}
                    {v.ricariche.length ? ` · ricarica ${p(v.ricariche.reduce((a, b) => a + b, 0) / v.ricariche.length)}` : ''}
                    {v.movimenti.length ? ` · movimenti ${p(v.movimenti.reduce((a, b) => a + b, 0))} in tutto` : ''}
                  </Link>
                )
              })()}
              {(() => {
                const bn = ab?.mappa[x.n]
                const st = bn ? libretto?.stages.find((z) => z.numero === bn) : undefined
                if (!st) return null
                const met = metalli(st)
                return (
                  <div className="meta" style={{ marginTop: 4 }}>
                    <b style={{ color: 'var(--text)' }}>Libretto: stage {st.numero}</b>{ab!.incerti.includes(x.n) && !ab!.manuale ? <span style={{ color: 'var(--accent)' }}> (da verificare)</span> : ''}{' · '}
                    {[met ? `${met} metalli` : '', st.bersagli.noShoot ? `${st.bersagli.noShoot} no-shoot` : '', st.flag.mobili ? 'attivazioni' : '', st.flag.manoDebole ? 'mano debole' : st.flag.manoForte ? 'mano forte' : ''].filter(Boolean).join(' · ') || 'solo carta'}
                    {' · '}<Link to={`/analisi-gara/${libretto!.id}/stage/${st.numero}`}>studio dello stage</Link>
                  </div>
                )
              })()}
              {(() => {
                const x2 = cr?.stages.find((z) => z.n === x.n)
                if (!cr || !x2?.suo) return null
                return (
                  <div className="meta" style={{ marginTop: 4 }}>
                    <Crosshair size={12} style={{ verticalAlign: -1 }} /> <b style={{ color: 'var(--text)' }}>{nomeBreve(cr.o.nome)}:</b> {statino(x2.suo)} · HF {f2(x2.suo.hf)}
                    {x2.hfPct != null && <> → sei al <b style={{ color: x2.hfPct >= 100 ? 'var(--ok)' : 'var(--fuoco)' }}>{f1(x2.hfPct)}%</b></>}
                  </div>
                )
              })()}
              {s.A !== undefined && (
                <div className="chips" style={{ marginTop: 6 }}>
                  <span className="badge">{s.A}A {s.C}C {s.D}D</span>
                  {!!s.MI && <span className="badge" style={{ color: 'var(--fuoco)' }}>{s.MI} mancat{s.MI === 1 ? 'o' : 'i'}</span>}
                  {!!s.NS && <span className="badge" style={{ color: 'var(--fuoco)' }}>{s.NS} no-shoot</span>}
                  {!!s.PE && <span className="badge" style={{ color: 'var(--fuoco)' }}>{s.PE} procedur{s.PE === 1 ? 'a' : 'e'}</span>}
                </div>
              )}
              <div className="meta" style={{ marginTop: 6 }}>
                Punti gara recuperabili: {x.guadagnoErrori > 0.05 ? <><b style={{ color: 'var(--text)' }}>+{f1(x.guadagnoErrori)}</b> senza errori · </> : ''}
                {s.A !== undefined ? <>+{f1(x.guadagnoPrecisione)} con tutte A · </> : ''}+{f1(x.guadagnoTempo5)} con il 5% di tempo in meno
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function VerificaAbbinamento({ r, libretto, onClose }: { r: RisultatoGara; libretto: Libretto; onClose: () => void }) {
  const ab = r.abbinamento!
  const me = r.concorrenti.find((c) => c.num === r.mioNum)!
  const [mappa, setMappa] = useState<Record<number, number>>({ ...ab.mappa })
  const nr = Object.keys(r.valoreStage).map(Number).sort((x, y) => x - y)
  function scegli(rn: number, bn: number) {
    // scambio: lo stage del libretto resta abbinato a un solo stage dei risultati
    const altro = nr.find((k) => mappa[k] === bn)
    setMappa((m) => ({ ...m, [rn]: bn, ...(altro !== undefined ? { [altro]: m[rn] } : {}) }))
  }
  async function salva() {
    await db.risultati.update(r.id!, { abbinamento: { ...ab, mappa, manuale: true, incerti: [] } })
    onClose()
  }
  return (
    <Sheet title="Abbina gli stage al libretto" onClose={onClose}>
      <p className="prose" style={{ marginTop: 0, fontSize: 13 }}>Per ogni stage della classifica scegli lo stage del libretto. Il disegno ti aiuta a riconoscerlo; si possono scambiare solo stage con gli stessi punti.</p>
      <div className="list">
        {nr.map((rn) => {
          const s = me.stages[rn]
          const st = libretto.stages.find((z) => z.numero === mappa[rn])
          const opzioni = libretto.stages.filter((z) => z.puntiMax === r.valoreStage[rn])
          return (
            <div key={rn} className="item" style={{ display: 'block' }}>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <div className="title">Classifica stage {rn} · {r.valoreStage[rn]} punti{ab.incerti.includes(rn) && !ab.manuale ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · da verificare</span> : ''}</div>
                  <div className="meta">Tu: {s ? `${f2(s.tempo)} s · ${s.A ?? '?'}A ${s.C ?? '?'}C${s.MI ? ` ${s.MI}M` : ''}` : '—'}</div>
                </div>
                <select className="select" style={{ width: 'auto' }} aria-label={`Stage del libretto per lo stage ${rn}`} value={mappa[rn]} onChange={(e) => scegli(rn, Number(e.target.value))}>
                  {opzioni.map((z) => <option key={z.numero} value={z.numero}>Libretto {z.numero}</option>)}
                </select>
              </div>
              {st && libretto.pdf && <div style={{ marginTop: 8 }}><StageDisegno analisiId={libretto.id} pdf={libretto.pdf} pagina={st.pagina} tagliaY={st.tabellaTopY} cimaY={st.disegnoTopY} alt={`Disegno dello stage ${st.numero} del libretto`} /></div>}
            </div>
          )
        })}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Annulla</button>
        <button className="btn primary" onClick={salva}>Conferma abbinamento</button>
      </div>
    </Sheet>
  )
}

function Avversari({ r }: { r: RisultatoGara }) {
  const rivali = useLiveQuery(() => getImp<string[]>('rivali', [])) ?? []
  const numRivali = rivali.map((n) => trovaPerNome(r, n)?.num).filter((n): n is number => !!n && n !== r.mioNum)
  const base = r.avversari ?? avversariVicini(r)
  const scelti = [...new Set([...numRivali, ...base])]
  const [cerca, setCerca] = useState('')
  const imposta = (lista: number[]) => db.risultati.update(r.id!, { avversari: lista })
  const candidati = r.concorrenti.filter((c) => c.num !== r.mioNum && !scelti.includes(c.num))
  const trovato = cerca.trim() ? candidati.find((c) => nomeLeggibile(c.nome).toLowerCase() === cerca.trim().toLowerCase()) ?? trovaPerNome({ ...r, concorrenti: candidati }, cerca) : undefined
  async function aggiungi(segui: boolean) {
    if (!trovato) return
    await imposta([...base.filter((x) => x !== trovato.num), trovato.num])
    if (segui) await setImp('rivali', [...new Set([...rivali, nomeLeggibile(trovato.nome)])])
    setCerca('')
  }
  return (
    <>
      <section className="card form">
        <div className="card-title" style={{ marginBottom: 0 }}>Avversari diretti</div>
        <p className="prose" style={{ margin: 0, fontSize: 13 }}>
          Ci sono i 3 sopra e i 3 sotto di te e gli avversari che segui (<Star size={12} style={{ verticalAlign: -1 }} />), che ritrovo da soli in ogni gara che importi. Scrivi un nome per aggiungerne altri.
        </p>
        <input className="input" list="elenco-tiratori" placeholder="Nome e cognome" aria-label="Cerca tiratore" value={cerca} onChange={(e) => setCerca(e.target.value)} />
        <datalist id="elenco-tiratori">{candidati.map((c) => <option key={c.num} value={nomeLeggibile(c.nome)}>{c.pos}° {c.cls}</option>)}</datalist>
        {cerca.trim() && (trovato ? (
          <div className="row">
            <span style={{ flex: 1, fontSize: 14 }}>{trovato.pos}° {nomeLeggibile(trovato.nome)}{trovato.cls ? ` · ${trovato.cls}` : ''}</span>
            <button className="btn" onClick={() => aggiungi(false)}><Plus size={16} /> Solo qui</button>
            <button className="btn primary" onClick={() => aggiungi(true)}><Star size={16} /> Segui sempre</button>
          </div>
        ) : <p className="prose" style={{ margin: 0, fontSize: 13 }}>Nessun tiratore con questo nome in {r.divisione}.</p>)}
      </section>
      {scelti.map((num) => {
        const c = confronto(r, num)
        const max = Math.max(...c.perStage.map((x) => Math.abs(x.diff)), 1)
        const peggiori = [...c.perStage].sort((x, y) => x.diff - y.diff).filter((x) => x.diff < 0).slice(0, 2)
        return (
          <section key={num} className="card">
            <div className="card-title">
              <span>{numRivali.includes(num) && <Star size={14} color="var(--accent)" style={{ verticalAlign: -2, marginRight: 4 }} />}{c.o.pos}° {nomeBreve(c.o.nome)}{c.o.cls ? ` · ${c.o.cls}` : ''}</span>
              <button className="btn ghost icon" aria-label="Togli avversario" onClick={async () => {
                if (numRivali.includes(num)) await setImp('rivali', rivali.filter((n) => trovaPerNome(r, n)?.num !== num))
                await imposta(base.filter((x) => x !== num))
              }}><X size={16} /></button>
            </div>
            <p style={{ margin: '0 0 10px' }}>
              {c.diff >= 0 ? <>Gli stai davanti di <b>{f1(c.diff)}</b> punti.</> : <>Ti sta davanti di <b>{f1(-c.diff)}</b> punti.</>}
              {peggiori.length > 0 && <> Ti ha battuto soprattutto negli stage {peggiori.map((x) => x.n).join(' e ')}.</>}
            </p>
            <div className="barre-diff">
              {c.perStage.map((x) => (
                <div key={x.n} className="riga">
                  <span className="n">{x.n}</span>
                  <div className="asse">
                    <span style={{ [x.diff >= 0 ? 'left' : 'right']: '50%', width: `${(Math.abs(x.diff) / max) * 50}%`, background: x.diff >= 0 ? 'var(--ok)' : 'var(--fuoco)' }} />
                  </div>
                  <span className="d" style={{ color: x.diff >= 0 ? 'var(--ok)' : 'var(--fuoco)' }}>{x.diff >= 0 ? '+' : ''}{f1(x.diff)}</span>
                  <span className="t">{x.suo ? `${f2(x.suo.tempo)} s · ${x.suo.A !== undefined ? `${x.suo.A}A ${x.suo.C}C${x.suo.MI ? ` ${x.suo.MI}M` : ''}` : `${x.suo.pts} pt`}` : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}

function Allenamento({ a, r }: { a: Analisi; r: RisultatoGara }) {
  const toast = useToast()
  const ind = indicazioni(a)
  const gare = useLiveQuery(() => db.eventi.where('tipo').equals('gara').reverse().sortBy('data')) ?? []
  const evento = gare.find((g) => g.id === r.eventoId)
  const colpiStimati = a.colpiTot ? a.colpiTot + 8 : 0

  async function aggiungiASessione(drill: string[]) {
    const oggi = oggiKey()
    const s = (await db.eventi.where('data').aboveOrEqual(oggi).filter((e) => e.tipo === 'fuoco' && !e.completato).sortBy('data'))[0]
    if (!s?.id) { toast('Nessuna sessione a fuoco in calendario: creala e riprova'); return }
    const lista = [...new Set([...(s.drill ?? []), ...drill.filter((d) => DRILLS.find((x) => x.id === d)?.modalita === 'fuoco')])]
    await db.eventi.update(s.id, { drill: lista })
    toast(`Drill aggiunti alla sessione del ${fmtMedio(s.data)}`)
  }

  return (
    <>
      {ind.length === 0 ? <div className="card">Gara pulita: nessuna priorità evidente. Continua con il piano.</div> : ind.map((x) => (
        <section key={x.titolo} className="card">
          <div className="card-title">{x.titolo}</div>
          <p style={{ margin: '0 0 10px' }}>{x.perche}</p>
          <div className="chips">
            {x.drill.map((id) => {
              const d = DRILLS.find((z) => z.id === id)
              return d ? <Link key={id} to={`/allenamento/${id}`} className={`badge ${d.modalita}`} style={{ padding: '6px 10px' }}>{d.nome}{d.modalita === 'bianco' ? ' · in bianco' : ''}</Link> : null
            })}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => aggiungiASessione(x.drill)}><Dumbbell size={16} /> Aggiungi alla prossima sessione</button>
          </div>
        </section>
      ))}

      <section className="card form">
        <div className="card-title" style={{ marginBottom: 0 }}><span><CalendarCheck size={18} style={{ verticalAlign: -3 }} /> Calendario</span></div>
        <select className="select" aria-label="Gara del calendario" value={r.eventoId ?? ''} onChange={(e) => db.risultati.update(r.id!, { eventoId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Non collegata a una gara del calendario</option>
          {gare.map((g) => <option key={g.id} value={g.id}>{fmtMedio(g.data)} · {g.titolo}</option>)}
        </select>
        {evento && !evento.completato && (
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { await db.eventi.update(evento.id!, { completato: true, colpiSparati: evento.colpiSparati ?? colpiStimati }); toast('Gara segnata come disputata') }}>
            Segna disputata ({colpiStimati} colpi circa)
          </button>
        )}
        {evento?.completato && <p className="prose" style={{ margin: 0, fontSize: 13 }}>Gara segnata come disputata: i colpi contano per munizioni e arma.</p>}
      </section>
    </>
  )
}

/** "18A 3C 1D 1M · 18,99 s · 100 pt" */
function statino(s: StageConc) {
  const c = s.A !== undefined ? [`${s.A}A`, `${s.C}C`, s.D ? `${s.D}D` : '', s.MI ? `${s.MI}M` : '', s.NS ? `${s.NS}NS` : '', s.PE ? `${s.PE}P` : ''].filter(Boolean).join(' ') + ' · ' : ''
  return `${c}${f2(s.tempo)} s · ${s.pts} pt`
}

/** Il tiratore di riferimento: un metro costante, gara dopo gara. */
function Riferimento({ r }: { r: RisultatoGara }) {
  const nome = useLiveQuery(() => getImp<string>('riferimento', ''))
  const rivali = useLiveQuery(() => getImp<string[]>('rivali', [])) ?? []
  const [cerca, setCerca] = useState('')
  if (nome === undefined) return null
  const o = nome ? trovaPerNome(r, nome) : undefined
  if (!o || o.num === r.mioNum) {
    const altri = r.concorrenti.filter((c) => c.num !== r.mioNum)
    const trovato = cerca.trim() ? altri.find((c) => nomeLeggibile(c.nome).toLowerCase() === cerca.trim().toLowerCase()) ?? trovaPerNome({ ...r, concorrenti: altri }, cerca) : undefined
    return (
      <section className="card form">
        <div className="card-title" style={{ marginBottom: 0 }}><span><Crosshair size={18} style={{ verticalAlign: -3 }} /> Il tuo riferimento</span></div>
        <p className="prose" style={{ margin: 0, fontSize: 13 }}>
          {nome ? `${nome} non era in questa gara (${r.divisione}).` : 'Scegli un tiratore costante da usare come metro: ti confronto con lui stage per stage, in ogni gara.'}
          {nome ? ' Puoi sceglierne un altro.' : ''}
        </p>
        <div className="row">
          <input className="input" style={{ flex: 1 }} list="rif-tiratori" placeholder="Nome e cognome" aria-label="Tiratore di riferimento" value={cerca} onChange={(e) => setCerca(e.target.value)} />
          <datalist id="rif-tiratori">{altri.map((c) => <option key={c.num} value={nomeLeggibile(c.nome)}>{c.pos}° {c.cls}</option>)}</datalist>
          <button className="btn primary" disabled={!trovato} onClick={async () => {
            if (!trovato) return
            const n = nomeLeggibile(trovato.nome)
            await setImp('rivali', [...new Set([...rivali, n])])
            await setImp('riferimento', n)
            setCerca('')
          }}><Crosshair size={16} /> Usa</button>
        </div>
      </section>
    )
  }
  const c = controRiferimento(r, o.num)
  const nb = nomeBreve(o.nome)
  const gPunti = c.conSuoiPunti ? c.conSuoiPunti.punti - r.concorrenti.find((x) => x.num === r.mioNum)!.punti : 0
  const gTempi = c.conSuoiTempi ? c.conSuoiTempi.punti - r.concorrenti.find((x) => x.num === r.mioNum)!.punti : 0
  return (
    <section className="card">
      <div className="card-title">
        <span><Crosshair size={18} style={{ verticalAlign: -3 }} /> Contro {nb}</span>
        <span className="badge" style={{ fontSize: 15, color: c.indice >= 100 ? 'var(--ok)' : 'var(--accent)' }}>{f1(c.indice)}%</span>
      </div>
      <p className="prose" style={{ margin: 0 }}>
        {c.diff >= 0 ? <>Gli stai davanti di <b>{f1(c.diff)}</b> punti gara</> : <>Ti sta davanti di <b>{f1(-c.diff)}</b> punti gara</>}
        {c.completo ? <>: sei {c.dTempo <= 0 ? <><b>{f2(-c.dTempo)} s più veloce</b></> : <><b>{f2(c.dTempo)} s più lento</b></>} in totale
          e hai fatto <b>{c.dPts >= 0 ? `${c.dPts} punti in più` : `${-c.dPts} punti in meno`}</b>.</> : '.'}
        {c.mio && c.suo && <> Colpi in A: {pc(c.mio.aPct)} contro {pc(c.suo.aPct)}; mancati e no-shoot: {c.mio.mancati} contro {c.suo.mancati}.</>}
      </p>
      {c.conSuoiPunti && c.conSuoiTempi && (
        <div className="list" style={{ marginTop: 10 }}>
          <div className="item" style={{ display: 'block' }}>
            <div className="title">Con i suoi punti e i tuoi tempi</div>
            <div className="meta">{f1(c.conSuoiPunti.punti)} punti · {c.conSuoiPunti.pos}° ({gPunti >= 0 ? '+' : ''}{f1(gPunti)})</div>
          </div>
          <div className="item" style={{ display: 'block' }}>
            <div className="title">Con i suoi tempi e i tuoi punti</div>
            <div className="meta">{f1(c.conSuoiTempi.punti)} punti · {c.conSuoiTempi.pos}° ({gTempi >= 0 ? '+' : ''}{f1(gTempi)})</div>
          </div>
        </div>
      )}
      {c.conSuoiPunti && c.conSuoiTempi && (gPunti > 1 || gTempi > 1) && (
        <p className="prose" style={{ margin: '10px 0 0' }}>
          {gPunti >= gTempi
            ? <>Da lui ti separa soprattutto la <b>precisione</b>: il tempo ce l’hai già.</>
            : <>Da lui ti separa soprattutto la <b>velocità</b>: i punti sono già in linea.</>}
        </p>
      )}
      <div className="card-title" style={{ marginTop: 14, marginBottom: 6, fontSize: 14 }}>Statino stage per stage</div>
      <div className="list">
        {c.stages.map((x) => (
          <div key={x.n} className="item" style={{ display: 'block' }}>
            <div className="row">
              <div className="title" style={{ flex: 1 }}>Stage {x.n}</div>
              {x.hfPct != null && <b style={{ color: x.hfPct >= 100 ? 'var(--ok)' : 'var(--fuoco)' }}>{f1(x.hfPct)}%</b>}
              <span className="meta" style={{ marginLeft: 8 }}>{x.dStage >= 0 ? '+' : ''}{f1(x.dStage)}</span>
            </div>
            <div className="meta">Tu: {x.mio ? statino(x.mio) : '—'}</div>
            <div className="meta">{nb.split(' ')[0]}: {x.suo ? statino(x.suo) : 'non visibile'}</div>
          </div>
        ))}
      </div>
      <p className="prose" style={{ margin: '8px 0 0', fontSize: 12.5 }}>La percentuale è il tuo hit factor sul suo; a destra i punti gara guadagnati o persi nello stage.</p>
    </section>
  )
}
