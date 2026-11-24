import { useLiveQuery } from 'dexie-react-hooks'
import { MSG_PDF, usePdfAnalisi } from '../sync/pdf'
import AvvisoPdf from '../components/AvvisoPdf'
import { AlertTriangle, ArrowLeft, Check, ClipboardCheck, Dumbbell, Hand, MapPinned, Pencil, Sparkles, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import StageMappa, { type Sovrapposizione } from '../components/StageMappa'
import { Segmented, Sheet, useToast } from '../components/ui'
import { getConfigAI } from '../ai/ai'
import { chiaveMappa, immagineDisegno, mappaVuota, proponiMappaAI, rifinisciMappaAI, type Dubbio, type MappaStage } from '../analisi/mappa'
import { fmtHf, fmtS, partenzaSpeciale, stimaStage } from '../analisi/motore'
import { calcolaPiano, consiglio, type Piano, type Stile } from '../analisi/piano'
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
  const [bozza, setBozza] = useState<MappaStage | null>(null)
  const [aiInCorso, setAiInCorso] = useState(false)
  const [erroreAi, setErroreAi] = useState('')
  const [stile, setStile] = useState<Stile | null>(null)
  const [dubbi, setDubbi] = useState<Dubbio[] | null>(null)
  const [risposte, setRisposte] = useState<Record<string, string>>({})
  const [passo, setPasso] = useState(0)
  const mappaRef = useRef<HTMLElement>(null)
  const chiudiDomande = useCallback(() => setDubbi(null), [])

  const sez = a ? a.lettura.sezioni[a.sezione] ?? a.lettura.sezioni[0] : null
  const s = sez?.stages.find((x) => x.numero === numero)
  const chiave = a ? chiaveMappa(a.sezione, numero) : ''
  const salvata = a?.mappe?.[chiave]
  const mappa = bozza ?? salvata ?? null
  const statoPdf = usePdfAnalisi(a)

  useEffect(() => {
    if (!a?.pdf || !s) return
    let ok = true
    immagineDisegno(String(analisiId), a.pdf, s.pagina, s.tabellaTopY, s.disegnoTopY)
      .then((r) => ok && setImg(r))
      .catch(() => ok && setErroreImg(true))
    return () => { ok = false }
  }, [a?.pdf, s?.pagina, s?.tabellaTopY, analisiId]) // eslint-disable-line react-hooks/exhaustive-deps

  const piani = useMemo(() => {
    if (!salvata || !s || !profilo) return null
    const ag = calcolaPiano(salvata, s, profilo, 'aggressivo')
    const co = calcolaPiano(salvata, s, profilo, 'conservativo')
    return ag && co ? { aggressivo: ag, conservativo: co, consiglio: consiglio(ag, co) } : null
  }, [salvata, s, profilo])

  if (a === undefined || !profilo) return <div className="page" />
  if (!a || !sez || !s) {
    return (
      <div className="page">
        <Link to="/analisi-gara" className="btn ghost" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={18} /> Analisi gara</Link>
        <div className="card">Stage non trovato.</div>
      </div>
    )
  }

  const stima = stimaStage(s, profilo)
  const scelto: Stile = stile ?? piani?.consiglio.scelta ?? 'conservativo'
  const piano: Piano | null = piani ? piani[scelto] : null
  const sovra: Sovrapposizione | null = piano && salvata && !bozza ? {
    punti: [salvata.partenza, ...piano.percorso.map((pid) => salvata.posizioni.find((p) => p.id === pid)!)].map((p) => ({ x: p.x, y: p.y, etichetta: p.id })),
    ordine: piano.ordine,
    inMovimento: piano.inMovimento,
    ricariche: piano.ricariche,
  } : null
  const senzaAbilita = !profilo.abilita || Object.keys(profilo.abilita).length < 5

  async function salvaMappa(m: MappaStage) {
    await db.analisi.update(analisiId, { mappe: { ...(a!.mappe ?? {}), [chiave]: m } })
  }

  async function proponi() {
    if (!img) return
    setErroreAi('')
    setAiInCorso(true)
    try {
      const r = await proponiMappaAI(img, s!)
      setBozza(r.mappa)
      setRisposte({})
      setPasso(0)
      setDubbi(r.dubbi.length ? r.dubbi : null)
      if (!r.dubbi.length) { toast('Bozza pronta: controllala e salva'); vaiAllaMappa() }
    } catch (e) {
      setErroreAi(e instanceof Error ? e.message : 'Proposta non riuscita')
    } finally {
      setAiInCorso(false)
    }
  }

  function vaiAllaMappa() {
    setTimeout(() => mappaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }

  function rispondi(d: Dubbio, o: string) {
    const nuove = { ...risposte, [d.id]: o }
    setRisposte(nuove)
    const i = dubbi!.indexOf(d)
    if (i < dubbi!.length - 1) setTimeout(() => setPasso(i + 1), 200)
    else void applicaRisposte(nuove)
  }

  async function applicaRisposte(ris = risposte) {
    if (!img || !bozza || !dubbi) return
    const date = dubbi.filter((d) => ris[d.id] && ris[d.id] !== 'Non so').map((d) => ({ domanda: d.domanda, risposta: ris[d.id] }))
    if (!date.length) { setDubbi(null); toast('Bozza pronta: controllala e salva'); vaiAllaMappa(); return }
    setErroreAi('')
    setAiInCorso(true)
    try {
      setBozza(await rifinisciMappaAI(img, s!, bozza, date))
      setDubbi(null)
      toast('Mappa corretta con le tue risposte: controllala e salva')
      vaiAllaMappa()
    } catch (e) {
      setErroreAi(e instanceof Error ? e.message : 'Correzione non riuscita')
    } finally {
      setAiInCorso(false)
    }
  }

  async function portaInAllenamento(p: Piano) {
    const nomeGara = sez!.info.nome || a!.nomeFile
    const descr = [
      `Dallo studio dello stage ${s!.numero} di ${nomeGara}, piano ${p.stile}.`,
      ...p.passi.map((x) => `• ${x.titolo}: ${x.dettaglio}`),
    ].join('\n')
    const did = (await db.drillPersonali.add({
      nome: `Stage ${s!.numero} · ${nomeGara}`.slice(0, 60),
      categoria: 'Movimento',
      modalita: 'fuoco',
      descrizione: descr,
      distanza: `${Math.round(Math.min(...(salvata?.bersagli.filter((b) => b.tipo !== 'noshoot').map((b) => b.distanza) ?? [5])))}–${Math.round(Math.max(...(salvata?.bersagli.map((b) => b.distanza) ?? [10])))} m`,
      bersagli: `${p.colpiTotali} colpi su ${Object.keys(p.ordine).length} bersagli`,
      colpi: p.colpiTotali,
      partenza: s!.posizionePartenza,
      obiettivo: Math.round(p.tempo * 100) / 100,
      creato: nowIso(),
      stage: { analisiId, numero: s!.numero, stile: p.stile },
      allestimento: `Ricostruisci lo stage ${s!.numero} come nel disegno, anche in forma ridotta: stesse posizioni, stessi angoli, distanze il più possibile simili.`,
      passi: p.passi.map((x) => `${x.titolo}: ${x.dettaglio}`),
      attenzione: p.rischi,
    })) as number
    const idDrill = `p-${did}`
    // collega alla prossima sessione a fuoco prima della gara
    const oggi = new Date().toISOString().slice(0, 10)
    const evGara = a!.eventoId ? await db.eventi.get(a!.eventoId) : undefined
    const sessione = (await db.eventi.where('data').aboveOrEqual(oggi)
      .filter((e) => e.tipo === 'fuoco' && (!evGara || e.data < evGara.data)).sortBy('data'))[0]
    if (sessione?.id) {
      await db.eventi.update(sessione.id, { drill: [...(sessione.drill ?? []), idDrill], note: `${sessione.note}\n• Stage ${s!.numero} (${p.stile})`.trim() })
      toast(`Drill creato e aggiunto alla sessione del ${sessione.data.split('-').reverse().slice(0, 2).join('/')}`)
    } else {
      toast('Drill creato in Allenamento')
    }
  }

  return (
    <div className="page">
      <Link to={`/analisi-gara/${analisiId}`} className="btn ghost" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><ArrowLeft size={18} /> {sez.info.nome || 'Analisi gara'}</Link>
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
        <Link to="/profilo" className="item" style={{ borderColor: 'var(--accent)' }}>
          <ClipboardCheck size={20} color="var(--accent)" />
          <div style={{ flex: 1 }}>
            <div className="title">Compila il questionario delle abilità</div>
            <div className="meta">Senza, i piani usano un livello medio: con le tue risposte diventano su misura.</div>
          </div>
        </Link>
      )}

      {!a.pdf ? (
        <div className="card">{statoPdf === 'pronto' ? 'Carico il disegno…' : (a ? <AvvisoPdf stato={statoPdf} a={a} /> : MSG_PDF[statoPdf])}</div>
      ) : erroreImg ? (
        <div className="card">Non riesco a mostrare il disegno.</div>
      ) : !img ? (
        <div className="card">Carico il disegno…</div>
      ) : (
        <section className="card form" ref={mappaRef} style={{ scrollMarginTop: 80 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            <span><MapPinned size={18} style={{ verticalAlign: -3 }} /> Mappa</span>
            {mappa && !bozza && (
              <button className="btn ghost" style={{ minHeight: 36 }} onClick={() => setBozza(structuredClone(salvata!))}><Pencil size={16} /> Modifica</button>
            )}
          </div>

          {!mappa && (
            <>
              <p className="prose" style={{ margin: 0 }}>
                Per il piano servono partenza, posizioni di tiro e bersagli sul disegno.
                {ai?.chiave ? ' L’AI li propone in pochi secondi, ti fa un paio di domande e poi tu controlli la bozza.' : ' Collega un’AI in Impostazioni per una proposta automatica, oppure segnali a mano.'}
                {ai?.fornitore === 'gemini' && ' Con Gemini gratuito la lettura dei disegni è meno precisa: rispondi bene alle domande, o collega Claude o ChatGPT.'}
              </p>
              <div className="row">
                {ai?.chiave
                  ? <button className="btn primary" onClick={proponi} disabled={aiInCorso}><Sparkles size={18} className={aiInCorso ? 'spin' : ''} /> {aiInCorso ? 'L’AI sta leggendo il disegno…' : 'Proponi con l’AI'}</button>
                  : <Link to="/impostazioni" className="btn"><Sparkles size={18} /> Collega un’AI</Link>}
                <button className="btn" onClick={() => setBozza(mappaVuota())}><Pencil size={18} /> Mappa a mano</button>
              </div>
            </>
          )}
          {erroreAi && <div role="alert" className="card avviso"><AlertTriangle size={18} color="var(--accent)" /> {erroreAi}</div>}

          {bozza && !dubbi && bozza.fonte === 'ai' && (
            <p className="prose" style={{ margin: 0, fontSize: 13 }}><b>Controlla la bozza:</b> trascina bersagli e posizioni dove sono davvero, poi salva. Il piano parte da qui.</p>
          )}

          {mappa && <StageMappa img={img} mappa={mappa} onChange={bozza ? setBozza : undefined} modifica={!!bozza} sovra={sovra} />}

          {bozza?.lettura && <p className="prose" style={{ margin: 0, fontSize: 14 }}><b>Lettura AI:</b> {bozza.lettura}</p>}

          {bozza && (
            <div className="row">
              {ai?.chiave && <button className="btn ghost" onClick={proponi} disabled={aiInCorso}><Sparkles size={16} /> {aiInCorso ? 'In corso…' : 'Riproponi con AI'}</button>}
              <div className="spacer" />
              <button className="btn" onClick={() => { setBozza(null); setDubbi(null) }}>Annulla</button>
              <button className="btn primary" onClick={async () => { await salvaMappa({ ...bozza, aggiornata: nowIso() }); setBozza(null); toast('Mappa salvata') }}
                disabled={!bozza.posizioni.length || !bozza.bersagli.length}><Check size={18} /> Salva mappa</button>
            </div>
          )}

          {salvata?.lettura && !bozza && <p className="prose" style={{ margin: 0, fontSize: 14 }}><b>Lettura AI:</b> {salvata.lettura}</p>}
          {salvata && !bozza && salvata.fonte === 'ai' && <p className="prose" style={{ margin: 0, fontSize: 12 }}>Mappa proposta dall’AI: verifica posizioni, visibilità e distanze prima di fidarti del piano.</p>}
        </section>
      )}

      {salvata && !bozza && !piani && (
        <div className="card avviso"><AlertTriangle size={18} color="var(--accent)" /> Con questa mappa non riesco a coprire tutti i bersagli: controlla che ogni bersaglio sia visibile da almeno una posizione.</div>
      )}

      {piani && piano && !bozza && (
        <>
          <section className="card">
            <div className="card-title">Piano d’azione</div>
            <div className="confronto">
              {(['aggressivo', 'conservativo'] as Stile[]).map((st) => {
                const p = piani[st]
                return (
                  <button key={st} className={`stat${piani.consiglio.scelta === st ? ' vince' : ''}`} onClick={() => setStile(st)} aria-pressed={scelto === st}
                    style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--text)', outline: scelto === st ? '2px solid var(--text)' : undefined }}>
                    <div className="l" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{st}</div>
                    <div className="v">{fmtS(p.tempo)}</div>
                    <div className="l">HF {fmtHf(p.hf)} · {Math.round(p.puntiAttesi)} punti attesi</div>
                    <div className="l">{p.percorso.length} posizioni · {p.ricariche.length} ricarich{p.ricariche.length === 1 ? 'a' : 'e'}{p.inMovimento.length ? ` · ${p.inMovimento.length} in movimento` : ''}</div>
                  </button>
                )
              })}
            </div>
            <p style={{ margin: '12px 0 0' }}><b>Consiglio:</b> {piani.consiglio.testo}</p>
            <p className="prose" style={{ margin: '6px 0 0', fontSize: 12 }}>
              Tempi calcolati dai tuoi tempi tecnici e dalle abilità; le distanze sono stimate dal disegno (3–20 m). Conta la differenza tra i due piani più del valore assoluto.
            </p>
          </section>

          <section className="card">
            <div className="card-title">
              <Segmented<Stile> label="Piano" value={scelto} onChange={setStile} options={[{ value: 'aggressivo', label: 'Aggressivo' }, { value: 'conservativo', label: 'Conservativo' }]} />
            </div>
            <div className="piano-passi">
              {piano.passi.map((x, i) => (
                <div key={i} className={`passo ${x.tipo}`}>
                  <span className="ic">{x.tipo === 'partenza' ? 'S' : x.tipo === 'movimento' ? '→' : x.tipo === 'ricarica' ? 'R' : x.posizione?.replace('P', '') ?? i}</span>
                  <div>
                    <div className="t">{x.titolo}</div>
                    <div className="d">{x.dettaglio}</div>
                    {x.ingaggi && x.ingaggi.some((g) => g.nota) && (
                      <div className="d" style={{ marginTop: 4 }}>{x.ingaggi.filter((g) => g.nota).map((g) => `${g.bersaglio}: ${g.nota}`).join(' · ')}</div>
                    )}
                  </div>
                  <span className="s">{fmtS(x.tempo)}</span>
                </div>
              ))}
            </div>
            {piano.rischi.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="label">Rischi</div>
                <ul className="drill" style={{ marginLeft: 0 }}>{piano.rischi.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            {piano.avvisi.length > 0 && <p className="prose" style={{ fontSize: 12, margin: '10px 0 0' }}>{piano.avvisi.join(' ')}</p>}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => portaInAllenamento(piano)}><Dumbbell size={18} /> Porta in allenamento</button>
            </div>
          </section>
        </>
      )}
      {dubbi && dubbi[passo] && (
        <Sheet title={dubbi.length === 1 ? 'Una domanda sullo stage' : `${dubbi.length} domande sullo stage`} onClose={chiudiDomande}>
          {aiInCorso ? (
            <div className="dubbi-attesa">
              <Sparkles size={28} className="spin" color="var(--accent)" />
              <div className="title">Correggo la mappa con le tue risposte…</div>
            </div>
          ) : (
            <div className="form">
              <div className="dubbi-passo">Domanda {passo + 1} di {dubbi.length}</div>
              <p className="dubbi-domanda">{dubbi[passo].domanda}</p>
              <div className="dubbi-opzioni">
                {[...dubbi[passo].opzioni, 'Non so'].map((o) => (
                  <button key={o} type="button" className={`btn${risposte[dubbi[passo].id] === o ? ' primary' : ''}`}
                    aria-pressed={risposte[dubbi[passo].id] === o} onClick={() => rispondi(dubbi[passo], o)}>{o}</button>
                ))}
              </div>
              {erroreAi && <div role="alert" className="card avviso"><AlertTriangle size={18} color="var(--accent)" /> {erroreAi}</div>}
              <p className="prose" style={{ margin: 0, fontSize: 13 }}>Il disegno non ha misure: le tue risposte valgono più di qualsiasi lettura automatica.</p>
              <div className="row">
                {passo > 0 && <button className="btn ghost" onClick={() => setPasso(passo - 1)}>Indietro</button>}
                <div className="spacer" />
                <button className="btn ghost" onClick={() => { setDubbi(null); toast('Bozza pronta: controllala e salva'); vaiAllaMappa() }}>Salta le domande</button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}
