import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { gestisciRitornoAccesso } from './google/auth'
import { installaLinkEsterni } from './lib/desktop'
import { applicaTema } from './lib/temi'

applicaTema()

// Ritorno dall'accesso Google: va gestito prima che parta il router
const esito = gestisciRitornoAccesso()
if (esito?.messaggio) sessionStorage.setItem('hf-msg', esito.messaggio)
if (esito?.ok && esito.dopo) sessionStorage.setItem('hf-dopo', esito.dopo)

installaLinkEsterni()

// Chiede al browser di non cancellare i dati locali quando manca spazio
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App esito={esito} />
  </StrictMode>,
)

// Solo per le prove automatiche (browser comandato da script)
if (navigator.webdriver) {
  void Promise.all([import('./db/db'), import('./sync/stato'), import('./sync/motore')]).then(([d, st, m]) => {
    ;(window as unknown as Record<string, unknown>).__hf = { db: d.db, sincronizzaOra: st.sincronizzaOra, stato: st.getStato, base: m.leggiBase }
  })
}
