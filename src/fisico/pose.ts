/**
 * Figure animate degli esercizi: uno scheletro a bastoncini (testa, spalle, anca, ginocchia, piedi, gomiti, mani)
 * che passa da una posa all'altra. Vista di lato (rivolto a destra) o di fronte. Coordinate in un riquadro 200×210,
 * con il pavimento a y = 198.
 */
export type Punto = [number, number]
export interface Posa {
  hd: Punto; nk: Punto; hp: Punto
  kl: Punto; fl: Punto; kr: Punto; fr: Punto
  el: Punto; hl: Punto; er: Punto; hr: Punto
}

const P = (o: Posa) => o
const sposta = (p: Posa, dx: number, dy: number): Posa => Object.fromEntries(Object.entries(p).map(([k, [x, y]]) => [k, [x + dx, y + dy]])) as unknown as Posa
const con = (p: Posa, o: Partial<Posa>): Posa => ({ ...p, ...o })
/** Specchio orizzontale (destra ↔ sinistra), per i movimenti alternati. */
const specchio = (p: Posa): Posa => {
  const m = (q: Punto): Punto => [200 - q[0], q[1]]
  return { hd: m(p.hd), nk: m(p.nk), hp: m(p.hp), kl: m(p.kr), fl: m(p.fr), kr: m(p.kl), fr: m(p.fl), el: m(p.er), hl: m(p.hr), er: m(p.el), hr: m(p.hl) }
}

