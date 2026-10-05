import type { DailyInterestSnapshot } from '../lib/dailyInterestHistory'

interface DailyInterestChartProps {
  snapshots: DailyInterestSnapshot[]
  startDate: string
  endDate: string
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

export function DailyInterestChart({ snapshots, startDate, endDate }: DailyInterestChartProps) {
  if (snapshots.length === 0) {
    return <p className="daily-interest-empty">El historial diario aparecerá aquí al completarse el primer día de seguimiento.</p>
  }

  const max = Math.max(...snapshots.map((snapshot) => snapshot.interest), 0)
  const chartMax = max > 0 ? max * 1.15 : 1
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1)
  const slotWidth = 976 / totalDays
  const barWidth = Math.min(42, slotWidth * 0.82)
  const labelStep = Math.max(1, Math.ceil(totalDays / 7))
  const preciseDate = new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const fullDate = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full',
  })
  const xForDate = (date: string) => {
    const day = new Date(`${date}T00:00:00`)
    const dayIndex = Math.round((day.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    return 12 + dayIndex * slotWidth + slotWidth / 2
  }
  const axisLabels = Array.from({ length: totalDays }, (_, index) => {
    if (index % labelStep !== 0 && index !== totalDays - 1) return undefined
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return {
      key: date.toISOString(),
      x: 12 + index * slotWidth + slotWidth / 2,
      label: preciseDate.format(date),
      title: fullDate.format(date),
    }
  }).filter((label) => label !== undefined)

  return (
    <div className="daily-interest-chart">
      <div className="daily-interest-chart-axis">
        <span>{formatCurrency(max)}</span>
        <span>{formatCurrency(0)}</span>
      </div>
      <svg
        viewBox="0 0 1000 210"
        preserveAspectRatio="none"
        role="img"
        aria-label="Interés compuesto estimado acumulado por día"
      >
        <defs>
          <linearGradient id="daily-interest-bar-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#79ceb7" />
            <stop offset="100%" stopColor="#367e77" />
          </linearGradient>
        </defs>
        {[30, 75, 120, 165].map((y) => (
          <line key={y} x1="12" x2="988" y1={y} y2={y} className="daily-interest-gridline" />
        ))}
        {snapshots.map((snapshot) => {
          const x = xForDate(snapshot.date) - barWidth / 2
          const height = Math.max(snapshot.interest > 0 ? 2 : 0, (snapshot.interest / chartMax) * 130)
          const y = 165 - height
          return (
            <g key={`${snapshot.investmentId}-${snapshot.date}`}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={Math.min(4, barWidth / 2)}
                className="daily-interest-bar"
                tabIndex={0}
                aria-label={`${snapshot.date}: interés estimado ${formatCurrency(snapshot.interest)}, capital al cierre ${formatCurrency(snapshot.closingBalance)}`}
              >
                <title>{`${fullDate.format(new Date(`${snapshot.date}T12:00:00`))} · Interés estimado del día: ${formatCurrency(snapshot.interest)} · Saldo al cierre: ${formatCurrency(snapshot.closingBalance)}${snapshot.contributions ? ` · Aportes del día: ${formatCurrency(snapshot.contributions)}` : ''}${snapshot.anchoredToConfirmation ? ' · Incluye corte confirmado' : ''}`}</title>
              </rect>
            </g>
          )
        })}
      </svg>
      <div className="daily-interest-date-labels">
        {axisLabels.map((label) => (
          <span key={label.key} title={label.title} style={{ left: `${((label.x - 12) / 976) * 100}%` }}>
            {label.label}
          </span>
        ))}
      </div>
    </div>
  )
}
