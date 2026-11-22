/** Area Video: porta a GDA Split, l'analisi dei video POV (beep, colpi, split, grafica per i social). */
import { AudioWaveform, Clapperboard, Film, Share2, Timer, WifiOff } from 'lucide-react'
import { PageHeader } from '../components/ui'

// GDA Split è una pagina a sé dentro l'app (public/split): con ?hf=1 mostra il tasto per tornare a Hitframe
const SPLIT = 'split/index.html?hf=1'

const PUNTI = [
  { icon: AudioWaveform, t: 'Beep e colpi da soli', d: 'Carichi il video della camera e l’app trova la partenza, ogni colpo e gli split leggendo l’audio.' },
  { icon: Timer, t: 'Tempo ufficiale', d: 'Scrivi il tempo del timer dell’RO e il tempo finale coincide con lo statino.' },
  { icon: Film, t: 'Grafica sul video', d: 'Colpi, split e tempo stampati sul video, con i tuoi loghi, pronti da esportare.' },
  { icon: Share2, t: 'Social', d: 'Caption e hashtag per Instagram a partire dai dati della prova.' },
  { icon: WifiOff, t: 'Anche offline', d: 'Il video non esce dal telefono: l’analisi avviene tutta sul dispositivo.' },
]

export default function Video() {
  return (
    <div className="page">
      <PageHeader title="Video" sub="Analisi dei tuoi video POV con GDA Split" />
      <section className="card video-hero">
        <div className="card-title" style={{ marginBottom: 0 }}><span><Clapperboard size={20} style={{ verticalAlign: -3, color: 'var(--accent)' }} /> GDA Split</span></div>
        <p>Scegli un video di allenamento o di gara: in pochi secondi hai beep, colpi, split e tempo, da correggere a mano dove serve.</p>
        <a className="btn primary" href={SPLIT}><Clapperboard size={20} /> Analizza un video</a>
      </section>
      <section className="card">
        <div className="video-punti">
          {PUNTI.map(({ icon: Icona, t, d }) => (
            <div key={t} className="video-punto"><Icona size={20} /><div><b>{t}</b><span>{d}</span></div></div>
          ))}
        </div>
      </section>
    </div>
  )
}
