/** Temi colore dell'app: cambiano solo il colore d'accento (e l'alone dello sfondo), il resto resta uguale. */
export interface Tema {
  id: string
  nome: string
  descrizione: string
  /** colore principale (bottoni, selezioni) e colore del testo sopra */
  fill: string
  ink: string
  /** accento usato come testo o bordo sullo sfondo scuro */
  accent: string
}

export const TEMI: Tema[] = [
  { id: 'giallo', nome: 'Giallo', descrizione: 'Il giallo Hitframe, il classico', fill: '#e5ea1e', ink: '#141408', accent: '#e5ea1e' },
  { id: 'tungsteno', nome: 'Tungsteno', descrizione: 'Grigio Cerakote con scritte bianche', fill: '#5d5e59', ink: '#ffffff', accent: '#c6c7c0' },
  { id: 'oro', nome: 'Oro', descrizione: 'Oro brunito su nero, classico italiano', fill: '#cfa95c', ink: '#15100a', accent: '#d6b46c' },
  { id: 'rosso', nome: 'Rosso corsa', descrizione: 'Rosso deciso, sportivo', fill: '#d42a2f', ink: '#ffffff', accent: '#f0565b' },
  { id: 'polimero', nome: 'Polimero', descrizione: 'Argento e nero, essenziale', fill: '#cdd2d7', ink: '#0b0b0c', accent: '#cdd2d7' },
  { id: 'oliva', nome: 'Oliva', descrizione: 'Verde oliva militare', fill: '#8e9a5b', ink: '#0b0c08', accent: '#adb977' },
  { id: 'arancio', nome: 'Arancio', descrizione: 'Arancio acceso', fill: '#f28c28', ink: '#140b02', accent: '#f59a42' },
  { id: 'acciaio', nome: 'Acciaio', descrizione: 'Blu acciaio, freddo', fill: '#9fb4c6', ink: '#0b0d10', accent: '#a9bdcd' },
]

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}
const linea = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.32 + 11 * 0.68))
  return `rgb(${c.join(', ')})`
}
const piuChiaro = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * 0.3))
  return `rgb(${c.join(', ')})`
}

export function temaAttivo(): string {
  try { return localStorage.getItem('hf-tema') || 'giallo' } catch { return 'giallo' }
}

export function applicaTema(id = temaAttivo()) {
  const t = TEMI.find((x) => x.id === id) ?? TEMI[0]
  const s = document.documentElement.style
  s.setProperty('--accent', t.accent)
  s.setProperty('--accent-fill', t.fill)
  s.setProperty('--accent-ink', t.ink)
  s.setProperty('--accent-strong', piuChiaro(t.accent))
  s.setProperty('--accent-rgb', rgb(t.accent))
  s.setProperty('--accent-line', linea(t.accent))
  // l'alone dello sfondo usa il colore pieno (per il tungsteno resta grigio)
  s.setProperty('--glow-rgb', rgb(t.id === 'tungsteno' ? '#8f918a' : t.fill))
  document.documentElement.dataset.tema = t.id
}

export function scegliTema(id: string) {
  try { localStorage.setItem('hf-tema', id) } catch { /* ignore */ }
  applicaTema(id)
}
