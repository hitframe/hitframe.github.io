import { CloudDownload } from 'lucide-react'
import { useState } from 'react'
import { avviaAccesso, getAccount, puoRinnovareDaSolo, rinnovaSilenzioso } from '../google/auth'
import { assicuraPdf, MSG_PDF, type StatoPdf } from '../sync/pdf'
import type { AnalisiGara } from '../db/types'

/** Messaggio sul PDF della locandina, con il tasto per scaricarlo dal Drive quando serve. */
export default function AvvisoPdf({ stato, a }: { stato: Exclude<StatoPdf, 'pronto'>; a: Pick<AnalisiGara, 'id' | 'pdf' | 'pdfDrive'> }) {
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  async function scarica() {
    setErrore(null)
    if (!navigator.onLine) { setErrore('Sei offline: serve la rete solo per questo primo scaricamento.'); return }
    setOccupato(true)
    try {
      if (puoRinnovareDaSolo()) await rinnovaSilenzioso()
      if (await assicuraPdf(a)) return
      if (getAccount() && !puoRinnovareDaSolo()) { avviaAccesso({ ritorno: window.location.hash }); return }
      setErrore('Non riesco a scaricarla: controlla l’account Google in Impostazioni.')
    } finally { setOccupato(false) }
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span>{MSG_PDF[stato]}</span>
      {stato === 'nel-drive' && (
        <button type="button" className="btn primary" onClick={scarica} disabled={occupato}>
          <CloudDownload size={18} /> {occupato ? 'Scarico…' : 'Scarica la locandina'}
        </button>
      )}
      {errore && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{errore}</span>}
    </span>
  )
}
