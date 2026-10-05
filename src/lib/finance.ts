import type { Investment, Movement, PeriodBreakdown, PortfolioEvent, PortfolioProjection, PortfolioSummary } from '../types'

export const STORAGE_KEY = 'rastreo-patrimonial-v1'
export const MOVEMENTS_STORAGE_KEY = 'rastreo-patrimonial-movements-v1'

export interface IncomeActivityShare {
  activity: string
  amount: number
  percentage: number
  color: string
}

const incomeActivityColors = ['#2459a6', '#4b84c8', '#6f9ed2', '#7c7ec0', '#459b91', '#a6b6ca']

export function buildIncomeActivityBreakdown(
  movements: Movement[],
  months: number,
  referenceDate: Date = new Date(),
): IncomeActivityShare[] {
  const periodLength = Math.max(months, 1)
  const firstMonth = referenceDate.getFullYear() * 12 + referenceDate.getMonth() - periodLength + 1
  const totals = new Map<string, number>()

  for (const movement of movements) {
    if (movement.direction !== 'income') continue
    const [year, month] = movement.date.split('-').map(Number)
    if (!year || !month) continue
    const movementMonth = year * 12 + month - 1
    if (movementMonth < firstMonth || movementMonth > referenceDate.getFullYear() * 12 + referenceDate.getMonth()) continue
    const activity = movement.incomeActivity?.trim() || 'Empleo'
    totals.set(activity, (totals.get(activity) ?? 0) + movement.amount)
  }

  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0)
  if (!total) return []

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([activity, amount], index) => ({
      activity,
      amount,
      percentage: (amount / total) * 100,
      color: incomeActivityColors[index % incomeActivityColors.length],
    }))
}

export function calculatePortfolioSummary(investments: Investment[]): PortfolioSummary {
  const totalPatrimonio = investments.reduce((sum, item) => sum + item.value, 0)
  const totalGrowth = investments.reduce((sum, item) => sum + item.growth, 0)
  const totalMonthlyIncome = investments.reduce((sum, item) => sum + item.monthlyIncome, 0)
  const available = investments
    .filter((item) => item.type.toLocaleLowerCase() === 'disponible')
    .reduce((sum, item) => sum + item.value, 0)
  const weightedYield =
    totalPatrimonio > 0
      ? (investments.reduce((sum, item) => sum + (item.value * item.annualYield) / 100, 0) / totalPatrimonio) * 100
      : 0

  return {
    totalPatrimonio,
    growth: totalGrowth,
    dailyIncome: totalMonthlyIncome / 30,
    monthlyIncome: totalMonthlyIncome,
    invested: totalPatrimonio - available,
    available,
    annualPerformance: Number(weightedYield.toFixed(1)),
  }
}

export function buildPortfolioTimeline(investments: Investment[], movements: Movement[]): PortfolioEvent[] {
  const investmentEvents: PortfolioEvent[] = investments.map((investment) => ({
    id: `investment-${investment.id}`,
    title: `${investment.name} · ${investment.institution}`,
    date: investment.date,
    amount: Math.abs(investment.value),
    direction: 'income',
    category: investment.status === 'real' ? 'Patrimonio real' : 'Patrimonio estimado',
    source: 'investment',
  }))

  const movementEvents: PortfolioEvent[] = movements.map((movement) => ({
    id: movement.id,
    title: movement.title,
    date: movement.date,
    amount: movement.amount,
    direction: movement.direction,
    category: movement.category,
    source: 'movement',
  }))

  return [...investmentEvents, ...movementEvents].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
  )
}

export function calculateMovementSummary(movements: Movement[]) {
  const income = movements
    .filter((movement) => movement.direction === 'income')
    .reduce((sum, movement) => sum + movement.amount, 0)
  const expense = movements
    .filter((movement) => movement.direction === 'expense')
    .reduce((sum, movement) => sum + movement.amount, 0)
  const transfer = movements
    .filter((movement) => movement.direction === 'transfer')
    .reduce((sum, movement) => sum + movement.amount, 0)

  return {
    income,
    expense,
    net: income - expense,
    transfer,
    recent: [...movements]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 5),
  }
}

export function buildPeriodBreakdown(movements: Movement[], months: number = 6, referenceDate: Date = new Date()): PeriodBreakdown[] {
  const monthCount = Math.max(months, 1)

  return Array.from({ length: monthCount }, (_, index) => {
    const currentMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - (monthCount - 1 - index), 1)
    const label = currentMonth.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')

    return movements.reduce(
      (accumulator, movement) => {
        const [year, month] = movement.date.split('-').map(Number)
        if (year === currentMonth.getFullYear() && month === currentMonth.getMonth() + 1) {
          if (movement.direction === 'income') {
            accumulator.income += movement.amount
          } else if (movement.direction === 'expense') {
            accumulator.expense += movement.amount
          }
        }

        return accumulator
      },
      { label, income: 0, expense: 0, net: 0 },
    )
  }).map((item) => ({ ...item, net: item.income - item.expense }))
}

export function calculateEstimatedInvestment(investment: Investment) {
  const annualReturn = (investment.value * investment.annualYield) / 100
  const monthlyReturn = annualReturn / 12
  const dailyReturn = annualReturn / 365

  return {
    annualReturn,
    monthlyReturn,
    dailyReturn,
    projectedValue: investment.value + investment.growth,
  }
}

export function buildPortfolioProjection(
  currentValue: number,
  targetValue: number,
  monthlyContribution: number,
  monthlyNet: number,
): PortfolioProjection {
  const safeCurrent = Math.max(currentValue, 0)
  const safeTarget = Math.max(targetValue, 0)
  const safeMonthlyContribution = Math.max(monthlyContribution, 0)
  const baseMonthly = safeMonthlyContribution > 0 ? safeMonthlyContribution : Math.max(monthlyNet, 0)
  const gap = Math.max(safeTarget - safeCurrent, 0)
  const projectedValue = safeCurrent + baseMonthly * 12
  const monthsToTarget = gap > 0 && baseMonthly > 0 ? Math.ceil(gap / baseMonthly) : 0

  return {
    current: safeCurrent,
    target: safeTarget,
    gap,
    monthlyContribution: baseMonthly,
    projectedValue,
    monthsToTarget,
  }
}

export function createInvestment(input: {
  name: string
  institution: string
  type: string
  annualYield: number
  status: Investment['status']
  date: string
  openingTime: string
}): Investment {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${input.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: input.name,
    institution: input.institution,
    type: input.type,
    value: 0,
    growth: 0,
    monthlyIncome: 0,
    annualYield: input.annualYield,
    status: input.status,
    accent: input.status === 'real' ? '#2459a6' : '#6b78b9',
    date: input.date,
    openingTime: input.openingTime,
  }
}

export function createMovement(input: {
  title: string
  amount: number
  direction: Movement['direction']
  category: string
  incomeActivity?: string
  date?: string
  time?: string
  institution?: string
  account?: string
  annualYield?: number
  investmentId?: string
  sourceFile?: string
}): Movement {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${input.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: input.title,
    amount: Math.abs(input.amount),
    direction: input.direction,
    category: input.category,
    incomeActivity: input.incomeActivity,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    time: input.time,
    institution: input.institution,
    account: input.account,
    annualYield: input.annualYield,
    investmentId: input.investmentId,
    sourceFile: input.sourceFile,
  }
}
