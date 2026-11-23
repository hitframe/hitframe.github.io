/**
 * Spazi per gli sponsor. Restano invisibili finché non c'è un partner per quel posto:
 * per attivarne uno basta aggiungerlo a PARTNER (logo in public/partner/).
 */
export type PostoPartner = 'oggi' | 'fisico' | 'fine-allenamento' | 'risultati'

interface Partner { posto: PostoPartner[]; nome: string; messaggio: string; link?: string; logo?: string }

export const PARTNER: Partner[] = [
  {
    posto: ['oggi', 'fisico', 'fine-allenamento', 'risultati'],
    nome: 'Vado La Mola Shooting Range',
    messaggio: 'A.T.D.S. Vado La Mola · Bassiano (LT)',
    link: 'https://www.instagram.com/vadolamolashootingrange/',
    logo: 'partner/vadolamola.png',
  },
]

export default function SpazioPartner({ posto }: { posto: PostoPartner }) {
  const p = PARTNER.find((x) => x.posto.includes(posto))
  if (!p) return null
  const corpo = (
    <>
      {p.logo ? <img src={p.logo} alt={p.nome} className="partner-logo" /> : <div className="partner-logo" aria-hidden="true" />}
      <div style={{ minWidth: 0 }}>
        <div className="partner-et">Partner di Hitframe</div>
        <div className="partner-msg">{p.nome}</div>
        <div className="partner-sub">{p.messaggio}</div>
      </div>
    </>
  )
  return p.link
    ? <a className="partner" href={p.link} target="_blank" rel="noopener sponsored">{corpo}</a>
    : <div className="partner">{corpo}</div>
}
