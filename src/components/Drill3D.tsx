import { useEffect, useRef, useState } from 'react'
import type { ElementoSchema, Schema } from '../allenamento/schemi'
import type * as T3 from 'three'

type Vista = 'tiratore' | 'alto' | 'lato'

/**
 * Vista 3D in prospettiva del drill (three.js caricato solo quando serve).
 * Coordinate dello schema: x laterale, y verso i bersagli → three: x, z = -y, y in alto.
 */
export default function Drill3D({ schema, altezza = 360 }: { schema: Schema; altezza?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [vista, setVista] = useState<Vista>('tiratore')
  const imposta = useRef<((v: Vista) => void) | null>(null)
  const [errore, setErrore] = useState(false)

  useEffect(() => {
    let fermo = false
    let pulisci = () => {}
    ;(async () => {
      try {
        const THREE = await import('three')
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
        if (fermo || !box.current) return
        const el = box.current
        const W = el.clientWidth, H = altezza
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(W, H)
        renderer.shadowMap.enabled = true
        el.appendChild(renderer.domElement)
        const scene = new THREE.Scene()
        scene.background = new THREE.Color('#9fc3e6')
        scene.fog = new THREE.Fog('#9fc3e6', 40, 90)
        const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200)

        scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a5a', 0.9))
        const sole = new THREE.DirectionalLight('#ffffff', 1.4)
        sole.position.set(-8, 20, 6); sole.castShadow = true
        sole.shadow.mapSize.set(1024, 1024)
        Object.assign(sole.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 })
        scene.add(sole)

        const elementi = schema.elementi
        const ys = elementi.flatMap((e) => [e.y, e.y2 ?? e.y]), xs = elementi.flatMap((e) => [e.x, e.x2 ?? e.x])
        const prof = Math.max(10, ...ys) + 3, larg = Math.max(12, ...xs.map(Math.abs).map((v) => v * 2 + 4))

        // fondo in ghiaia, griglia a 1 m, parapalle
        const terreno = new THREE.Mesh(new THREE.PlaneGeometry(larg + 20, prof + 20), new THREE.MeshLambertMaterial({ color: '#c8b48c' }))
        terreno.rotation.x = -Math.PI / 2; terreno.position.z = -prof / 2 + 3; terreno.receiveShadow = true
        scene.add(terreno)
        const griglia = new THREE.GridHelper(Math.max(larg, prof) + 10, Math.max(larg, prof) + 10, '#a8956d', '#b9a67f')
        griglia.position.set(0, 0.005, -prof / 2 + 3); scene.add(griglia)
        const terrapieno = new THREE.Mesh(new THREE.BoxGeometry(larg + 20, 4, 2), new THREE.MeshLambertMaterial({ color: '#8d7650' }))
        terrapieno.position.set(0, 2, -prof - 1.5); terrapieno.receiveShadow = true; scene.add(terrapieno)

        const carta = new THREE.MeshLambertMaterial({ color: '#c9a77a', side: THREE.DoubleSide })
        const bianco = new THREE.MeshLambertMaterial({ color: '#f2f2f0', side: THREE.DoubleSide })
        const acciaio = new THREE.MeshStandardMaterial({ color: '#2f6fd6', metalness: 0.3, roughness: 0.5 })
        const legno = new THREE.MeshLambertMaterial({ color: '#6b5236' })
        const paletto = new THREE.MeshLambertMaterial({ color: '#7b6040' })
        const giallo = new THREE.MeshLambertMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--accent-fill').trim() || '#e5ea1e' })

        const ottagono = (w: number, h: number) => {
          const s = new THREE.Shape()
          const tx = w * 0.27, ty = h * 0.24
          s.moveTo(-w / 2 + tx, h / 2); s.lineTo(w / 2 - tx, h / 2); s.lineTo(w / 2, h / 2 - ty); s.lineTo(w / 2, -h / 2 + ty)
          s.lineTo(w / 2 - tx, -h / 2); s.lineTo(-w / 2 + tx, -h / 2); s.lineTo(-w / 2, -h / 2 + ty); s.lineTo(-w / 2, h / 2 - ty); s.closePath()
          return new THREE.ShapeGeometry(s)
        }
        const popperForma = (h: number) => {
          const s = new THREE.Shape(), r = h * 0.17, c = h * 0.07, b = h * 0.2
          s.moveTo(-b, 0); s.lineTo(b, 0); s.lineTo(c, h - 2 * r); s.absarc(0, h - r, r, -Math.PI / 2 + 0.3, Math.PI * 1.5 - 0.3, false); s.lineTo(-b, 0)
          return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false })
        }
        const etichetta = (testo: string, colore = '#111') => {
          const c = document.createElement('canvas'); c.width = 128; c.height = 64
          const g = c.getContext('2d')!
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(14, 10, 100, 44)
          g.fillStyle = colore; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(testo, 64, 33)
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
          sp.scale.set(0.8, 0.4, 1); return sp
        }
        const pos = (e: ElementoSchema) => new THREE.Vector3(e.x, 0, -e.y)
        const ombra = (m: T3.Object3D) => { m.traverse((o: T3.Object3D) => { if ((o as T3.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } }); return m }

        const bersaglioCarta = (mat: T3.Material, scala = 1) => {
          const g = new THREE.Group()
          const t = new THREE.Mesh(ottagono(0.46 * scala, 0.58 * scala), mat)
          t.position.y = 1.0 + 0.29 * scala; g.add(t)
          for (const dx of [-0.15, 0.15]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.05, 0.02), paletto); p.position.set(dx * scala, 0.52, -0.01); g.add(p) }
          return g
        }

        for (const e of elementi) {
          let o: T3.Object3D | null = null
          switch (e.t) {
            case 'carta': o = bersaglioCarta(carta); break
            case 'mini': o = bersaglioCarta(carta, 0.66); break
            case 'noshoot': o = bersaglioCarta(bianco); o.position.z = 0.03; break
            case 'popper': case 'miniPopper': {
              const h = e.t === 'popper' ? 0.85 : 0.56
              const m = new THREE.Mesh(popperForma(h), acciaio); m.position.y = 0.05
              const base = new THREE.Mesh(new THREE.BoxGeometry(h * 0.5, 0.05, 0.3), acciaio)
              o = new THREE.Group(); o.add(m, base); break
            }
            case 'piastra': {
              const g = new THREE.Group()
              const terra = e.variante === 'terra'
              const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), acciaio)
              p.rotation.x = Math.PI / 2; p.position.y = terra ? 0.18 : 1.1
              const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, terra ? 0.1 : 1.0), paletto)
              asta.position.y = terra ? 0.05 : 0.5
              g.add(p, asta); o = g; break
            }
            case 'bobber': {
              const g = new THREE.Group()
              const perno = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.4), acciaio); perno.position.y = 0.2
              const braccio = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.03), acciaio)
              braccio.position.set(0.35, 0.75, 0); braccio.rotation.z = -0.55
              const testa = e.variante === 'piatto'
                ? (() => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24), acciaio); p.rotation.x = Math.PI / 2; return p })()
                : new THREE.Mesh(ottagono(0.46, 0.58), carta)
              testa.position.set(0.68, 1.35, 0.02)
              g.add(perno, braccio, testa)
              if (e.variante === 'passata') {
                const cop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.05), legno); cop.position.set(-0.3, 0.95, 0.25); g.add(cop)
              }
              o = g; break
            }
            case 'barile': {
              o = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.9, 24), new THREE.MeshLambertMaterial({ color: '#1f5fae' }))
              o.position.y = 0.45; break
            }
            case 'tavolo': {
              const g = new THREE.Group()
              const piano = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), legno); piano.position.y = 0.9
              g.add(piano)
              for (const [dx, dz] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) { const g2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), legno); g2.position.set(dx, 0.45, dz); g.add(g2) }
              o = g; break
            }
            case 'muro': {
              const a = pos(e), b = new THREE.Vector3(e.x2 ?? e.x, 0, -(e.y2 ?? e.y))
              const len = a.distanceTo(b)
              const m = new THREE.Mesh(new THREE.BoxGeometry(len, 2.0, 0.08), legno)
              m.position.set((a.x + b.x) / 2, 1.0, (a.z + b.z) / 2); m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
              scene.add(ombra(m)); break
            }
            case 'linea': {
              const a = pos(e), b = new THREE.Vector3(e.x2 ?? e.x, 0, -(e.y2 ?? e.y))
              const len = a.distanceTo(b)
              const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.06), new THREE.MeshLambertMaterial({ color: '#d33' }))
              m.position.set((a.x + b.x) / 2, 0.015, (a.z + b.z) / 2); m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
              scene.add(m); break
            }
            case 'freccia': {
              const a = pos(e), b = new THREE.Vector3(e.x2 ?? e.x, 0.05, -(e.y2 ?? e.y)); a.y = 0.05
              const dir = b.clone().sub(a)
              scene.add(new THREE.ArrowHelper(dir.clone().normalize(), a, dir.length(), 0x8b5cf6, 0.4, 0.25)); break
            }
            case 'box': {
              const l = 1.3
              const pts = [[-l / 2, -l / 2], [l / 2, -l / 2], [l / 2, l / 2], [-l / 2, l / 2], [-l / 2, -l / 2]].map(([dx, dz]) => new THREE.Vector3(e.x + dx, 0.02, -e.y + dz))
              scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffffff' })))
              if (e.id) { const s = etichetta(e.id, '#555'); s.position.set(e.x, 0.25, -e.y + 0.8); scene.add(s) }
              break
            }
            case 'tiratore': {
              const g = new THREE.Group()
              const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 12), giallo); corpo.position.y = 0.75
              const testa = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), giallo); testa.position.y = 1.62
              g.add(corpo, testa)
              if (e.verso === 'indietro') g.rotation.y = Math.PI
              g.userData.tiratore = true
              o = g; break
            }
          }
          if (o) {
            o.position.x += e.x; o.position.z += -e.y
            scene.add(ombra(o))
            if (e.id && ['carta', 'mini', 'popper', 'miniPopper', 'piastra', 'bobber'].includes(e.t)) {
              const s = etichetta(e.id); s.position.set(e.x, e.t === 'piastra' && e.variante === 'terra' ? 0.6 : 2.05, -e.y); scene.add(s)
            }
          }
        }

        const sagomeTiratore: T3.Object3D[] = []
        scene.traverse((o: T3.Object3D) => { if (o.userData.tiratore) sagomeTiratore.push(o) })
        const start = elementi.find((e) => e.t === 'tiratore') ?? elementi.find((e) => e.t === 'box') ?? { x: 0, y: 0 }
        const tutti = elementi.filter((e) => e.t !== 'freccia')
        const cx = tutti.reduce((a, e) => a + e.x, 0) / Math.max(1, tutti.length)
        const cz = -tutti.reduce((a, e) => a + e.y, 0) / Math.max(1, tutti.length)
        const centro = new THREE.Vector3(cx, 0.8, cz)
        const controlli = new OrbitControls(camera, renderer.domElement)
        controlli.enableDamping = true
        controlli.maxPolarAngle = Math.PI / 2 - 0.03
        controlli.minDistance = 1; controlli.maxDistance = 80
        const vai = (v: Vista) => {
          for (const t of sagomeTiratore) t.visible = v !== 'tiratore'
          if (v === 'tiratore') { camera.position.set(start.x, 1.65, -start.y + 0.3); controlli.target.set(start.x * 0.6, 1.1, -start.y - 8) }
          else if (v === 'alto') { camera.position.set(cx, Math.max(12, prof * 1.2), cz + prof * 0.45); controlli.target.copy(centro) }
          else { camera.position.set(cx + Math.max(8, prof * 0.6), 4.5, cz + 4); controlli.target.copy(centro) }
          controlli.update()
        }
        imposta.current = vai
        vai('tiratore')

        let raf = 0
        const ciclo = () => { controlli.update(); renderer.render(scene, camera); raf = requestAnimationFrame(ciclo) }
        ciclo()
        const ridimensiona = () => {
          const w = el.clientWidth
          renderer.setSize(w, H); camera.aspect = w / H; camera.updateProjectionMatrix()
        }
        window.addEventListener('resize', ridimensiona)
        pulisci = () => {
          cancelAnimationFrame(raf); window.removeEventListener('resize', ridimensiona)
          controlli.dispose(); renderer.dispose()
          scene.traverse((o: T3.Object3D) => { const m = o as T3.Mesh; m.geometry?.dispose?.() })
          renderer.domElement.remove()
        }
      } catch (e) {
        console.error(e)
        setErrore(true)
      }
    })()
    return () => { fermo = true; pulisci() }
  }, [schema, altezza])

  if (errore) return <p className="prose" style={{ margin: 0 }}>La vista 3D non è disponibile su questo dispositivo.</p>
  return (
    <div className="form" style={{ gap: 8 }}>
      <div ref={box} className="vista-3d" style={{ height: altezza }} aria-label="Vista 3D del drill: trascina per ruotare, pizzica per lo zoom" />
      <div className="row">
        {([['tiratore', 'Occhi del tiratore'], ['alto', 'Dall’alto'], ['lato', 'Di lato']] as [Vista, string][]).map(([v, l]) => (
          <button key={v} type="button" className={`chip-giorno${vista === v ? ' attivo' : ''}`} style={{ padding: '0 12px', minHeight: 34 }} onClick={() => { setVista(v); imposta.current?.(v) }}>{l}</button>
        ))}
      </div>
      <p className="prose" style={{ margin: 0, fontSize: 12 }}>Trascina con un dito per ruotare, due dita per zoom e spostamento.</p>
    </div>
  )
}
