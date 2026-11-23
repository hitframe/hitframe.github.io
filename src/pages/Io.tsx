import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { useAbilita } from '../video/useAbilita'
import { proposteDaVideo } from '../components/AbilitaMisurate'

interface Riga { to: string; titolo: string; sotto?: string; segnale?: string }

function Gruppo({ titolo, righe, evidenza }: { titolo: string; righe: Riga[]; evidenza?: boolean }) {
  return (
    <section className="io-gruppo">
      <h2 className={`io-titolo${evidenza ? ' evidenza' : ''}`}>{titolo}</h2>
      <div className={`io-lista${evidenza ? ' evidenza' : ''}`}>
        {righe.map((r) => (
          <Link key={r.to} to={r.to} className="io-riga">
            <div>
              <div className="t">{r.titolo}</div>
              {r.sotto && <div className="s">{r.sotto}</div>}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              {r.segnale && <span className="io-segnale">{r.segnale}</span>}
              <ChevronRight size={18} color="var(--faint)" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** "Io": il tiratore in primo piano, poi obiettivi e materiale, poi l'app. */
export default function Io() {
  const profilo = useLiveQuery(() => db.profilo.get('me'))
  const abilita = useAbilita()
  const prop = abilita && profilo ? proposteDaVideo(abilita, profilo) : null
  const nome = profilo?.nome || 'Tiratore'
  const iniziali = nome.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 3).join('').toUpperCase()
  return (
    <div className="page">
      <div className="io-testa">
        <div className="io-avatar" aria-hidden="true">{iniziali || 'IO'}</div>
        <div>
          <h1 className="io-nome">{nome}</h1>
          <div className="meta">{[profilo?.divisione, profilo?.classe ? `classe ${profilo.classe}` : null].filter(Boolean).join(' · ') || 'Completa il tuo profilo'}</div>
        </div>
      </div>

      <Gruppo titolo="Tiratore" evidenza righe={[
        { to: '/io/atleta', titolo: 'Atleta', sotto: 'Divisione, classe, categoria, mano forte, arma' },
        { to: '/io/tempi', titolo: 'Tempi tecnici', sotto: 'Estrazione, split, transizioni, ricariche, movimento', segnale: prop?.voci.length ? 'Aggiorna' : undefined },
        { to: '/io/abilita', titolo: 'Abilità', sotto: 'Questionario e misure dai video' },
        { to: '/io/gara', titolo: 'Tempi di gara', sotto: 'Short, Medium, Long' },
      ]} />

      <Gruppo titolo="Obiettivi e materiale" righe={[
        { to: '/io/obiettivi', titolo: 'Obiettivi' },
        { to: '/attrezzatura', titolo: 'Armi', sotto: 'Colpi, manutenzioni, parti' },
        { to: '/munizioni', titolo: 'Munizioni e ricariche', sotto: 'Ricette, cronografo, scorte' },
      ]} />

      <Gruppo titolo="App" righe={[
        { to: '/impostazioni', titolo: 'Impostazioni', sotto: 'Account e sincronizzazione, intelligenza artificiale, licenza, backup' },
      ]} />
    </div>
  )
}
