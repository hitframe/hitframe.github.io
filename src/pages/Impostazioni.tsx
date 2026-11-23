import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { ImpostazioniGoogle } from '../components/GoogleSync'
import ImpostazioniAI from '../components/ImpostazioniAI'
import ImpostazioniAccount from '../components/ImpostazioniAccount'
import { SezioneLicenza } from '../licenza/ui'
import { getAccount } from '../google/auth'
import { sincronizzaOra } from '../sync/stato'
import { AppComputer } from '../components/AppComputer'
import { PageHeader, useToast } from '../components/ui'
import { cancellaTutto, ripristinaBackup, scaricaBackup } from '../db/backup'
import { db } from '../db/db'

export default function Impostazioni() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [errore, setErrore] = useState('')
  const [confermaCancella, setConfermaCancella] = useState(false)
  const conteggi = useLiveQuery(async () => ({ eventi: await db.eventi.count(), diario: await db.diario.count() }))

  async function importa(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrore('')
    try {
      const r = await ripristinaBackup(await file.text())
      toast(`Ripristinati ${r.eventi} eventi e ${r.diario} voci`)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Ripristino non riuscito.')
    }
  }

  async function cancella() {
    await cancellaTutto()
    setConfermaCancella(false)
    if (getAccount()) void sincronizzaOra()
    toast('Tutti i dati sono stati cancellati')
  }

  return (
    <div className="page">
      <PageHeader title="Impostazioni" sub={getAccount() ? 'Dati sincronizzati con il tuo Google Drive' : 'I tuoi dati restano su questo dispositivo'} />

      <ImpostazioniAccount />

      <SezioneLicenza />

      <section className="card form">
        <div className="card-title" style={{ marginBottom: 0 }}>Backup manuale</div>
        <p className="prose" style={{ margin: 0 }}>
          {getAccount()
            ? 'Non serve più per passare i dati tra dispositivi: lo fa la sincronizzazione. Resta utile come copia extra da conservare dove vuoi.'
            : "Hitframe salva tutto in locale. Scarica un backup ogni tanto e conservalo: ti serve anche per passare i dati dall'iPhone al Mac."}
        </p>
        {conteggi && <div className="meta" style={{ color: 'var(--muted)', fontSize: 13 }}>Ora salvati: {conteggi.eventi} eventi, {conteggi.diario} voci di diario.</div>}
        <div className="row">
          <button className="btn primary" onClick={() => scaricaBackup().then(() => toast('Backup scaricato'))}><Download size={18} /> Scarica backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={18} /> Ripristina</button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={importa} hidden />
        </div>
        <div className="hint" style={{ color: 'var(--faint)', fontSize: 12 }}>Il ripristino sostituisce tutti i dati presenti su questo dispositivo{getAccount() ? ' e, con la sincronizzazione, anche sugli altri' : ''}.</div>
        {errore && <div role="alert" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>{errore}</div>}
      </section>

      <ImpostazioniGoogle />

      <AppComputer />

      <ImpostazioniAI />

      <section className="card form">
        <div className="card-title" style={{ marginBottom: 0 }}>Zona pericolosa</div>
        <div className="row">
          {confermaCancella ? (
            <>
              <button className="btn danger" onClick={cancella}><Trash2 size={18} /> Sì, cancella tutto</button>
              <button className="btn ghost" onClick={() => setConfermaCancella(false)}>Annulla</button>
            </>
          ) : (
            <button className="btn danger" onClick={() => setConfermaCancella(true)}><Trash2 size={18} /> Cancella tutti i dati</button>
          )}
        </div>
        {confermaCancella && getAccount() && (
          <div className="hint" style={{ color: 'var(--accent-strong)', fontSize: 12 }}>Cancella i dati anche dal Google Drive e da tutti gli altri dispositivi collegati.</div>
        )}
      </section>

      <p className="prose" style={{ fontSize: 12, textAlign: 'center' }}>Hitframe · versione 0.30.0 · © {new Date().getFullYear()} Giuseppe De Angelis</p>
    </div>
  )
}
