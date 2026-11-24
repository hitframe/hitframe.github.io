/**
 * I PDF delle analisi di gara viaggiano nel Drive dell'utente come file a sé (non dentro il file dei dati):
 * - chi ha il PDF lo carica e scrive l'id nel record (pdfDrive), che arriva agli altri dispositivi;
 * - chi ha solo l'id lo scarica quando serve (aprendo la gara o lo stage);
 * - i PDF di analisi cancellate vengono tolti dal Drive dopo qualche giorno.
 */
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { AnalisiGara } from '../db/types'
import { getAccount, puoRinnovareDaSolo, rinnovaSilenzioso, tokenValido } from '../google/auth'
import { caricaPdf, eliminaFile, elencaPdf, scaricaPdf } from './drive'
import { sospendiSegnalazioni } from './segnali'

const ORFANI_DOPO = 3 * 86_400_000
let inCorso: Promise<number> | null = null

/** Carica i PDF che mancano nel Drive e pulisce quelli orfani. Restituisce quanti ne ha caricati. */
export function allineaPdf(): Promise<number> {
  if (inCorso) return inCorso
  inCorso = (async () => {
    let caricati = 0
    for (const a of await db.analisi.toArray()) {
      if (!a.pdf || a.pdfDrive || a.id == null) continue
      const nome = `hitframe-gara-${a.id}.pdf`
      const id = await caricaPdf(a.pdf, nome)
      await sospendiSegnalazioni(() => db.analisi.update(a.id!, { pdfDrive: id }))
      caricati++
    }
    // porta su questo dispositivo le locandine che mancano, così al poligono si vedono anche offline
    for (const a of await db.analisi.toArray()) {
      if (!a.pdf && a.pdfDrive) await assicuraPdf(a).catch(() => false)
    }
    try {
      const usati = new Set((await db.analisi.toArray()).map((a) => a.pdfDrive).filter(Boolean) as string[])
      const ora = Date.now()
      for (const f of await elencaPdf()) {
        if (!usati.has(f.id) && ora - Date.parse(f.modifiedTime) > ORFANI_DOPO) await eliminaFile(f.id)
      }
    } catch (e) {
      console.warn('Pulizia PDF non riuscita', e)
    }
    return caricati
  })().finally(() => { inCorso = null })
  return inCorso
}

const scaricamenti = new Map<number, Promise<boolean>>()

/** Porta su questo dispositivo il PDF di un'analisi, se è nel Drive. */
export function assicuraPdf(a: Pick<AnalisiGara, 'id' | 'pdf' | 'pdfDrive'>): Promise<boolean> {
  if (a.pdf) return Promise.resolve(true)
  if (!a.pdfDrive || a.id == null || !getAccount()) return Promise.resolve(false)
  if (!tokenValido() && !puoRinnovareDaSolo()) return Promise.resolve(false)
  let p = scaricamenti.get(a.id)
  if (!p) {
    const id = a.id, fileId = a.pdfDrive
    p = (async () => {
      // nell'app per computer l'accesso si rinnova da solo; nel browser serve un tocco dell'utente
      if (!tokenValido() && !(await rinnovaSilenzioso())) return false
      const blob = await scaricaPdf(fileId)
      if (!blob) return false
      await sospendiSegnalazioni(() => db.analisi.update(id, { pdf: blob }))
      return true
    })().catch((e) => { console.warn(e); return false }).finally(() => scaricamenti.delete(id))
    scaricamenti.set(a.id, p)
  }
  return p
}

export type StatoPdf = 'pronto' | 'scarico' | 'nel-drive' | 'assente'

/** Stato del PDF di un'analisi, scaricandolo dal Drive se serve. */
export function usePdfAnalisi(a: Pick<AnalisiGara, 'id' | 'pdf' | 'pdfDrive'> | undefined | null): StatoPdf {
  const [fallitoPer, setFallitoPer] = useState<string | null>(null)
  const id = a?.id, ha = !!a?.pdf, drive = a?.pdfDrive ?? null
  useEffect(() => {
    if (!a || ha || !drive) return
    let ok = true
    void assicuraPdf(a).then((r) => { if (ok && !r) setFallitoPer(drive) })
    return () => { ok = false }
  }, [id, ha, drive]) // eslint-disable-line react-hooks/exhaustive-deps
  const fallito = fallitoPer !== null && fallitoPer === drive
  if (!a) return 'assente'
  if (ha) return 'pronto'
  if (!drive) return 'assente'
  return fallito ? 'nel-drive' : 'scarico'
}

export const MSG_PDF: Record<Exclude<StatoPdf, 'pronto'>, string> = {
  scarico: 'Scarico il PDF della gara dal tuo Google Drive…',
  'nel-drive': 'La locandina è nel tuo Google Drive e su questo dispositivo non c’è ancora.',
  assente: 'Il disegno non è disponibile: ricarica la locandina della gara.',
}
