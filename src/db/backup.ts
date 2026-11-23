import { db } from './db'

const TABELLE = () => [db.profilo, db.eventi, db.diario, db.impostazioni, db.analisi, db.prove, db.drillPersonali, db.componenti, db.ricette, db.crono, db.lotti, db.armi, db.interventi, db.risultati, db.stageLab, db.corse, db.fisico]

export const BACKUP_FORMATO = 'hitframe-backup'
export const BACKUP_VERSIONE = 6

export interface Backup {
  formato: typeof BACKUP_FORMATO
  versione: number
  creato: string
  dati: {
    profilo: unknown[]
    eventi: unknown[]
    diario: unknown[]
    impostazioni: unknown[]
    analisi?: unknown[]
    prove?: unknown[]
    drillPersonali?: unknown[]
    componenti?: unknown[]
    ricette?: unknown[]
    crono?: unknown[]
    lotti?: unknown[]
    armi?: unknown[]
    interventi?: unknown[]
    risultati?: unknown[]
    stageLab?: unknown[]
    corse?: unknown[]
    fisico?: unknown[]
  }
}

export async function creaBackup(): Promise<Backup> {
  const [profilo, eventi, diario, impostazioni, analisi, prove, drillPersonali, componenti, ricette, crono, lotti, armi, interventi, risultati, stageLab, corse, fisico] = await Promise.all([
    db.profilo.toArray(),
    db.eventi.toArray(),
    db.diario.toArray(),
    db.impostazioni.toArray(),
    db.analisi.toArray(),
    db.prove.toArray(),
    db.drillPersonali.toArray(),
    db.componenti.toArray(),
    db.ricette.toArray(),
    db.crono.toArray(),
    db.lotti.toArray(),
    db.armi.toArray(),
    db.interventi.toArray(),
    db.risultati.toArray(),
    db.stageLab.toArray(),
    db.corse.toArray(),
    db.fisico.toArray(),
  ])
  return {
    formato: BACKUP_FORMATO,
    versione: BACKUP_VERSIONE,
    creato: new Date().toISOString(),
    // i PDF non entrano nel backup: restano le analisi, senza i disegni degli stage
    dati: { profilo, eventi, diario, impostazioni, analisi: analisi.map((a) => ({ ...a, pdf: null })), prove, drillPersonali, componenti, ricette, crono, lotti, armi, interventi, risultati, stageLab, corse, fisico },
  }
}

export async function scaricaBackup() {
  const backup = await creaBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const data = backup.creato.slice(0, 10)
  a.href = url
  a.download = `hitframe-backup-${data}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Sostituisce tutti i dati con quelli del backup. */
export async function ripristinaBackup(testo: string): Promise<{ eventi: number; diario: number; analisi: number }> {
  let parsed: Backup
  try {
    parsed = JSON.parse(testo)
  } catch {
    throw new Error('Il file non è un JSON valido.')
  }
  if (parsed?.formato !== BACKUP_FORMATO || !parsed.dati) {
    throw new Error('Il file non è un backup di Hitframe.')
  }
  if (parsed.versione > BACKUP_VERSIONE) {
    throw new Error("Il backup arriva da una versione più recente dell'app. Aggiorna Hitframe e riprova.")
  }
  const d = parsed.dati
  await db.transaction('rw', TABELLE(), async () => {
    await Promise.all(TABELLE().map((t) => t.clear()))
    await db.prove.bulkPut((d.prove ?? []) as never[])
    await db.drillPersonali.bulkPut((d.drillPersonali ?? []) as never[])
    await db.profilo.bulkPut((d.profilo ?? []) as never[])
    await db.eventi.bulkPut((d.eventi ?? []) as never[])
    await db.diario.bulkPut((d.diario ?? []) as never[])
    await db.impostazioni.bulkPut((d.impostazioni ?? []) as never[])
    await db.analisi.bulkPut((d.analisi ?? []) as never[])
    await db.componenti.bulkPut((d.componenti ?? []) as never[])
    await db.ricette.bulkPut((d.ricette ?? []) as never[])
    await db.crono.bulkPut((d.crono ?? []) as never[])
    await db.lotti.bulkPut((d.lotti ?? []) as never[])
    await db.armi.bulkPut((d.armi ?? []) as never[])
    await db.interventi.bulkPut((d.interventi ?? []) as never[])
    await db.risultati.bulkPut((d.risultati ?? []) as never[])
    await db.stageLab.bulkPut((d.stageLab ?? []) as never[])
    await db.corse.bulkPut((d.corse ?? []) as never[])
    await db.fisico.bulkPut((d.fisico ?? []) as never[])
  })
  return { eventi: d.eventi?.length ?? 0, diario: d.diario?.length ?? 0, analisi: d.analisi?.length ?? 0 }
}

export async function cancellaTutto() {
  await db.transaction('rw', TABELLE(), async () => {
    await Promise.all(TABELLE().map((t) => t.clear()))
  })
}
