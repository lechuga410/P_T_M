interface MetricCardProps {
  label: string
  value: string
  change: string
  tone?: 'positive' | 'neutral' | 'warning'
}

export function MetricCard({ label, value, change, tone = 'positive' }: MetricCardProps) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className={`metric-change tone-${tone}`}>{change}</span>
    </div>
  )
}
