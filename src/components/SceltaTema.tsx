import { Check } from 'lucide-react'
import { useState } from 'react'
import { scegliTema, temaAttivo, TEMI } from '../lib/temi'

/** Personalizzazione: il colore dell'app. */
export default function SceltaTema() {
  const [attivo, setAttivo] = useState(temaAttivo)
  return (
    <section className="card form">
      <div className="card-title" style={{ marginBottom: 0 }}>Personalizzazione</div>
      <p className="prose" style={{ margin: 0 }}>Il colore dell’app: scegli quello che va con la tua arma o la tua divisa.</p>
      <div className="temi" role="radiogroup" aria-label="Colore dell’app">
        {TEMI.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={attivo === t.id} className={`tema${attivo === t.id ? ' on' : ''}`}
            onClick={() => { scegliTema(t.id); setAttivo(t.id) }}>
            <span className="tema-anteprima" style={{ background: `radial-gradient(120% 80% at 90% -10%, ${t.fill}55, transparent 70%), #0b0b0c` }}>
              <span className="tema-btn" style={{ background: t.fill, color: t.ink }}>Start</span>
              <span className="tema-testo" style={{ color: t.accent }}>16,4 s</span>
              {attivo === t.id && <span className="tema-ok" style={{ background: t.fill, color: t.ink }}><Check size={14} /></span>}
            </span>
            <span className="tema-nome">{t.nome}</span>
            <span className="tema-desc">{t.descrizione}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
