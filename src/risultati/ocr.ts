/**
 * OCR degli screenshot dei risultati, tutto sul dispositivo (Tesseract in WebAssembly, file serviti dall'app).
 * La prima volta scarica il motore (circa 6 MB); poi resta in cache e funziona anche offline.
 */
import { createWorker, OEM, type Worker } from 'tesseract.js'
import { simd } from 'wasm-feature-detect'
import { dataDaFile, leggiRighe, stageDaEtichetta, type RigaOcr, type Schermata } from './schermate'

type Blocchi = { paragraphs: { lines: { bbox: Box; words: { text: string; bbox: Box }[] }[] }[] }[]
type Box = { x0: number; y0: number; x1: number; y1: number }

async function apriMotore(avanzamento?: (testo: string) => void): Promise<Worker> {
  const base = new URL('ocr/', document.baseURI).href
  const core = (await simd()) ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js'
  return createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: base + 'worker.min.js',
    corePath: base + core,
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (/loading|initializ/i.test(m.status) && avanzamento) avanzamento('Preparo la lettura…')
    },
  })
}

function righeDa(blocchi: Blocchi | null): RigaOcr[] {
  return (blocchi ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({
    y0: l.bbox.y0, y1: l.bbox.y1,
    parole: l.words.map((w) => ({ t: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 })),
  }))
}

async function dimensioni(file: File): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const d = { w: bmp.width, h: bmp.height }
    bmp.close()
    return d
  } catch {
    return { w: 2400, h: 1400 }
  }
}

export interface EsitoOcr { schermate: Schermata[]; scartati: string[]; data: string | null }

/**
 * Legge gli screenshot: classifica "Match" e classifiche degli stage.
 * Il numero dello stage si legge dal menu in alto; se non si legge, si usa l'ordine dei file.
 */
export async function leggiScreenshot(files: File[], avanzamento: (testo: string) => void): Promise<EsitoOcr> {
  const ordinati = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.lastModified - b.lastModified)
  avanzamento('Preparo la lettura…')
  const w = await apriMotore(avanzamento)
  const schermate: Schermata[] = []
  const scartati: string[] = []
  try {
    for (let i = 0; i < ordinati.length; i++) {
      const f = ordinati[i]
      avanzamento(`Leggo lo screenshot ${i + 1} di ${ordinati.length}…`)
      const r = await w.recognize(f, {}, { blocks: true })
      const righe = righeDa(r.data.blocks as unknown as Blocchi)
      const letto = leggiRighe(righe)
      if (!letto || !letto.righe.length) { scartati.push(f.name); continue }
      let stage: number | null = null
      if (letto.tipo === 'stage') {
        // il menu "Stage 3 Stage 3" sta a sinistra della riga dei filtri (Division, Classes, Categories)
        const filtri = righe.find((x) => x.parole.some((p) => /^(Classes|Categories)$/i.test(p.t)))
        const { w: W, h: H } = await dimensioni(f)
        const parole = filtri?.parole.filter((p) => /[A-Za-z]{3,}/.test(p.t)) ?? []
        const destra = parole.length ? Math.min(...parole.map((p) => p.x0)) - 8 : W * 0.3
        const rect = filtri && destra > 120
          ? { left: 0, top: Math.max(0, filtri.y0 - 40), width: Math.max(200, destra), height: filtri.y1 - filtri.y0 + 80 }
          : { left: 0, top: 0, width: Math.round(W * 0.3), height: Math.round(H * 0.12) }
        const et = await w.recognize(f, { rectangle: rect })
        stage = stageDaEtichetta(et.data.text) ?? stageDaEtichetta(righe.slice(0, 3).map((x) => x.parole.map((p) => p.t).join(' ')).join(' '))
      }
      schermate.push({ file: f.name, tipo: letto.tipo, stage, righe: letto.righe, scartate: letto.scartate })
    }
  } finally {
    await w.terminate()
  }
  // stage senza numero leggibile: il primo numero libero, nell'ordine dei file
  for (const s of schermate.filter((x) => x.tipo === 'stage' && x.stage == null)) {
    const usati = new Set(schermate.map((x) => x.stage).filter((n): n is number => n != null))
    let n = 1
    while (usati.has(n)) n++
    s.stage = n
    s.stageDedotto = true
  }
  const date = ordinati.map((f) => dataDaFile(f.name)).filter((d): d is string => !!d)
  const data = date[0] ?? (ordinati[0] ? new Date(ordinati[0].lastModified).toISOString().slice(0, 10) : null)
  return { schermate, scartati, data }
}
