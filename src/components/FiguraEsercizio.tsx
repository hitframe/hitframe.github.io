import { useEffect, useState } from 'react'
import { esercizio, type Attrezzo } from '../fisico/dati'
import { interpola, POSE, type NomePosa, type Posa } from '../fisico/pose'

const SEQ_ESTRAZIONE: NomePosa[] = ['IN_PIEDI', 'IN_PIEDI', 'MIRA', 'MIRA']

/** Figura animata di un esercizio (si ferma se il sistema chiede meno movimento). */
export default function FiguraEsercizio({ id, size = 220, attiva = true }: { id: string; size?: number; attiva?: boolean }) {
  const es = esercizio(id)
  const pose = es?.pose ?? SEQ_ESTRAZIONE
  const ritmo = es?.ritmo ?? 2.4
  const [t, setT] = useState(0)
  const ridotto = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (!attiva || ridotto) return
    let raf = 0
    const t0 = performance.now()
    const giro = (ora: number) => { setT(((ora - t0) / 1000 / ritmo) % 1); raf = requestAnimationFrame(giro) }
    raf = requestAnimationFrame(giro)
    return () => cancelAnimationFrame(raf)
  }, [attiva, ritmo, ridotto])

  const n = pose.length
  const pos = t * n
  const i = Math.floor(pos) % n
  const f = pos - Math.floor(pos)
  const morbido = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2
  const p: Posa = attiva && !ridotto ? interpola(POSE[pose[i]], POSE[pose[(i + 1) % n]], morbido) : POSE[pose[Math.min(1, n - 1)]]
  const attrezzo: Attrezzo = es?.attrezzo ?? 'nessuno'
  const L = (a: [number, number], b: [number, number]) => `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`
  const pugno = id === 'pugni' ? 3 + 2.5 * Math.abs(Math.sin(t * Math.PI * 2)) : 4.5

  return (
    <svg className="figura" width={size} height={size * 1.05} viewBox="0 -14 200 224" role="img" aria-label={`Animazione: ${es?.nome ?? 'estrazione a secco'}`}>
      <path d="M8 200H192" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />
      {attrezzo === 'sbarra' && <path d="M40 6H160" stroke="var(--muted)" strokeWidth="4" strokeLinecap="round" />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* lato lontano */}
        <g stroke="#5D5E59" strokeWidth="7">
          <path d={L(p.hp, p.kl) + L(p.kl, p.fl)} />
          <path d={L(p.nk, p.el) + L(p.el, p.hl)} />
        </g>
        {/* busto e lato vicino */}
        <g stroke="var(--text)" strokeWidth="8">
          <path d={L(p.nk, p.hp)} />
          <path d={L(p.hp, p.kr) + L(p.kr, p.fr)} />
          <path d={L(p.nk, p.er) + L(p.er, p.hr)} />
        </g>
        <circle cx={p.hd[0]} cy={p.hd[1]} r="13" fill="var(--text)" />
        {id === 'aperture-elastico' && <path d={L(p.hl, p.hr)} stroke="var(--accent)" strokeWidth="3" />}
        {id === 'estrazione' && <path d={L(p.hr, [p.hr[0] + 16, p.hr[1] - 2])} stroke="var(--accent)" strokeWidth="6" />}
      </g>
      {attrezzo === 'manubri' && [p.hl, p.hr].map((h, k) => <rect key={k} x={h[0] - 9} y={h[1] - 4} width="18" height="8" rx="2" fill="var(--accent)" />)}
      <circle cx={p.hl[0]} cy={p.hl[1]} r={pugno} fill="#5D5E59" />
      <circle cx={p.hr[0]} cy={p.hr[1]} r={pugno} fill="var(--text)" />
    </svg>
  )
}