// ----- di lato -----
const IN_PIEDI = P({ hd: [100, 40], nk: [100, 58], hp: [100, 116], kl: [103, 157], fl: [101, 198], kr: [97, 157], fr: [95, 198], el: [103, 87], hl: [105, 114], er: [97, 87], hr: [95, 114] })
const MIRA = con(IN_PIEDI, { hp: [96, 118], kl: [106, 157], kr: [100, 157], el: [124, 64], hl: [148, 64], er: [122, 66], hr: [148, 65] })
const ACCOSCIATO = P({ hd: [118, 74], nk: [108, 90], hp: [78, 142], kl: [112, 148], fl: [102, 198], kr: [108, 150], fr: [98, 198], el: [128, 98], hl: [150, 98], er: [126, 100], hr: [148, 100] })
const ACC_MANI_TERRA = P({ hd: [126, 104], nk: [112, 118], hp: [80, 150], kl: [108, 156], fl: [96, 198], kr: [104, 158], fr: [92, 198], el: [124, 160], hl: [130, 198], er: [122, 162], hr: [128, 198] })
const SALTO = P({ hd: [100, 12], nk: [100, 30], hp: [100, 88], kl: [104, 128], fl: [100, 166], kr: [98, 128], fr: [94, 166], el: [110, 18], hl: [116, -2], er: [92, 18], hr: [86, -2] })
const AFFONDO = P({ hd: [100, 60], nk: [100, 78], hp: [100, 134], kl: [84, 184], fl: [62, 196], kr: [132, 160], fr: [136, 198], el: [102, 106], hl: [104, 132], er: [98, 106], hr: [96, 132] })
const AFFONDO_IN_VOLO = sposta(con(AFFONDO, { kl: [90, 168], fl: [72, 186], kr: [124, 150], fr: [126, 186] }), 0, -18)
const AFFONDO_BASSO = P({ hd: [108, 76], nk: [104, 94], hp: [96, 150], kl: [80, 196], fl: [48, 198], kr: [130, 160], fr: [134, 198], el: [118, 126], hl: [128, 156], er: [116, 128], hr: [126, 156] })
const PLANK_ALTA = P({ hd: [164, 128], nk: [150, 136], hp: [100, 152], kl: [70, 172], fl: [42, 196], kr: [70, 174], fr: [42, 198], el: [150, 166], hl: [150, 196], er: [152, 166], hr: [152, 198] })
const PIEGAMENTO = P({ hd: [166, 162], nk: [150, 170], hp: [100, 176], kl: [70, 186], fl: [42, 196], kr: [70, 187], fr: [42, 198], el: [136, 162], hl: [150, 196], er: [138, 163], hr: [152, 198] })
const PLANK_GOMITI = P({ hd: [164, 150], nk: [150, 160], hp: [100, 168], kl: [70, 182], fl: [42, 196], kr: [70, 183], fr: [42, 198], el: [150, 196], hl: [170, 196], er: [152, 196], hr: [172, 196] })
const SCALATORE_A = con(PLANK_ALTA, { kr: [126, 168], fr: [110, 188] })
const SCALATORE_B = con(PLANK_ALTA, { kl: [126, 168], fl: [110, 188] })
const TOCCO_SPALLA = con(PLANK_ALTA, { er: [160, 150], hr: [150, 138] })
const PONTE_GIU = P({ hd: [40, 186], nk: [56, 190], hp: [104, 192], kl: [134, 160], fl: [150, 198], kr: [136, 162], fr: [152, 198], el: [76, 196], hl: [96, 197], er: [78, 196], hr: [98, 197] })
const PONTE_SU = con(PONTE_GIU, { hp: [108, 158], kl: [138, 150], kr: [140, 152] })
const PRONO = P({ hd: [162, 186], nk: [146, 190], hp: [96, 192], kl: [66, 194], fl: [36, 196], kr: [66, 195], fr: [36, 197], el: [168, 192], hl: [188, 192], er: [168, 193], hr: [188, 193] })
const SUPERMAN = con(PRONO, { hd: [164, 174], nk: [148, 182], el: [170, 176], hl: [192, 168], er: [170, 177], hr: [192, 169], kl: [66, 188], fl: [36, 178], kr: [66, 189], fr: [36, 179] })
const QUADRUPEDIA = P({ hd: [152, 118], nk: [138, 128], hp: [90, 130], kl: [92, 196], fl: [62, 196], kr: [90, 196], fr: [60, 196], el: [138, 162], hl: [138, 196], er: [140, 162], hr: [140, 196] })
const BIRD_DOG = con(QUADRUPEDIA, { er: [162, 124], hr: [186, 120], kl: [62, 130], fl: [34, 128] })
const GATTO = con(QUADRUPEDIA, { nk: [138, 120], hd: [148, 132], hp: [90, 118] })
const MUCCA = con(QUADRUPEDIA, { nk: [138, 132], hd: [154, 110], hp: [90, 134] })
const DEAD_BUG = P({ hd: [40, 186], nk: [56, 188], hp: [106, 190], kl: [110, 150], fl: [134, 150], kr: [112, 152], fr: [136, 152], el: [58, 160], hl: [60, 136], er: [60, 162], hr: [62, 138] })
const DEAD_BUG_EST = con(DEAD_BUG, { kr: [136, 172], fr: [168, 182], er: [44, 168], hr: [24, 156] })
const GINOCCHIA_A = con(IN_PIEDI, { kr: [124, 112], fr: [118, 150], el: [112, 80], hl: [124, 66], er: [88, 92], hr: [84, 112] })
const GINOCCHIA_B = con(IN_PIEDI, { kl: [124, 112], fl: [118, 150], er: [112, 80], hr: [124, 66], el: [88, 92], hl: [84, 112] })
const RESA = con(IN_PIEDI, { el: [112, 50], hl: [108, 28], er: [90, 50], hr: [94, 28] })
const SCATTO = P({ hd: [134, 52], nk: [124, 66], hp: [104, 118], kl: [84, 160], fl: [64, 196], kr: [134, 140], fr: [128, 178], el: [140, 90], hl: [156, 76], er: [106, 92], hr: [94, 110] })
const PIEGATO = P({ hd: [142, 82], nk: [128, 90], hp: [86, 118], kl: [100, 158], fl: [98, 198], kr: [96, 158], fr: [94, 198], el: [128, 116], hl: [128, 140], er: [126, 116], hr: [126, 140] })
const REMATORE = con(PIEGATO, { el: [104, 102], hl: [118, 120], er: [102, 104], hr: [116, 122] })
const STACCO = con(PIEGATO, { hl: [124, 158], el: [126, 132], hr: [122, 158], er: [124, 132] })
const GOBLET = con(ACCOSCIATO, { el: [118, 104], hl: [124, 90], er: [116, 106], hr: [122, 92] })
const IN_PIEDI_GOBLET = con(IN_PIEDI, { el: [106, 84], hl: [112, 72], er: [104, 86], hr: [110, 74] })
const ALZATA = con(IN_PIEDI, { el: [124, 66], hl: [150, 58], er: [122, 68], hr: [148, 60] })
const CAMMINA_A = con(IN_PIEDI, { kl: [112, 156], fl: [118, 198], kr: [92, 158], fr: [80, 198] })
const CAMMINA_B = con(IN_PIEDI, { kr: [112, 156], fr: [118, 198], kl: [92, 158], fl: [80, 198] })
const MIRA_CAMMINA_A = con(MIRA, { kl: [114, 156], fl: [120, 198], kr: [92, 158], fr: [82, 198] })
const MIRA_CAMMINA_B = con(MIRA, { kr: [114, 156], fr: [120, 198], kl: [92, 158], fl: [82, 198] })
const MIRA_UNA_GAMBA = con(MIRA, { kl: [118, 140], fl: [104, 162] })
const SALTO_LUNGO_CARICA = con(ACCOSCIATO, { el: [64, 120], hl: [48, 132], er: [66, 122], hr: [50, 134] })
const SALTO_LUNGO_VOLO = sposta(con(SALTO, { hd: [104, 30], nk: [102, 46], el: [120, 30], hl: [138, 20], er: [118, 32], hr: [136, 22], kl: [114, 116], fl: [116, 150], kr: [110, 118], fr: [112, 152] }), 22, 14)
const SEDUTO_9090 = P({ hd: [100, 118], nk: [100, 136], hp: [100, 192], kl: [66, 186], fl: [54, 198], kr: [138, 186], fr: [126, 198], el: [86, 164], hl: [82, 190], er: [114, 164], hr: [118, 190] })
const SEDUTO_9090_RUOTA = con(SEDUTO_9090, { hd: [114, 120], nk: [110, 138], el: [126, 166], hl: [134, 190], er: [130, 156], hr: [146, 170] })
const ALLUNGO_TORACE = con(IN_PIEDI, { el: [120, 58], hl: [128, 32], er: [80, 58], hr: [72, 32] })

