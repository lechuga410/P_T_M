import { useChartTooltip } from './ChartTooltip'
interface GrowthPoint {
  label: string
  value: number
  timestamp?: number
}

interface InvestmentGrowthChartProps {
  points: GrowthPoint[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  }).format(amount)

export function InvestmentGrowthChart({ points }: InvestmentGrowthChartProps) {
  const { containerRef, show, hide, tooltip } = useChartTooltip<HTMLDivElement>()
  if (points.length === 0) {
    return <p className="capital-yield-empty">No hay datos para el periodo seleccionado.</p>
  }

  const max = Math.max(...points.map((point) => point.value), 1)
  const min = Math.min(...points.map((point) => point.value))
  const range = Math.max(max - min, 1)
  const first = points[0].timestamp
  const span = (points.at(-1)?.timestamp ?? 0) - (first ?? 0)
  const byTime = first !== undefined && points.every((point) => point.timestamp !== undefined) && span > 0
  const coordinates = points.map((point, index) => ({
    x: 12 + (byTime ? ((point.timestamp as number) - (first as number)) / span : index / Math.max(points.length - 1, 1)) * 976,
    y: 162 - ((point.value - min) / range) * 132,
  }))
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `12,170 ${line} 988,170`
  const labelStep = Math.max(1, Math.ceil((points.length - 1) / 6))

  return (
    <div className="investment-growth-chart chart-tooltip-host" ref={containerRef}>
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
        {coordinates.map((point, index) => {
          const previous = points[index - 1]
          const delta = previous ? points[index].value - previous.value : 0
          const content = {
            title: points[index].label,
            valueLabel: 'Capital estimado',
            value: formatCurrency(points[index].value),
            rows: previous
              ? [{ label: 'Variación vs. punto anterior', value: `${delta >= 0 ? '+' : ''}${formatCurrency(delta)}`, color: delta >= 0 ? '#79ceb7' : '#e08a8a' }]
              : undefined,
            badges: index === coordinates.length - 1 ? ['Último punto'] : undefined,
          }
          return (
            <g key={`${points[index].label}-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={index === coordinates.length - 1 ? 5 : 3}
                className={index === coordinates.length - 1 ? 'investment-chart-dot current' : 'investment-chart-dot'}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="11"
                fill="transparent"
                className="chart-hit"
                tabIndex={0}
                aria-label={`${points[index].label}: ${formatCurrency(points[index].value)}`}
                onMouseEnter={show(content)}
                onMouseMove={show(content)}
                onMouseLeave={hide}
                onFocus={show(content)}
                onBlur={hide}
              />
            </g>
          )
        })}
      </svg>
      <div className="investment-chart-labels positioned">
        {points.map((point, index) => ({ point, index })).filter(({ index }) => index % labelStep === 0 || index === points.length - 1).filter(({ index }, _, all) => {
          const lastX = coordinates[points.length - 1].x
          return index === points.length - 1 || index === 0 || (lastX - coordinates[index].x > 140 && coordinates[index].x - coordinates[0].x > 140 && all.length > 0)
        }).map(({ point, index }) => (
          <span key={`${point.label}-${index}`} className={index === 0 ? 'first' : index === points.length - 1 ? 'last' : undefined} style={{ left: `${(coordinates[index].x / 1000) * 100}%` }}>{point.label}</span>
        ))}
      </div>
      {tooltip}
    </div>
  )
}
