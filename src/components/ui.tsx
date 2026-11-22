import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Il marchio: sagoma IPSC ottagonale "a mirino" con il punto in zona A. */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
      <g transform="translate(100 100) scale(0.92) translate(-100 -100)">
        <g transform="skewX(-10) translate(18 0)">
          <path d="M35,82 L35,57 L70,18 L88,18 M112,18 L130,18 L165,57 L165,82 M165,118 L165,143 L130,182 L112,182 M88,182 L70,182 L35,143 L35,118" fill="none" stroke="#F4F4F2" strokeWidth="18" strokeLinejoin="miter" />
          <circle cx="100" cy="100" r="30" fill="none" stroke="#E5EA1E" strokeWidth="8" />
          <circle cx="100" cy="100" r="16" fill="#E5EA1E" />
        </g>
      </g>
    </svg>
  )
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <Mark size={size + 4} />
      <span><span className="hit">Hit</span>frame</span>
    </span>
  )
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    ref.current?.addEventListener('keydown', onKey)
    const node = ref.current
    node?.querySelector<HTMLElement>('input, textarea, select')?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = prev
      node?.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  // nel body: aperta dal menu laterale (che ha un suo livello) finiva sotto la scheda della prossima gara
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Chiudi">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Segmented<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Rating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="rating" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} aria-pressed={value === n} onClick={() => onChange(n)} aria-label={`${label} ${n} su 5`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Empty({ icon, text, action }: { icon?: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div>{text}</div>
      {action}
    </div>
  )
}

/** Converte il valore di un input numerico: vuoto → null. */
export const numOrNull = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2400)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  )
}
