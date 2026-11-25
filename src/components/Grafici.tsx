import { useState } from 'react'

export interface Serie { nome: string; valori: (number | null)[]; colore: string; tratteggio?: boolean; /** linea di riferimento: senza punti */ riferimento?: boolean }

/** Media mobile centrata: tiene la linea leggibile quando le gare sono tante. */
function mediaMobile(v: (number | null)[], finestra: number): (number | null)[] {
  const m = Math.floor(finestra / 2)
  return v.map((_, i) => {
    const w = v.slice(Math.max(0, i - m), Math.min(v.length, i + m + 1)).filter((x): x is number => x !== null)
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null
  })
}

/**
 * Grafico a linee leggero: una scala sola, etichette dirette sull'ultimo punto,
 * tooltip al tocco o al passaggio del mouse su ogni gara.
 * Con tante gare i valori singoli diventano puntini tenui e la linea è la media mobile.
 */
export function GraficoLinee({ etichette, serie, formato, invertito = false, minimo, massimo, titolo }: {
  etichette: string[]; serie: Serie[]; formato: (n: number) => string; invertito?: boolean; minimo?: number; massimo?: number; titolo: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 360, H = 190, PL = 38, PR = 64, PT = 12, PB = 26
  const n = etichette.length
  const denso = n > 12
  const finestra = n > 40 ? 7 : 5
  const linee = serie.map((s) => (denso ? mediaMobile(s.valori, finestra) : s.valori))
  // la scala segue le linee (più gli estremi dei singoli valori, ma senza farsi schiacciare dai picchi isolati)
  const tuttiLinee = linee.flatMap((v) => v.filter((x): x is number => x !== null))
  const tuttiPunti = serie.flatMap((s) => s.valori.filter((v): v is number => v !== null))
  if (!tuttiPunti.length) return null
  const ordinati = [...tuttiPunti].sort((a, b) => a - b)
  const q = (p: number) => ordinati[Math.min(ordinati.length - 1, Math.max(0, Math.round((ordinati.length - 1) * p)))]
  let lo = minimo ?? Math.min(...tuttiLinee, denso ? q(0.03) : ordinati[0])
  let hi = massimo ?? Math.max(...tuttiLinee, denso ? q(0.97) : ordinati[ordinati.length - 1])
  if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.12
  if (minimo === undefined) lo -= pad
  if (massimo === undefined) hi += pad
  const x = (i: number) => PL + (n === 1 ? (W - PL - PR) / 2 : (i * (W - PL - PR)) / (n - 1))
  const y = (v: number) => {
    const c = Math.max(lo, Math.min(hi, v))
    const t = (c - lo) / (hi - lo)
    return PT + (invertito ? t : 1 - t) * (H - PT - PB)
  }
  const ticks = [0, 0.5, 1].map((t) => lo + t * (hi - lo))
  // etichette dell'asse x: al massimo 5, ben distanziate
  const maxEtichette = 5
  const indiciX = n <= maxEtichette ? etichette.map((_, i) => i)
    : Array.from({ length: maxEtichette }, (_, k) => Math.round((k * (n - 1)) / (maxEtichette - 1)))
  // etichette dirette senza sovrapposizioni
  const yEtichetta = linee.map((v) => { const u = [...v].reverse().find((x) => x !== null); return u == null ? 0 : y(u) })
  {
    // distanzia le etichette (12 px) restando dentro il grafico
    const ord = yEtichetta.map((_, i) => i).sort((a, b) => yEtichetta[a] - yEtichetta[b])
    for (let k = 1; k < ord.length; k++) yEtichetta[ord[k]] = Math.max(yEtichetta[ord[k]], yEtichetta[ord[k - 1]] + 12)
    const fondo = H - PB - 2
    for (let k = ord.length - 1; k >= 0; k--) {
      const limite = k === ord.length - 1 ? fondo : yEtichetta[ord[k + 1]] - 12
      yEtichetta[ord[k]] = Math.max(PT + 4, Math.min(yEtichetta[ord[k]], limite))
    }
  }
  const punti = (v: (number | null)[]) => v.map((val, i) => (val === null ? null : [x(i), y(val)] as const)).filter((p): p is readonly [number, number] => p !== null)
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={titolo} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--surface-3)" strokeWidth={1} />
            <text x={PL - 6} y={y(t) + 3} fontSize={9.5} textAnchor="end" fill="var(--faint)">{formato(t)}</text>
          </g>
        ))}
        {indiciX.map((i, k) => (
          <text key={i} x={x(i)} y={H - 8} fontSize={9} textAnchor={k === 0 && n > 1 ? 'start' : k === indiciX.length - 1 && n > 1 ? 'end' : 'middle'} fill="var(--faint)">{etichette[i]}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="var(--faint)" strokeDasharray="3 3" />}
        {serie.map((s, si) => {
          const grezzi = punti(s.valori)
          const linea = punti(linee[si])
          const ultimo = [...linee[si]].reverse().find((v) => v !== null)
          const iUltimo = linee[si].lastIndexOf(ultimo ?? null)
          return (
            <g key={s.nome}>
              {denso && !s.tratteggio && grezzi.map((p, i) => <circle key={`g${i}`} cx={p[0]} cy={p[1]} r={1.9} fill={s.colore} opacity={0.38} />)}
              <polyline fill="none" stroke={s.colore} strokeWidth={denso ? 2.4 : 2} strokeDasharray={s.tratteggio ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round"
                opacity={s.tratteggio && denso ? 0.7 : 1} points={linea.map((p) => p.join(',')).join(' ')} />
              {!denso && !s.riferimento && linea.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={s.tratteggio ? 3 : 4} fill={s.tratteggio ? 'var(--bg)' : s.colore} stroke={s.colore} strokeWidth={s.tratteggio ? 1.5 : 0} />)}
              {denso && ultimo != null && <circle cx={x(iUltimo)} cy={y(ultimo)} r={3.5} fill={s.colore} />}
              {hover !== null && s.valori[hover] !== null && <circle cx={x(hover)} cy={y(s.valori[hover]!)} r={4.5} fill={s.colore} stroke="var(--bg)" strokeWidth={1.5} />}
              {ultimo !== undefined && ultimo !== null && (
                <text x={x(iUltimo) + 8} y={yEtichetta[si] + 3} fontSize={10} fill="var(--muted)">{s.nome}</text>
              )}
            </g>
          )
        })}
        {/* aree sensibili per il tooltip, più larghe dei punti */}
        {etichette.map((_, i) => (
          <rect key={i} x={x(i) - (W - PL - PR) / Math.max(2, n) / 2} y={0} width={(W - PL - PR) / Math.max(2, n)} height={H} fill="transparent"
            onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />
        ))}
      </svg>
      {hover !== null && (
        <div className="tooltip-grafico" style={{ left: `${Math.min(80, Math.max(20, (x(hover) / W) * 100))}%` }}>
          <div className="t">{etichette[hover]}</div>
          {serie.map((s) => s.valori[hover] !== null && (
            <div key={s.nome}><i style={{ background: s.colore }} />{s.nome}: <b>{formato(s.valori[hover]!)}</b></div>
          ))}
        </div>
      )}
      {(serie.length > 1 || denso) && (
        <div className="legenda-schema" style={{ marginTop: 4 }}>
          {serie.map((s) => <span key={s.nome}><i style={{ background: s.tratteggio ? `repeating-linear-gradient(90deg, ${s.colore} 0 5px, transparent 5px 8px)` : s.colore, height: 3 }} />{s.nome}</span>)}
          {denso && <span style={{ color: 'var(--faint)' }}>linea: media di {finestra} gare · puntini: singole gare</span>}
        </div>
      )}
    </div>
  )
}

