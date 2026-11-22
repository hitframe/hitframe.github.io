import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { trovaDrill } from '../allenamento/servizi'
import { campioni, statistiche, type StatMetrica } from './corse'

/** Abilità misurate dalle run di GDA Split (null finché carica). */
export function useAbilita(): { stat: StatMetrica[]; run: number } | null {
  const corse = useLiveQuery(() => db.corse.toArray())
  const personali = useLiveQuery(() => db.drillPersonali.toArray())
  return useMemo(() => {
    if (!corse || !personali) return null
    return { stat: statistiche(campioni(corse, (id) => trovaDrill(id, personali))), run: corse.length }
  }, [corse, personali])
}

/** Per l'AI: solo le abilità con abbastanza dati. */
export function abilitaPerAI(a: { stat: StatMetrica[]; run: number } | null) {
  if (!a) return undefined
  const r2 = (x: number) => Math.round(x * 100) / 100
  const out = a.stat.filter((s) => s.n >= 3).map((s) => ({ abilita: s.k, campioni: s.n, mediana_s: r2(s.mediana), migliore_s: r2(s.migliore), costanza_s: r2(s.costanza), tendenza_ultimi30gg_s: s.tendenza == null ? null : r2(s.tendenza) }))
  return out.length ? { fonte: 'tempi reali dai video POV (GDA Split)', run: a.run, abilita: out } : undefined
}
