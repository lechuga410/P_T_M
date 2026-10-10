import type { CSSProperties } from 'react'
import type { Investment } from '../types'
import type { InvestmentPerformance } from '../lib/investmentPerformance'

interface InvestmentsShowcaseProps {
  investments: Investment[]
  performances: Map<string, InvestmentPerformance>
  onOpen: (investmentId: string) => void
  onCreate: () => void
}

const cop = (amount: number, digits = 0) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount)

const isNu = (investment: Investment) => /\b(nu|cajita)\b/i.test(`${investment.name} ${investment.institution}`)
const dailyRate = (annualYield: number) => Math.pow(1 + annualYield / 100, 1 / 365) - 1
const FALLBACK_ACCENTS = ['#2b6cb0', '#0f766e', '#b7791f', '#7c3aed', '#be123c']

function Sparkline({ values, id }: { values: number[]; id: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * 200,
    34 - ((value - min) / span) * 28,
  ])
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]
  return (
    <svg className="inv2-spark" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L200 40 L0 40 Z`} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="2.4" fill="#fff" />
    </svg>
  )
}

function NuCard({ investment, performance, onOpen }: { investment: Investment; performance?: InvestmentPerformance; onOpen: () => void }) {
  const perDay = investment.value * dailyRate(investment.annualYield)
  const trend = performance?.trend.map((point) => point.value) ?? []
  return (
    <button type="button" className="inv2-nu" onClick={onOpen} aria-label={`Abrir ${investment.name}`}>
      <span className="inv2-nu-glow" aria-hidden="true" />
      <span className="inv2-nu-top">
        <span className="inv2-nu-brand">nu</span>
        <span className="inv2-nu-badge">{investment.verifiedAt ? 'Saldo confirmado' : 'Estimado'}</span>
      </span>
      <span className="inv2-nu-chip-row" aria-hidden="true">
        <span className="inv2-chip"><i /><i /><i /><i /></span>
        <svg className="inv2-contactless" viewBox="0 0 24 24"><path d="M7 6c3 3.5 3 8.500 0 12M11 4c4.500 5 4.500 11 0 16M15 2c6 6.500 6 13.500 0 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </span>
      <span className="inv2-nu-label">{investment.name.toUpperCase()}</span>
      <strong className="inv2-nu-balance">{cop(investment.value, 4)}</strong>
      <Sparkline values={trend} id={investment.id} />
      <span className="inv2-nu-stats">
        <span><small>Rendimiento</small><b>{investment.annualYield}% EA</b></span>
        <span><small>Interés por día</small><b>+{cop(perDay, 2)}</b></span>
        <span><small>Ganado</small><b>+{cop(investment.growth, 2)}</b></span>
      </span>
      <span className="inv2-nu-open">Abrir cuenta <b aria-hidden="true">→</b></span>
    </button>
  )
}

export function InvestmentsShowcase({ investments, performances, onOpen, onCreate }: InvestmentsShowcaseProps) {
  const total = investments.reduce((sum, investment) => sum + investment.value, 0)
  const weightedYield = total > 0
    ? investments.reduce((sum, investment) => sum + investment.value * investment.annualYield, 0) / total
    : 0
  const perDayTotal = investments.reduce((sum, investment) => sum + investment.value * dailyRate(investment.annualYield), 0)
  const earnedTotal = investments.reduce((sum, investment) => sum + investment.growth, 0)
  const nuAccounts = investments.filter(isNu)
  const others = investments.filter((investment) => !isNu(investment))

  return (
    <div className="inv2">
      <section className="inv2-hero">
        <span className="inv2-hero-grid" aria-hidden="true" />
        <span className="inv2-hero-radar" aria-hidden="true" />
        <div className="inv2-hero-main">
          <span className="inv2-kicker">CENTRO DE MANDO · CAPITAL INVERTIDO</span>
          <strong className="inv2-total">{cop(total)}</strong>
          <p>{investments.length ? 'Tu capital trabajando mientras duermes. Cada cuenta tiene su propio frente.' : 'Aún no hay capital en el tablero.'}</p>
          <button type="button" className="inv2-create" onClick={onCreate}><span aria-hidden="true">＋</span> Registrar inversión</button>
        </div>
        <dl className="inv2-hero-stats">
          <div><dt>Cuentas</dt><dd>{String(investments.length).padStart(2, '0')}</dd></div>
          <div><dt>Rendimiento medio</dt><dd>{weightedYield.toFixed(2)}%<small> EA</small></dd></div>
          <div><dt>Interés por día</dt><dd>+{cop(perDayTotal)}</dd></div>
          <div><dt>Ganado a la fecha</dt><dd>+{cop(earnedTotal)}</dd></div>
        </dl>
      </section>

      {investments.length ? (
        <>
          {nuAccounts.length ? (
            <section className="inv2-section">
              <header className="inv2-section-head"><span>CAJITAS</span><i /></header>
              <div className="inv2-nu-grid">
                {nuAccounts.map((investment) => (
                  <NuCard key={investment.id} investment={investment} performance={performances.get(investment.id)} onOpen={() => onOpen(investment.id)} />
                ))}
              </div>
            </section>
          ) : null}

          {others.length ? (
            <section className="inv2-section">
              <header className="inv2-section-head"><span>OTRAS POSICIONES</span><i /></header>
              <div className="inv2-grid">
                {others.map((investment, index) => {
                  const share = total > 0 ? (investment.value / total) * 100 : 0
                  const accent = investment.accent || FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length]
                  return (
                    <button type="button" key={investment.id} className="inv2-card" style={{ '--accent': accent } as CSSProperties} onClick={() => onOpen(investment.id)}>
                      <span className="inv2-card-top">
                        <span className="inv2-card-inst">{investment.institution} · {investment.type}</span>
                        <span className={`inv2-card-status${investment.verifiedAt || investment.status === 'real' ? ' is-real' : ''}`}>
                          {investment.verifiedAt ? 'Confirmado' : investment.status === 'real' ? 'Dato real' : 'Estimado'}
                        </span>
                      </span>
                      <strong className="inv2-card-name">{investment.name}</strong>
                      <span className="inv2-card-balance">{cop(investment.value, 2)}</span>
                      <span className="inv2-share" aria-label={`${share.toFixed(1)}% del portafolio`}>
                        <span style={{ width: `${Math.min(share, 100)}%` }} />
                      </span>
                      <span className="inv2-card-foot">
                        <span>{share.toFixed(1)}% del portafolio</span>
                        <span>{investment.annualYield}% EA</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="inv2-empty">
          <strong>Tu portafolio empieza aquí</strong>
          <p>Registra la primera inversión y tendrá su propio espacio para consultar movimientos y evolución.</p>
          <button type="button" className="inv2-create" onClick={onCreate}>Registrar primera inversión <span aria-hidden="true">→</span></button>
        </section>
      )}
    </div>
  )
}
