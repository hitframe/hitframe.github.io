/** "Abilità misurate": i tempi veri dei video (GDA Split), con fasce di distanza, crescita e riferimenti di classe. */
import { ChevronDown, Gauge, Ruler, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import type { Classe, Profilo } from '../db/types'
import { livelloDi, METRICHE, NOMI_FASCIA, RIFERIMENTI, serieSettimanale, type Metrica } from '../video/corse'
import { useAbilita, type Abilita } from '../video/useAbilita'
import { GraficoLinee } from './Grafici'
import { useToast } from './ui'

const f2 = (n: number) => n.toFixed(2).replace('.', ',')
const MIN_PROFILO = 5
const PENDENZA_STANDARD = 0.035
const ORDINE_CLASSI: Classe[] = ['D', 'C', 'B', 'A', 'Master', 'Grand Master']
const SIGLA: Record<Classe, string> = { D: 'D', C: 'C', B: 'B', A: 'A', Master: 'M', 'Grand Master': 'GM' }

export default function AbilitaMisurate({ profilo }: { profilo: Profilo | undefined }) {
  const a = useAbilita()
  const toast = useToast()
  const [aperta, setAperta] = useState<Metrica | null>(null)
  if (!a) return null
  const conDati = a.stat.filter((s) => s.n > 0)
  const { voci, tempi, pendenza } = proposteDaVideo(a, profilo)

  async function aggiorna() {
    if (!profilo || !voci.length) return
    await db.profilo.update('me', { tempi: { ...profilo.tempi, ...tempi }, ...(pendenza != null ? { pendenzaDistanza: pendenza } : {}) })
    toast('Profilo aggiornato: i piani degli stage ora usano i tuoi tempi veri')
  }

  return (
    <section className="card" id="abilita">
      <div className="card-title"><span><Gauge size={18} style={{ verticalAlign: -3 }} /> Abilità misurate dai video</span><Link to="/video/storico">{a.run} run · storico</Link></div>
      {conDati.length === 0 ? (
        <p className="prose" style={{ margin: 0 }}>
          Qui finiscono i tempi veri delle tue run: analizza i video POV con GDA Split e salvali in Hitframe. Estrazione, split, transizioni, ricariche e movimenti si aggiornano da soli.
          {' '}<Link to="/video">Vai a Video</Link>
        </p>
      ) : (
        <>
          <div className="abilita-lista">
            {conDati.map((s) => {
              const m = METRICHE.find((x) => x.k === s.k)!
              const rif = m.profilo && profilo ? profilo.tempi[m.profilo] : null
              const liv = s.nBase >= 5 ? livelloDi(s.k, s.mediana) : null
              const su = aperta === s.k
              return (
                <div key={s.k} className="abilita-blocco">
                  <button type="button" className="abilita-riga" aria-expanded={su} onClick={() => setAperta(su ? null : s.k)}>
                    <div className="abilita-nome">
                      <b>{m.nome}</b>
                      <span>{s.k === 'ricarica' || s.k === 'movimento' || s.k === 'ricaricaMov' ? m.desc : s.nBase ? `Su ${NOMI_FASCIA.base}` : 'Nessuna misura su carta entro 8 m: valore su tutte'}</span>
                    </div>
                    <div className="abilita-val">
                      <b>{f2(s.mediana)}<small> s</small></b>
                      <span>migliore {f2(s.migliore)} · ±{f2(s.costanza)} · {s.nBase && s.nBase < s.n ? `${s.nBase} misure (${s.n} in tutto)` : `${s.n} ${s.n === 1 ? 'misura' : 'misure'}`}</span>
                      {rif != null && <span>nel profilo {f2(rif)}</span>}
                    </div>
                    <div className="abilita-extra">
                      {liv && <span className="badge">livello {SIGLA[liv]}</span>}
                      {s.tendenza != null && Math.abs(s.tendenza) >= 0.01 && (
                        <span className={`abilita-trend ${s.tendenza < 0 ? 'meglio' : 'peggio'}`} title="Ultimi 30 giorni rispetto ai 3 mesi prima">
                          {s.tendenza < 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />} {s.tendenza > 0 ? '+' : '−'}{f2(Math.abs(s.tendenza))}
                        </span>
                      )}
                      {s.fasce.map((f) => <span key={f.f} className="badge">{NOMI_FASCIA[f.f]} {f2(f.mediana)}</span>)}
                      <ChevronDown size={16} className={`abilita-giu${su ? ' su' : ''}`} />
                    </div>
                  </button>
                  {su && <Crescita a={a} k={s.k} classe={profilo?.classe} />}
                </div>
              )
            })}
          </div>

          {a.pendenza ? (
            <p className="prose abilita-dist"><Ruler size={15} /> <span><b>Costo della distanza:</b> ogni metro oltre i 7 m ti costa il <b>{(a.pendenza.pendenza * 100).toFixed(1).replace('.', ',')}%</b> di tempo in più sugli split
              ({a.pendenza.n} misure tra {a.pendenza.da} e {a.pendenza.a} m). Nei piani degli stage {profilo?.pendenzaDistanza != null ? 'si usa già il tuo valore' : `si usa il valore standard del ${(PENDENZA_STANDARD * 100).toFixed(1).replace('.', ',')}%`}.</span></p>
          ) : (
            <p className="prose abilita-dist"><Ruler size={15} /> <span>Indica le distanze dei bersagli nelle run (anche solo la distanza tipica): con almeno 8 split a distanze diverse calcolo quanto ti costa ogni metro in più.</span></p>
          )}
          <p className="prose" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
            Valore principale: la mediana su carta fino a 8 m, come i tempi del profilo. ± è la costanza (più è bassa, più sei regolare). Il livello è un riferimento indicativo per classe, non ufficiale. Tocca un’abilità per la crescita nel tempo.
          </p>
          {voci.length > 0 && (
            <button className="btn primary" style={{ marginTop: 10 }} onClick={aggiorna}>Usa questi valori nel profilo ({voci.join(', ')})</button>
          )}
        </>
      )}
    </section>
  )
}

function Crescita({ a, k, classe }: { a: Abilita; k: Metrica; classe: Classe | undefined }) {
  const { etichette, valori } = serieSettimanale(a.camp[k], k)
  const rif = RIFERIMENTI[k]
  if (etichette.length < 2) return <p className="prose" style={{ margin: '6px 4px 0', fontSize: 13 }}>Servono misure in almeno due settimane diverse per vedere la crescita.</p>
  const i = classe ? ORDINE_CLASSI.indexOf(classe) : -1
  const prossima = i >= 0 && i < ORDINE_CLASSI.length - 1 ? ORDINE_CLASSI[i + 1] : null
  const serie = [
    { nome: 'Tu', valori, colore: 'var(--accent)' },
    ...(rif && classe ? [{ nome: `Classe ${SIGLA[classe]}`, valori: valori.map(() => rif[classe]), colore: 'var(--muted)', tratteggio: true, riferimento: true }] : []),
    ...(rif && prossima ? [{ nome: `Classe ${SIGLA[prossima]}`, valori: valori.map(() => rif[prossima]), colore: 'var(--ok)', tratteggio: true, riferimento: true }] : []),
  ]
  return (
    <div className="abilita-grafico">
      <GraficoLinee titolo={`Crescita: ${METRICHE.find((m) => m.k === k)!.nome.toLowerCase()} (mediana per settimana)`} etichette={etichette.map((d) => d.slice(5).split('-').reverse().join('/'))}
        serie={serie} formato={f2} invertito />
    </div>
  )
}

/** Cosa cambierebbe nel profilo usando i tempi misurati dai video (mediane su carta fino a 8 m). */
export function proposteDaVideo(a: Abilita, profilo: Profilo | undefined | null) {
  const tempi: Partial<Profilo['tempi']> = {}
  const voci: string[] = []
  const righe: { nome: string; video: number; profilo: number }[] = []
  if (!profilo) return { tempi, voci, righe, pendenza: null as number | null }
  for (const s of a.stat) {
    const m = METRICHE.find((x) => x.k === s.k)
    if (!m?.profilo || s.nBase < MIN_PROFILO) continue
    righe.push({ nome: m.nome, video: s.mediana, profilo: profilo.tempi[m.profilo] })
    if (Math.abs(profilo.tempi[m.profilo] - s.mediana) >= 0.02) {
      tempi[m.profilo] = Math.round(s.mediana * 100) / 100
      voci.push(m.nome.toLowerCase())
    }
  }
  let pendenza: number | null = null
  if (a.pendenza && Math.abs((profilo.pendenzaDistanza ?? PENDENZA_STANDARD) - a.pendenza.pendenza) >= 0.003) {
    pendenza = Math.round(a.pendenza.pendenza * 1000) / 1000
    voci.push('costo della distanza')
  }
  return { tempi, voci, righe, pendenza }
}
