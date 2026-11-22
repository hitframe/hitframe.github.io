import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { trovaDrill } from '../allenamento/servizi'
import { campioni, pendenzaDistanza, statistiche, type Campione, type Metrica, type StatMetrica } from './corse'

/** Abilità misurate dalle run di GDA Split (null finché carica). */
export interface Abilita { stat: StatMetrica[]; run: number; camp: Record<Metrica, Campione[]>; pendenza: ReturnType<typeof pendenzaDistanza> }

export function useAbilita(): Abilita | null {
  const corse = useLiveQuery(() => db.corse.toArray())
  const personali = useLiveQuery(() => db.drillPersonali.toArray())
  return useMemo(() => {
    if (!corse || !personali) return null
    const camp = campioni(corse, (id) => trovaDrill(id, personali))
    return { stat: statistiche(camp), run: corse.length, camp, pendenza: pendenzaDistanza(camp) }
  }, [corse, personali])
}

/** Per l'AI: solo le abilità con abbastanza dati. */
export function abilitaPerAI(a: Pick<Abilita, 'stat' | 'run'> & { pendenza?: Abilita['pendenza'] } | null) {
  if (!a) return undefined
  const r2 = (x: number) => Math.round(x * 100) / 100
  const out = a.stat.filter((s) => s.n >= 3).map((s) => ({
    abilita: s.k, campioni: s.n, riferimento: s.nBase ? 'carta fino a 8 m' : 'tutte le distanze',
    mediana_s: r2(s.mediana), migliore_s: r2(s.migliore), costanza_s: r2(s.costanza),
    tendenza_ultimi30gg_s: s.tendenza == null ? null : r2(s.tendenza),
    altre_fasce: s.fasce.map((f) => ({ fascia: f.f, campioni: f.n, mediana_s: r2(f.mediana) })),
  }))
  return out.length ? {
    fonte: 'tempi reali dai video POV (GDA Split)', run: a.run, abilita: out,
    costo_distanza: a.pendenza ? `+${Math.round(a.pendenza.pendenza * 1000) / 10}% di tempo per metro oltre i 7 m` : null,
  } : undefined
}