// ----- di fronte -----
const FRONTE = P({ hd: [100, 40], nk: [100, 58], hp: [100, 116], kl: [93, 157], fl: [91, 198], kr: [107, 157], fr: [109, 198], el: [86, 86], hl: [82, 114], er: [114, 86], hr: [118, 114] })
const JACK_APERTO = con(FRONTE, { kl: [82, 156], fl: [68, 198], kr: [118, 156], fr: [132, 198], el: [78, 40], hl: [70, 16], er: [122, 40], hr: [130, 16] })
const PATTINATORE = P({ hd: [86, 50], nk: [88, 68], hp: [84, 124], kl: [74, 160], fl: [72, 198], kr: [100, 168], fr: [118, 194], el: [104, 92], hl: [118, 110], er: [72, 90], hr: [62, 104] })
const COSACCO = P({ hd: [86, 82], nk: [86, 100], hp: [76, 152], kl: [60, 156], fl: [62, 198], kr: [126, 176], fr: [154, 198], el: [96, 118], hl: [104, 136], er: [92, 120], hr: [104, 138] })
const SALTELLO = sposta(con(FRONTE, { el: [80, 98], hl: [72, 118], er: [120, 98], hr: [128, 118] }), 0, -8)
const SALTELLO_GIU = con(FRONTE, { el: [80, 98], hl: [72, 118], er: [120, 98], hr: [128, 118] })
const SOSPESO = P({ hd: [100, 40], nk: [100, 56], hp: [100, 112], kl: [100, 150], fl: [100, 188], kr: [100, 150], fr: [100, 188], el: [88, 30], hl: [84, 8], er: [112, 30], hr: [116, 8] })
const SOSPESO_ATTIVO = con(sposta(SOSPESO, 0, -6), { hl: [84, 8], hr: [116, 8], el: [86, 24], er: [114, 24] })
const PLANK_LATERALE = P({ hd: [164, 128], nk: [148, 138], hp: [104, 164], kl: [72, 180], fl: [40, 196], kr: [72, 181], fr: [40, 197], el: [148, 196], hl: [168, 196], er: [148, 112], hr: [148, 88] })
const PLANK_LATERALE_GIU = con(PLANK_LATERALE, { hp: [104, 172] })
const SPALLE_SU = con(FRONTE, { el: [78, 44], hl: [74, 20], er: [122, 44], hr: [126, 20] })
const SPALLE_LATO = con(FRONTE, { el: [70, 58], hl: [44, 58], er: [130, 58], hr: [156, 58] })
const MANI_AVANTI = con(FRONTE, { el: [88, 70], hl: [90, 66], er: [112, 70], hr: [110, 66] })

export const POSE = {
  IN_PIEDI, MIRA, ACCOSCIATO, ACC_MANI_TERRA, SALTO, AFFONDO, AFFONDO_INV: specchio(AFFONDO), AFFONDO_IN_VOLO, AFFONDO_IN_VOLO_INV: specchio(AFFONDO_IN_VOLO),
  AFFONDO_BASSO, PLANK_ALTA, PIEGAMENTO, PLANK_GOMITI, SCALATORE_A, SCALATORE_B, TOCCO_SPALLA, PONTE_GIU, PONTE_SU, PRONO, SUPERMAN,
  QUADRUPEDIA, BIRD_DOG, GATTO, MUCCA, DEAD_BUG, DEAD_BUG_EST, GINOCCHIA_A, GINOCCHIA_B, RESA, SCATTO, PIEGATO, REMATORE, STACCO, GOBLET,
  IN_PIEDI_GOBLET, ALZATA, CAMMINA_A, CAMMINA_B, MIRA_CAMMINA_A, MIRA_CAMMINA_B, MIRA_UNA_GAMBA, SALTO_LUNGO_CARICA, SALTO_LUNGO_VOLO,
  SEDUTO_9090, SEDUTO_9090_RUOTA, ALLUNGO_TORACE, FRONTE, JACK_APERTO, PATTINATORE, PATTINATORE_B: specchio(PATTINATORE), COSACCO, COSACCO_B: specchio(COSACCO),
  SALTELLO, SALTELLO_GIU, SOSPESO, SOSPESO_ATTIVO, PLANK_LATERALE, PLANK_LATERALE_GIU, SPALLE_SU, SPALLE_LATO, MANI_AVANTI,
}
export type NomePosa = keyof typeof POSE

/** Posa intermedia tra due pose (t da 0 a 1). */
export function interpola(a: Posa, b: Posa, t: number): Posa {
  const o = {} as Record<string, Punto>
  for (const k of Object.keys(a) as (keyof Posa)[]) o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t]
  return o as unknown as Posa
}
