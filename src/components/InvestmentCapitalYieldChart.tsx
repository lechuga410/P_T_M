import { useChartTooltip } from './ChartTooltip'
import type { InvestmentHistoryPoint } from '../lib/investmentPerformance'

interface InvestmentCapitalYieldChartProps {
  points: InvestmentHistoryPoint[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  }).format(amount)

export function InvestmentCapitalYieldChart({ points }: InvestmentCapitalYieldChartProps) {
  const { containerRef, show, hide, tooltip } = useChartTooltip<HTMLDivElement>()
  if (points.length === 0) {
    return <p className="capital-yield-empty">No hay datos para el periodo seleccionado.</p>
  }

  const maxValue = Math.max(...points.flatMap((point) => [point.principal, point.earned]), 1)
  const scaleMax = maxValue * 1.08
  const coordinates = points.map((point, index) => ({
    x: 12 + (index / Math.max(points.length - 1, 1)) * 976,
    principalY: 162 - (point.principal / scaleMax) * 130,
    earnedY: 162 - (point.earned / scaleMax) * 130,
  }))
  const principalLine = coordinates.map((point) => `${point.x},${point.principalY}`).join(' ')
  const earnedLine = coordinates.map((point) => `${point.x},${point.earnedY}`).join(' ')
  const labelStep = Math.max(1, Math.ceil((points.length - 1) / 6))
  const latest = points[points.length - 1]

  return (
    <div className="capital-yield-chart chart-tooltip-host" ref={containerRef}>
      <div className="capital-yield-legend">
        <span><i className="capital-yield-key principal" />Capital aportado <strong>{formatCurrency(latest.principal)}</strong></span>
        <span><i className="capital-yield-key earned" />Rendimiento <strong>{formatCurrency(latest.earned)}</strong></span>
      </div>
      <div className="capital-yield-scales">
        <span>{formatCurrency(scaleMax)}</span>
      </div>
      <svg
        viewBox="0 0 1000 190"
        preserveAspectRatio="none"
        role="img"
        aria-label="Capital aportado y rendimiento en una escala monetaria común"
      >
        {[30, 74, 118, 162].map((y) => (
          <line key={y} x1="12" x2="988" y1={y} y2={y} className="capital-yield-gridline" />
        ))}
        <polyline points={principalLine} className="capital-yield-line principal" />
        <polyline points={earnedLine} className="capital-yield-line earned" />
        {coordinates.map((point, index) => {
          const current = points[index]
          const content = {
            title: current.label,
            valueLabel: 'Saldo total',
            value: formatCurrency(current.total),
            rows: [
              { label: 'Capital aportado', value: formatCurrency(current.principal), color: '#337fa2' },
              { label: 'Rendimiento', value: formatCurrency(current.earned), color: '#d49a4d' },
              { label: 'Rendimiento / capital', value: `${(current.principal > 0 ? (current.earned / current.principal) * 100 : 0).toFixed(3)} %`, color: '#79ceb7' },
            ],
          }
          const handlers = {
            onMouseEnter: show(content),
            onMouseMove: show(content),
            onMouseLeave: hide,
            onFocus: show(content),
            onBlur: hide,
          }
          return (
            <g key={`${current.timestamp}-${index}`}>
              <line x1={point.x} x2={point.x} y1="30" y2="162" className="chart-guide chart-guide-hover" />
              <circle cx={point.x} cy={point.principalY} r="3" className="capital-yield-dot principal" />
              <circle cx={point.x} cy={point.earnedY} r="3" className="capital-yield-dot earned" />
              <rect
                x={point.x - Math.max(6, 488 / points.length)}
                y="0"
                width={Math.max(12, 976 / points.length)}
                height="190"
                fill="transparent"
                className="chart-hit"
                tabIndex={0}
                aria-label={`${current.label}: capital ${formatCurrency(current.principal)}, rendimiento ${formatCurrency(current.earned)}`}
                {...handlers}
              />
            </g>
          )
        })}
      </svg>
      <div className="capital-yield-scales bottom">
        <span>{formatCurrency(0)}</span>
      </div>
      <div className="capital-yield-labels">
        {points.filter((_, index) => index % labelStep === 0 || index === points.length - 1).map((point) => (
          <span key={`${point.timestamp}-${point.label}`}>{point.label}</span>
        ))}
      </div>
      {tooltip}
    </div>
  )
}
