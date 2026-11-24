import type React from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { apriPdf, disegnaStage } from '../analisi/estrai'

// Un documento aperto per analisi, riusato da tutti gli stage
const cache = new Map<number, Promise<PDFDocumentProxy>>()

function documento(id: number, pdf: Blob): Promise<PDFDocumentProxy> {
  let p = cache.get(id)
  if (!p) {
    p = pdf.arrayBuffer().then(apriPdf)
    cache.set(id, p)
  }
  return p
}

export default function StageDisegno({ analisiId, pdf, pagina, tagliaY, cimaY, alt, messaggio }: {
  analisiId: number; pdf: Blob | null; pagina: number; tagliaY: number; cimaY?: number; alt: string; messaggio?: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stato, setStato] = useState<'carico' | 'ok' | 'errore'>('carico')

  useEffect(() => {
    if (!pdf || !canvas.current || !box.current) return
    let annullato = false
    const larghezza = Math.min(box.current.clientWidth, 900)
    documento(analisiId, pdf)
      .then(async (doc) => {
        if (annullato || !canvas.current) return
        await disegnaStage(doc, pagina, canvas.current, larghezza, tagliaY, cimaY)
        if (!annullato) setStato('ok')
      })
      .catch((e) => {
        console.error(e)
        if (!annullato) setStato('errore')
      })
    return () => { annullato = true }
  }, [analisiId, pdf, pagina, tagliaY, cimaY])

  if (!pdf) {
    return <div className="disegno vuoto">{messaggio ?? 'Disegno non disponibile: ricarica il PDF della gara per vederlo.'}</div>
  }
  return (
    <div ref={box} className="disegno">
      {stato === 'carico' && <div className="vuoto">Carico il disegno…</div>}
      {stato === 'errore' && <div className="vuoto">Non riesco a mostrare il disegno.</div>}
      <canvas ref={canvas} role="img" aria-label={alt} style={{ display: stato === 'ok' ? 'block' : 'none' }} />
    </div>
  )
}
