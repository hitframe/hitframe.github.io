import {
  BarChart3,
  BookOpen,
  Brain,
  Compass,
  CalendarDays,
  Clapperboard,
  FileSearch,
  Home,
  Dumbbell,
  ListChecks,
  Medal,
  Target,
  Timer,
  Trophy,
  User,
  type LucideIcon,
} from 'lucide-react'

export interface Voce { path: string; label: string; icon: LucideIcon; descrizione?: string; figli?: Voce[] }

export interface Area extends Voce {
  id: 'oggi' | 'allenati' | 'gare' | 'progressi' | 'io'
  /** sezioni dell'area, mostrate come schede in alto */
  sezioni: Voce[]
  /** prefissi di percorso che appartengono all'area */
  prefissi: string[]
}

/** Le 5 aree della barra in basso. */
export const AREE: Area[] = [
  { id: 'oggi', path: '/', label: 'Oggi', icon: Home, sezioni: [], prefissi: [] },
  {
    id: 'allenati', path: '/allenamento', label: 'Allenati', icon: Target,
    sezioni: [
      {
        path: '/allenamento', label: 'Tiro', icon: Target,
        figli: [
          { path: '/allenamento', label: 'Drill', icon: Target },
          { path: '/sessioni', label: 'Sessioni', icon: ListChecks },
          { path: '/timer', label: 'Timer', icon: Timer },
        ],
      },
      { path: '/fisico', label: 'Fisico', icon: Dumbbell },
      { path: '/mente', label: 'Mente', icon: Brain },
    ],
    prefissi: ['/allenamento', '/sessioni', '/timer', '/fisico', '/mente'],
  },
  {
    id: 'gare', path: '/gare', label: 'Gare', icon: Trophy,
    sezioni: [
      { path: '/gare', label: 'Le mie gare', icon: Trophy },
      { path: '/analisi-gara', label: 'Locandine', icon: FileSearch },
      { path: '/risultati', label: 'Risultati', icon: Medal },
    ],
    prefissi: ['/gare', '/analisi-gara', '/risultati'],
  },
  {
    id: 'progressi', path: '/statistiche', label: 'Progressi', icon: BarChart3,
    sezioni: [
      { path: '/statistiche', label: 'Statistiche', icon: BarChart3 },
      { path: '/quadro', label: 'Quadro', icon: Compass },
      { path: '/video', label: 'Video', icon: Clapperboard },
    ],
    prefissi: ['/statistiche', '/quadro', '/video'],
  },
  {
    id: 'io', path: '/io', label: 'Io', icon: User, sezioni: [],
    prefissi: ['/io', '/profilo', '/attrezzatura', '/munizioni', '/impostazioni', '/licenze'],
  },
]

/** Sempre a portata di mano, in alto: cose personali e trasversali. */
export const STRUMENTI: Voce[] = [
  { path: '/calendario', label: 'Calendario', icon: CalendarDays },
  { path: '/diario', label: 'Diario', icon: BookOpen },
]

export function areaDi(pathname: string): Area | undefined {
  if (pathname === '/') return AREE[0]
  return AREE.find((a) => a.prefissi.some((p) => pathname === p || pathname.startsWith(p + '/')))
}

/** Usato dalla pagina "in arrivo" per i moduli futuri. */
export interface Modulo { path: string; label: string; descrizione: string; icon: LucideIcon; pronto: boolean; fase?: number; dettagli?: string[] }
