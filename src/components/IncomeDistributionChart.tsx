import type { IncomeActivityShare } from '../lib/finance'

interface IncomeDistributionChartProps {
  data: IncomeActivityShare[]
  total: number
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)

export function IncomeDistributionChart({ data, total }: IncomeDistributionChartProps) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const segments = data.map((item, index) => ({
    ...item,
    offset: data.slice(0, index).reduce((sum, previous) => sum + (previous.percentage / 100) * circumference, 0),
  }))

  return (
    <div className="income-distribution">
      <div className="income-donut-wrap">
        <svg className="income-donut" viewBox="0 0 100 100" role="img" aria-label="Distribución porcentual de ingresos por actividad">
          <circle className="income-donut-track" cx="50" cy="50" r={radius} />
          {segments.map((item) => {
            const segmentLength = (item.percentage / 100) * circumference
            return (
              <circle
                key={item.activity}
                className="income-donut-segment"
                cx="50"
                cy="50"
                r={radius}
                stroke={item.color}
                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                strokeDashoffset={-item.offset}
              />
            )
          })}
        </svg>
        <div className="income-donut-center">
          <span>INGRESOS</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>
      <div className="income-distribution-list">
        {data.map((item) => (
          <div className="income-distribution-row" key={item.activity}>
            <span className="income-distribution-name"><i style={{ backgroundColor: item.color }} />{item.activity}</span>
            <strong>{item.percentage.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%</strong>
            <small>{formatCurrency(item.amount)}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
