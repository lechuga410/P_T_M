import type { PatrimonialGoal } from '../lib/patrimonialGoals'

interface PatrimonialGoalsRoadmapProps {
  goals: PatrimonialGoal[]
  currentTotal: number
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)

const formatAchievedDate = (value: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export function PatrimonialGoalsRoadmap({ goals, currentTotal }: PatrimonialGoalsRoadmapProps) {
  const activeGoal = goals.find((goal) => !goal.achievedAt)
  const achievedGoals = goals.filter((goal) => goal.achievedAt).reverse()
  const progress = activeGoal
    ? Math.min((currentTotal / activeGoal.targetAmount) * 100, 100)
    : 0
  const routePoints = [
    { x: 16, y: 174 },
    { x: 55, y: 170 },
    { x: 72, y: 132 },
    { x: 105, y: 132 },
    { x: 148, y: 132 },
    { x: 164, y: 158 },
    { x: 188, y: 112 },
    { x: 225, y: 80 },
    { x: 263, y: 91 },
    { x: 300, y: 80 },
    { x: 315, y: 35 },
    { x: 344, y: 20 },
  ]
  const routePosition = (progress / 100) * (routePoints.length - 1)
  const routeSegment = Math.min(Math.floor(routePosition), routePoints.length - 2)
  const routeSegmentProgress = routePosition - routeSegment
  const currentPosition = {
    x: routePoints[routeSegment].x + (routePoints[routeSegment + 1].x - routePoints[routeSegment].x) * routeSegmentProgress,
    y: routePoints[routeSegment].y + (routePoints[routeSegment + 1].y - routePoints[routeSegment].y) * routeSegmentProgress,
  }

  const from = routePoints[routeSegment]
  const to = routePoints[routeSegment + 1]
  const planeAngle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI) * 0.75

  return (
    <article className="panel roadmap-panel">
      <div className="section-heading">
        <div><span className="section-kicker">TU CAMINO</span><h2>Ruta a tu meta</h2></div>
        <span className="roadmap-status">{activeGoal ? 'EN MARCHA' : 'LISTA PARA EMPEZAR'}</span>
      </div>

      <div className="roadmap-map" role="img" aria-label={activeGoal
        ? `Ruta hacia ${formatCurrency(activeGoal.targetAmount)}, avance ${progress.toFixed(0)} por ciento`
        : 'Ruta patrimonial lista para fijar un nuevo hito'}>
        <svg className="roadmap-route" viewBox="0 0 360 190" preserveAspectRatio="none" aria-hidden="true">
          <path className="roadmap-route-base" d="M16 174 C68 174 53 132 105 132 S164 158 188 112 S236 76 263 91 S289 25 344 20" pathLength="100" />
          {activeGoal && <path className="roadmap-route-progress" d="M16 174 C68 174 53 132 105 132 S164 158 188 112 S236 76 263 91 S289 25 344 20" pathLength="100" style={{ strokeDasharray: `${progress} 100` }} />}
          <circle className="roadmap-landmark" cx="105" cy="132" r="5" />
          <circle className="roadmap-landmark" cx="263" cy="91" r="5" />
          <circle className={activeGoal ? 'roadmap-target-marker active' : 'roadmap-target-marker'} cx="344" cy="20" r="9" />
        </svg>
        <div className="roadmap-start"><span>HOY</span><strong>{formatCurrency(currentTotal)}</strong></div>
        <div className="roadmap-target">
          <span>{activeGoal ? 'SIGUIENTE HITO' : 'PRÓXIMO HITO'}</span>
          <strong>{activeGoal ? formatCurrency(activeGoal.targetAmount) : 'Fija tu meta'}</strong>
        </div>
        <span className="roadmap-flag" aria-hidden="true">⚑</span>
        {activeGoal && (
          <div
            className="roadmap-plane"
            style={{ left: `${(currentPosition.x / 360) * 100}%`, top: `${(currentPosition.y / 190) * 100}%` }}
          >
            <svg className="roadmap-plane-icon" viewBox="0 0 64 64" style={{ transform: `rotate(${planeAngle}deg)` }} aria-hidden="true">
              <path d="M60 32c0-2.2-5-4-9-4H38L22 6h-6l8 22H12l-4-7H3l3 11-3 11h5l4-7h12l-8 22h6l16-22h13c4 0 9-1.800 9-4z" />
              <path className="roadmap-plane-window" d="M50 30h6M44 30h2M38 30h2" />
            </svg>
            <span className="roadmap-progress-label">{progress.toLocaleString('es-CO', { maximumFractionDigits: 0 })}%</span>
          </div>
        )}
      </div>

      {activeGoal ? (
        <div className="roadmap-active-meta">
          <span>{formatCurrency(Math.max(activeGoal.targetAmount - currentTotal, 0))} para alcanzar tu meta</span>
          <strong>Meta fijada el {formatAchievedDate(activeGoal.createdAt)}</strong>
        </div>
      ) : (
        <div className="roadmap-active-meta">
          <span>Tu ruta está lista</span>
          <strong>Define tu siguiente hito en Meta patrimonial.</strong>
        </div>
      )}

      {achievedGoals.length > 0 && (
        <div className="roadmap-history">
          <h3>Hitos alcanzados</h3>
          <ol>
            {achievedGoals.map((goal) => (
              <li key={goal.id}>
                <span className="roadmap-history-check">✓</span>
                <span><strong>{formatCurrency(goal.targetAmount)}</strong><small>Alcanzada el {formatAchievedDate(goal.achievedAt ?? goal.createdAt)}</small></span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  )
}
