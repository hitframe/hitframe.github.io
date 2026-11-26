import { useLiveQuery } from 'dexie-react-hooks'
import { db, normalizzaProfilo } from '../db/db'
import type { AnalisiGara, Corsa, Profilo } from '../db/types'
import { chiaveMappa } from './mappa'
import { correzioneDaVideo, strategie } from './schema'

/** Lo stage della locandina collegato a una run (se c'è e se è stato segnato). */
export function stageDellaRun(c: Pick<Corsa, 'analisiId' | 'stage'>, a: AnalisiGara | undefined) {
  if (!a || c.stage == null) return null
  const sez = a.lettura.sezioni[a.sezione] ?? a.lettura.sezioni[0]
  const s = sez?.stages.find((x) => x.numero === c.stage)
  const schema = a.schemi?.[chiaveMappa(a.sezione, c.stage)]
  return s ? { s, schema: schema?.segni?.length ? schema : null, nomeGara: sez.info.nome || a.nomeFile } : null
}

const reale = (c: Corsa) => c.tempoTimer ?? c.colpi[c.colpi.length - 1] ?? null

/** Rapporti tempo reale / tempo stimato dai video di gara collegati agli stage studiati. */
export function rapportiVideo(corse: Corsa[], analisi: AnalisiGara[], profilo: Profilo) {
  const perId = new Map(analisi.map((a) => [a.id, a]))
  const out: number[] = []
  for (const c of corse) {
    if (c.contesto !== 'gara' || c.analisiId == null) continue
    const x = stageDellaRun(c, perId.get(c.analisiId))
    const t = reale(c)
    if (!x?.schema || !t) continue
    const p = strategie(x.schema, x.s, profilo, undefined, 1)
    const st = p?.tutte.find((y) => y.stile === p.consigliata)
    if (st) out.push(t / st.tempo)
  }
  return out
}

/** Correzione personale delle stime, calcolata dai tuoi video di gara. */
export function useCorrezioneVideo() {
  return useLiveQuery(async () => {
    const profilo = normalizzaProfilo(await db.profilo.get('me'))
    const corse = (await db.corse.toArray()).filter((c) => c.contesto === 'gara')
    const ids = [...new Set(corse.map((c) => c.analisiId).filter((x): x is number => x != null))]
    const analisi = (await db.analisi.bulkGet(ids)).filter((a): a is AnalisiGara => !!a)
    return correzioneDaVideo(rapportiVideo(corse, analisi, profilo))
  }) ?? { fattore: 1, n: 0 }
}