/** Radar delle abilità (1–5), con un eventuale confronto tratteggiato. */
export function Radar({ assi, valori, confronto, titolo }: { assi: string[]; valori: number[]; confronto?: number[]; titolo: string }) {
  const W = 340, H = 300, cx = W / 2, cy = H / 2 + 4, R = 100
  const n = assi.length
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const p = (i: number, v: number) => [cx + Math.cos(ang(i)) * (R * v) / 5, cy + Math.sin(ang(i)) * (R * v) / 5]
  const poly = (vv: number[]) => vv.map((v, i) => p(i, v).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={titolo}>
      {[1, 2, 3, 4, 5].map((l) => <polygon key={l} points={poly(new Array(n).fill(l))} fill="none" stroke="var(--surface-3)" />)}
      {assi.map((a, i) => {
        const [x, y] = p(i, 5.9)
        const [x1, y1] = p(i, 5)
        return (
          <g key={a}>
            <line x1={cx} y1={cy} x2={x1} y2={y1} stroke="var(--surface-3)" />
            <text x={x} y={y + 3} fontSize={9} textAnchor={Math.abs(x - cx) < 10 ? 'middle' : x > cx ? 'start' : 'end'} fill="var(--muted)">{a}</text>
          </g>
        )
      })}
      {confronto && <polygon points={poly(confronto)} fill="none" stroke="var(--faint)" strokeWidth={1.5} strokeDasharray="4 3" />}
      <polygon points={poly(valori)} fill="rgba(var(--accent-rgb),0.18)" stroke="var(--accent)" strokeWidth={2} />
      {valori.map((v, i) => { const [x, y] = p(i, v); return <circle key={i} cx={x} cy={y} r={3.5} fill="var(--accent)"><title>{`${assi[i]}: ${v}/5`}</title></circle> })}
    </svg>
  )
}
