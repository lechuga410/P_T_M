import { useState } from 'react'

interface YieldRateInputProps {
  rate: number
  onCommit: (rate: number) => void
}

export function YieldRateInput({ rate, onCommit }: YieldRateInputProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    const parsed = Number(draft.replace(',', '.'))
    setDraft(null)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 && parsed !== rate) onCommit(parsed)
  }

  return (
    <input
      className="yield-rate-input"
      inputMode="decimal"
      aria-label="Rendimiento anual (EA)"
      size={Math.max((draft ?? String(rate)).length, 1)}
      value={draft ?? String(rate)}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { setDraft(null); event.currentTarget.blur() }
      }}
    />
  )
}
