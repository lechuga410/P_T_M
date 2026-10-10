import { useEffect, useRef, useState } from 'react'

interface YieldRateInputProps {
  rate: number
  onCommit: (rate: number) => void
}

const AUTO_COMMIT_MS = 1200

export function YieldRateInput({ rate, onCommit }: YieldRateInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const draftRef = useRef<string | null>(null)
  const rateRef = useRef(rate)
  const onCommitRef = useRef(onCommit)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    rateRef.current = rate
    onCommitRef.current = onCommit
  })

  const updateDraft = (value: string | null) => {
    draftRef.current = value
    setDraft(value)
  }

  const flush = () => {
    window.clearTimeout(timerRef.current)
    const pending = draftRef.current
    if (pending === null) return
    draftRef.current = null
    const parsed = Number(pending.replace(',', '.'))
    if (pending.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 && parsed !== rateRef.current) {
      onCommitRef.current(parsed)
    }
  }

  // Guarda también si el usuario cierra la pestaña o cambia de pantalla sin salir del campo.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  return (
    <input
      className="yield-rate-input"
      inputMode="decimal"
      aria-label="Rendimiento anual (EA)"
      size={Math.max((draft ?? String(rate)).length, 1)}
      value={draft ?? String(rate)}
      onChange={(event) => {
        updateDraft(event.target.value.replace(/[^0-9.,]/g, ''))
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          flush()
          setDraft(null)
        }, AUTO_COMMIT_MS)
      }}
      onBlur={() => {
        flush()
        setDraft(null)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          window.clearTimeout(timerRef.current)
          updateDraft(null)
          event.currentTarget.blur()
        }
      }}
    />
  )
}
