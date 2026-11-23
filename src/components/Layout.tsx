import { ArrowLeft } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { AREE, STRUMENTI, areaDi } from '../modules'
import { aggiornaColoriSeServe, sincronizzaTutto } from '../google/calendar'
import { getAccount } from '../google/auth'
import { avviaSincronizzazione } from '../sync/stato'
import NuvolaSync from './NuvolaSync'
import CalcoloHF from './CalcoloHF'
import ChatAI from './ChatAI'
import { BannerLicenza, GestoreLicenza } from '../licenza/ui'
import { aggiornamentoDesktop } from '../lib/desktop'
import { useToast, Wordmark } from './ui'

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const toast = useToast()
  useEffect(() => {
    aggiornaColoriSeServe()
    if (getAccount()) avviaSincronizzazione()
  }, [])
  useEffect(() => {
    void aggiornamentoDesktop().then((a) => a && toast(`Nuova versione di Hitframe per computer (${a.nuova}): la trovi in Impostazioni`))
  }, [toast])
  useEffect(() => {
    const msg = sessionStorage.getItem('hf-msg')
    const dopo = sessionStorage.getItem('hf-dopo')
    sessionStorage.removeItem('hf-msg')
    sessionStorage.removeItem('hf-dopo')
    if (msg) toast(msg)
    if (dopo === 'calendario') {
      sincronizzaTutto()
        .then((r) => toast(`Google Calendar aggiornato (${r.inviati + r.eliminati} modifiche)`))
        .catch(() => toast('Calendario non aggiornato: riprova da Impostazioni'))
    }
    const ricevute = (e: Event) => {
      const n = (e as CustomEvent<number>).detail
      toast(n === 1 ? '1 modifica arrivata dagli altri dispositivi' : `${n} modifiche arrivate dagli altri dispositivi`)
    }
    window.addEventListener('hf-sync-ricevute', ricevute)
    // una scrittura rifiutata perché la prova è finita: lo diciamo invece di fallire in silenzio
    const rifiuto = (e: PromiseRejectionEvent) => {
      const m = String((e.reason as Error)?.message ?? e.reason ?? '')
      if (/sola lettura/i.test(m)) { e.preventDefault(); toast('Sola lettura: inserisci una licenza in Impostazioni per salvare') }
    }
    window.addEventListener('unhandledrejection', rifiuto)
    return () => { window.removeEventListener('hf-sync-ricevute', ricevute); window.removeEventListener('unhandledrejection', rifiuto) }
  }, [toast])

  const area = areaDi(pathname)
  const attiva = (p: string) => pathname === p || pathname.startsWith(p + '/')
  const attivaSez = (s: { path: string; figli?: { path: string }[] }) => attiva(s.path) || !!s.figli?.some((f) => attiva(f.path))
  const sezione = area?.sezioni.find(attivaSez)

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Menu principale">
        <div className="brand"><Link to="/" style={{ textDecoration: 'none' }}><Wordmark size={30} /></Link></div>
        {AREE.map((a) => (
          <div key={a.id}>
            <NavLink to={a.path} end={a.path === '/'} className={() => `nav-link${area?.id === a.id ? ' active' : ''}`}>
              <a.icon size={20} /> {a.label}
            </NavLink>
            {area?.id === a.id && a.sezioni.length > 1 && (
              <div className="nav-sub">
                {a.sezioni.map((s) => (
                  <NavLink key={s.path} to={s.path} className={() => `nav-sublink${attivaSez(s) ? ' active' : ''}`}>{s.label}</NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
        <CalcoloHF classe="nav-link" conTesto />
        <div className="spacer" />
        <div className="sidebar-sync"><NuvolaSync conTesto /></div>
        {STRUMENTI.map((s) => (
          <NavLink key={s.path} to={s.path} className="nav-link"><s.icon size={20} /> {s.label}</NavLink>
        ))}
      </aside>

      <main className="main">
        <header className="topbar">
          <Link to="/" style={{ textDecoration: 'none' }} aria-label="Oggi"><Wordmark size={24} /></Link>
          <div className="row" style={{ gap: 4 }}>
            <NuvolaSync />
            <CalcoloHF />
            {STRUMENTI.map((s) => (
              <NavLink key={s.path} to={s.path} className="btn icon ghost topbar-btn" aria-label={s.label} title={s.label}>
                <s.icon size={21} />
              </NavLink>
            ))}
          </div>
        </header>
        {area && area.sezioni.length > 1 && (
          <nav className="sottomenu" aria-label={`Sezioni di ${area.label}`}>
            {area.sezioni.map((s) => (
              <Link key={s.path} to={s.path} className={`sottomenu-voce${attivaSez(s) ? ' attiva' : ''}`} aria-current={attivaSez(s) ? 'page' : undefined}>
                <s.icon size={15} /> {s.label}
              </Link>
            ))}
          </nav>
        )}
        {sezione?.figli && (
          <nav className="sottomenu sottomenu-2" aria-label={`Sezioni di ${sezione.label}`}>
            {sezione.figli.map((f) => (
              <Link key={f.path} to={f.path} className={`sottomenu-voce2${attiva(f.path) ? ' attiva' : ''}`} aria-current={attiva(f.path) ? 'page' : undefined}>{f.label}</Link>
            ))}
          </nav>
        )}
        {area?.id === 'io' && pathname !== '/io' && (
          <div className="sottomenu"><Link to="/io" className="btn ghost" style={{ marginLeft: -8 }}><ArrowLeft size={18} /> Io</Link></div>
        )}
        <BannerLicenza />
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Navigazione">
        {AREE.map((a) => (
          <NavLink key={a.id} to={a.path} end={a.path === '/'} className={() => `tab${area?.id === a.id ? ' active' : ''}`}>
            <a.icon size={22} />
            {a.label}
          </NavLink>
        ))}
      </nav>
      <ChatAI />
      <GestoreLicenza />
    </div>
  )
}
