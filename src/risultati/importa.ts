import { apriPdf, estraiPagine } from '../analisi/estrai'
import type { PaginaPdf } from '../analisi/tipi'
import { leggiRisultati, tipoPdf, type LetturaRisultati } from './parser'
import { dataStampa } from './motore'

export interface LetturaFile { lettura: LetturaRisultati; data: string | null; scartati: string[]; /** da screenshot di PractiScore */ schermate?: boolean }

/**
 * Legge i PDF dei risultati (Overall, Stage Results, Score Verification).
 * Si possono caricare insieme i PDF di più gare: vengono raggruppati per nome della gara.
 */
export async function leggiFileRisultati(files: File[]): Promise<{ gare: LetturaFile[]; scartati: string[] }> {
  const gruppi = new Map<string, { pagine: PaginaPdf[][]; data: string | null }>()
  const scartati: string[] = []
  for (const f of files) {
    const doc = await apriPdf(await f.arrayBuffer())
    const pagine = await estraiPagine(doc)
    await doc.loadingTask.destroy()
    if (!tipoPdf(pagine)) { scartati.push(f.name); continue }
    const nome = leggiRisultati([pagine.slice(0, 1)]).gara.trim().toUpperCase() || f.name
    const g = gruppi.get(nome) ?? { pagine: [], data: null }
    g.pagine.push(pagine)
    g.data ??= dataStampa(pagine[0].items.map((i) => i.str))
    gruppi.set(nome, g)
  }
  return { gare: [...gruppi.values()].map((g) => ({ lettura: leggiRisultati(g.pagine), data: g.data, scartati: [] })), scartati }
}
