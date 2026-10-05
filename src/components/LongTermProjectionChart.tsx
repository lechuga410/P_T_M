interface LongTermProjectionChartProps {
  points: Array<{ years: number; balance: number }>
  currentBalance: number
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)

export function LongTermProjectionChart({ points, currentBalance }: LongTermProjectionChartProps) {
  const chartPoints = [{ years: 0, balance: currentBalance }, ...points]
  const maxYears = Math.max(...chartPoints.map((point) => point.years), 1)
  const maxBalance = Math.max(...chartPoints.map((point) => point.balance), 1)
  const coordinates = chartPoints.map((point) => ({
    x: 20 + (point.years / maxYears) * 960,
    y: 165 - (point.balance / maxBalance) * 132,
  }))
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `20,170 ${line} 980,170`

  return (
    <div className="long-term-projection-chart">
      <div className="long-term-projection-axis">
        <span>{formatCurrency(maxBalance)}</span>
        <span>{formatCurrency(0)}</span>
      </div>
      <svg
        viewBox="0 0 1000 205"
        preserveAspectRatio="none"
        role="img"
        aria-label="Proyección del saldo compuesto desde ahora hasta 30 años"
      >
        <defs>
          <linearGradient id="long-term-projection-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7c9be0" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#7c9be0" stopOpacity="0.015" />
          </linearGradient>
        </defs>
        {[32, 76, 120, 164].map((y) => (
          <line key={y} x1="20" x2="980" y1={y} y2={y} className="long-term-projection-gridline" />
        ))}
        <polygon points={area} fill="url(#long-term-projection-fill)" />
        <polyline points={line} className="long-term-projection-line" />
        {coordinates.slice(1).map((point, index) => (
          <circle
            key={chartPoints[index + 1].years}
            cx={point.x}
            cy={point.y}
            r="4"
            className="long-term-projection-dot"
            tabIndex={0}
            aria-label={`${chartPoints[index + 1].years} años: ${formatCurrency(chartPoints[index + 1].balance)}`}
          >
            <title>{`A ${chartPoints[index + 1].years} años · Saldo estimado: ${formatCurrency(chartPoints[index + 1].balance)} · Crecimiento desde hoy: ${formatCurrency(chartPoints[index + 1].balance - currentBalance)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="long-term-projection-years">
        {chartPoints.map((point) => {
          const position = `${(point.years / maxYears) * 100}%`
          return (
            <span
              key={point.years}
              style={{
                left: position,
                transform: point.years === 0 ? 'none' : point.years === maxYears ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {point.years === 0 ? 'Hoy' : `${point.years} años`}
            </span>
          )
        })}
      </div>
      <div className="long-term-projection-values">
        {points.map((point) => (
          <article key={point.years}>
            <span>{point.years} años</span>
            <strong>{formatCurrency(point.balance)}</strong>
          </article>
        ))}
      </div>
    </div>
  )
}
