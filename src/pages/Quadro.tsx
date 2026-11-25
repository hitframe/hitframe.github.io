import { useLiveQuery } from 'dexie-react-hooks'
import { Brain, Loader2, Medal, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { chiedi, ErroreAI, estraiJson, getConfigAI } from '../ai/ai'
import { CardObiettivo, useDatiAtleta } from '../components/Obiettivi'
import AbilitaMisurate from '../components/AbilitaMisurate'
import { abilitaPerAI, useAbilita } from '../video/useAbilita'
import { Empty, PageHeader, useToast } from '../components/ui'
import { db, getImp, setImp } from '../db/db'
import { fmt } from '../lib/date'
import { costruisciQuadro, ISTRUZIONI_AI, NOMI_CLASSI, riassuntoPerAI, type CommentoAI } from '../quadro/calcoli'

const f1 = (n: number) => n.toFixed(1).replace('.', ',')

export default function Quadro() {
  const toast = useToast()
  const dati = useDatiAtleta()
  const risultati = useLiveQuery(() => db.risultati.toArray())
  const profilo = useLiveQuery(() => db.profilo.get('me'))
  const salvato = useLiveQuery(() => getImp<{ data: string; c: CommentoAI } | null>('quadroAI', null))
  const [occupato, setOccupato] = useState(false)
  const abilita = useAbilita()
  const [errore, setErrore] = useState('')
  const q = useMemo(() => (dati && risultati ? costruisciQuadro(dati.punti, risultati, dati.eventi, dati.diario, profilo) : null), [dati, risultati, profilo])

  if (!q || !dati) return <div className="page" />

  async function chiediAI() {
    const cfg = await getConfigAI()
    if (!cfg) { toast('Configura prima l’AI in Impostazioni'); return }
    setOccupato(true)
    setErrore('')
    try {
      const testo = await chiedi(cfg, { sistema: ISTRUZIONI_AI, testo: JSON.stringify(riassuntoPerAI(q!, dati!.punti, profilo, abilitaPerAI(abilita))), maxToken: 8000 })
      const c = estraiJson<CommentoAI>(testo)
      await setImp('quadroAI', { data: new Date().toISOString(), c })
    } catch (e) {
      setErrore(e instanceof ErroreAI ? e.message : 'Commento non riuscito, riprova')
    } finally {
      setOccupato(false)
    }
  }

  const cr = q.crescita
  const ultime = dati.punti.slice(-5)
  const mioRecente = ultime.length ? ultime.reduce((a, p) => a + p.reale, 0) / ultime.length : 0
  return (
    <div className="page">
      <PageHeader title="Il mio quadro" sub={q.periodo ? `Dal ${fmt(q.periodo.da, 'd MMM yyyy')} al ${fmt(q.periodo.a, 'd MMM yyyy')}` : 'Storico, crescita e dove puoi arrivare'} />

      {q.gare === 0 ? (
        <div className="card">
          <Empty icon={<Medal size={28} />} text="Importa i risultati delle tue gare: qui trovi lo storico, la crescita e il livello a cui puoi ambire."
            action={<Link to="/risultati" className="btn primary">Vai a Risultati</Link>} />
        </div>
      ) : (
        <>
          <div className="stats zone">
            <div className="stat"><div className="v">{q.gare}</div><div className="l">Gare</div></div>
            <div className="stat"><div className="v">{f1(q.mediaReale)}</div><div className="l">Reale medio</div></div>
            <div className="stat"><div className="v">{f1(q.mediaPct)}%</div><div className="l">Media in classifica</div></div>
          </div>

          <section className="card">
            <div className="card-title">Crescita</div>
            {cr ? (
              <p style={{ margin: 0 }}>
                {cr.trendReale >= 0 ? <TrendingUp size={18} color="var(--ok)" style={{ verticalAlign: -3 }} /> : <TrendingDown size={18} color="var(--fuoco)" style={{ verticalAlign: -3 }} />}{' '}
                Punteggio reale da <b>{f1(cr.primeReale)}</b> delle prime gare a <b>{f1(cr.ultimeReale)}</b> delle ultime
                ({cr.trendReale >= 0 ? '+' : ''}{f1(cr.trendReale)} a gara). Regolarità: ±{f1(q.regolarita)} tra una gara e l’altra.
              </p>
            ) : <p className="prose" style={{ margin: 0 }}>Servono almeno 3 gare per misurare la crescita.</p>}
            {q.migliore && <p className="prose" style={{ margin: '8px 0 0', fontSize: 14 }}>Gara migliore: <Link to={`/risultati/${q.migliore.id}`}>{q.migliore.gara}</Link> ({fmt(q.migliore.data, 'd MMM yyyy')}) con {f1(q.migliore.reale)} reale e {f1(q.migliore.pct)}%.</p>}
          </section>

          {q.classi.length > 0 && (
            <section className="card">
              <div className="card-title">Il tuo livello tra i tiratori incontrati</div>
              <div className="list">
                {q.classi.map((c) => (
                  <div key={c.cls} style={{ display: 'grid', gridTemplateColumns: '108px 1fr 48px', gap: 10, alignItems: 'center', fontSize: 14 }}>
                    <span className="label" style={{ color: c.cls === q.livello.simile ? 'var(--accent)' : undefined }}>{NOMI_CLASSI[c.cls]}</span>
                    <div className="progresso" style={{ marginTop: 0, height: 10 }}><span style={{ width: `${Math.min(100, c.mediana)}%`, background: c.cls === q.livello.simile ? 'var(--accent-fill)' : 'var(--surface-3)', outline: '1px solid var(--border)' }} /></div>
                    <b style={{ textAlign: 'right' }}>{f1(c.mediana)}</b>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '108px 1fr 48px', gap: 10, alignItems: 'center', fontSize: 14 }}>
                  <span className="label" style={{ color: 'var(--text)' }}>Tu (ultime)</span>
                  <div className="progresso" style={{ marginTop: 0, height: 10 }}><span style={{ width: `${Math.min(100, mioRecente)}%`, background: 'var(--ok)' }} /></div>
                  <b style={{ textAlign: 'right' }}>{f1(mioRecente)}</b>
                </div>
              </div>
              <p className="prose" style={{ fontSize: 13, margin: '10px 0 0' }}>
                Mediana del punteggio reale per classe, calcolata su tutti i tiratori delle gare che hai importato.
                {q.livello.simile && <> Oggi il tuo livello è vicino a quello tipico della classe <b>{NOMI_CLASSI[q.livello.simile]}</b>{q.livello.sopra ? <>; fai meglio del {Math.round(q.livello.percentile[q.livello.sopra] ?? 0)}% dei {NOMI_CLASSI[q.livello.sopra]} incontrati</> : ''}.</>}
              </p>
            </section>
          )}

          {q.ambizione && (
            <section className="card">
              <div className="card-title">A cosa puoi ambire</div>
              <p style={{ margin: 0 }}>
                Con il livello delle ultime gare e la tendenza attuale, nei prossimi mesi è realistico un punteggio reale tra <b>{f1(q.ambizione.realeTra[0])}</b> e <b>{f1(q.ambizione.realeTra[1])}</b>.
                In un campo come quelli che hai trovato finora corrisponde a circa <b>{Math.round(q.ambizione.pctTra[0])}–{Math.round(q.ambizione.pctTra[1])}%</b> in classifica.
              </p>
              <p className="prose" style={{ fontSize: 12, margin: '6px 0 0' }}>Stima prudente: livello recente più una parte della tendenza, con la tua variabilità da gara a gara.</p>
            </section>
          )}

          {(q.forti.length > 0 || q.deboli.length > 0) && (
            <section className="card">
              <div className="card-title">Punti di forza e da migliorare</div>
              <ul className="obiettivo-righe azioni">{q.forti.map((t) => <li key={t} style={{ color: 'var(--ok)' }}><span style={{ color: 'var(--text)' }}>{t}</span></li>)}</ul>
              <ul className="obiettivo-righe azioni">{q.deboli.map((t) => <li key={t} style={{ color: 'var(--fuoco)' }}><span style={{ color: 'var(--text)' }}>{t}</span></li>)}</ul>
            </section>
          )}
        </>
      )}

      <AbilitaMisurate profilo={profilo} />

      <section className="card">
        <div className="card-title">Allenamento e testa</div>
        <div className="stats">
          <div className="stat"><div className="v">{q.allenamento.sessioni}</div><div className="l">Sessioni ({q.allenamento.fuoco} a fuoco, {q.allenamento.bianco} in bianco)</div></div>
          <div className="stat"><div className="v">{f1(q.allenamento.perMese)}</div><div className="l">Sessioni al mese</div></div>
          <div className="stat"><div className="v">{q.allenamento.colpi}</div><div className="l">Colpi sparati</div></div>
        </div>
        {q.testa ? (
          <p className="prose" style={{ margin: '10px 0 0', fontSize: 14 }}>
            Dal diario ({q.testa.voci} voci): umore {f1(q.testa.umore)}/5, energia {f1(q.testa.energia)}/5, concentrazione {f1(q.testa.concentrazione)}/5{q.testa.sonno ? `, ${f1(q.testa.sonno)} ore di sonno` : ''}.
          </p>
        ) : <p className="prose" style={{ margin: '10px 0 0', fontSize: 14 }}>Scrivi nel diario: umore, energia e concentrazione entrano nel quadro.</p>}
      </section>

      {(profilo?.obiettivi?.length ?? 0) > 0 && (
        <section className="card">
          <div className="card-title"><span>Obiettivi</span><Link to="/profilo">Modifica</Link></div>
          <div className="list">{profilo!.obiettivi!.map((o) => <CardObiettivo key={o.id} o={o} dati={dati} compatta />)}</div>
        </section>
      )}

      <section className="card">
        <div className="card-title"><span><Sparkles size={18} style={{ verticalAlign: -3 }} /> Il commento del coach (AI)</span></div>
        {salvato?.c ? (
          <div className="commento-ai">
            <p style={{ marginTop: 0 }}>{salvato.c.sintesi}</p>
            <p>{salvato.c.crescita}</p>
            <p><b>A cosa puoi ambire.</b> {salvato.c.ambizione}</p>
            {salvato.c.puntiForza?.length > 0 && <><div className="label">Punti di forza</div><ul className="obiettivo-righe azioni">{salvato.c.puntiForza.map((x) => <li key={x}>{x}</li>)}</ul></>}
            {salvato.c.daMigliorare?.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Da migliorare</div><ul className="obiettivo-righe azioni">{salvato.c.daMigliorare.map((x) => <li key={x}>{x}</li>)}</ul></>}
            {salvato.c.prossimi30giorni?.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Prossimi 30 giorni</div><ul className="obiettivo-righe azioni">{salvato.c.prossimi30giorni.map((x) => <li key={x}>{x}</li>)}</ul></>}
            {salvato.c.mente && <p><Brain size={16} style={{ verticalAlign: -3 }} /> {salvato.c.mente}</p>}
            <div className="meta">Aggiornato il {fmt(salvato.data.slice(0, 10), 'd MMM yyyy')}</div>
          </div>
        ) : (
          <p className="prose" style={{ margin: 0, fontSize: 14 }}>
            L’AI che hai collegato in Impostazioni legge il tuo storico (gare, allenamenti, diario, obiettivi) e ti scrive un quadro della situazione con le priorità dei prossimi 30 giorni.
            Partono solo numeri e statistiche: nessun nome degli altri tiratori.
          </p>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={chiediAI} disabled={occupato}>
            {occupato ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />} {salvato?.c ? 'Aggiorna il commento' : 'Chiedi il quadro al coach'}
          </button>
        </div>
        {errore && <div role="alert" style={{ color: 'var(--accent-strong)', fontSize: 13, marginTop: 8, wordBreak: 'break-word' }}>{errore}</div>}
      </section>
    </div>
  )
}
