import type { Movement } from '../types'

interface FlightFuelBudgetProps {
  totalPatrimony: number
  movements: Movement[]
  now: Date
}

const CELLS = 24
const ALLOWANCE_RATE = 0.05

const currency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)

export function FlightFuelBudget({ totalPatrimony, movements, now }: FlightFuelBudgetProps) {
  const allowance = Math.max(totalPatrimony, 0) * ALLOWANCE_RATE
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const spent = movements
    .filter((movement) => movement.direction === 'expense' && movement.date.startsWith(monthKey))
    .reduce((sum, movement) => sum + movement.amount, 0)
  const remaining = allowance - spent
  const fuel = allowance > 0 ? Math.max(0, Math.min(remaining / allowance, 1)) : 0
  const litCells = Math.ceil(fuel * CELLS)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const burnPerDay = spent / Math.max(now.getDate(), 1)
  const endurance = burnPerDay > 0 && remaining > 0 ? Math.floor(remaining / burnPerDay) : undefined
  const reachesMonthEnd = endurance === undefined || endurance >= daysInMonth - now.getDate()
  const state = remaining <= 0 ? 'empty' : fuel < 0.25 || !reachesMonthEnd ? 'reserve' : 'nominal'
  const status = {
    nominal: { code: 'VUELO NOMINAL', text: 'Margen suficiente. Mantén el rumbo.' },
    reserve: { code: 'COMBUSTIBLE EN RESERVA', text: 'A este ritmo no llegas a fin de mes. Reduce la velocidad.' },
    empty: { code: 'SIN COMBUSTIBLE · ATERRIZA', text: 'Superaste tu 5 % del mes. Cada gasto extra es fuego amigo.' },
  }[state]

  return (
    <section className={`panel flight-fuel flight-fuel-${state}`} aria-label="Combustible de misión: 5 % del patrimonio">
      <div className="flight-fuel-radar" aria-hidden="true" />
      <header className="flight-fuel-header">
        <div>
          <span className="flight-fuel-kicker">PARTE DE VUELO · {now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }).toUpperCase()}</span>
          <h2>Combustible de misión</h2>
          <p>El 5 % de tu patrimonio es tu techo de gasto. Lo demás es capital que no se toca.</p>
        </div>
        <div className="flight-fuel-status"><i aria-hidden="true" />{status.code}</div>
      </header>

      <div className="flight-fuel-body">
        <div className="flight-fuel-main">
          <span>AUTORIZADO PARA GASTAR</span>
          <strong>{currency(allowance)}</strong>
          <small>5 % de {currency(totalPatrimony)}</small>
        </div>

        <div className="flight-fuel-gauge-wrap">
          <div className="flight-fuel-scale" aria-hidden="true"><span>E</span><span>¼</span><span>½</span><span>¾</span><span>F</span></div>
          <div className="flight-fuel-gauge" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fuel * 100)} aria-label="Combustible restante">
            {Array.from({ length: CELLS }, (_, index) => (
              <span key={index} className={index < litCells ? 'cell lit' : 'cell'} style={{ ['--i' as string]: index }} />
            ))}
          </div>
          <div className="flight-fuel-readout">
            <span>{Math.round(fuel * 100)}% de combustible</span>
            <span>{status.text}</span>
          </div>
        </div>

        <dl className="flight-fuel-stats">
          <div><dt>Consumido</dt><dd>{currency(spent)}</dd></div>
          <div><dt>{remaining >= 0 ? 'Disponible' : 'Exceso'}</dt><dd>{currency(Math.abs(remaining))}</dd></div>
          <div><dt>Autonomía</dt><dd>{spent === 0 ? 'Máxima' : remaining <= 0 ? '0 días' : reachesMonthEnd ? 'Hasta fin de mes' : `${endurance} días`}</dd></div>
        </dl>
      </div>
    </section>
  )
}