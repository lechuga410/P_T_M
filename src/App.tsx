import { type FormEvent, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { FinancialImportDialog } from './components/FinancialImportDialog'
import { DailyInterestChart } from './components/DailyInterestChart'
import { InvestmentCapitalYieldChart } from './components/InvestmentCapitalYieldChart'
import { IncomeDistributionChart } from './components/IncomeDistributionChart'
import { InvestmentGrowthChart } from './components/InvestmentGrowthChart'
import { LongTermProjectionChart } from './components/LongTermProjectionChart'
import { PatrimonialGoalsRoadmap } from './components/PatrimonialGoalsRoadmap'
import { FlightFuelBudget } from './components/FlightFuelBudget'
import { MonthlyFlowChart } from './components/MonthlyFlowChart'
import { PortfolioBars } from './components/PortfolioBars'
import nuCajitaImage from '../imagenes/cajita_nu.jfif'
import type { ImportedTransaction } from './lib/financialImport'
import { InvestmentsShowcase } from './components/InvestmentsShowcase'
import { YieldRateInput } from './components/YieldRateInput'
import { withYieldChange } from './lib/yieldRates'
import { parseCopAmount } from './lib/currencyInput'
import { calculateInvestmentHistory, calculateInvestmentPerformance, withCurrentInvestmentPerformance } from './lib/investmentPerformance'
import { AVAILABLE_ACCOUNT_ID, affectsInvestment, signedFlowAmount, WITHDRAWAL_CATEGORY, WITHDRAWAL_RECEIVED_CATEGORY } from './lib/investmentFlows'
import {
  appendDailyInterestSnapshots,
  buildDailyInterestProjection,
  DAILY_INTEREST_STORAGE_KEY,
  estimateInvestmentBalanceNow,
  loadDailyInterestHistory,
} from './lib/dailyInterestHistory'
import type { DailyInterestSnapshot } from './lib/dailyInterestHistory'
import {
  completeReachedGoals,
  createPatrimonialGoal,
  loadPatrimonialGoals,
  PATRIMONIAL_GOALS_STORAGE_KEY,
} from './lib/patrimonialGoals'
import type { PatrimonialGoal } from './lib/patrimonialGoals'
import {
  buildIncomeActivityBreakdown,
  buildPeriodBreakdown,
  calculateMovementSummary,
  calculatePortfolioSummary,
  createInvestment,
  createMovement,
  MOVEMENTS_STORAGE_KEY,
  STORAGE_KEY,
} from './lib/finance'
import type { Investment, Movement } from './types'
import './App.css'

const colors = ['#2459a6', '#557fc1', '#6b78b9', '#3182ce', '#8296b2', '#3d668f']

type SectionId = 'dashboard' | 'investments' | 'new-investment' | 'investment-detail' | 'movements' | 'projections'
type ChartHorizon = '7d' | '1' | '3' | '6' | '12' | 'all' | 'custom'
const HORIZON_OPTIONS = [['7d', '7 días'], ['1', '1 mes'], ['3', '3 meses'], ['6', '6 meses'], ['12', '12 meses'], ['all', 'Desde apertura'], ['custom', 'Personalizado']] as const
const MIN_CHART_SPAN_MS = 60 * 60 * 1000
type DailyInterestHorizon = 'daily' | '7' | '30' | '90' | '180' | '365' | 'custom'

interface AppRoute {
  section: SectionId
  investmentId?: string
}

const sections: { id: SectionId; label: string; icon: 'grid' | 'wallet' | 'add' | 'arrows' | 'target' }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'investments', label: 'Inversiones', icon: 'wallet' },
  { id: 'new-investment', label: 'Registrar inversión', icon: 'add' },
  { id: 'movements', label: 'Movimientos', icon: 'arrows' },
  { id: 'projections', label: 'Proyecciones', icon: 'target' },
]

function NavIcon({ name }: { name: (typeof sections)[number]['icon'] }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2.5" /><path d="M3 9h18M16 14h2" /><path d="M6 5V4a1 1 0 0 1 1-1h11" /></>,
    add: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
    arrows: <><path d="M7 7h13l-3-3M17 17H4l3 3" /><path d="M20 7v4M4 17v-4" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  }).format(amount)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatLocalDateTime = (value: Date) => {
  const date = formatLocalDate(value)
  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const seconds = String(value.getSeconds()).padStart(2, '0')
  const milliseconds = String(value.getMilliseconds()).padStart(3, '0')
  return `${date}T${hours}:${minutes}:${seconds}.${milliseconds}`
}

const dateBeforeMonths = (value: Date, months: number) => {
  const targetDay = value.getDate()
  const result = new Date(value)
  result.setDate(1)
  result.setMonth(result.getMonth() - months)
  const finalDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(targetDay, finalDay))
  return result
}

const dateBeforeDays = (value: Date, days: number) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() - days)

const horizonStart = (horizon: ChartHorizon, now: Date): number =>
  horizon === '7d' ? now.getTime() - 7 * 24 * 60 * 60 * 1000 : horizon === 'all' ? 0 : dateBeforeMonths(now, Number(horizon)).getTime()

const formatPreciseCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

const formatLiveCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(amount)

const formatVerifiedAt = (value: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'America/Bogota',
  }).format(new Date(value))

const loadCollection = <T extends { id: string }>(key: string, exampleIds: string[]): T[] => {
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is T => Boolean(item && typeof item.id === 'string' && !exampleIds.includes(item.id)))
  } catch (error) {
    console.error(`No se pudieron leer los datos locales (${key}).`, error)
    return []
  }
}

const investmentExamples = ['nu-cajita', 'meta-ahorro', 'cuenta-banco']
const movementExamples = ['mov-1', 'mov-2', 'mov-3', 'mov-4', 'mov-5', 'mov-6']

function readRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const investmentMatch = hash.match(/^investment\/(.+)$/)
  if (investmentMatch) {
    try {
      return { section: 'investment-detail', investmentId: decodeURIComponent(investmentMatch[1]) }
    } catch {
      return { section: 'investments' }
    }
  }

  const validSections: SectionId[] = ['dashboard', 'investments', 'new-investment', 'movements', 'projections']
  return validSections.includes(hash as SectionId) ? { section: hash as SectionId } : { section: 'dashboard' }
}

const TICK_INTERVAL_MS = 1_000

const applyValueDeltas = (investments: Investment[], deltas: Map<string, number>): Investment[] =>
  investments.map((investment) => {
    const delta = deltas.get(investment.id)
    if (!delta) return investment
    const value = Math.max(investment.value + delta, 0)
    return {
      ...investment,
      value,
      monthlyIncome: investment.type === 'Disponible' ? 0 : (value * (investment.annualYield / 100)) / 12,
    }
  })

// Un retiro resta de la inversión origen y, si hay destino, suma ese mismo monto al dinero disponible.
const withWithdrawalReceipt = (withdrawal: Movement, destinationInvestmentId?: string): Movement[] => {
  if (!destinationInvestmentId) return [withdrawal]
  const received = createMovement({
    title: `Retiro recibido · ${withdrawal.title}`,
    amount: withdrawal.amount,
    direction: 'transfer',
    category: WITHDRAWAL_RECEIVED_CATEGORY,
    date: withdrawal.date,
    time: withdrawal.time,
    investmentId: destinationInvestmentId,
    sourceFile: withdrawal.sourceFile,
  })
  return [
    { ...withdrawal, relatedMovementId: withdrawal.relatedMovementId ?? received.id },
    { ...received, relatedMovementId: withdrawal.id },
  ]
}

// Sustituye el marcador de "Dinero disponible" por la cuenta real, creándola si todavía no existe.
const resolveAvailableAccount = (investments: Investment[], movements: Movement[]): { investments: Investment[]; movements: Movement[] } => {
  if (!movements.some((movement) => movement.investmentId === AVAILABLE_ACCOUNT_ID)) return { investments, movements }
  let account = investments.find((investment) => investment.type.toLowerCase() === 'disponible')
  let nextInvestments = investments
  if (!account) {
    account = {
      id: crypto.randomUUID(),
      name: 'Dinero disponible',
      institution: 'Cuenta de ahorros',
      type: 'Disponible',
      value: 0,
      growth: 0,
      monthlyIncome: 0,
      annualYield: 0,
      status: 'real',
      accent: '#a78bfa',
      date: movements.find((movement) => movement.investmentId === AVAILABLE_ACCOUNT_ID)?.date ?? new Date().toISOString().slice(0, 10),
    }
    nextInvestments = [...investments, account]
  }
  const accountId = account.id
  return {
    investments: nextInvestments,
    movements: movements.map((movement) => movement.investmentId === AVAILABLE_ACCOUNT_ID ? { ...movement, investmentId: accountId } : movement),
  }
}

