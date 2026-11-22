import { lazy, Suspense, useEffect, useState } from 'react'
import { Benvenuto, Collegamento, SceltaDati } from './components/Accesso'
import { accessoDisponibile, getAccount, setAccount, type EsitoRitorno } from './google/auth'
import { completaCollegamento } from './sync/collega'
import { leggiBase } from './sync/motore'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { ToastProvider } from './components/ui'
import Calendario from './pages/Calendario'
import Diario from './pages/Diario'
import Home from './pages/Home'
import Impostazioni from './pages/Impostazioni'
import Profilo from './pages/Profilo'
import Allenamento from './pages/Allenamento'
import DrillDettaglio from './pages/DrillDettaglio'
import Timer from './pages/Timer'
import Sessioni from './pages/Sessioni'
import Gare from './pages/Gare'
import Munizioni from './pages/Munizioni'
import RicettaDettaglio from './pages/RicettaDettaglio'
import Attrezzatura, { ArmaDettaglio } from './pages/Attrezzatura'

// Il modulo Analisi gara (con pdf.js) si carica solo quando lo apri
const AnalisiGare = lazy(() => import('./pages/AnalisiGare'))
const AnalisiDettaglio = lazy(() => import('./pages/AnalisiDettaglio'))
const StudioStage = lazy(() => import('./pages/StudioStage'))
const Risultati = lazy(() => import('./pages/Risultati'))
const Statistiche = lazy(() => import('./pages/Statistiche'))
const Quadro = lazy(() => import('./pages/Quadro'))
const PaginaLicenze = lazy(() => import('./licenza/ui').then((m) => ({ default: m.PaginaLicenze })))
const Mente = lazy(() => import('./pages/Mente'))
const Video = lazy(() => import('./pages/Video'))
const VideoRun = lazy(() => import('./pages/VideoRun'))
const RisultatoDettaglio = lazy(() => import('./pages/RisultatoDettaglio'))

type Fase =
  | { tipo: 'app' }
  | { tipo: 'benvenuto'; messaggio?: string | null }
  | { tipo: 'collego' }
  | { tipo: 'scelta'; nelCloud: number; suDispositivo: number; aggiornato: string | null }

/** Per le prove automatiche (browser comandato da script) l'accesso non è obbligatorio. */
const senzaAccesso = () => !accessoDisponibile() || localStorage.getItem('hf-senza-account') === '1' || (navigator.webdriver === true && localStorage.getItem('hf-prova-accesso') !== '1')

function faseIniziale(esito: EsitoRitorno | null): Fase {
  if (esito?.dopo === 'collega' && esito.ok) return { tipo: 'collego' }
  if (senzaAccesso()) return { tipo: 'app' }
  if (!getAccount() || !leggiBase()) return { tipo: 'benvenuto', messaggio: esito?.messaggio }
  return { tipo: 'app' }
}

export default function App({ esito }: { esito: EsitoRitorno | null }) {
  const [fase, setFase] = useState<Fase>(() => faseIniziale(esito))

  useEffect(() => {
    if (fase.tipo !== 'collego') return
    completaCollegamento()
      .then((r) => {
        if (r.tipo === 'fatto') {
          sessionStorage.setItem('hf-msg', r.messaggio)
          setFase({ tipo: 'app' })
        } else setFase({ tipo: 'scelta', nelCloud: r.nelCloud, suDispositivo: r.suDispositivo, aggiornato: r.aggiornato })
      })
      .catch((e) => {
        setAccount(null)
        setFase({ tipo: 'benvenuto', messaggio: e instanceof Error ? e.message : 'Collegamento non riuscito, riprova.' })
      })
  }, [fase.tipo])

  // uscita dall'account (da Impostazioni): si torna alla schermata di accesso
  useEffect(() => {
    const f = () => { if (!getAccount() && !senzaAccesso()) setFase({ tipo: 'benvenuto' }) }
    window.addEventListener('hf-account', f)
    return () => window.removeEventListener('hf-account', f)
  }, [])

  if (fase.tipo === 'benvenuto') return <Benvenuto messaggio={fase.messaggio} />
  if (fase.tipo === 'collego') return <Collegamento />
  if (fase.tipo === 'scelta') {
    return <SceltaDati {...fase} fatto={(msg) => { sessionStorage.setItem('hf-msg', msg); setFase({ tipo: 'app' }) }} />
  }
  return <Applicazione />
}

// HashRouter: funziona offline e su GitHub Pages senza configurazioni del server
function Applicazione() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="calendario" element={<Calendario />} />
            <Route path="diario" element={<Diario />} />
            <Route path="profilo" element={<Profilo />} />
            <Route path="impostazioni" element={<Impostazioni />} />
            <Route path="allenamento" element={<Allenamento />} />
            <Route path="allenamento/:id" element={<DrillDettaglio />} />
            <Route path="timer" element={<Timer />} />
            <Route path="sessioni" element={<Sessioni />} />
            <Route path="gare" element={<Gare />} />
            <Route path="stage-designer/*" element={<Navigate to="/allenamento" replace />} />
            <Route path="licenze" element={<Suspense fallback={<div className="page" />}><PaginaLicenze /></Suspense>} />
            <Route path="quadro" element={<Suspense fallback={<div className="page" />}><Quadro /></Suspense>} />
            <Route path="mente" element={<Suspense fallback={<div className="page" />}><Mente /></Suspense>} />
            <Route path="statistiche" element={<Suspense fallback={<div className="page" />}><Statistiche /></Suspense>} />
            <Route path="risultati" element={<Suspense fallback={<div className="page" />}><Risultati /></Suspense>} />
            <Route path="risultati/:id" element={<Suspense fallback={<div className="page" />}><RisultatoDettaglio /></Suspense>} />
            <Route path="video" element={<Suspense fallback={<div className="page" />}><Video /></Suspense>} />
            <Route path="video/run" element={<Suspense fallback={<div className="page" />}><VideoRun /></Suspense>} />
            <Route path="video/run/:id" element={<Suspense fallback={<div className="page" />}><VideoRun /></Suspense>} />
            <Route path="munizioni" element={<Munizioni />} />
            <Route path="munizioni/ricetta/:id" element={<RicettaDettaglio />} />
            <Route path="attrezzatura" element={<Attrezzatura />} />
            <Route path="attrezzatura/:id" element={<ArmaDettaglio />} />
            <Route path="analisi-gara" element={<Suspense fallback={<div className="page" />}><AnalisiGare /></Suspense>} />
            <Route path="analisi-gara/:id" element={<Suspense fallback={<div className="page" />}><AnalisiDettaglio /></Suspense>} />
            <Route path="analisi-gara/:id/stage/:n" element={<Suspense fallback={<div className="page" />}><StudioStage /></Suspense>} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  )
}
