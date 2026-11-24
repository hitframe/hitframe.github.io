import { useLiveQuery } from 'dexie-react-hooks'
import { MSG_PDF, usePdfAnalisi } from '../sync/pdf'
import AvvisoPdf from '../components/AvvisoPdf'
import { AlertTriangle, ArrowLeft, ClipboardCheck, Dumbbell, Hand, Maximize2, Minimize2, Pencil, RefreshCw, Sparkles, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SchemaEditor from '../components/SchemaEditor'
import { Segmented, Sheet, useToast } from '../components/ui'
import { getConfigAI } from '../ai/ai'
import { chiaveMappa, immagineDisegno } from '../analisi/mappa'
import { fmtHf, fmtS, partenzaSpeciale, stimaStage } from '../analisi/motore'
import {
  consigliCoachAI, controllaSchema, daMappa, leggiStageAI, NOMI_STILE, rifinisciStageAI, schemaVuoto, strategia, strategie,
  type Domanda, type SchemaStage, type Stile, type Strategia,
} from '../analisi/schema'
import { db, normalizzaProfilo, nowIso } from '../db/db'

export default function StudioStage() {
  const { id, n } = useParams()
  const toast = useToast()
  const analisiId = Number(id)
  const numero = Number(n)
  const a = useLiveQuery(() => db.analisi.get(analisiId), [analisiId])
  const profilo = useLiveQuery(async () => normalizzaProfilo(await db.profilo.get('me')))
  const ai = useLiveQuery(() => getConfigAI())
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(null)
  const [erroreImg, setErroreImg] = useState(false)
  const [grande, setGrande] = useState(false)
  const [aiInCorso, setAiInCorso] = useState<string | null>(null)
  const [erroreAi, setErroreAi] = useState('')
  const [stile, setStile] = useState<Stile | null>(null)
  const [domande, setDomande] = useState<Domanda[] | null>(null)
  const [risposte, setRisposte] = useState<Record<string, string>>({})
  const [passo, setPasso] = useState(0)
  const chiudiDomande = useCallback(() => setDomande(null), [])

  const sez = a ? a.lettura.sezioni[a.sezione] ?? a.lettura.sezioni[0] : null
  const s = sez?.stages.find((x) => x.numero === numero)
  const chiave = a ? chiaveMappa(a.sezione, numero) : ''
  const schema: SchemaStage | null = a?.schemi?.[chiave] ?? null
  const statoPdf = usePdfAnalisi(a)

  useEffect(() => {
    if (!a?.pdf || !s) return
    let ok = true
    immagineDisegno(String(analisiId), a.pdf, s.pagina, s.tabellaTopY, s.disegnoTopY)
      .then((r) => ok && setImg(r))
      .catch(() => ok && setErroreImg(true))
    return () => { ok = false }
  }, [a?.pdf, s?.pagina, s?.tabellaTopY, analisiId]) // eslint-disable-line react-hooks/exhaustive-deps

  const piani = useMemo(() => (schema && s && profilo ? strategie(schema, s, profilo) : null), [schema, s, profilo])
  const classic = useMemo(() => {
    if (!schema || !s || !profilo || (profilo.armaDettagli?.capienza ?? 15) <= 10) return null
    return strategia(schema, s, profilo, 'equilibrato', 10)
  }, [schema, s, profilo])

  if (a === undefined || !profilo) return <div className="page" />
  if (!a || !sez || !s) {
    return (
      <div className="page">
        <Link to="/analisi-gara" className="btn ghost" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={18} /> Locandine</Link>
        <div className="card">Stage non trovato.</div>
      </div>
    )
  }

  const stima = stimaStage(s, profilo)
  const scelto: Stile = stile ?? piani?.consigliata ?? 'equilibrato'
  const piano: Strategia | null = piani?.tutte.find((x) => x.stile === scelto) ?? null
  const avvisi = schema ? controllaSchema(schema, s) : []
  const senzaAbilita = !profilo.abilita || Object.keys(profilo.abilita).length < 5

  async function salva(sc: SchemaStage | null) {
    const schemi = { ...(a!.schemi ?? {}) }
    if (sc) schemi[chiave] = { ...sc, aggiornato: nowIso() }
    else delete schemi[chiave]
    await db.analisi.update(analisiId, { schemi })
  }
  // ogni modifica allo schema rende vecchi i consigli del coach
  const modifica = (sc: SchemaStage) => void salva({ ...sc, coach: undefined })

  async function leggiConAI() {
    if (!img || !profilo) return
    setErroreAi('')
    setAiInCorso('Leggo il disegno e ragiono sulle stringhe…')
    try {
      const r = await leggiStageAI(img, s!, profilo)
      await salva(r.schema)
      setRisposte({}); setPasso(0)
      setDomande(r.domande.length ? r.domande : null)
      if (!r.domande.length) toast('Schema pronto: controllalo')
    } catch (e) {
      setErroreAi(e instanceof Error ? e.message : 'Lettura non riuscita')
    } finally { setAiInCorso(null) }
  }

  function rispondi(d: Domanda, o: string) {
    const nuove = { ...risposte, [d.id]: o }
    setRisposte(nuove)
    const i = domande!.indexOf(d)
    if (i < domande!.length - 1) setTimeout(() => setPasso(i + 1), 180)
    else void applica(nuove)
  }

  async function applica(ris = risposte) {
    if (!img || !schema || !domande || !profilo) return
    const date = domande.filter((d) => ris[d.id] && ris[d.id] !== 'Non so').map((d) => ({ domanda: d.domanda, risposta: ris[d.id] }))
    if (!date.length) { setDomande(null); return }
    setErroreAi('')
    setAiInCorso('Correggo lo schema con le tue risposte…')
    try {
      const r = await rifinisciStageAI(img, s!, profilo, schema, date)
      await salva(r.schema)
      setRisposte({}); setPasso(0)
      if (r.domande.length) { setDomande(r.domande); toast('Ancora qualche dubbio') }
      else { setDomande(null); toast('Schema aggiornato con le tue risposte') }
    } catch (e) {
      setErroreAi(e instanceof Error ? e.message : 'Correzione non riuscita')
    } finally { setAiInCorso(null) }
  }

  async function coach(p: Strategia) {
    if (!schema || !profilo) return
    setErroreAi('')
    setAiInCorso('Il coach sta preparando i consigli…')
    try {
      const c = await consigliCoachAI(s!, profilo, schema, p)
      await salva({ ...schema, coach: { ...(schema.coach ?? {}), [p.stile]: c } })
    } catch (e) {
      setErroreAi(e instanceof Error ? e.message : 'Consigli non riusciti')
    } finally { setAiInCorso(null) }
  }

  async function portaInAllenamento(p: Strategia) {
    const nomeGara = sez!.info.nome || a!.nomeFile
    const tutti = schema!.posizioni.flatMap((x) => x.bersagli)
    const descr = [
      `Dallo studio dello stage ${s!.numero} di ${nomeGara}, strategia ${NOMI_STILE[p.stile].toLowerCase()}.`,
      ...p.stringhe.map((x) => `• Stringa ${x.n} (${x.colpi} colpi): ${x.testo}`),
      ...p.ricariche.map((r) => `• ${r.testo}`),
    ].join('\n')
    const did = (await db.drillPersonali.add({
      nome: `Stage ${s!.numero} · ${nomeGara}`.slice(0, 60),
      categoria: 'Movimento',
      modalita: 'fuoco',
      descrizione: descr,
      distanza: `${Math.min(...tutti.map((b) => b.distanza))}–${Math.max(...tutti.map((b) => b.distanza))} m`,
      bersagli: `${s!.colpi} colpi su ${tutti.length} bersagli`,
      colpi: s!.colpi,
      partenza: s!.posizionePartenza,
      obiettivo: Math.round(p.tempo * 100) / 100,
      creato: nowIso(),
      stage: { analisiId, numero: s!.numero, stile: p.stile === 'prudente' ? 'conservativo' : 'aggressivo' },
      allestimento: `Ricostruisci lo stage ${s!.numero} anche in forma ridotta: stesse posizioni (${schema!.posizioni.map((x) => x.id).join(', ')}), stesso ordine di ingaggio, distanze simili.`,
      passi: p.passi.map((x) => `${x.titolo}: ${x.dettaglio}`),
      attenzione: p.consigli,
    })) as number
    const idDrill = `p-${did}`
    const oggi = new Date().toISOString().slice(0, 10)
    const evGara = a!.eventoId ? await db.eventi.get(a!.eventoId) : undefined
    const sessione = (await db.eventi.where('data').aboveOrEqual(oggi)
      .filter((e) => e.tipo === 'fuoco' && (!evGara || e.data < evGara.data)).sortBy('data'))[0]
    if (sessione?.id) {
      await db.eventi.update(sessione.id, { drill: [...(sessione.drill ?? []), idDrill], note: `${sessione.note}\n• Stage ${s!.numero} (${NOMI_STILE[p.stile].toLowerCase()})`.trim() })
      toast(`Drill creato e aggiunto alla sessione del ${sessione.data.split('-').reverse().slice(0, 2).join('/')}`)
    } else toast('Drill creato in Allenamento')
  }

  const vecchiaMappa = a.mappe?.[chiave]

  return (
    <div className="page">
      <Link to={`/analisi-gara/${analisiId}`} className="btn ghost" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><ArrowLeft size={18} /> {sez.info.nome || 'Locandina'}</Link>
      <header className="page-header">
        <div>
          <h1>Stage {s.numero}</h1>
          <div className="sub">{s.tipo} course · {s.colpi} colpi · {s.puntiMax} punti · stima {fmtS(stima.obiettivo)} ({fmtS(stima.min)}–{fmtS(stima.max)})</div>
        </div>
      </header>

      <div className="chips">
        {s.flag.mobili && <span className="badge gara"><Zap size={12} /> attivazioni</span>}
        {(s.flag.manoForte || s.flag.manoDebole) && <span className="badge fuoco"><Hand size={12} /> {s.flag.manoDebole ? 'mano debole' : 'mano forte'}</span>}
        {partenzaSpeciale(s).map((x) => <span key={x} className="badge bianco">{x}</span>)}
      </div>

      <details className="guida">
        <summary>Briefing</summary>
        <dl className="dettagli" style={{ marginTop: 10 }}>
          {s.posizionePartenza && <><dt>Partenza</dt><dd>{s.posizionePartenza}</dd></>}
          {s.prontoTiratore && <><dt>Pronto tiratore</dt><dd>{s.prontoTiratore}</dd></>}
          {s.prontoArma && <><dt>Pronto arma</dt><dd>{s.prontoArma}</dd></>}
          {s.procedura && <><dt>Procedura</dt><dd>{s.procedura}</dd></>}
          {s.note && <><dt>Note</dt><dd>{s.note}</dd></>}
        </dl>
      </details>

      {senzaAbilita && (
        <Link to="/io/abilita" className="item" style={{ borderColor: 'var(--accent)' }}>
          <ClipboardCheck size={20} color="var(--accent)" />
          <div style={{ flex: 1 }}>
            <div className="title">Compila il questionario delle abilità</div>
            <div className="meta">Senza, la strategia usa un livello medio: con le tue risposte diventa su misura.</div>
          </div>
        </Link>
      )}

      {!a.pdf ? (
        <div className="card">{statoPdf === 'pronto' ? 'Carico il disegno…' : <AvvisoPdf stato={statoPdf} a={a} />}</div>
      ) : erroreImg ? (
        <div className="card">Non riesco a mostrare il disegno.</div>
      ) : !img ? (
        <div className="card">Carico il disegno…</div>
      ) : (
        <section className={`card disegno-studio${grande ? ' grande' : ''}`}>
          <div className="disegno-scroll"><img src={img.url} alt={`Disegno dello stage ${s.numero}`} /></div>
          <button type="button" className="btn ghost disegno-zoom" onClick={() => setGrande(!grande)} aria-label={grande ? 'Rimpicciolisci il disegno' : 'Ingrandisci il disegno'}>
            {grande ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </section>
      )}
      {!a.pdf && statoPdf !== 'pronto' && <p className="meta" style={{ margin: 0 }}>{MSG_PDF[statoPdf]}</p>}

      <section className="card form">
        <div className="card-title" style={{ marginBottom: 0 }}><span>Schema dello stage</span>
          {schema && ai?.chiave && img && <button className="btn ghost" style={{ minHeight: 36 }} onClick={leggiConAI} disabled={!!aiInCorso}><RefreshCw size={16} /> Rileggi</button>}
        </div>
        {!schema ? (
          <>
            <p className="prose" style={{ margin: 0 }}>
              Le posizioni nell’ordine in cui le fai e, per ognuna, i bersagli nell’ordine in cui li ingaggi.
              Lo stage è pensato a stringhe di massimo 10 colpi (Classic): da lì escono posizioni e ricariche.
              {ai?.chiave ? ' L’AI legge il disegno, ti fa le domande che servono e prepara lo schema; tu correggi con un tocco.' : ' Collega un’AI in Impostazioni per la lettura automatica, oppure costruiscilo tu.'}
            </p>
            <div className="row">
              {ai?.chiave
                ? <button className="btn primary" onClick={leggiConAI} disabled={!!aiInCorso || !img}><Sparkles size={18} className={aiInCorso ? 'spin' : ''} /> {aiInCorso ? 'L’AI sta leggendo…' : 'Leggi con l’AI'}</button>
                : <Link to="/impostazioni" className="btn"><Sparkles size={18} /> Collega un’AI</Link>}
              <button className="btn" onClick={() => void salva((vecchiaMappa && daMappa(vecchiaMappa, s)) || schemaVuoto(s))}><Pencil size={18} /> Costruiscilo tu</button>
            </div>
          </>
        ) : (
          <>
            {schema.lettura && <p className="prose" style={{ margin: 0, fontSize: 14 }}><b>Lettura:</b> {schema.lettura}</p>}
            <SchemaEditor schema={schema} onChange={modifica} />
            {avvisi.length > 0 && (
              <div role="status" className="schema-avviso"><AlertTriangle size={16} /> <span>{avvisi.join(' ')}</span></div>
            )}
            <p className="meta" style={{ margin: 0 }}>Tocca un bersaglio per distanza, visibilità, ordine e posizione. Tocca i metri tra due posizioni per cambiarli.</p>
            {schema.risposte?.length ? (
              <details className="guida"><summary>Le tue risposte all’AI ({schema.risposte.length})</summary>
                <ul className="drill" style={{ marginLeft: 0 }}>{schema.risposte.map((r, i) => <li key={i}>{r.domanda} <b>{r.risposta}</b></li>)}</ul>
              </details>
            ) : null}
            <div className="row">
              <span className="spacer" />
              <button className="btn ghost" onClick={() => { if (confirm('Cancellare lo schema di questo stage?')) void salva(null) }}>Ricomincia</button>
            </div>
          </>
        )}
        {erroreAi && <div role="alert" className="schema-avviso"><AlertTriangle size={16} /> <span>{erroreAi}</span></div>}
      </section>

      {piani && piano && (
        <>
          <section className="card">
            <div className="card-title"><span>Strategia</span></div>
            <Segmented<Stile> label="Strategia" value={scelto} onChange={setStile}
              options={piani.tutte.map((p) => ({ value: p.stile, label: `${NOMI_STILE[p.stile]}${p.stile === piani.consigliata ? ' ★' : ''}` }))} />
            <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 12 }}>
              <div className="stat"><div className="v">{fmtS(piano.tempo)}</div><div className="l">tempo stimato</div></div>
              <div className="stat"><div className="v">{fmtHf(piano.hf)}</div><div className="l">hit factor</div></div>
              <div className="stat"><div className="v">{piano.ricariche.length}</div><div className="l">{piano.ricariche.length === 1 ? 'ricarica' : 'ricariche'}{piano.ricariche.some((r) => !r.inMovimento) ? ' (una da fermo)' : ''}</div></div>
            </div>
            <p className="prose" style={{ margin: '10px 0 0', fontSize: 13 }}>
              ★ = consigliata per te ({profilo.classe}, {profilo.divisione}): il miglior hit factor atteso tenendo conto di quanto rischi in punti.
              {classic && classic.ricariche.length !== piano.ricariche.length ? ` Con ${piano.capienza} colpi ti ${piano.ricariche.length === 1 ? 'serve 1 ricarica' : `servono ${piano.ricariche.length} ricariche`}; un Classic (10 colpi) ne fa ${classic.ricariche.length}.` : ''}
            </p>

            <div className="label" style={{ marginTop: 14 }}>Stringhe</div>
            <div className="stringhe">
              {piano.stringhe.map((x) => (
                <div key={x.n} className="stringa"><b>{x.n}</b><span>{x.testo}</span><i>{x.colpi} colpi</i></div>
              ))}
            </div>

            <div className="label" style={{ marginTop: 14 }}>Passo per passo</div>
            <div className="piano-passi">
              {piano.passi.map((x, i) => (
                <div key={i} className={`passo ${x.tipo}`}>
                  <span className="ic">{x.tipo === 'partenza' ? 'S' : x.tipo === 'movimento' ? '→' : x.tipo === 'ricarica' ? 'R' : x.posizione}</span>
                  <div><div className="t">{x.titolo}</div><div className="d">{x.dettaglio}</div></div>
                  <span className="s">{fmtS(x.tempo)}</span>
                </div>
              ))}
            </div>
            {piano.consigli.length > 0 && (
              <ul className="drill" style={{ marginLeft: 0, marginTop: 12 }}>{piano.consigli.map((c) => <li key={c}>{c}</li>)}</ul>
            )}
          </section>

          <section className="card">
            <div className="card-title"><span><Sparkles size={18} style={{ verticalAlign: -3, color: 'var(--accent)' }} /> Il coach su questo stage</span></div>
            {schema?.coach?.[scelto]?.length ? (
              <ol className="coach-lista">{schema.coach[scelto]!.map((c, i) => <li key={i}>{c}</li>)}</ol>
            ) : (
              <p className="prose" style={{ margin: 0 }}>Consigli su misura per la strategia {NOMI_STILE[scelto].toLowerCase()}: dove guadagnare tempo, dove non rischiare, cosa provare nel walkthrough.</p>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              {ai?.chiave && <button className="btn" onClick={() => coach(piano)} disabled={!!aiInCorso}><Sparkles size={18} /> {schema?.coach?.[scelto]?.length ? 'Rifai i consigli' : 'Chiedi al coach'}</button>}
              <button className="btn" onClick={() => portaInAllenamento(piano)}><Dumbbell size={18} /> Porta in allenamento</button>
            </div>
            <p className="prose" style={{ margin: '10px 0 0', fontSize: 12 }}>Tempi dai tuoi tempi tecnici; distanze e metri dallo schema. Conta la differenza tra le strategie più del valore assoluto.</p>
          </section>
        </>
      )}

      {aiInCorso && !domande && (
        <div className="ai-attesa" role="status"><Sparkles size={18} className="spin" /> {aiInCorso}</div>
      )}

      {domande && domande[passo] && (
        <Sheet title={`${domande.length === 1 ? 'Una domanda' : `${domande.length} domande`} sullo stage`} onClose={chiudiDomande}>
          {aiInCorso ? (
            <div className="dubbi-attesa"><Sparkles size={28} className="spin" color="var(--accent)" /><div className="title">{aiInCorso}</div></div>
          ) : (
            <div className="form">
              <div className="dubbi-passo">Domanda {passo + 1} di {domande.length}</div>
              <p className="dubbi-domanda">{domande[passo].domanda}</p>
              <div className="dubbi-opzioni">
                {[...domande[passo].opzioni, 'Non so'].map((o) => (
                  <button key={o} type="button" className={`btn${risposte[domande[passo].id] === o ? ' primary' : ''}`}
                    aria-pressed={risposte[domande[passo].id] === o} onClick={() => rispondi(domande[passo], o)}>{o}</button>
                ))}
              </div>
              <p className="prose" style={{ margin: 0, fontSize: 13 }}>Il disegno non ha misure: le tue risposte valgono più di qualsiasi lettura automatica.</p>
              <div className="row">
                {passo > 0 && <button className="btn ghost" onClick={() => setPasso(passo - 1)}>Indietro</button>}
                <div className="spacer" />
                <button className="btn ghost" onClick={() => setDomande(null)}>Salta</button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}