function App() {
  const [now, setNow] = useState(() => new Date())
  const [route, setRoute] = useState<AppRoute>(readRoute)
  const activeSection = route.section
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [investments, setInvestments] = useState<Investment[]>(() => loadCollection(STORAGE_KEY, investmentExamples))
  const [movements, setMovements] = useState<Movement[]>(() => loadCollection(MOVEMENTS_STORAGE_KEY, movementExamples))
  const [dailyInterestHistory, setDailyInterestHistory] = useState<DailyInterestSnapshot[]>(loadDailyInterestHistory)
  const [patrimonialGoals, setPatrimonialGoals] = useState<PatrimonialGoal[]>(loadPatrimonialGoals)
  const [period, setPeriod] = useState(6)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [balanceChartHorizon, setBalanceChartHorizon] = useState<ChartHorizon>('all')
  const [balanceCustomStart, setBalanceCustomStart] = useState(() => formatLocalDate(dateBeforeMonths(now, 12)))
  const [balanceCustomEnd, setBalanceCustomEnd] = useState(() => formatLocalDate(now))
  const [breakdownChartHorizon, setBreakdownChartHorizon] = useState<ChartHorizon>('12')
  const [breakdownCustomStart, setBreakdownCustomStart] = useState(() => formatLocalDate(dateBeforeMonths(now, 12)))
  const [breakdownCustomEnd, setBreakdownCustomEnd] = useState(() => formatLocalDate(now))
  const [dailyInterestHorizon, setDailyInterestHorizon] = useState<DailyInterestHorizon>('daily')
  const [dailyInterestCustomStart, setDailyInterestCustomStart] = useState(() => formatLocalDate(dateBeforeMonths(now, 1)))
  const [dailyInterestCustomEnd, setDailyInterestCustomEnd] = useState(() => formatLocalDate(now))
  const [formMessage, setFormMessage] = useState('')
  const [verifiedBalanceInput, setVerifiedBalanceInput] = useState('')
  const [verifiedAtInput, setVerifiedAtInput] = useState(() => formatLocalDateTime(now))
  const [investmentForm, setInvestmentForm] = useState({
    name: '',
    institution: '',
    type: 'Inversión',
    annualYield: '',
    status: 'real' as Investment['status'],
    date: formatLocalDate(now),
    openingTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  })
  const [movementForm, setMovementForm] = useState(() => ({
    title: '',
    amount: '',
    category: '',
    incomeActivity: 'Empleo',
    direction: 'income' as Movement['direction'],
    investmentId: '',
    destinationInvestmentId: '',
    date: formatLocalDate(now),
    time: '',
  }))
  const [goalTarget, setGoalTarget] = useState('')
  const navigateTo = (section: SectionId, investmentId?: string) => {
    const nextRoute: AppRoute = section === 'investment-detail' && investmentId
      ? { section, investmentId }
      : { section }
    const hash = nextRoute.investmentId
      ? `#/investment/${encodeURIComponent(nextRoute.investmentId)}`
      : `#/${nextRoute.section}`
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute(nextRoute)
    setFormMessage('')
  }

  useEffect(() => {
    const syncRoute = () => setRoute(readRoute())
    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('popstate', syncRoute)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('popstate', syncRoute)
    }
  }, [])

  useEffect(() => {
    const refreshNow = () => setNow(new Date())
    const refreshStoredData = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setInvestments(loadCollection(STORAGE_KEY, investmentExamples))
      if (event.key === MOVEMENTS_STORAGE_KEY) setMovements(loadCollection(MOVEMENTS_STORAGE_KEY, movementExamples))
      if (event.key === DAILY_INTEREST_STORAGE_KEY) setDailyInterestHistory(loadDailyInterestHistory())
    }
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshNow()
    }, TICK_INTERVAL_MS)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshNow()
    }
    window.addEventListener('focus', refreshNow)
    window.addEventListener('storage', refreshStoredData)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshNow)
      window.removeEventListener('storage', refreshStoredData)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  const todayKey = formatLocalDate(now)
  const dailyInterestWithAppendedSnapshots = useMemo(
    () => appendDailyInterestSnapshots(investments, movements, dailyInterestHistory, new Date(`${todayKey}T12:00:00`)),
    [dailyInterestHistory, investments, movements, todayKey],
  )

  useEffect(() => {
    try {
      const serialized = JSON.stringify(dailyInterestWithAppendedSnapshots)
      if (serialized === localStorage.getItem(DAILY_INTEREST_STORAGE_KEY)) return
      localStorage.setItem(DAILY_INTEREST_STORAGE_KEY, serialized)
    } catch (error) {
      console.error('No se pudo guardar el historial permanente de intereses diarios.', error)
      const timeout = window.setTimeout(() => {
        setFormMessage('No se pudo guardar el historial diario en este navegador. Las cuentas y movimientos no se modificaron.')
      }, 0)
      return () => window.clearTimeout(timeout)
    }
  }, [dailyInterestWithAppendedSnapshots])

  useEffect(() => {
    if (!movements.some((movement) => movement.direction === 'income' && !movement.incomeActivity?.trim())) return
    const migratedMovements = movements.map((movement) =>
      movement.direction === 'income' && !movement.incomeActivity?.trim()
        ? { ...movement, incomeActivity: 'Empleo' }
        : movement,
    )
    localStorage.setItem(MOVEMENTS_STORAGE_KEY, JSON.stringify(migratedMovements))
  }, [movements])

  const investmentPerformances = useMemo(
    () => new Map(investments.map((investment) => [
      investment.id,
      calculateInvestmentPerformance(investment, movements, now),
    ])),
    [investments, movements, now],
  )
  const currentInvestments = useMemo(
    () => investments.map((investment) => {
      const performance = investmentPerformances.get(investment.id)
      return performance
        ? { ...investment, value: performance.currentValue, growth: performance.earned, monthlyIncome: performance.monthlyEstimate }
        : withCurrentInvestmentPerformance(investment, movements, now)
    }),
    [investments, investmentPerformances, movements, now],
  )
  const summary = useMemo(() => calculatePortfolioSummary(currentInvestments), [currentInvestments])
  const movementSummary = useMemo(() => calculateMovementSummary(movements), [movements])
  const monthlyBreakdown = useMemo(() => buildPeriodBreakdown(movements, period, now), [movements, period, now])
  const incomeActivityBreakdown = useMemo(
    () => buildIncomeActivityBreakdown(movements, period, now),
    [movements, period, now],
  )
  const totalPeriodIncome = incomeActivityBreakdown.reduce((total, item) => total + item.amount, 0)
  const activePatrimonialGoal = patrimonialGoals.find((goal) => !goal.achievedAt)
  const goalAmount = activePatrimonialGoal?.targetAmount ?? 0
  const goalGap = Math.max(goalAmount - summary.totalPatrimonio, 0)
  const filteredMovements = useMemo(
    () =>
      movements
        .filter((movement) => historyFilter === 'all' || movement.direction === historyFilter)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [historyFilter, movements],
  )
  const incomeActivities = useMemo(
    () => [...new Set(movements
      .filter((movement) => movement.direction === 'income')
      .map((movement) => movement.incomeActivity?.trim() || 'Empleo'))],
    [movements],
  )
  const investmentDistribution = useMemo(
    () => currentInvestments.map((investment, index) => ({
      label: investment.name,
      value: summary.totalPatrimonio ? Number(((investment.value / summary.totalPatrimonio) * 100).toFixed(1)) : 0,
      color: investment.accent || colors[index % colors.length],
    })),
    [currentInvestments, summary.totalPatrimonio],
  )
  const selectedInvestmentRecord = investments.find((investment) => investment.id === route.investmentId)
  const selectedInvestment = currentInvestments.find((investment) => investment.id === route.investmentId)
  const selectedPerformance = selectedInvestmentRecord
    ? investmentPerformances.get(selectedInvestmentRecord.id)
    : undefined
  const balanceChartRange = useMemo(() => {
    if (balanceChartHorizon !== 'custom') {
      const startAt = horizonStart(balanceChartHorizon, now)
      return now.getTime() - startAt >= MIN_CHART_SPAN_MS ? { startAt, endAt: now.getTime() } : undefined
    }

    const start = new Date(`${balanceCustomStart}T00:00:00`)
    const end = new Date(`${balanceCustomEnd}T00:00:00`)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return undefined
    const startAt = start.getTime()
    const today = formatLocalDate(now)
    const endAt = balanceCustomEnd === today
      ? now.getTime()
      : new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime()
    if (balanceCustomStart >= balanceCustomEnd || endAt > now.getTime()) return undefined
    const clampedStart = startAt
    return endAt - clampedStart >= MIN_CHART_SPAN_MS ? { startAt: clampedStart, endAt } : undefined
  }, [balanceChartHorizon, balanceCustomEnd, balanceCustomStart, now])
  const breakdownChartRange = useMemo(() => {
    if (breakdownChartHorizon !== 'custom') {
      const startAt = horizonStart(breakdownChartHorizon, now)
      return now.getTime() - startAt >= MIN_CHART_SPAN_MS ? { startAt, endAt: now.getTime() } : undefined
    }

    const start = new Date(`${breakdownCustomStart}T00:00:00`)
    const end = new Date(`${breakdownCustomEnd}T00:00:00`)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return undefined
    const startAt = start.getTime()
    const today = formatLocalDate(now)
    const endAt = breakdownCustomEnd === today
      ? now.getTime()
      : new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime()
    if (breakdownCustomStart >= breakdownCustomEnd || endAt > now.getTime()) return undefined
    const clampedStart = startAt
    return endAt - clampedStart >= MIN_CHART_SPAN_MS ? { startAt: clampedStart, endAt } : undefined
  }, [breakdownChartHorizon, breakdownCustomEnd, breakdownCustomStart, now])
  const balanceHistory = useMemo(
    () => selectedInvestmentRecord && balanceChartRange
      ? calculateInvestmentHistory(selectedInvestmentRecord, movements, balanceChartRange.startAt, balanceChartRange.endAt)
      : [],
    [balanceChartRange, movements, selectedInvestmentRecord],
  )
  const breakdownHistory = useMemo(
    () => selectedInvestmentRecord && breakdownChartRange
      ? calculateInvestmentHistory(selectedInvestmentRecord, movements, breakdownChartRange.startAt, breakdownChartRange.endAt)
      : [],
    [breakdownChartRange, movements, selectedInvestmentRecord],
  )
  const dailyInterestRange = useMemo(() => {
    if (dailyInterestHorizon === 'daily') {
      return {
        startDate: formatLocalDate(dateBeforeDays(now, 30)),
        endDate: formatLocalDate(dateBeforeDays(now, 1)),
      }
    }
    if (dailyInterestHorizon !== 'custom') {
      return {
        startDate: formatLocalDate(dateBeforeDays(now, Number(dailyInterestHorizon) - 1)),
        endDate: formatLocalDate(now),
      }
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dailyInterestCustomStart)
      || !/^\d{4}-\d{2}-\d{2}$/.test(dailyInterestCustomEnd)
      || dailyInterestCustomStart > dailyInterestCustomEnd
      || dailyInterestCustomEnd > formatLocalDate(now)
    ) return undefined
    return { startDate: dailyInterestCustomStart, endDate: dailyInterestCustomEnd }
  }, [dailyInterestCustomEnd, dailyInterestCustomStart, dailyInterestHorizon, now])
  const visibleDailyInterest = useMemo(
    () => selectedInvestmentRecord && dailyInterestRange
      ? dailyInterestWithAppendedSnapshots.filter((snapshot) =>
        snapshot.investmentId === selectedInvestmentRecord.id
        && snapshot.date >= dailyInterestRange.startDate
        && snapshot.date <= dailyInterestRange.endDate,
      )
      : [],
    [dailyInterestRange, dailyInterestWithAppendedSnapshots, selectedInvestmentRecord],
  )
  const longTermCurrentBalance = selectedInvestmentRecord
    ? estimateInvestmentBalanceNow(selectedInvestmentRecord, movements, dailyInterestWithAppendedSnapshots, now)
    : 0
  const longTermProjection = selectedInvestmentRecord
    ? buildDailyInterestProjection(longTermCurrentBalance, selectedInvestmentRecord.annualYield)
    : []
  const investmentMovements = useMemo(
    () => movements
      .filter((movement) => movement.investmentId === route.investmentId)
      .sort((left, right) => `${right.date}T${right.time ?? '00:00'}`.localeCompare(`${left.date}T${left.time ?? '00:00'}`)),
    [movements, route.investmentId],
  )
  const investmentContributions = investmentMovements.reduce(
    (total, movement) => total + (affectsInvestment(movement) ? signedFlowAmount(movement) : 0),
    0,
  )
  const navSection = activeSection === 'investment-detail' ? 'investments' : activeSection

  const persistInvestments = (next: Investment[]): boolean => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.error('No se pudieron guardar las inversiones. No se aplicó el cambio.', error)
      setFormMessage('No se pudieron guardar los cambios de inversión en este navegador. No se modificó la lista guardada.')
      return false
    }
    setInvestments(next)
    return true
  }

  useEffect(() => {
    const updatedGoals = completeReachedGoals(patrimonialGoals, summary.totalPatrimonio, now.toISOString())
    if (!updatedGoals.some((goal, index) => goal.achievedAt !== patrimonialGoals[index]?.achievedAt)) return
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(PATRIMONIAL_GOALS_STORAGE_KEY, JSON.stringify(updatedGoals))
        setPatrimonialGoals(updatedGoals)
        setFormMessage('¡Meta patrimonial alcanzada! El hito quedó guardado con fecha y hora.')
      } catch (error) {
        console.error('Se alcanzó una meta, pero no se pudo guardar el hito localmente.', error)
        setFormMessage('El saldo llegó a la meta, pero no se pudo guardar la fecha del hito. Revisa el espacio disponible del navegador.')
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [now, patrimonialGoals, summary.totalPatrimonio])

  const persistMovements = (next: Movement[]): boolean => {
    try {
      localStorage.setItem(MOVEMENTS_STORAGE_KEY, JSON.stringify(next))
      setMovements(next)
      return true
    } catch (error) {
      console.error('No se pudieron guardar los movimientos. No se aplicó el cambio.', error)
      setFormMessage('No se pudieron guardar los movimientos en este navegador. No se modificó el historial guardado.')
      return false
    }
  }

  const addPatrimonialGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (activePatrimonialGoal) {
      setFormMessage('Alcanza tu hito actual antes de fijar la siguiente meta.')
      return
    }
    const targetAmount = Number(goalTarget)
    if (!Number.isFinite(targetAmount) || targetAmount <= summary.totalPatrimonio) {
      setFormMessage('La nueva meta debe ser mayor que tu patrimonio actual.')
      return
    }
    const nextGoals = [...patrimonialGoals, createPatrimonialGoal(targetAmount)]
    try {
      localStorage.setItem(PATRIMONIAL_GOALS_STORAGE_KEY, JSON.stringify(nextGoals))
      setPatrimonialGoals(nextGoals)
      setGoalTarget('')
      setFormMessage('Meta fijada. Ya está marcada en tu ruta patrimonial.')
    } catch (error) {
      console.error('No se pudo guardar la nueva meta patrimonial.', error)
      setFormMessage('No se pudo guardar la meta. Tus cuentas y movimientos no se modificaron.')
    }
  }

  const saveVerifiedBalance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedInvestmentRecord) return
    const balance = parseCopAmount(verifiedBalanceInput)
    const verifiedDate = new Date(verifiedAtInput)
    if (balance === undefined || balance < 0 || !Number.isFinite(verifiedDate.getTime())) {
      setFormMessage('Ingresa el saldo confirmado por Nu y una fecha y hora válidas.')
      return
    }
    if (verifiedDate.getTime() > Date.now()) {
      setFormMessage('La fecha de corte no puede estar en el futuro.')
      return
    }

    const verifiedAt = verifiedDate.toISOString()
    const recordedContributions = movements
      .filter((movement) =>
        movement.investmentId === selectedInvestmentRecord.id
        && affectsInvestment(movement)
        && new Date(`${movement.date}T${movement.time || '12:00'}:00`).getTime() <= verifiedDate.getTime(),
      )
      .reduce((total, movement) => total + signedFlowAmount(movement), 0)
    const allRecordedContributions = movements
      .filter((movement) => movement.investmentId === selectedInvestmentRecord.id && affectsInvestment(movement))
      .reduce((total, movement) => total + signedFlowAmount(movement), 0)
    const untrackedPrincipal = Math.max(selectedInvestmentRecord.value - allRecordedContributions, 0)
    const verifiedPrincipal = Math.min(balance, recordedContributions + untrackedPrincipal)
    const updatedInvestments = investments.map((investment) => investment.id === selectedInvestmentRecord.id
      ? { ...investment, verifiedBalance: balance, verifiedAt, verifiedPrincipal }
      : investment)
    if (!persistInvestments(updatedInvestments)) return
    setVerifiedBalanceInput('')
    setVerifiedAtInput(formatLocalDateTime(new Date()))
    setFormMessage(`Saldo confirmado guardado: ${formatPreciseCurrency(balance)}.`)
  }

  const changeYieldRate = (investmentId: string, rate: number) => {
    const changedAt = Date.now()
    // Parte de lo guardado en disco para no pisar cambios hechos desde otra pestaña.
    const stored = loadCollection<Investment>(STORAGE_KEY, investmentExamples)
    const base = stored.some((investment) => investment.id === investmentId) ? stored : investments
    persistInvestments(base.map((investment) => investment.id === investmentId
      ? withYieldChange(investment, rate, changedAt)
      : investment))
  }

  const deleteInvestment = (investmentId: string) => {
    const investment = investments.find((item) => item.id === investmentId)
    if (!investment || !window.confirm(`¿Eliminar "${investment.name}"? Esta acción no se puede deshacer.`)) return
    if (!persistInvestments(investments.filter((investment) => investment.id !== investmentId))) return
    persistMovements(movements.map((movement) =>
      movement.investmentId === investmentId ? { ...movement, investmentId: undefined } : movement,
    ))
    navigateTo('investments')
  }

  const deleteMovement = (movement: Movement) => {
    if (!window.confirm(`¿Eliminar el movimiento "${movement.title}"? Esta acción no se puede deshacer.`)) return
    const isWithdrawalPair = (item: Movement) =>
      item.direction === 'withdrawal' || item.category === WITHDRAWAL_RECEIVED_CATEGORY
    const removed = movements.filter((item) =>
      item.id === movement.id
      || (isWithdrawalPair(movement) && isWithdrawalPair(item)
        && (item.id === movement.relatedMovementId || item.relatedMovementId === movement.id)),
    )
    const removedIds = new Set(removed.map((item) => item.id))
    if (!persistMovements(movements
      .filter((item) => !removedIds.has(item.id))
      .map((item) => item.relatedMovementId && removedIds.has(item.relatedMovementId)
        ? { ...item, relatedMovementId: undefined }
        : item))) return

    const deltas = new Map<string, number>()
    for (const item of removed) {
      if (item.investmentId && affectsInvestment(item)) {
        deltas.set(item.investmentId, (deltas.get(item.investmentId) ?? 0) - signedFlowAmount(item))
      }
    }
    if (deltas.size) persistInvestments(applyValueDeltas(investments, deltas))
  }

  const addInvestment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const annualYield = Number(investmentForm.annualYield) || 0
    if (!investmentForm.name.trim() || annualYield < 0 || !investmentForm.date || !investmentForm.openingTime) {
      setFormMessage('Ingresa el nombre y la fecha y hora de apertura. El rendimiento no puede ser negativo.')
      return
    }

    const investment = createInvestment({
      name: investmentForm.name.trim(),
      institution: investmentForm.institution.trim() || 'Sin institución',
      type: investmentForm.type,
      annualYield,
      status: investmentForm.status,
      date: investmentForm.date,
      openingTime: investmentForm.openingTime,
    })
    if (!persistInvestments([investment, ...investments])) return
    setInvestmentForm({
      name: '',
      institution: '',
      type: 'Inversión',
      annualYield: '',
      status: 'real',
      date: formatLocalDate(new Date()),
      openingTime: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
    })
    setFormMessage('Inversión guardada.')
    navigateTo('investments')
  }

  const addMovement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = parseCopAmount(movementForm.amount) ?? Number.NaN
    if (!movementForm.title.trim() || !Number.isFinite(amount) || amount <= 0 || !movementForm.date) {
      setFormMessage('Ingresa una descripción, una fecha y un monto válido mayor que cero (ej. 3.209,78).')
      return
    }

    const flowAccountId = movementForm.investmentId || undefined
    const isWithdrawal = movementForm.direction === 'withdrawal'
    if (isWithdrawal) {
      const source = currentInvestments.find((investment) => investment.id === flowAccountId)
      if (!source) {
        setFormMessage('Selecciona la inversión de la que retiras el dinero.')
        return
      }
      if (amount > source.value + 0.005) {
        setFormMessage(`El retiro supera el saldo actual de ${source.name} (${formatPreciseCurrency(source.value)}).`)
        return
      }
    }

    const nowTime = new Date()
    const time = /^\d{2}:\d{2}$/.test(movementForm.time)
      ? movementForm.time
      : flowAccountId && movementForm.date === formatLocalDate(nowTime)
      ? `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`
      : undefined
    const movement = createMovement({
      title: movementForm.title.trim(),
      amount,
      direction: movementForm.direction,
      category: movementForm.category.trim() || (isWithdrawal ? WITHDRAWAL_CATEGORY : 'Sin categoría'),
      incomeActivity: movementForm.direction === 'income'
        ? movementForm.incomeActivity.trim() || 'Empleo'
        : undefined,
      date: movementForm.date,
      time,
      investmentId: ['transfer', 'withdrawal', 'expense'].includes(movementForm.direction) ? flowAccountId : undefined,
    })
    const resolvedNew = resolveAvailableAccount(investments, isWithdrawal
      ? withWithdrawalReceipt(movement, movementForm.destinationInvestmentId || undefined)
      : [movement])
    const created = resolvedNew.movements
    const deltas = new Map<string, number>()
    for (const item of created) {
      if (item.investmentId && affectsInvestment(item)) {
        deltas.set(item.investmentId, (deltas.get(item.investmentId) ?? 0) + signedFlowAmount(item))
      }
    }
    if ((deltas.size || resolvedNew.investments !== investments) && !persistInvestments(applyValueDeltas(resolvedNew.investments, deltas))) return
    if (!persistMovements([...created, ...movements])) return
    setMovementForm({ title: '', amount: '', category: '', incomeActivity: 'Empleo', direction: 'income', investmentId: '', destinationInvestmentId: '', date: formatLocalDate(new Date()), time: '' })
    setFormMessage(isWithdrawal ? 'Retiro registrado y saldos actualizados.' : 'Movimiento registrado.')
  }
  const exportData = () => {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), investments, movements, patrimonialGoals, dailyInterestHistory: dailyInterestWithAppendedSnapshots }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'rastreo-patrimonial.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const importTransactions = (transactions: ImportedTransaction[]) => {
    const imported = transactions.map((transaction) => createMovement({
      title: transaction.title.trim(),
      amount: Number(transaction.amount),
      direction: transaction.direction,
      category: transaction.category.trim() || 'Sin categoría',
      incomeActivity: transaction.direction === 'income'
        ? transaction.incomeActivity?.trim() || 'Empleo'
        : undefined,
      date: transaction.date,
      time: transaction.time || undefined,
      investmentId: ['transfer', 'withdrawal', 'expense'].includes(transaction.direction) ? transaction.investmentId : undefined,
      sourceFile: transaction.sourceFile,
    }))
    const importedMovementIds = new Map(
      transactions.map((transaction, index) => [transaction.id, imported[index].id]),
    )
    const resolvedImport = resolveAvailableAccount(investments, imported.flatMap((movement, index) => {
      const relatedTransactionId = transactions[index].relatedTransactionId
      const relatedMovementId = relatedTransactionId ? importedMovementIds.get(relatedTransactionId) : undefined
      const base = relatedMovementId ? { ...movement, relatedMovementId } : movement
      return base.direction === 'withdrawal'
        ? withWithdrawalReceipt(base, transactions[index].destinationInvestmentId)
        : [base]
    }))
    const importedWithRelations = resolvedImport.movements
    const deltas = new Map<string, number>()
    for (const movement of importedWithRelations) {
      if (movement.investmentId && affectsInvestment(movement)) {
        deltas.set(movement.investmentId, (deltas.get(movement.investmentId) ?? 0) + signedFlowAmount(movement))
      }
    }
    if ((deltas.size || resolvedImport.investments !== investments) && !persistInvestments(applyValueDeltas(resolvedImport.investments, deltas))) return
    if (!persistMovements([...importedWithRelations, ...movements])) return
    setIsImportOpen(false)
    const withdrawalCount = importedWithRelations.filter((movement) => movement.direction === 'withdrawal' && movement.investmentId).length
    const assignedCount = importedWithRelations.filter((movement) => movement.investmentId && movement.direction !== 'withdrawal' && movement.category !== WITHDRAWAL_RECEIVED_CATEGORY).length
    const notes = [
      assignedCount ? `${assignedCount} movimiento(s) aplicado(s) a tus cuentas` : '',
      withdrawalCount ? `${withdrawalCount} retiro(s) descontado(s) de tus inversiones` : '',
    ].filter(Boolean)
    setFormMessage(`${imported.length} movimiento(s) importado(s)${notes.length ? `; ${notes.join('; ')}` : ''}.`)
  }
  const portfolioInvestments = currentInvestments.filter((investment) => investment.type.toLowerCase() !== 'disponible')
  const hasData = investments.length > 0 || movements.length > 0 || dailyInterestWithAppendedSnapshots.length > 0
  const hasCashflow = movements.some((movement) => movement.direction === 'income' || movement.direction === 'expense')
  const activeTitle = activeSection === 'dashboard'
    ? 'Resumen de tu patrimonio'
    : activeSection === 'investment-detail'
      ? selectedInvestment?.name ?? 'Inversiones'
      : sections.find((section) => section.id === activeSection)?.label ?? 'Dashboard'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-cluster">
          <button type="button" className="brand" aria-label="Ir al dashboard" onClick={() => navigateTo('dashboard')}>
            <svg className="brand-hourglass" viewBox="0 0 40 56" role="img" aria-label="Rastreo Patrimonial">
              <defs>
                <clipPath id="hg-top"><path d="M9 8h22c0 9-7 14-10 20h-2C16 22 9 17 9 8z" /></clipPath>
                <clipPath id="hg-bottom"><path d="M19 28h2c3 6 10 11 10 20H9c0-9 7-14 10-20z" /></clipPath>
                <linearGradient id="hg-sand" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#f6d27a" />
                  <stop offset="1" stopColor="#c8932f" />
                </linearGradient>
                <linearGradient id="hg-cap" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#4a6b8a" />
                  <stop offset="1" stopColor="#1f3a57" />
                </linearGradient>
                <linearGradient id="hg-glass-fill" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#9fc4e8" stopOpacity="0.35" />
                  <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.08" />
                  <stop offset="1" stopColor="#9fc4e8" stopOpacity="0.3" />
                </linearGradient>
              </defs>
              <path className="hg-glass-body" d="M9 8c0 9 7 14 10 20-3 6-10 11-10 20h22c0-9-7-14-10-20 3-6 10-11 10-20z" />
              <g clipPath="url(#hg-top)"><rect className="hg-sand-top" x="8" y="8" width="24" height="20" /></g>
              <g clipPath="url(#hg-bottom)"><path className="hg-sand-bottom" d="M20 31L33 48H7z" /></g>
              <line className="hg-stream" x1="20" x2="20" y1="27" y2="47" />
              <circle className="hg-grain g1" cx="20" cy="28" r="0.9" />
              <circle className="hg-grain g2" cx="19.4" cy="28" r="0.8" />
              <circle className="hg-grain g3" cx="20.6" cy="28" r="0.8" />
              <path className="hg-glass-edge" d="M9 8c0 9 7 14 10 20-3 6-10 11-10 20h22c0-9-7-14-10-20 3-6 10-11 10-20z" />
              <path className="hg-shine" d="M12 11c.4 4 2.600 6.500 4.500 9" />
              <rect className="hg-cap" x="4" y="2.500" width="32" height="5.500" rx="2.500" />
              <rect className="hg-cap" x="4" y="48" width="32" height="5.500" rx="2.500" />
              <path className="hg-pillar" d="M6.500 8v40M33.500 8v40" />
            </svg>
          </button>
          <div className="brand-actions" aria-label="Acciones de documentos">
            <button type="button" className="button button-primary import-trigger" onClick={() => setIsImportOpen(true)}>
              <span aria-hidden="true">↓</span> Importar documentos
            </button>
            <button type="button" className="button button-light" onClick={exportData} disabled={!hasData}>
              <span aria-hidden="true">↑</span> Exportar datos
            </button>
          </div>
        </div>

        <div className="sky" aria-hidden="true">
          <span className="sky-sun" />
          <span className="sky-cloud c1" /><span className="sky-cloud c2" /><span className="sky-cloud c3" /><span className="sky-cloud c4" />
          <div className="sky-plane">
            <span className="sky-contrail" />
            <svg viewBox="0 0 64 24"><path d="M2 12c0-1.500 6-3 12-3h14L20 1h4l14 8h12c6 0 12 1.500 12 3s-6 3-12 3H38l-14 8h-4l8-8H14C8 15 2 13.500 2 12z" /><path className="sky-plane-windows" d="M46 11.200h8M36 11.200h6" /></svg>
          </div>
        </div>
        <nav className="nav" aria-label="Navegación principal">
          {sections.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`${navSection === id ? 'nav-item active' : 'nav-item'}${id === 'new-investment' ? ' nav-item-register' : ''}`}
              data-label={label}
              aria-label={label}
              aria-current={navSection === id ? 'page' : undefined}
              onClick={() => navigateTo(id)}
            >
              <NavIcon name={icon} />
              <span className="nav-label" aria-hidden="true">{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="local-indicator" />
          <div><strong>Espacio privado</strong><small>Tus datos solo están en este navegador.</small></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-heading">
            <p className="eyebrow">RASTREO PATRIMONIAL <span>·</span> {new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(now)}</p>
            <h1>{activeTitle}</h1>
          </div>
        </header>

        {formMessage && <div className="feedback" role="status">{formMessage}<button type="button" onClick={() => setFormMessage('')} aria-label="Cerrar aviso">×</button></div>}

        {activeSection === 'dashboard' && <>
        <section className="hero-card" aria-label="Resumen patrimonial">
          <div className="hero-copy">
            <span className="hero-label">PATRIMONIO TOTAL</span>
            <strong className="hero-value">{formatCurrency(summary.totalPatrimonio)}</strong>
            <span className="hero-note">{hasData ? 'Calculado con las cuentas que has registrado' : 'Agrega tus cuentas para ver tu resumen patrimonial'}</span>
          </div>
          <div className="hero-side">
            <span className="hero-label">RENDIMIENTO MENSUAL ESTIMADO</span>
            <strong>{formatCurrency(summary.monthlyIncome)}</strong>
            <span>Según las tasas que registraste</span>
          </div>
          <span className="hero-orbit orbit-one" />
          <span className="hero-orbit orbit-two" />
        </section>

        <section className="metrics-grid" aria-label="Métricas financieras">
          <article className="metric-card">
            <span className="metric-label">Dinero disponible</span>
            <strong className="metric-value">{formatCurrency(summary.available)}</strong>
            <span className="metric-foot">Cuentas marcadas como disponibles</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Invertido y ahorrado</span>
            <strong className="metric-value">{formatCurrency(summary.invested)}</strong>
            <span className="metric-foot">{investments.length} {investments.length === 1 ? 'registro' : 'registros'}</span>
          </article>
          <article className="metric-card account-count-card">
            <span className="metric-label">Cuentas creadas</span>
            <strong className="metric-value">{investments.length}</strong>
            <span className="metric-foot">En seguimiento</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Flujo neto registrado</span>
            <strong className={`metric-value ${movementSummary.net < 0 ? 'text-negative' : ''}`}>{formatCurrency(movementSummary.net)}</strong>
            <span className="metric-foot">{movements.length} movimientos registrados</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Rendimiento anual ponderado</span>
            <strong className="metric-value">{summary.annualPerformance}<small>%</small></strong>
            <span className="metric-foot">Estimación del portafolio</span>
          </article>
        </section>

        <section className="overview-grid">
          <article className="panel chart-panel">
            <div className="section-heading">
              <div><span className="section-kicker">MOVIMIENTOS</span><h2>Ingresos y gastos</h2></div>
              <div className="period-switch" aria-label="Periodo del gráfico">
                {[3, 6, 12].map((value) => (
                  <button key={value} type="button" className={period === value ? 'period-option selected' : 'period-option'} onClick={() => setPeriod(value)}>{value} meses</button>
                ))}
              </div>
            </div>
            {hasCashflow ? (
              <>
                <div className="chart-legend"><span><i className="legend-income" /> Ingresos</span><span><i className="legend-expense" /> Gastos</span></div>
                <MonthlyFlowChart months={monthlyBreakdown} movements={movements} now={now} />
              </>
            ) : (
              <div className="empty-chart"><span className="empty-chart-icon">↗</span><strong>{movements.length ? 'No hay ingresos o gastos en este periodo' : 'Aún no hay movimientos'}</strong><p>{movements.length ? 'Las transferencias entre tus propias cuentas no se cuentan como ingreso o gasto.' : 'Registra ingresos y gastos para ver aquí tu flujo mensual.'}</p><button className="inline-link" type="button" onClick={() => navigateTo('movements')}>Registrar primer movimiento <span>→</span></button></div>
            )}
          </article>

          <article className="panel allocation-panel">
            <div className="section-heading"><div><span className="section-kicker">DISTRIBUCIÓN</span><h2>Así se reparte</h2></div><span className="section-count">{investments.length}</span></div>
            {investments.length ? (
              <PortfolioBars data={investmentDistribution} />
            ) : (
              <div className="empty-allocation"><span className="allocation-ring">＋</span><p>La distribución aparecerá cuando agregues una cuenta.</p></div>
            )}
          </article>
        </section>

        <FlightFuelBudget totalPatrimony={summary.totalPatrimonio} movements={movements} now={now} />

        <section className={`panel goals-panel dashboard-goal${activePatrimonialGoal ? '' : ' dashboard-goal-empty'}`}>
          <div className="goal-intro"><span className="section-kicker">TU SIGUIENTE PASO</span><h2>Meta patrimonial</h2><p>Define el valor que quieres alcanzar y consulta cuánto te falta.</p></div>
          {activePatrimonialGoal ? (
            <>
              <div className="goal-active">
                <span>SIGUIENTE HITO</span>
                <strong>{formatCurrency(activePatrimonialGoal.targetAmount)}</strong>
                <small>Tu patrimonio actual es {formatCurrency(summary.totalPatrimonio)}</small>
              </div>
              <div className="goal-result">
                <span>{goalGap ? 'Te faltan' : 'Hito alcanzado'}</span>
                <strong>{formatCurrency(goalGap)}</strong>
                <small>{goalGap ? 'Al llegar, guardaremos permanentemente la fecha y la hora.' : 'Guardando el momento en tu historial…'}</small>
                <div className="goal-progress"><span style={{ width: `${Math.min((summary.totalPatrimonio / goalAmount) * 100, 100)}%` }} /></div>
              </div>
            </>
          ) : (
            <form className="goal-controls" onSubmit={addPatrimonialGoal}>
              <label htmlFor="goal-target">Clava tu siguiente meta<input id="goal-target" type="number" min={Math.floor(summary.totalPatrimonio) + 1} step="1" required value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} placeholder="Ej. 10.000.000" /></label>
              <button className="button button-primary" type="submit">Fijar meta <span>→</span></button>
            </form>
          )}
        </section>

        <section className="income-goals-grid">
          <article className="panel income-allocation-panel">
            <div className="section-heading"><div><span className="section-kicker">FUENTES DE INGRESO</span><h2>Distribución por actividad</h2></div><span className="section-count">{incomeActivityBreakdown.length}</span></div>
            {incomeActivityBreakdown.length ? (
              <>
                <p className="income-period-note">Participación porcentual en tus ingresos de los últimos {period} meses.</p>
                <IncomeDistributionChart data={incomeActivityBreakdown} total={totalPeriodIncome} />
              </>
            ) : (
              <div className="empty-allocation"><span className="allocation-ring">＋</span><p>La distribución aparecerá cuando registres ingresos y les asignes una actividad.</p><button className="inline-link" type="button" onClick={() => navigateTo('movements')}>Registrar un ingreso <span>→</span></button></div>
            )}
          </article>
          <PatrimonialGoalsRoadmap goals={patrimonialGoals} currentTotal={summary.totalPatrimonio} />
        </section>
        </>}

        {activeSection === 'investments' && <section className="section-view investments-view">
          <InvestmentsShowcase
            investments={portfolioInvestments}
            performances={investmentPerformances}
            onOpen={(investmentId) => navigateTo('investment-detail', investmentId)}
            onCreate={() => navigateTo('new-investment')}
          />
        </section>}

        {activeSection === 'investment-detail' && selectedInvestment && <section className="investment-detail-view section-view">
          <button className="detail-back" type="button" onClick={() => navigateTo('investments')}><span aria-hidden="true">←</span> Volver a inversiones</button>
          <section className={`investment-detail-hero${/nu|cajita/i.test(`${selectedInvestment.name} ${selectedInvestment.institution}`) ? ' nu-detail-hero' : ''}`}>
            {/nu|cajita/i.test(`${selectedInvestment.name} ${selectedInvestment.institution}`)
              ? <img className="detail-cover" src={nuCajitaImage} alt="" />
              : <div className="detail-cover detail-generic-cover" style={{ '--investment-accent': selectedInvestment.accent || colors[0] } as CSSProperties}><NavIcon name="wallet" /></div>}
            <div className="detail-hero-scrim" />
            <div className="detail-hero-content">
              <span className="detail-breadcrumb">{selectedInvestment.institution} <span>／</span> {selectedInvestment.type}</span>
              <div className="detail-title-row"><h2>{selectedInvestment.name}</h2><span className={`investment-status status-${selectedInvestmentRecord?.verifiedAt ? 'real' : selectedInvestment.status}`}>{selectedInvestmentRecord?.verifiedAt ? 'Saldo confirmado' : selectedInvestment.status === 'real' ? 'Dato real' : 'Estimado'}</span></div>
              <span className="detail-balance-label">SALDO EN TIEMPO REAL</span>
              <strong className="detail-balance">{formatLiveCurrency(selectedInvestment.value)}</strong>
              {selectedInvestmentRecord?.verifiedAt ? <span className="detail-opening">Corte confirmado: {formatPreciseCurrency(selectedInvestmentRecord.verifiedBalance ?? 0)} · {formatVerifiedAt(selectedInvestmentRecord.verifiedAt)}</span> : null}
              <span className="detail-opening">Abierta el {formatDate(selectedInvestment.date)}{selectedInvestment.openingTime ? ` · ${selectedInvestment.openingTime}` : ''}</span>
            </div>
            <span className="detail-yield"><small>RENDIMIENTO ANUAL</small><strong><YieldRateInput rate={selectedInvestment.annualYield} onCommit={(rate) => changeYieldRate(selectedInvestment.id, rate)} />% <span>EA</span></strong></span>
          </section>

          <section className="panel performance-panel">
            <div className="account-performance-heading">
              <div><span className="section-kicker">TU CUENTA · NU</span><h2>Saldo y rendimiento</h2></div>
              <span className="performance-estimate-badge">TIEMPO REAL · {selectedInvestment.annualYield}% EA</span>
            </div>

            <details className="verified-balance-disclosure">
              <summary>
                <span className="verified-disclosure-icon" aria-hidden="true">↻</span>
                <span><strong>Actualizar saldo confirmado</strong><small>{selectedInvestmentRecord?.verifiedAt ? `Último corte · ${formatVerifiedAt(selectedInvestmentRecord.verifiedAt)}` : 'Registrar el saldo que muestra Nu'}</small></span>
                <span className="verified-disclosure-value">{selectedInvestmentRecord?.verifiedAt ? formatPreciseCurrency(selectedInvestmentRecord.verifiedBalance ?? 0) : '＋'}</span>
              </summary>
              <div className="verified-balance-card">
                <div className="verified-balance-heading">
                  <div><span>ÚLTIMO SALDO CONFIRMADO EN NU</span><strong>{selectedInvestmentRecord?.verifiedAt ? formatPreciseCurrency(selectedInvestmentRecord.verifiedBalance ?? 0) : 'Aún no sincronizado'}</strong></div>
                </div>
                <form className="verified-balance-form" onSubmit={saveVerifiedBalance}>
                  <label>Saldo confirmado<input aria-label="Saldo confirmado en Nu" type="text" inputMode="decimal" autoComplete="off" required value={verifiedBalanceInput} onChange={(event) => setVerifiedBalanceInput(event.target.value)} placeholder="371.335,56" aria-describedby="verified-balance-format" /><small id="verified-balance-format">Formato COP: 371.335,56</small></label>
                  <label>Fecha y hora del saldo<input aria-label="Fecha y hora de corte del saldo" type="datetime-local" step="0.001" required value={verifiedAtInput} onChange={(event) => setVerifiedAtInput(event.target.value)} /></label>
                  <button type="submit" className="button button-primary">Guardar saldo confirmado</button>
                </form>
              </div>
            </details>

            <div className="account-balance-breakdown" aria-label="Capital y diferencia al corte">
              <div><span>APORTES REGISTRADOS</span><strong>{formatPreciseCurrency(selectedPerformance?.principal ?? investmentContributions)}</strong></div>
              <div><span>RENDIMIENTO ACUMULADO</span><strong>{formatLiveCurrency(selectedPerformance?.earned ?? 0)}</strong><small>Saldo actual menos aportes · crece con el tiempo</small></div>
              <div><span>SALDO ACTUAL</span><strong>{formatLiveCurrency(selectedPerformance?.currentValue ?? selectedInvestment.value)}</strong></div>
            </div>

            <section className="capital-evolution">
              <div className="performance-chart-heading">
                <div><span className="chart-overline">HISTORIAL DE LA CUENTA</span><h3>Evolución del capital</h3><span>{selectedInvestmentRecord?.verifiedAt ? 'Saldo confirmado y aportes registrados' : 'Saldo y aportes registrados'}</span></div>
                <div className="chart-current-balance"><small>SALDO AL FINAL DEL RANGO</small><strong>{formatLiveCurrency(balanceHistory.at(-1)?.total ?? selectedInvestment.value)}</strong></div>
              </div>
              <div className="chart-horizon-control" aria-label="Periodo de evolución del capital">
                <div className="chart-horizon-heading">
                  <strong>Horizonte de esta gráfica</strong><span>No afecta la gráfica siguiente</span>
                </div>
                <div className="chart-horizon-options">
                  {HORIZON_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={balanceChartHorizon === value ? 'chart-horizon-option selected' : 'chart-horizon-option'}
                      aria-pressed={balanceChartHorizon === value}
                      onClick={() => setBalanceChartHorizon(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {balanceChartHorizon === 'custom' && (
                  <div className="custom-chart-range">
                    <label>Desde<input aria-label="Desde evolución del capital" type="date" value={balanceCustomStart} max={formatLocalDate(now)} onChange={(event) => setBalanceCustomStart(event.target.value)} /></label>
                    <span aria-hidden="true">→</span>
                    <label>Hasta<input aria-label="Hasta evolución del capital" type="date" value={balanceCustomEnd} min={balanceCustomStart} max={formatLocalDate(now)} onChange={(event) => setBalanceCustomEnd(event.target.value)} /></label>
                    {!balanceChartRange && <small role="alert">Elige fechas válidas para la evolución del capital.</small>}
                  </div>
                )}
              </div>
              {balanceChartRange
                ? <InvestmentGrowthChart points={balanceHistory.map((point) => ({ label: point.label, value: point.total, timestamp: point.timestamp }))} />
                : <p className="capital-yield-empty">Corrige las fechas para ver este periodo.</p>}
            </section>

            <section className="capital-yield-panel" aria-label="Separación del capital aportado y el rendimiento">
              <div className="capital-yield-heading">
                <div><span className="section-kicker">DESGLOSE DEL SALDO</span><h3>Capital vs. rendimiento</h3></div>
              </div>
              <p className="capital-yield-explanation">{selectedInvestmentRecord?.verifiedAt ? 'Rendimiento previo estimado con EA; en el corte es la diferencia entre saldo confirmado y capital registrado.' : 'Rendimiento estimado con los aportes y la tasa EA registrada.'} Ambas líneas usan la misma escala COP para que la brecha represente la diferencia real.</p>
              <div className="chart-horizon-control" aria-label="Periodo de capital y rendimiento">
                <div className="chart-horizon-heading">
                  <strong>Horizonte de esta gráfica</strong><span>No afecta la gráfica anterior</span>
                </div>
                <div className="chart-horizon-options">
                  {HORIZON_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={breakdownChartHorizon === value ? 'chart-horizon-option selected' : 'chart-horizon-option'}
                      aria-pressed={breakdownChartHorizon === value}
                      onClick={() => setBreakdownChartHorizon(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {breakdownChartHorizon === 'custom' && (
                  <div className="custom-chart-range">
                    <label>Desde<input aria-label="Desde capital y rendimiento" type="date" value={breakdownCustomStart} max={formatLocalDate(now)} onChange={(event) => setBreakdownCustomStart(event.target.value)} /></label>
                    <span aria-hidden="true">→</span>
                    <label>Hasta<input aria-label="Hasta capital y rendimiento" type="date" value={breakdownCustomEnd} min={breakdownCustomStart} max={formatLocalDate(now)} onChange={(event) => setBreakdownCustomEnd(event.target.value)} /></label>
                    {!breakdownChartRange && <small role="alert">Elige fechas válidas para capital y rendimiento.</small>}
                  </div>
                )}
              </div>
              {breakdownChartRange
                ? <InvestmentCapitalYieldChart points={breakdownHistory} />
                : <p className="capital-yield-empty">Corrige las fechas para ver este periodo.</p>}
            </section>

            <section className="yield-outlook">
              <div className="yield-outlook-heading"><div><span className="section-kicker">SI SE MANTIENE LA TASA ACTUAL</span><h3>Proyección por plazo</h3></div><span>Ganancia estimada</span></div>
              <div className="yield-periods">
                {(selectedPerformance?.periods ?? []).map((period) => (
                  <article key={period.label}><span>{period.label.replace('En ', '')}</span><strong>{formatPreciseCurrency(period.amount)}</strong><i aria-hidden="true" /></article>
                ))}
              </div>
            </section>

            <section className="daily-interest-panel">
              <div className="daily-interest-heading">
                <div><span className="section-kicker">REGISTRO DIARIO · ESTIMADO</span><h3>Interés ganado cada día</h3></div>
                <span>Las barras cerradas quedan guardadas y no se recalculan.</span>
              </div>
              <p className="daily-interest-note">Cada barra representa un día; este modo muestra los últimos 30 días disponibles (habrá menos si la cuenta es más reciente). Se guarda el cálculo de cada día y los días sin uso se completan al volver a abrir la app. La barra del corte puede cubrir solo el tiempo posterior a la confirmación. Es una estimación con la EA, no un abono oficial de Nu.</p>
              <div className="chart-horizon-control" aria-label="Periodo del gráfico de interés diario">
                <div className="chart-horizon-heading">
                  <strong>Periodo de esta gráfica</strong><span>No afecta las otras gráficas</span>
                </div>
                <div className="chart-horizon-options">
                  {([
                    ['daily', '1 día · últimos 30'],
                    ['7', '7 días'],
                    ['30', '30 días'],
                    ['90', '90 días'],
                    ['180', '6 meses'],
                    ['365', '1 año'],
                    ['custom', 'Personalizado'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={dailyInterestHorizon === value ? 'chart-horizon-option selected' : 'chart-horizon-option'}
                      aria-pressed={dailyInterestHorizon === value}
                      onClick={() => setDailyInterestHorizon(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {dailyInterestHorizon === 'custom' && (
                  <div className="custom-chart-range">
                    <label>Desde<input aria-label="Desde interés diario" type="date" value={dailyInterestCustomStart} max={formatLocalDate(now)} onChange={(event) => setDailyInterestCustomStart(event.target.value)} /></label>
                    <span aria-hidden="true">→</span>
                    <label>Hasta<input aria-label="Hasta interés diario" type="date" value={dailyInterestCustomEnd} min={dailyInterestCustomStart} max={formatLocalDate(now)} onChange={(event) => setDailyInterestCustomEnd(event.target.value)} /></label>
                    {!dailyInterestRange && <small role="alert">Elige un rango diario válido que no supere hoy.</small>}
                  </div>
                )}
              </div>
              {dailyInterestRange
                ? <DailyInterestChart
                  snapshots={visibleDailyInterest}
                  startDate={dailyInterestRange.startDate}
                  endDate={dailyInterestRange.endDate}
                />
                : <p className="daily-interest-empty">Corrige las fechas para consultar el historial diario.</p>}
            </section>

            <section className="long-term-panel">
              <div className="long-term-heading">
                <div><span className="section-kicker">SI TODO SIGUE IGUAL</span><h3>Proyección a largo plazo</h3></div>
                <span>EA {selectedInvestment.annualYield}% · sin nuevos aportes</span>
              </div>
              <p className="long-term-note">Parte de un saldo estimado de {formatPreciseCurrency(longTermCurrentBalance)} y aplica interés compuesto con la tasa actual. Cada punto indica el saldo estimado de esta inversión a ese plazo.</p>
              <LongTermProjectionChart points={longTermProjection} currentBalance={longTermCurrentBalance} />
            </section>
          </section>

          <section className="panel detail-activity">
            <div className="section-heading"><div><span className="section-kicker">HISTORIAL DE LA CUENTA</span><h2>Actividad y aportes</h2></div><span className="section-count">{investmentMovements.length}</span></div>
            {investmentMovements.length ? (
              <div className="detail-movement-list">
                {investmentMovements.map((movement) => (
                  <div className="detail-movement-row" key={movement.id}>
                    <span className={`movement-icon ${movement.direction}`}>{movement.direction === 'income' ? '↙' : movement.direction === 'expense' || movement.direction === 'withdrawal' ? '↗' : '↔'}</span>
                    <span className="detail-movement-copy"><strong>{movement.title}</strong><small>{movement.category} · {formatDate(movement.date)}{movement.time ? ` · ${movement.time}` : ''}</small></span>
                    <strong className={signedFlowAmount(movement) < 0 ? 'movement-expense' : 'movement-income'}>{signedFlowAmount(movement) < 0 ? '−' : '+'}{formatCurrency(movement.amount)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="detail-empty"><span className="detail-empty-orbit">↗</span><strong>Esta cuenta empieza aquí</strong><p>Cuando importes un movimiento y lo asignes a esta cuenta, su actividad aparecerá organizada en este espacio.</p><button className="button button-primary" type="button" onClick={() => setIsImportOpen(true)}>Importar movimientos <span>↑</span></button></div>
            )}
          </section>
          <button type="button" className="detail-remove" onClick={() => deleteInvestment(selectedInvestment.id)}>Eliminar esta cuenta</button>
        </section>}

        {activeSection === 'investment-detail' && !selectedInvestment && <section className="panel missing-investment section-view">
          <strong>No encontramos esta cuenta</strong>
          <p>Puede que ya no exista en este navegador. Tus demás datos siguen guardados.</p>
          <button type="button" className="button button-primary" onClick={() => navigateTo('investments')}>Volver a inversiones <span>→</span></button>
        </section>}

        {activeSection === 'new-investment' && <section className="content-grid section-view registration-view">
          <article className="panel form-panel">
            <div className="section-heading">
              <div><span className="section-kicker">NUEVA INVERSIÓN</span><h2>Registrar inversión</h2><p className="registration-intro">Añade una cuenta o inversión para incluirla en tu portafolio activo.</p></div>
              <span className="form-plus">＋</span>
            </div>
            <div className="telemetry-note">
              <span aria-hidden="true">◷</span>
              <p>El seguimiento comienza en <strong>$0</strong>. El saldo se actualizará al importar y asignar los movimientos de esta inversión.</p>
            </div>
            <form className="data-form" onSubmit={addInvestment}>
              <label>Nombre<input required value={investmentForm.name} onChange={(event) => setInvestmentForm({ ...investmentForm, name: event.target.value })} placeholder="Ej. Cuenta de ahorros" /></label>
              <label>Entidad<input value={investmentForm.institution} onChange={(event) => setInvestmentForm({ ...investmentForm, institution: event.target.value })} placeholder="Banco o plataforma" /></label>
              <div className="form-row">
                <label>Tipo<select value={investmentForm.type} onChange={(event) => setInvestmentForm({ ...investmentForm, type: event.target.value })}><option>Inversión</option><option>Ahorro</option><option>Otro</option></select></label>
                <label>Estado<select value={investmentForm.status} onChange={(event) => setInvestmentForm({ ...investmentForm, status: event.target.value as Investment['status'] })}><option value="real">Dato real</option><option value="estimado">Estimado</option></select></label>
              </div>
              <label>Rendimiento anual estimado <span className="label-optional">(opcional)</span><div className="input-suffix"><input type="number" min="0" step="0.1" value={investmentForm.annualYield} onChange={(event) => setInvestmentForm({ ...investmentForm, annualYield: event.target.value })} placeholder="0" /><span>%</span></div></label>
              <div className="form-row">
                <label>Fecha de apertura<input required type="date" value={investmentForm.date} onChange={(event) => setInvestmentForm({ ...investmentForm, date: event.target.value })} /></label>
                <label>Hora de apertura<input required type="time" value={investmentForm.openingTime} onChange={(event) => setInvestmentForm({ ...investmentForm, openingTime: event.target.value })} /></label>
              </div>
              <button className="button button-primary" type="submit">Agregar cuenta <span>→</span></button>
            </form>
          </article>
        </section>}

        {activeSection === 'movements' && <section className="content-grid movement-grid section-view">
          <article className="panel form-panel">
            <div className="section-heading"><div><span className="section-kicker">FLUJO DE CAJA</span><h2>Registrar movimiento</h2></div><span className="form-plus">↕</span></div>
            <form className="data-form" onSubmit={addMovement}>
              <label>Descripción<input required value={movementForm.title} onChange={(event) => setMovementForm({ ...movementForm, title: event.target.value })} placeholder={movementForm.direction === 'income' ? 'Ej. Nómina de septiembre' : 'Ej. Pago de servicios'} /></label>
              <div className="form-row">
                <label>Monto<input required inputMode="decimal" pattern="[0-9.,\s$]*" title="Ej. 3.209,78" value={movementForm.amount} onChange={(event) => setMovementForm({ ...movementForm, amount: event.target.value })} placeholder="0" /></label>
                <label>Tipo<select value={movementForm.direction} onChange={(event) => setMovementForm({ ...movementForm, direction: event.target.value as Movement['direction'], investmentId: '', destinationInvestmentId: '' })}><option value="income">Ingreso</option><option value="expense">Gasto</option>                <option value="transfer">Transferencia</option><option value="withdrawal">Retiro de inversión</option></select></label>
              </div>
                              {movementForm.direction === 'withdrawal' && <div className="form-row">
                                <label>Retirar de<select required value={movementForm.investmentId} onChange={(event) => setMovementForm({ ...movementForm, investmentId: event.target.value })}><option value="">Selecciona una inversión</option>{currentInvestments.filter((investment) => investment.type !== 'Disponible').map((investment) => <option key={investment.id} value={investment.id}>{investment.name} · {formatCurrency(investment.value)}</option>)}</select></label>
                                <label>Llega a<select value={movementForm.destinationInvestmentId} onChange={(event) => setMovementForm({ ...movementForm, destinationInvestmentId: event.target.value })}><option value="">No sumar a dinero disponible</option>{!currentInvestments.some((investment) => investment.type === 'Disponible') && <option value={AVAILABLE_ACCOUNT_ID}>Dinero disponible (cuenta de ahorros) · nueva</option>}{currentInvestments.filter((investment) => investment.type === 'Disponible').map((investment) => <option key={investment.id} value={investment.id}>{investment.name} · {formatCurrency(investment.value)}</option>)}</select></label>
                              </div>}
                              {movementForm.direction === 'expense' && <label>Pagado desde (opcional)<select value={movementForm.investmentId} onChange={(event) => setMovementForm({ ...movementForm, investmentId: event.target.value })}><option value="">No descontar de cuentas</option>{!currentInvestments.some((investment) => investment.type === 'Disponible') && <option value={AVAILABLE_ACCOUNT_ID}>Dinero disponible (cuenta de ahorros) · nueva</option>}{currentInvestments.map((investment) => <option key={investment.id} value={investment.id}>{investment.name} · {formatCurrency(investment.value)}</option>)}</select></label>}
                              {movementForm.direction === 'transfer' && <label>Aporte a (opcional)<select value={movementForm.investmentId} onChange={(event) => setMovementForm({ ...movementForm, investmentId: event.target.value })}><option value="">No sumar a inversiones</option>{currentInvestments.map((investment) => <option key={investment.id} value={investment.id}>{investment.name} · {formatCurrency(investment.value)}</option>)}</select></label>}
              {movementForm.direction === 'income' && <label>Actividad que genera el ingreso<input required value={movementForm.incomeActivity} onChange={(event) => setMovementForm({ ...movementForm, incomeActivity: event.target.value })} list="income-activities" placeholder="Ej. Empleo" /><datalist id="income-activities">{incomeActivities.map((activity) => <option key={activity} value={activity} />)}</datalist></label>}
              <div className="form-row">
                <label>Categoría<input value={movementForm.category} onChange={(event) => setMovementForm({ ...movementForm, category: event.target.value })} placeholder="Ej. Vivienda" /></label>
                <label>Fecha<input required type="date" value={movementForm.date} onChange={(event) => setMovementForm({ ...movementForm, date: event.target.value })} /></label>
                <label>Hora <span className="label-optional">(opcional)</span><input type="time" value={movementForm.time} onChange={(event) => setMovementForm({ ...movementForm, time: event.target.value })} /></label>
              </div>
              <button className="button button-primary" type="submit">Guardar movimiento <span>→</span></button>
            </form>
          </article>

          <article className="panel list-panel" aria-label="Historial de movimientos">
            <div className="section-heading">
              <div><span className="section-kicker">ACTIVIDAD</span><h2>Movimientos</h2></div>
              <div className="filter-switch">
                {(['all', 'income', 'expense'] as const).map((filter) => <button key={filter} type="button" className={historyFilter === filter ? 'filter-option selected' : 'filter-option'} onClick={() => setHistoryFilter(filter)}>{filter === 'all' ? 'Todos' : filter === 'income' ? 'Ingresos' : 'Gastos'}</button>)}
              </div>
            </div>
            {filteredMovements.length ? (
              <div className="movement-list">
                {filteredMovements.map((movement) => {
                  const relatedMovement = movements.find((item) =>
                    item.id === movement.relatedMovementId || item.relatedMovementId === movement.id,
                  )
                  return (
                    <div className="movement-row" key={movement.id}>
                      <span className={`movement-icon ${movement.direction}`}>{movement.direction === 'income' ? '↙' : movement.direction === 'expense' || movement.direction === 'withdrawal' ? '↗' : '↔'}</span>
                      <div className="movement-details"><strong>{movement.title}</strong><span>{movement.category}{movement.direction === 'income' ? ` · Actividad: ${movement.incomeActivity?.trim() || 'Empleo'}` : ''} · {formatDate(movement.date)}{movement.time ? ` · ${movement.time}` : ''}{movement.account ? ` · ${movement.account}` : ''}{movement.investmentId ? ` · ${movement.direction === 'withdrawal' ? 'Retiro de' : movement.direction === 'expense' ? 'Pagado desde' : movement.category === WITHDRAWAL_RECEIVED_CATEGORY ? 'Recibido en' : 'Aporte a'} ${investments.find((item) => item.id === movement.investmentId)?.name ?? 'inversión'}` : ''}{relatedMovement ? ` · Vinculado con ${relatedMovement.title}` : ''}</span></div>
                      <strong className={movement.direction === 'income' ? 'movement-income' : movement.direction === 'expense' ? 'movement-expense' : 'movement-transfer'}>{movement.direction === 'income' ? '+' : movement.direction === 'expense' ? '−' : movement.direction === 'withdrawal' ? '⇄' : '↔'}{formatCurrency(movement.amount)}</strong>
                      <button type="button" className="delete-button" aria-label={`Eliminar movimiento ${movement.title}`} onClick={() => deleteMovement(movement)}>×</button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="empty-list"><span>02</span><div><strong>{movements.length ? 'No hay resultados' : 'Todavía no hay actividad'}</strong><p>{movements.length ? 'Prueba otro filtro.' : 'Tus ingresos y gastos registrados aparecerán en esta lista.'}</p></div></div>
            )}
          </article>
        </section>}

        <footer className="page-footer"><span>Rastreo Patrimonial</span><span>Datos guardados en este dispositivo · COP</span></footer>
      </main>
      <FinancialImportDialog
        open={isImportOpen}
        existingMovements={movements}
        investments={currentInvestments}
        incomeActivities={incomeActivities}
        onClose={() => setIsImportOpen(false)}
        onImport={importTransactions}
      />
    </div>
  )
}

export default App
