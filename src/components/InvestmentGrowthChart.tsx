import type { InvestmentTrendPoint } from '../lib/investmentPerformance'

interface InvestmentGrowthChartProps {
  points: InvestmentTrendPoint[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  }).format(amount)

export function InvestmentGrowthChart({ points }: InvestmentGrowthChartProps) {
  if (points.length === 0) {
    return <p className="capital-yield-empty">No hay datos para el periodo seleccionado.</p>
  }

  const max = Math.max(...points.map((point) => point.value), 1)
  const min = Math.min(...points.map((point) => point.value))
  const range = Math.max(max - min, 1)
  const coordinates = points.map((point, index) => ({
    x: 12 + (index / Math.max(points.length - 1, 1)) * 976,
    y: 162 - ((point.value - min) / range) * 132,
  }))
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `12,170 ${line} 988,170`
  const labelStep = Math.max(1, Math.ceil((points.length - 1) / 6))

  return (
    <div className="investment-growth-chart">
      <div className="investment-chart-values">
        <span>{formatCurrency(min)}</span>
        <strong>{formatCurrency(max)}</strong>
      </div>
      <svg viewBox="0 0 1000 190" preserveAspectRatio="none" role="img" aria-label="Evolución del saldo en el periodo seleccionado">
        <defs>
          <linearGradient id="investment-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4d8bd2" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#4d8bd2" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[30, 75, 120, 165].map((y) => <line key={y} x1="12" x2="988" y1={y} y2={y} className="investment-chart-gridline" />)}
        <polygon points={area} fill="url(#investment-chart-fill)" />
        <polyline points={line} className="investment-chart-line" />
        {coordinates.map((point, index) => (
          <circle
            key={`${points[index].label}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === coordinates.length - 1 ? 5 : 3}
            className={index === coordinates.length - 1 ? 'investment-chart-dot current' : 'investment-chart-dot'}
          >
            <title>{`${points[index].label}: ${formatCurrency(points[index].value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="investment-chart-labels">
        {points.filter((_, index) => index % labelStep === 0 || index === points.length - 1).map((point, index) => (
          <span key={`${point.label}-${index}`}>{point.label}</span>
        ))}
      </div>
    </div>
  )
}
