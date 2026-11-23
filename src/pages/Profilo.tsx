import { Clapperboard, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { SezioneObiettivi } from '../components/Obiettivi'
import { QuestionarioAbilita, RiepilogoAbilita } from '../components/Abilita'
import { proposteDaVideo } from '../components/AbilitaMisurate'
import { useAbilita } from '../video/useAbilita'
import { numOrNull, PageHeader, Segmented, useToast } from '../components/ui'
import { db, normalizzaProfilo, nowIso } from '../db/db'
import {
  CATEGORIE, CLASSI, DIVISIONI, FUNZIONAMENTI, RIFERIMENTI_DEFAULT, TEMPI_DEFAULT,
  type DettagliArma, type Funzionamento, type Profilo as P, type RiferimentiGara, type TempiPersonali,
} from '../db/types'

const TEMPI: { k: keyof TempiPersonali; nome: string; desc: string; unita: string }[] = [
  { k: 'estrazione', nome: 'Estrazione', desc: 'Dal beep al primo colpo, bersaglio a 7 m, mani in posizione di resa', unita: 's' },
  { k: 'split', nome: 'Split', desc: 'Tra due colpi sullo stesso bersaglio a 7–10 m', unita: 's' },
  { k: 'transizioneVicina', nome: 'Transizione vicina', desc: 'Tra bersagli a circa 1 m di distanza', unita: 's' },
  { k: 'transizioneLontana', nome: 'Transizione lontana', desc: 'Tra bersagli distanti o con grande angolo', unita: 's' },
  { k: 'ricarica', nome: 'Ricarica', desc: 'Dall’ultimo colpo al primo colpo dopo il cambio caricatore', unita: 's' },
  { k: 'entrataPosizione', nome: 'Entrata in posizione', desc: 'Dall’arrivo in posizione al primo colpo', unita: 's' },
  { k: 'uscitaPosizione', nome: 'Uscita dalla posizione', desc: 'Dall’ultimo colpo al primo passo', unita: 's' },
  { k: 'colpoPiastra', nome: 'Colpo su piastra', desc: 'Colpo singolo su metallo a media distanza', unita: 's' },
  { k: 'velocitaMovimento', nome: 'Velocità di movimento', desc: 'Media tra posizioni, comprese partenza e frenata', unita: 'm/s' },
]

const TIPI = ['Short', 'Medium', 'Long'] as const
const TITOLI: Record<string, string> = { atleta: 'Atleta', tempi: 'Tempi tecnici', abilita: 'Abilità', gara: 'Tempi di gara', obiettivi: 'Obiettivi' }
const SOTTO: Record<string, string> = {
  atleta: 'Chi sei e con cosa tiri',
  tempi: 'I tuoi tempi medi: la base di drill, piani e stime',
  abilita: 'Questionario e misure dai video',
  gara: 'Tempi tipici su stage puliti, per Short, Medium e Long',
  obiettivi: 'Cosa vuoi ottenere in questa stagione',
}
const f2 = (n: number) => n.toFixed(2).replace('.', ',')
const txt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

function testiDa(p: P): Record<string, string> {
  const t: Record<string, string> = {}
  for (const x of TEMPI) t[`t.${x.k}`] = txt(p.tempi[x.k])
  for (const k of TIPI) for (const c of ['min', 'max', 'colpi'] as const) t[`r.${k}.${c}`] = txt(p.riferimenti[k][c])
  t['a.capienza'] = txt(p.armaDettagli.capienza)
  t['a.pesoScatto'] = txt(p.armaDettagli.pesoScatto)
  return t
}

export default function Profilo() {
  const toast = useToast()
  const [p, setP] = useState<P | null>(null)
  const [testi, setTesti] = useState<Record<string, string>>({})
  const [sporco, setSporco] = useState(false)
  const [questionario, setQuestionario] = useState(false)
  const abilitaVideo = useAbilita()
  const { parte } = useParams()
  const vedi = (k: string) => !parte || parte === k

  useEffect(() => {
    db.profilo.get('me').then((x) => {
      const base = normalizzaProfilo(x)
      setP(base)
      setTesti(testiDa(base))
    })
  }, [])

  if (!p) return <div className="page"><PageHeader title="Profilo" /></div>

  const set = <K extends keyof P>(k: K, v: P[K]) => { setP({ ...p, [k]: v }); setSporco(true) }
  const setArma = <K extends keyof DettagliArma>(k: K, v: DettagliArma[K]) => {
    setP((prev) => prev && { ...prev, armaDettagli: { ...prev.armaDettagli, [k]: v } })
    setSporco(true)
  }

  const setTempo = (k: keyof TempiPersonali, raw: string) => {
    setTesti((t) => ({ ...t, [`t.${k}`]: raw }))
    const n = numOrNull(raw)
    if (n !== null && n > 0) setP((prev) => prev && { ...prev, tempi: { ...prev.tempi, [k]: n } })
    setSporco(true)
  }

  const setRif = (tipo: keyof RiferimentiGara, campo: 'min' | 'max' | 'colpi', raw: string) => {
    setTesti((t) => ({ ...t, [`r.${tipo}.${campo}`]: raw }))
    const n = numOrNull(raw)
    if (n !== null && n > 0) {
      setP((prev) => prev && { ...prev, riferimenti: { ...prev.riferimenti, [tipo]: { ...prev.riferimenti[tipo], [campo]: n } } })
    }
    setSporco(true)
  }

  const setArmaNum = (k: 'capienza' | 'pesoScatto', raw: string) => {
    setTesti((t) => ({ ...t, [`a.${k}`]: raw }))
    setArma(k, numOrNull(raw))
  }

  const ripristinaTempi = () => {
    const np = { ...p, tempi: { ...TEMPI_DEFAULT } }
    setP(np)
    setTesti(testiDa(np))
    setSporco(true)
  }
  const ripristinaRif = () => {
    const np = { ...p, riferimenti: structuredClone(RIFERIMENTI_DEFAULT) }
    setP(np)
    setTesti(testiDa(np))
    setSporco(true)
  }

  async function salva() {
    if (!p) return
    for (const k of TIPI) {
      if (p.riferimenti[k].max < p.riferimenti[k].min) {
        toast(`${k}: il massimo è più basso del minimo`)
        return
      }
    }
    // gli obiettivi si salvano a parte: non sovrascriverli con quelli letti all'apertura
    const attuale = await db.profilo.get('me')
    await db.profilo.put({ ...p, obiettivi: attuale?.obiettivi ?? p.obiettivi, aggiornato: nowIso() })
    setSporco(false)
    toast('Profilo salvato')
  }

  const t = p.tempi
  const a = p.armaDettagli
  const billDrill = t.estrazione + 5 * t.split
  const elPresidente = t.estrazione + 0.35 + 6 * t.split + 4 * t.transizioneVicina + t.ricarica
  const spostamento5m = t.uscitaPosizione + 5 / t.velocitaMovimento + t.entrataPosizione

  return (
    <div className="page">
      <PageHeader
        title={TITOLI[parte ?? ''] ?? 'Profilo'}
        sub={SOTTO[parte ?? ''] ?? 'I tuoi dati e i tuoi tempi: la base di ogni calcolo'}
        actions={<button className="btn primary" onClick={salva} disabled={!sporco}><Save size={18} /> Salva</button>}
      />

      {vedi('obiettivi') && <SezioneObiettivi />}

      {vedi('atleta') && (
      <section className="card form">
        <div className="card-title" style={{ marginBottom: 0 }}>Atleta</div>
        <div className="field">
          <label htmlFor="p-nome">Nome</label>
          <input id="p-nome" className="input" value={p.nome} onChange={(e) => set('nome', e.target.value)} />
        </div>
        <div className="fields-2">
          <div className="field">
            <label htmlFor="p-div">Divisione</label>
            <select id="p-div" className="select" value={p.divisione} onChange={(e) => set('divisione', e.target.value as P['divisione'])}>
              {DIVISIONI.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-classe">Classe</label>
            <select id="p-classe" className="select" value={p.classe} onChange={(e) => set('classe', e.target.value as P['classe'])}>
              {CLASSI.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="fields-2">
          <div className="field">
            <label htmlFor="p-cat">Categoria</label>
            <select id="p-cat" className="select" value={p.categoria} onChange={(e) => set('categoria', e.target.value)}>
              {CATEGORIE.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-club">Club</label>
            <input id="p-club" className="input" value={p.club} onChange={(e) => set('club', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <span className="label">Mano forte</span>
          <Segmented label="Mano forte" value={p.manoForte} onChange={(v) => set('manoForte', v)}
            options={[{ value: 'destra', label: 'Destra' }, { value: 'sinistra', label: 'Sinistra' }]} />
        </div>
      </section>
      )}

      {vedi('abilita') && <RiepilogoAbilita abilita={p.abilita} storico={p.storicoAbilita} onQuestionario={() => setQuestionario(true)} />}
      {abilitaVideo && (vedi('abilita') || vedi('tempi')) && (() => {
        const prop = proposteDaVideo(abilitaVideo, p)
        async function aggiornaDaVideo() {
          const np = { ...p!, tempi: { ...p!.tempi, ...prop.tempi }, ...(prop.pendenza != null ? { pendenzaDistanza: prop.pendenza } : {}) }
          setP(np)
          setTesti(testiDa(np))
          const attuale = await db.profilo.get('me')
          await db.profilo.put({ ...np, obiettivi: attuale?.obiettivi ?? np.obiettivi, aggiornato: nowIso() })
          setSporco(false)
          toast(`Aggiornati dai video: ${prop.voci.join(', ')}`)
        }
        return (
          <section className="card">
            <div className="card-title"><span><Clapperboard size={18} style={{ verticalAlign: -3 }} /> Abilità dai video</span><Link to="/video">{abilitaVideo.run} run</Link></div>
            {prop.righe.length === 0 ? (
              <p className="prose" style={{ margin: 0, fontSize: 13 }}>
                Servono almeno 5 misure su carta fino a 8 m per un’abilità: salva le run da GDA Split in <Link to="/video">Video</Link> e qui potrai aggiornare i tuoi tempi con un tocco.
              </p>
            ) : (
              <>
                <div className="tempo-confronto">
                  {prop.righe.map((r) => (
                    <div key={r.nome} className="tempo-row">
                      <div><span className="n">{r.nome}</span><div className="d">profilo {f2(r.profilo)} s</div></div>
                      <b style={{ color: Math.abs(r.video - r.profilo) < 0.02 ? 'var(--text)' : r.video < r.profilo ? 'var(--ok)' : 'var(--accent)' }}>{f2(r.video)} s</b>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn primary" disabled={!prop.voci.length} onClick={aggiornaDaVideo}><RefreshCw size={18} /> Aggiorna</button>
                  <span className="meta">{prop.voci.length ? `Cambiano: ${prop.voci.join(', ')}` : 'I tempi del profilo sono già allineati ai video.'}</span>
                </div>
              </>
            )}
          </section>
        )
      })()}

      {vedi('atleta') && (
      <section className="card form">
        <div className="card-title" style={{ marginBottom: 0 }}>Arma principale</div>
        <div className="field">
          <label htmlFor="p-arma">Marca e modello</label>
          <input id="p-arma" className="input" value={p.arma} onChange={(e) => set('arma', e.target.value)} placeholder="Es. Arsenal Firearms Strike One" />
        </div>
        <div className="field">
          <label htmlFor="a-funz">Funzionamento</label>
          <select id="a-funz" className="select" value={a.funzionamento} onChange={(e) => setArma('funzionamento', e.target.value as Funzionamento)}>
            {(Object.keys(FUNZIONAMENTI) as Funzionamento[]).map((k) => <option key={k} value={k}>{FUNZIONAMENTI[k]}</option>)}
          </select>
          <span className="hint">
            {a.funzionamento === 'dasa' && 'Le stime aggiungono il primo colpo in doppia azione dalla condizione di pronto.'}
            {a.funzionamento === 'dao' && 'Le stime considerano uno scatto più lungo su tutti i colpi.'}
            {a.funzionamento === 'lem' && 'Le stime aggiungono un piccolo margine sul primo colpo.'}
          </span>
        </div>
        <div className="fields-3">
          <div className="field">
            <label htmlFor="a-cal">Calibro</label>
            <input id="a-cal" className="input" value={a.calibro} onChange={(e) => setArma('calibro', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="a-cap">Colpi nel caricatore</label>
            <input id="a-cap" className="input" inputMode="numeric" value={testi['a.capienza'] ?? ''} onChange={(e) => setArmaNum('capienza', e.target.value)} placeholder="15" />
          </div>
          <div className="field">
            <label htmlFor="a-scatto">Peso scatto (kg)</label>
            <input id="a-scatto" className="input" inputMode="decimal" value={testi['a.pesoScatto'] ?? ''} onChange={(e) => setArmaNum('pesoScatto', e.target.value)} />
          </div>
        </div>
        <div className="fields-2">
          <label className="check">
            <input type="checkbox" checked={a.ottica} onChange={(e) => setArma('ottica', e.target.checked)} />
            Ottica (red dot)
          </label>
          {a.ottica && (
            <div className="field">
              <label htmlFor="a-ott">Modello ottica</label>
              <input id="a-ott" className="input" value={a.modelloOttica} onChange={(e) => setArma('modelloOttica', e.target.value)} />
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="a-canna">Canna</label>
          <input id="a-canna" className="input" value={a.canna} onChange={(e) => setArma('canna', e.target.value)} placeholder="Lunghezza, marca, data di sostituzione…" />
        </div>
        <div className="field">
          <label htmlFor="a-note">Note</label>
          <textarea id="a-note" className="textarea" style={{ minHeight: 80 }} value={a.note} onChange={(e) => setArma('note', e.target.value)} placeholder="Molle, guida, modifiche…" />
        </div>
      </section>
      )}

      {vedi('gara') && (
      <section className="card">
        <div className="card-title">
          <span>Tempi di riferimento in gara</span>
          <button className="btn ghost" onClick={ripristinaRif} style={{ minHeight: 36 }}><RotateCcw size={16} /> Predefiniti</button>
        </div>
        <p className="prose" style={{ margin: '0 0 10px', fontSize: 13 }}>
          I tuoi tempi tipici su stage puliti, senza errori. Le stime delle gare partono da qui e si adattano a ogni stage.
        </p>
        <div className="rif-grid">
          <span />
          <span className="label">Min (s)</span>
          <span className="label">Max (s)</span>
          <span className="label">Colpi</span>
          {TIPI.map((k) => (
            <div key={k} style={{ display: 'contents' }}>
              <span className="n">{k}</span>
              {(['min', 'max', 'colpi'] as const).map((c) => (
                <input key={c} className="input" inputMode="decimal" aria-label={`${k} ${c}`}
                  value={testi[`r.${k}.${c}`] ?? ''} onChange={(e) => setRif(k, c, e.target.value)} />
              ))}
            </div>
          ))}
        </div>
      </section>
      )}

      {vedi('tempi') && (
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-title">
            <span>Tempi tecnici</span>
            <button className="btn ghost" onClick={ripristinaTempi} style={{ minHeight: 36 }}><RotateCcw size={16} /> Predefiniti</button>
          </div>
          <p className="prose" style={{ margin: '0 0 6px', fontSize: 13 }}>
            Valori medi, non i migliori: servono per drill e allenamenti. Con il Timer si aggiorneranno da soli.
          </p>
          {TEMPI.map((x) => (
            <div key={x.k} className="tempo-row">
              <div>
                <label className="n" htmlFor={`t-${x.k}`}>{x.nome}</label>
                <div className="d">{x.desc}</div>
              </div>
              <div className="unit-input">
                <input id={`t-${x.k}`} className="input" inputMode="decimal" value={testi[`t.${x.k}`] ?? ''} onChange={(e) => setTempo(x.k, e.target.value)} />
                <span>{x.unita}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-title">Stime sui drill</div>
          <p className="prose" style={{ margin: '0 0 12px', fontSize: 13 }}>
            Calcolate dai tempi tecnici.
          </p>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(1, minmax(0, 1fr))' }}>
            <div className="stat">
              <div className="v">{f2(billDrill)} s</div>
              <div className="l">Bill Drill: estrazione e 6 colpi su un bersaglio</div>
            </div>
            <div className="stat">
              <div className="v">{f2(elPresidente)} s</div>
              <div className="l">El Presidente: giro, 12 colpi su 3 bersagli, una ricarica</div>
            </div>
            <div className="stat">
              <div className="v">{f2(spostamento5m)} s</div>
              <div className="l">Cambio posizione di 5 m: uscita, movimento ed entrata</div>
            </div>
          </div>
        </section>
      </div>
      )}

      {questionario && (
        <QuestionarioAbilita iniziale={p.abilita} onClose={() => setQuestionario(false)}
          onSalvato={(a) => setP((prev) => prev && { ...prev, abilita: a, storicoAbilita: [...(prev.storicoAbilita ?? []), { data: new Date().toISOString().slice(0, 10), valori: a }] })} />
      )}

      {sporco && (
        <div className="row" style={{ position: 'sticky', bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px)', justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={salva}><Save size={18} /> Salva modifiche</button>
        </div>
      )}
    </div>
  )
}
