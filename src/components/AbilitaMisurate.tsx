/** "Abilità misurate": i tempi veri dei video (GDA Split), con mediana, migliore, costanza e tendenza. */
import { Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import type { Profilo } from '../db/types'
import { METRICHE } from '../video/corse'
import { useAbilita } from '../video/useAbilita'
import { useToast } from './ui'

const f2 = (n: number) => n.toFixed(2).replace('.', ',')
const MIN_PROFILO = 5

export default function AbilitaMisurate({ profilo }: { profilo: Profilo | undefined }) {
  const a = useAbilita()
  const toast = useToast()
  if (!a) return null
  const conDati = a.stat.filter((s) => s.n > 0)
  const daAggiornare = conDati.filter((s) => {
    const k = METRICHE.find((m) => m.k === s.k)?.profilo
    return k && s.n >= MIN_PROFILO && profilo && Math.abs(profilo.tempi[k] - s.mediana) >= 0.02
  })

  async function aggiorna() {
    if (!profilo) return
    const tempi = { ...profilo.tempi }
    for (const s of daAggiornare) {
      const k = METRICHE.find((m) => m.k === s.k)!.profilo!
      tempi[k] = Math.round(s.mediana * 100) / 100
    }
    await db.profilo.update('me', { tempi })
    toast('Tempi del profilo aggiornati: i piani degli stage ora usano i tuoi tempi veri')
  }

  return (
    <section className="card" id="abilita">
      <div className="card-title"><span><Gauge size={18} style={{ verticalAlign: -3 }} /> Abilità misurate dai video</span><Link to="/video">{a.run} run</Link></div>
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
              return (
                <div key={s.k} className="abilita-riga">
                  <div className="abilita-nome"><b>{m.nome}</b><span>{m.desc}</span></div>
                  <div className="abilita-val">
                    <b>{f2(s.mediana)}<small> s</small></b>
                    <span>migliore {f2(s.migliore)} · ±{f2(s.costanza)} · {s.n} {s.n === 1 ? 'volta' : 'volte'}</span>
                    {rif != null && <span>nel profilo {f2(rif)}</span>}
                  </div>
                  {s.tendenza != null && Math.abs(s.tendenza) >= 0.01 && (
                    <span className={`abilita-trend ${s.tendenza < 0 ? 'meglio' : 'peggio'}`} title="Ultimi 30 giorni rispetto ai 3 mesi prima">
                      {s.tendenza < 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />} {s.tendenza > 0 ? '+' : '−'}{f2(Math.abs(s.tendenza))}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="prose" style={{ margin: '10px 0 0', fontSize: 12.5 }}>
            Valore principale: la mediana. ± è la costanza (più è bassa, più sei regolare). La freccia confronta gli ultimi 30 giorni con i 3 mesi prima.
          </p>
          {daAggiornare.length > 0 && (
            <button className="btn primary" style={{ marginTop: 10 }} onClick={aggiorna}>
              Usa questi tempi nel profilo ({daAggiornare.map((s) => METRICHE.find((m) => m.k === s.k)!.nome.toLowerCase()).join(', ')})
            </button>
          )}
        </>
      )}
    </section>
  )
}
