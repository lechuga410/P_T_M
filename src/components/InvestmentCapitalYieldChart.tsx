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
    <div className="capital-yield-chart">
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
        {coordinates.map((point, index) => (
          <g key={`${points[index].timestamp}-${index}`}>
            <circle cx={point.x} cy={point.principalY} r="3" className="capital-yield-dot principal">
              <title>{`${points[index].label} · Capital aportado: ${formatCurrency(points[index].principal)}`}</title>
            </circle>
            <circle cx={point.x} cy={point.earnedY} r="3" className="capital-yield-dot earned">
              <title>{`${points[index].label} · Rendimiento: ${formatCurrency(points[index].earned)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="capital-yield-scales bottom">
        <span>{formatCurrency(0)}</span>
      </div>
      <div className="capital-yield-labels">
        {points.filter((_, index) => index % labelStep === 0 || index === points.length - 1).map((point) => (
          <span key={`${point.timestamp}-${point.label}`}>{point.label}</span>
        ))}
      </div>
    </div>
  )
}
