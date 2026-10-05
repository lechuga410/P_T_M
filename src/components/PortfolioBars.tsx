interface BarPoint {
  label: string
  value: number
  color: string
}

interface PortfolioBarsProps {
  data: BarPoint[]
}

export function PortfolioBars({ data }: PortfolioBarsProps) {
  const maxValue = Math.max(...data.map((item) => item.value), 1)

  return (
    <div className="portfolio-bars" aria-label="Resumen de distribución del portafolio">
      {data.map((item) => (
        <div className="bar-group" key={item.label}>
          <div className="bar-meta">
            <span>{item.label}</span>
            <strong>{item.value}%</strong>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / maxValue) * 100}%`, background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}
