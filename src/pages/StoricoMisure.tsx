/** Storico di tutte le misure prese dai video: ogni tempo con la sua data e la run da cui viene, per riscontrarlo ed esportarlo. */
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, ChevronRight, Copy, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, useToast } from '../components/ui'
import { db } from '../db/db'
import type { Corsa } from '../db/types'
import { fmt } from '../lib/date'
import { fasciaDi, METRICHE, NOMI_FASCIA, type Campione, type Metrica } from '../video/corse'
import { useAbilita } from '../video/useAbilita'

const f2 = (n: number) => n.toFixed(2).replace('.', ',')
const CONTESTO = { allenamento: 'Allenamento', gara: 'Gara', libero: 'Altro' } as const
const dataSicura = (c: Pick<Corsa, 'dataFonte'>) => c.dataFonte === 'video' || c.dataFonte === 'manuale' || c.dataFonte === 'evento'
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }

type Riga = Campione & { k: Metrica }

export default function StoricoMisure() {
  const toast = useToast()
  const ab = useAbilita()
  const corse = useLiveQuery(() => db.corse.toArray()) ?? []
  const [metrica, setMetrica] = useState<Metrica | 'tutte'>('tutte')
  const perId = useMemo(() => new Map(corse.map((c) => [c.id, c])), [corse])

  const righe: Riga[] = useMemo(() => {
    if (!ab) return []
    const out: Riga[] = []
    for (const m of METRICHE) for (const x of ab.camp[m.k]) out.push({ ...x, k: m.k })
    return out.sort((a, b) => b.data.localeCompare(a.data) || (a.corsaId ?? 0) - (b.corsaId ?? 0))
  }, [ab])
  const daVerificare = corse.filter((c) => !dataSicura(c))
  const visibili = metrica === 'tutte' ? righe : righe.filter((r) => r.k === metrica)

  // per run: la mediana di ogni abilità misurata in quella run
  const perRun = useMemo(() => {
    const m = new Map<number, Map<Metrica, number[]>>()
    for (const r of visibili) {
      if (r.corsaId == null) continue
      const x = m.get(r.corsaId) ?? new Map<Metrica, number[]>()
      x.set(r.k, [...(x.get(r.k) ?? []), r.v])
      m.set(r.corsaId, x)
    }
    return [...m.entries()].map(([id, v]) => ({ c: perId.get(id)!, v })).filter((x) => x.c)
      .sort((a, b) => b.c.data.localeCompare(a.c.data))
  }, [visibili, perId])

  // andamento mese per mese della metrica scelta
  const mesi = useMemo(() => {
    if (metrica === 'tutte') return []
    const g = new Map<string, number[]>()
    for (const r of visibili) g.set(r.data.slice(0, 7), [...(g.get(r.data.slice(0, 7)) ?? []), r.v])
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mese, v]) => ({ mese, n: v.length, med: mediana(v), min: Math.min(...v) }))
  }, [visibili, metrica])

  function csv() {
    const l = ['data;run;contesto;abilita;tempo_s;bersaglio;distanza_m;fascia;data_verificata']
    for (const r of righe) {
      const c = r.corsaId != null ? perId.get(r.corsaId) : undefined
      const nome = METRICHE.find((m) => m.k === r.k)?.nome ?? r.k
      l.push([r.data, c?.titolo ?? '', c ? CONTESTO[c.contesto] : '', nome, f2(r.v), r.bers, r.d ?? '', NOMI_FASCIA[fasciaDi(r)], c && dataSicura(c) ? 'sì' : 'no']
        .map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';'))
    }
    return '﻿' + l.join('\n')
  }
  function scarica() {
    const url = URL.createObjectURL(new Blob([csv()], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `hitframe-misure-video-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  async function copia() {
    try { await navigator.clipboard.writeText(csv().replace('﻿', '')); toast('Misure copiate: incollale in un foglio di calcolo') } catch { toast('Copia non riuscita: usa “Scarica CSV”') }
  }

  return (
    <div className="page">
      <Link to="/video" className="btn ghost" style={{ alignSelf: 'flex-start', marginLeft: -8 }}><ArrowLeft size={18} /> Video</Link>
      <PageHeader title="Storico misure" sub={`${righe.length} tempi da ${corse.length} run, ognuno con la sua data e la run da cui viene`} />

      {daVerificare.length > 0 && (
        <section className="card" style={{ borderColor: "#4a4710" }}>
          <div className="card-title"><span><AlertTriangle size={18} style={{ verticalAlign: -3, color: 'var(--accent)' }} /> {daVerificare.length === 1 ? '1 run con la data da verificare' : `${daVerificare.length} run con la data da verificare`}</span></div>
          <p className="prose" style={{ margin: '0 0 8px' }}>Per queste run la data non viene dal video: probabilmente è il giorno in cui le hai salvate. Aprile e scegli il giorno giusto, così lo storico è fedele.</p>
          <div className="list">
            {daVerificare.sort((a, b) => b.data.localeCompare(a.data)).map((c) => (
              <Link key={c.id} to={`/video/run/${c.id}`} className="item">
                <div style={{ flex: 1, minWidth: 0 }}><div className="title">{c.titolo}</div><div className="meta">{fmt(c.data, 'd MMM yyyy')} · {c.file || 'video'}</div></div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="chips">
          <button type="button" className={`chip${metrica === 'tutte' ? ' on' : ''}`} aria-pressed={metrica === 'tutte'} onClick={() => setMetrica('tutte')}>Tutte</button>
          {METRICHE.filter((m) => righe.some((r) => r.k === m.k)).map((m) => (
            <button key={m.k} type="button" className={`chip${metrica === m.k ? ' on' : ''}`} aria-pressed={metrica === m.k} onClick={() => setMetrica(m.k)}>{m.nome}</button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={scarica} disabled={!righe.length}><Download size={18} /> Scarica CSV</button>
          <button className="btn" style={{ flex: 1 }} onClick={copia} disabled={!righe.length}><Copy size={18} /> Copia</button>
        </div>
      </section>

      {mesi.length > 0 && (
        <section className="card">
          <div className="card-title"><span>Mese per mese</span></div>
          <table className="tabella-storico">
            <thead><tr><th>Mese</th><th>Misure</th><th>Mediana</th><th>Migliore</th></tr></thead>
            <tbody>
              {mesi.map((m) => (
                <tr key={m.mese}><td>{fmt(m.mese + '-01', 'MMM yyyy')}</td><td>{m.n}</td><td><b>{f2(m.med)} s</b></td><td>{f2(m.min)} s</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <div className="card-title"><span>Run per run</span></div>
        {perRun.length === 0 ? (
          <p className="prose" style={{ margin: 0 }}>Nessuna misura ancora. Analizza un video con GDA Split e salvalo in Hitframe: i tempi arrivano qui con la data del video.</p>
        ) : (
          <div className="list">
            {perRun.map(({ c, v }) => (
              <Link key={c.id} to={`/video/run/${c.id}`} className="item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{c.titolo}</div>
                  <div className="meta">
                    {fmt(c.data, 'd MMM yyyy')}{!dataSicura(c) && <span style={{ color: 'var(--accent)' }}> · data da verificare</span>} · {CONTESTO[c.contesto]}
                  </div>
                  <div className="storico-valori">
                    {METRICHE.filter((m) => v.has(m.k)).map((m) => {
                      const xs = v.get(m.k)!
                      return <span key={m.k}>{m.nome} <b>{f2(mediana(xs))}</b>{xs.length > 1 ? <i> ×{xs.length}</i> : null}</span>
                    })}
                  </div>
                </div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
