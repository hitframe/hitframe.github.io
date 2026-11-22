import Dexie, { type EntityTable } from 'dexie'
import type { StageAllenamento } from './types'
import type { AnalisiGara, Arma, Componente, Corsa, DrillPersonale, Evento, Impostazione, Intervento, Lotto, Profilo, Prova, Ricetta, SessioneCrono, VoceDiario } from './types'
import type { RisultatoGara } from '../risultati/motore'
import { ARMA_DEFAULT, RIFERIMENTI_DEFAULT, TEMPI_DEFAULT } from './types'
import { inSospensione, nuovoId, segnalaModifica } from '../sync/segnali'
import { ErroreSolaLettura, solaLettura } from '../licenza/licenza'

export class HitframeDB extends Dexie {
  profilo!: EntityTable<Profilo, 'id'>
  eventi!: EntityTable<Evento, 'id'>
  diario!: EntityTable<VoceDiario, 'id'>
  impostazioni!: EntityTable<Impostazione, 'chiave'>
  analisi!: EntityTable<AnalisiGara, 'id'>
  prove!: EntityTable<Prova, 'id'>
  drillPersonali!: EntityTable<DrillPersonale, 'id'>
  componenti!: EntityTable<Componente, 'id'>
  ricette!: EntityTable<Ricetta, 'id'>
  crono!: EntityTable<SessioneCrono, 'id'>
  lotti!: EntityTable<Lotto, 'id'>
  armi!: EntityTable<Arma, 'id'>
  interventi!: EntityTable<Intervento, 'id'>
  risultati!: EntityTable<RisultatoGara, 'id'>
  stageLab!: EntityTable<StageAllenamento, 'id'>
  corse!: EntityTable<Corsa, 'id'>

  constructor() {
    super('hitframe')
    // Versione 1 dello schema. Nuovi moduli = nuove versioni, mai modifiche distruttive.
    this.version(1).stores({
      profilo: 'id',
      eventi: '++id, data, tipo, completato',
      diario: '++id, data, eventoId, *tag',
      impostazioni: 'chiave',
    })
    // v2: analisi dei PDF di gara
    this.version(2).stores({
      analisi: '++id, creato, eventoId',
    })
    // v3: allenamento
    this.version(3).stores({
      prove: '++id, drillId, data, eventoId, creato',
      drillPersonali: '++id, nome',
    })
    // v4: munizioni e attrezzatura
    this.version(4).stores({
      componenti: '++id, tipo',
      ricette: '++id, nome, archiviata',
      crono: '++id, ricettaId, data',
      lotti: '++id, ricettaId, data',
      armi: '++id, nome',
      interventi: '++id, armaId, data',
    })
    // v5: risultati di gara
    this.version(5).stores({
      risultati: '++id, data, eventoId',
    })
    // v6: stage designer
    this.version(6).stores({
      stageLab: '++id, nome, aggiornato',
    })
    // v7: run analizzate con GDA Split (dati del video POV)
    this.version(7).stores({
      corse: '++id, data, eventoId, drillId, risultatoId',
    })
  }
}

export const db = new HitframeDB()

/*
 * Per la sincronizzazione tra dispositivi:
 * - i nuovi record ricevono id unici (non 1, 2, 3… che si scontrerebbero tra telefono e computer);
 * - ogni modifica avvisa il sincronizzatore.
 */
for (const t of db.tables) {
  const pk = t.schema.primKey
  // prova finita senza licenza: si consulta tutto ma non si scrive (le impostazioni restano libere per inserire la licenza)
  const blocca = () => { if (solaLettura() && t.name !== 'impostazioni' && !inSospensione()) throw new ErroreSolaLettura() }
  t.hook('creating', function (chiave, obj) {
    blocca()
    segnalaModifica()
    if (pk.auto && chiave === undefined && typeof pk.keyPath === 'string') {
      const id = nuovoId()
      ;(obj as Record<string, unknown>)[pk.keyPath] = id
      return id
    }
    return undefined
  })
  t.hook('updating', function () { blocca(); segnalaModifica(); return undefined })
  t.hook('deleting', function () { blocca(); segnalaModifica() })
}

export const nowIso = () => new Date().toISOString()

export function profiloVuoto(): Profilo {
  return {
    id: 'me',
    nome: '',
    divisione: 'Production',
    classe: 'C',
    categoria: 'Nessuna',
    club: '',
    arma: '',
    manoForte: 'destra',
    armaDettagli: { ...ARMA_DEFAULT },
    riferimenti: structuredClone(RIFERIMENTI_DEFAULT),
    tempi: { ...TEMPI_DEFAULT },
    aggiornato: nowIso(),
  }
}

/** Completa un profilo salvato con i campi aggiunti nelle versioni successive. */
export function normalizzaProfilo(p: Partial<Profilo> | undefined): Profilo {
  const base = profiloVuoto()
  if (!p) return base
  return {
    ...base,
    ...p,
    armaDettagli: { ...base.armaDettagli, ...(p.armaDettagli ?? {}) },
    riferimenti: {
      Short: { ...base.riferimenti.Short, ...(p.riferimenti?.Short ?? {}) },
      Medium: { ...base.riferimenti.Medium, ...(p.riferimenti?.Medium ?? {}) },
      Long: { ...base.riferimenti.Long, ...(p.riferimenti?.Long ?? {}) },
    },
    tempi: { ...base.tempi, ...(p.tempi ?? {}) },
  } as Profilo
}

export async function getProfilo(): Promise<Profilo> {
  return normalizzaProfilo(await db.profilo.get('me'))
}

/* ---------- Impostazioni chiave/valore ---------- */
export async function getImp<T>(chiave: string, def: T): Promise<T> {
  const r = await db.impostazioni.get(chiave)
  return r ? (r.valore as T) : def
}
export async function setImp(chiave: string, valore: unknown) {
  await db.impostazioni.put({ chiave, valore })
}
