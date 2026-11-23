import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, Medal, Shuffle, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DOMANDE } from '../abilita/questionario'
import { fmt2, tuttiDrill } from '../allenamento/servizi'
import { GraficoLinee, Radar } from '../components/Grafici'
import { Empty, PageHeader } from '../components/ui'
import { db, getImp, normalizzaProfilo } from '../db/db'
import { fmt } from '../lib/date'
import { inAltreDivisioni, nomeLeggibile, trovaPerNome } from '../risultati/motore'
import { pendenza, puntiForzaDebolezza, puntiGara, type Corso } from '../statistiche/calcoli'
import { armaDiGara, nelPeriodo, opzioniPeriodo } from '../statistiche/filtri'

const f1 = (n: number) => n.toFixed(1).replace('.', ',')

export default function Statistiche() {
  const risultati = useLiveQuery(() => db.risultati.toArray())
  const analisi = useLiveQuery(() => db.analisi.toArray())
  const profilo = useLiveQuery(async () => normalizzaProfilo(await db.profilo.get('me')))
  const prove = useLiveQuery(() => db.prove.toArray()) ?? []
  const personali = useLiveQuery(() => db.drillPersonali.toArray()) ?? []
  const eventi = useLiveQuery(() => db.eventi.toArray()) ?? []
  const rivali = useLiveQuery(() => getImp<string[]>('rivali', [])) ?? []
  const diario = useLiveQuery(() => db.diario.toArray()) ?? []

  const [vediAltre, setVediAltre] = useState(false)
  const [tutteGare, setTutteGare] = useState(false)
  const [periodo, setPeriodo] = useState('tutto')
  const [armaFiltro, setArmaFiltro] = useState<number | 'tutte'>('tutte')
  const armi = useLiveQuery(() => db.armi.toArray()) ?? []
  const tuttiPunti = useMemo(() => (risultati && analisi ? puntiGara(risultati, analisi) : []), [risultati, analisi])
  const armaPerGara = useMemo(() => new Map((risultati ?? []).map((r) => [r.id!, armaDiGara(r, armi)?.id ?? null])), [risultati, armi])
  const punti = useMemo(() => tuttiPunti.filter((p) => nelPeriodo(p.data, periodo) && (armaFiltro === 'tutte' || armaPerGara.get(p.id) === armaFiltro)),
    [tuttiPunti, periodo, armaFiltro, armaPerGara])
  const giudizi = useMemo(() => puntiForzaDebolezza(punti), [punti])

  if (!risultati || !analisi || !profilo) return <div className="page" />

  const pG = punti
  const opzioni = opzioniPeriodo(tuttiPunti.map((p) => p.data))
  const armiUsate = armi.filter((a) => [...armaPerGara.values()].includes(a.id!))
  const lungo = pG.length > 1 && Date.parse(pG[pG.length - 1].data) - Date.parse(pG[0].data) > 300 * 86400000
  const et = pG.map((p) => fmt(p.data, lungo ? 'MMM yy' : 'd MMM'))
  const trend = pendenza(punti.map((p) => p.reale))
  const media = punti.length ? punti.reduce((a, p) => a + p.reale, 0) / punti.length : 0
  const migliore = punti.length ? punti.reduce((a, p) => (p.reale > a.reale ? p : a)) : null
  const conPV = punti.some((p) => p.realePrecisione !== null)

  // Tipi di stage su tutte le gare
  const corsi: Corso[] = ['Short', 'Medium', 'Long']
  const perCorso = corsi.map((c) => {
    let s = 0, k = 0
    for (const p of punti) { const v = p.perCorso[c]; if (v) { s += v.pct * v.n; k += v.n } }
    return { c, pct: k ? s / k : 0, k }
  }).filter((x) => x.k > 0)

  // Allenamento: ultimi 90 giorni
  const da90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const sessioni90 = eventi.filter((e) => e.completato && e.data >= da90 && (e.tipo === 'fuoco' || e.tipo === 'bianco'))
  const colpi90 = sessioni90.reduce((a, e) => a + (e.colpiSparati ?? 0), 0)
  const drills = tuttiDrill(personali)
  const progressi = drills.map((d) => {
    const pp = prove.filter((p) => p.drillId === d.id && p.tempo).sort((a, b) => a.creato.localeCompare(b.creato))
    if (pp.length < 3) return null
    const primo = pp.slice(0, 3).reduce((a, p) => a + p.tempo!, 0) / 3
    const ultimo = pp.slice(-3).reduce((a, p) => a + p.tempo!, 0) / 3
    return { d, n: pp.length, primo, ultimo, record: Math.min(...pp.map((p) => p.tempo!)), delta: (ultimo - primo) / primo }
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.delta - b.delta)

  // Altre divisioni, gara per gara
  const altre = new Map<string, { pct: number[]; pos: string[] }>()
  for (const r of [...risultati].sort((a, b) => a.data.localeCompare(b.data))) {
    for (const x of inAltreDivisioni(r)) {
      const v = altre.get(x.divisione) ?? { pct: [], pos: [] }
      v.pct.push(x.pct); v.pos.push(`${x.pos}°/${x.tot}`)
      altre.set(x.divisione, v)
    }
  }
  const altreLista = [...altre.entries()].map(([d, v]) => ({ d, media: v.pct.reduce((a, b) => a + b, 0) / v.pct.length, n: v.pct.length, pos: v.pos })).sort((a, b) => b.media - a.media)

  // Testa e corpo: diario nei giorni di gara
  const sigaDiario = (data: string, eventoId: number | null) => {
    const d0 = new Date(Date.parse(data) - 2 * 86400000).toISOString().slice(0, 10)
    const vv = diario.filter((v) => (eventoId !== null && v.eventoId === eventoId) || (v.data >= d0 && v.data <= data))
    if (!vv.length) return null
    const m = (f: (v: typeof vv[number]) => number | null) => { const x = vv.map(f).filter((n): n is number => n !== null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null }
    return { conc: m((v) => v.concentrazione), umore: m((v) => v.umore), energia: m((v) => v.energia), sonno: m((v) => v.sonnoOre) }
  }
  const testa = punti.map((p) => ({ p, d: sigaDiario(p.data, risultati.find((r) => r.id === p.id)?.eventoId ?? null) })).filter((x) => x.d)
  let confrontoTesta = ''
  if (testa.length >= 3) {
    const conc = testa.map((x) => x.d!.conc!).sort((a, b) => a - b)
    const med = conc[Math.floor(conc.length / 2)]
    const alto = testa.filter((x) => x.d!.conc! > med), basso = testa.filter((x) => x.d!.conc! <= med)
    const mm = (xx: typeof testa) => xx.reduce((a, x) => a + x.p.reale, 0) / Math.max(1, xx.length)
    if (alto.length && basso.length) confrontoTesta = `Con concentrazione sopra ${med}/5 il tuo punteggio reale medio è ${f1(mm(alto))}, sotto è ${f1(mm(basso))}.`
  }

  // Abilità
  const ab = profilo.abilita ?? {}
  const assi = DOMANDE.filter((d) => ab[d.area] !== undefined)
  const primoStorico = profilo.storicoAbilita?.[0]?.valori

  return (
    <div className="page">
      <PageHeader title="Statistiche" sub="Andamento, punti di forza e cosa migliorare" />

      {tuttiPunti.length > 0 && (
        <div className="filtri-stat">
          <select className="input" aria-label="Periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {opzioni.filter((o) => !o.gruppo).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {['Anno', 'Semestre', 'Trimestre'].map((g) => (
              <optgroup key={g} label={g}>{opzioni.filter((o) => o.gruppo === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
            ))}
          </select>
          <select className="input" aria-label="Arma" value={String(armaFiltro)} onChange={(e) => setArmaFiltro(e.target.value === 'tutte' ? 'tutte' : +e.target.value)}>
            <option value="tutte">Tutte le armi</option>
            {(armiUsate.length ? armiUsate : armi).map((a) => <option key={a.id} value={a.id}>{a.nome || a.modello}</option>)}
          </select>
          <div className="meta" style={{ gridColumn: '1 / -1' }}>
            {punti.length} gare su {tuttiPunti.length}{armi.length === 0 ? ' · aggiungi le tue armi in Materiale → Attrezzatura (con la data “dal”) per filtrare per arma' : ''}
          </div>
        </div>
      )}

      {tuttiPunti.length > 0 && punti.length === 0 ? (
        <div className="card"><Empty icon={<BarChart3 size={28} />} text="Nessuna gara in questo periodo o con questa arma." /></div>
      ) : punti.length === 0 ? (
        <div className="card">
          <Empty icon={<BarChart3 size={28} />} text="Importa i risultati delle tue gare: qui vedrai l’andamento, la precisione, la velocità e gli errori gara dopo gara."
            action={<Link to="/risultati" className="btn primary"><Medal size={18} /> Vai a Risultati</Link>} />
        </div>
      ) : (
        <>
          <div className="stats zone">
            <div className="stat"><div className="v">{punti.length}</div><div className="l">Gare analizzate</div></div>
            <div className="stat"><div className="v">{f1(media)}</div><div className="l">Punteggio reale medio</div></div>
            <div className="stat"><div className="v" style={{ color: trend > 0.3 ? 'var(--ok)' : trend < -0.3 ? 'var(--fuoco)' : undefined }}>{trend >= 0 ? '+' : ''}{f1(trend)}</div><div className="l">Punti reali per gara (tendenza)</div></div>
          </div>

          {giudizi.length > 0 && (
            <section className="card">
              <div className="card-title">Punti di forza e da migliorare</div>
              <div className="list">
                {giudizi.map((g) => (
                  <div key={g.titolo + g.tipo} className="item" style={{ alignItems: 'flex-start' }}>
                    {g.tipo === 'forte' ? <ThumbsUp size={18} color="var(--ok)" style={{ flexShrink: 0, marginTop: 2 }} /> : <ThumbsDown size={18} color="var(--fuoco)" style={{ flexShrink: 0, marginTop: 2 }} />}
                    <div><div className="title">{g.titolo}</div><div className="meta">{g.testo}</div></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-title">Punteggio reale</div>
            <GraficoLinee titolo="Punteggio reale gara per gara, con la percentuale in classifica" etichette={et} formato={(n) => f1(n)}
              serie={[
                { nome: 'Reale', valori: pG.map((p) => p.reale), colore: 'var(--accent)' },
                { nome: '% classifica', valori: pG.map((p) => p.pct), colore: 'var(--muted)', tratteggio: true },
              ]} />
            <p className="prose" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Il punteggio reale misura la tua gara rispetto a un Grand Master in forma sugli stessi stage, stimato da tutti i tiratori presenti e dalla loro classe:
              non dipende da chi ha vinto. Il tratteggio è la percentuale in classifica, che invece cambia con il livello del campo.
            </p>
            <div className="list" style={{ marginTop: 10 }}>
              {[...punti].reverse().slice(0, tutteGare ? undefined : 8).map((p) => (
                <Link key={p.id} to={`/risultati/${p.id}`} className="item" style={{ padding: '8px 12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title" style={{ fontSize: 14 }}>{p.gara}</div>
                    <div className="meta">{fmt(p.data, 'd MMM yyyy')} · {p.pos}° su {p.tot} ({f1(p.pct)}%) · campo {p.livelloCampo}</div>
                  </div>
                  <b style={{ color: p === migliore ? 'var(--accent)' : undefined }}>{f1(p.reale)}</b>
                </Link>
              ))}
              {punti.length > 8 && (
                <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setTutteGare((v) => !v)}>
                  {tutteGare ? 'Mostra solo le ultime 8' : `Mostra tutte le ${punti.length} gare`}
                </button>
              )}
            </div>
          </section>

          {conPV && (
            <section className="card">
              <div className="card-title">Precisione e velocità reali</div>
              <GraficoLinee titolo="Precisione e velocità rispetto a un Grand Master in forma" etichette={et} formato={(n) => f1(n)}
                serie={[
                  { nome: 'Precisione', valori: pG.map((p) => p.realePrecisione), colore: 'var(--accent)' },
                  { nome: 'Velocità', valori: pG.map((p) => p.realeVelocita), colore: 'var(--fuoco)' },
                ]} />
              <p className="prose" style={{ fontSize: 12, margin: '6px 0 0' }}>100 = come un Grand Master in forma. Precisione × velocità = punteggio reale.</p>
            </section>
          )}

          <section className="card">
            <div className="card-title">Colpi in A</div>
            <GraficoLinee titolo="Percentuale di colpi in A rispetto ai primi 10" etichette={et} formato={(n) => `${Math.round(n)}%`}
              serie={[
                { nome: 'Tu', valori: pG.map((p) => p.aPct * 100), colore: 'var(--accent)' },
                { nome: 'Primi 10', valori: pG.map((p) => p.aPctTop10 * 100), colore: 'var(--muted)', tratteggio: true },
              ]} />
          </section>

          <section className="card">
            <div className="card-title">Tempo rispetto ai primi 10</div>
            <GraficoLinee titolo="Tempo totale in percentuale della media dei primi 10" etichette={et} formato={(n) => `${Math.round(n)}`}
              serie={[
                { nome: 'Tu', valori: pG.map((p) => p.tempoRel * 100), colore: 'var(--accent)' },
                { nome: 'Primi 10', valori: pG.map(() => 100), colore: 'var(--muted)', tratteggio: true },
              ]} />
            <p className="prose" style={{ fontSize: 12, margin: '6px 0 0' }}>100 = tempo medio dei primi 10. Sotto 100 sei più veloce.</p>
          </section>

          <section className="card">
            <div className="card-title">Miss ogni 100 colpi</div>
            <GraficoLinee titolo="Miss ogni 100 colpi rispetto ai primi 10" etichette={et} formato={(n) => f1(n)} minimo={0}
              serie={[
                { nome: 'Tu', valori: pG.map((p) => p.mancati100), colore: 'var(--accent)' },
                { nome: 'Primi 10', valori: pG.map((p) => p.mancati100Top10), colore: 'var(--muted)', tratteggio: true },
              ]} />
            <p className="prose" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Miss, no-shoot e procedure ti sono costati {f1(punti.reduce((a, p) => a + p.costoErrori, 0))} punti gara in totale.
            </p>
          </section>

          {perCorso.length > 0 && (
            <section className="card">
              <div className="card-title">Per tipo di stage</div>
              <div className="list">
                {perCorso.map((x) => (
                  <div key={x.c} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 56px', gap: 10, alignItems: 'center', fontSize: 14 }}>
                    <span className="label">{x.c}</span>
                    <div className="progresso" style={{ marginTop: 0, height: 10 }}><span style={{ width: `${x.pct}%`, background: 'var(--accent)' }} /></div>
                    <b style={{ textAlign: 'right' }}>{f1(x.pct)}</b>
                  </div>
                ))}
              </div>
              <p className="prose" style={{ fontSize: 12, margin: '8px 0 0' }}>Punteggio reale medio su {perCorso.reduce((a, x) => a + x.k, 0)} stage. Il tipo viene dalla locandina quando è caricato, altrimenti dai colpi.</p>
            </section>
          )}

          {altreLista.length > 0 && !vediAltre && (
            <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setVediAltre(true)}><Shuffle size={16} /> E se fossi in un’altra divisione?</button>
          )}
          {altreLista.length > 0 && vediAltre && (
            <section className="card">
              <div className="card-title"><span>In un’altra divisione</span><button className="btn ghost" style={{ minHeight: 32, padding: '0 8px' }} onClick={() => setVediAltre(false)}>Chiudi</button></div>
              <div className="list">
                {altreLista.map((x) => (
                  <div key={x.d} className="item" style={{ padding: '8px 12px' }}>
                    <div style={{ flex: 1 }}><div className="title" style={{ fontSize: 14 }}>{x.d}</div><div className="meta">{x.pos.join(' · ')}</div></div>
                    <b>{f1(x.media)}%</b>
                  </div>
                ))}
              </div>
              <p className="prose" style={{ fontSize: 12, margin: '8px 0 0' }}>Media dei tuoi piazzamenti ipotetici nelle gare con i PDF completi. Con un’altra arma i tempi cambierebbero: è un indizio, non una previsione.</p>
            </section>
          )}

          <section className="card">
            <div className="card-title"><span>Testa e corpo</span><Link to="/diario">Diario</Link></div>
            {testa.length === 0 ? (
              <p className="prose" style={{ margin: 0, fontSize: 13 }}>Scrivi nel diario prima e dopo le gare (sonno, umore, energia, concentrazione): qui vedrai come incidono sui risultati.</p>
            ) : (
              <>
                <div className="list">
                  {testa.map(({ p, d }) => (
                    <Link key={p.id} to={`/risultati/${p.id}`} className="item" style={{ padding: '8px 12px' }}>
                      <div style={{ flex: 1 }}>
                        <div className="title" style={{ fontSize: 14 }}>{p.breve}</div>
                        <div className="meta">concentrazione {d!.conc ? f1(d!.conc) : '—'} · umore {d!.umore ? f1(d!.umore) : '—'}{d!.sonno ? ` · ${f1(d!.sonno)} h di sonno` : ''}</div>
                      </div>
                      <b>{f1(p.reale)}</b>
                    </Link>
                  ))}
                </div>
                {confrontoTesta && <p style={{ margin: '10px 0 0' }}>{confrontoTesta}</p>}
              </>
            )}
          </section>

          {rivali.length > 0 && risultati.length > 0 && (
            <section className="card">
              <div className="card-title">Avversari che segui</div>
              <div className="list">
                {rivali.map((n) => {
                  const righe = [...risultati].sort((a, b) => a.data.localeCompare(b.data)).map((r) => ({ r, c: trovaPerNome(r, n), io: r.concorrenti.find((x) => x.num === r.mioNum) })).filter((x) => x.c)
                  const davanti = righe.filter((x) => (x.io?.punti ?? 0) > x.c!.punti).length
                  return (
                    <div key={n} className="item" style={{ display: 'block' }}>
                      <div className="title">{n} <span className="meta">· davanti tu in {davanti} gare su {righe.length}</span></div>
                      <div className="chips" style={{ marginTop: 6 }}>
                        {righe.map(({ r, c, io }) => (
                          <span key={r.id} className="badge" style={{ color: (io?.punti ?? 0) > c!.punti ? 'var(--ok)' : 'var(--fuoco)' }}>{fmt(r.data, 'd MMM')}: tu {io?.pos}° · {nomeLeggibile(c!.nome).split(' ')[0]} {c!.pos}°</span>
                        ))}
                        {!righe.length && <span className="meta">Non presente nelle gare importate.</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      <section className="card">
        <div className="card-title">Allenamento</div>
        <div className="stats">
          <div className="stat"><div className="v">{sessioni90.length}</div><div className="l">Sessioni in 90 giorni</div></div>
          <div className="stat"><div className="v">{colpi90}</div><div className="l">Colpi sparati in 90 giorni</div></div>
          <div className="stat"><div className="v">{prove.length}</div><div className="l">Prove registrate</div></div>
        </div>
        {progressi.length > 0 ? (
          <div className="list" style={{ marginTop: 10 }}>
            {progressi.slice(0, 6).map((x) => (
              <Link key={x.d.id} to={`/allenamento/${x.d.id}`} className="item" style={{ padding: '8px 12px' }}>
                <div style={{ flex: 1 }}>
                  <div className="title" style={{ fontSize: 14 }}>{x.d.nome}</div>
                  <div className="meta">{x.n} prove · da {fmt2(x.primo)} a {fmt2(x.ultimo)} s · record {fmt2(x.record)} s</div>
                </div>
                <b style={{ color: x.delta < 0 ? 'var(--ok)' : 'var(--fuoco)' }}>{x.delta < 0 ? '' : '+'}{Math.round(x.delta * 100)}%</b>
              </Link>
            ))}
          </div>
        ) : <p className="prose" style={{ margin: '10px 0 0', fontSize: 13 }}>Registra almeno 3 prove su un drill per vedere i progressi.</p>}
      </section>

      <section className="card">
        <div className="card-title"><span>Abilità</span><Link to="/profilo">Questionario</Link></div>
        {assi.length >= 3 ? (
          <>
            <Radar titolo="Radar delle abilità" assi={assi.map((d) => d.titolo)} valori={assi.map((d) => ab[d.area] ?? 0)}
              confronto={primoStorico && profilo.storicoAbilita!.length > 1 ? assi.map((d) => primoStorico[d.area] ?? 0) : undefined} />
            {primoStorico && profilo.storicoAbilita!.length > 1 && <p className="prose" style={{ fontSize: 12, margin: 0 }}>Tratteggio: il primo questionario. Giallo: l’ultimo.</p>}
          </>
        ) : <p className="prose" style={{ margin: 0, fontSize: 13 }}>Compila il questionario delle abilità nel Profilo per vedere il radar.</p>}
      </section>
    </div>
  )
}
