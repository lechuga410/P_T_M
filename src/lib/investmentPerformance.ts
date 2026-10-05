import type { Investment, Movement } from '../types'

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface YieldPeriod {
  label: string
  amount: number
}

export interface InvestmentTrendPoint {
  label: string
  value: number
}

export interface InvestmentHistoryPoint {
  timestamp: number
  label: string
  principal: number
  earned: number
  total: number
}

export interface InvestmentPerformance {
  principal: number
  earned: number
  currentValue: number
  monthlyEstimate: number
  periods: YieldPeriod[]
  trend: InvestmentTrendPoint[]
}

interface InvestmentLot {
  amount: number
  principal: number
  start: number
}

function localTimestamp(date: string, time?: string): number {
  const timestamp = new Date(`${date}T${time || '12:00'}:00`).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function valueAfterYield(amount: number, annualYield: number, start: number, end: number): number {
  if (amount <= 0 || annualYield <= 0 || end <= start) return amount
  const value = amount * Math.pow(1 + annualYield / 100, (end - start) / YEAR_MS)
  return Number.isFinite(value) ? value : amount
}

function buildLots(investment: Investment, movements: Movement[]) {
  const contributions = movements.filter(
    (movement) => movement.investmentId === investment.id && movement.direction === 'transfer',
  )
  const recordedContributions = contributions.reduce((sum, movement) => sum + movement.amount, 0)
  const openingAt = localTimestamp(investment.date, investment.openingTime)
  const verifiedAt = investment.verifiedAt ? new Date(investment.verifiedAt).getTime() : Number.NaN
  const verifiedBalance = investment.verifiedBalance
  if (
    Number.isFinite(verifiedAt)
    && typeof verifiedBalance === 'number'
    && Number.isFinite(verifiedBalance)
    && verifiedBalance >= 0
  ) {
    const principalAtVerification = typeof investment.verifiedPrincipal === 'number'
      && Number.isFinite(investment.verifiedPrincipal)
      ? investment.verifiedPrincipal
      : contributions
        .filter((movement) => localTimestamp(movement.date, movement.time) <= verifiedAt)
        .reduce((sum, movement) => sum + movement.amount, 0)
    const lots: InvestmentLot[] = [{
      amount: verifiedBalance,
      principal: principalAtVerification,
      start: verifiedAt,
    }]

    for (const movement of contributions) {
      const start = localTimestamp(movement.date, movement.time)
      if (start > verifiedAt) lots.push({ amount: movement.amount, principal: movement.amount, start })
    }
    return lots
  }

  const baseline = Math.max(investment.value - recordedContributions, 0)
  const lots: InvestmentLot[] = baseline > 0
    ? [{ amount: baseline, principal: baseline, start: openingAt }]
    : []

  for (const movement of contributions) {
    lots.push({ amount: movement.amount, principal: movement.amount, start: localTimestamp(movement.date, movement.time) })
  }

  return lots
}

function accruedAt(
  lots: InvestmentLot[],
  investment: Investment,
  at: number,
): { principal: number; earned: number; currentValue: number } {
  let principal = 0
  let earned = 0

  for (const lot of lots) {
    if (lot.start > at) continue
    const currentLotValue = valueAfterYield(lot.amount, investment.annualYield, lot.start, at)
    principal += lot.principal
    earned += currentLotValue - lot.principal
  }

  return { principal, earned, currentValue: principal + earned }
}

function addHistoryTimestamps(timestamps: Set<number>, startAt: number, endAt: number): void {
  const duration = endAt - startAt
  if (duration <= 62 * DAY_MS) {
    for (let timestamp = startAt + DAY_MS; timestamp < endAt; timestamp += DAY_MS) {
      timestamps.add(timestamp)
    }
    return
  }

  if (duration <= 190 * DAY_MS) {
    for (let timestamp = startAt + 7 * DAY_MS; timestamp < endAt; timestamp += 7 * DAY_MS) {
      timestamps.add(timestamp)
    }
    return
  }

  const firstMonth = new Date(startAt)
  firstMonth.setDate(1)
  firstMonth.setHours(0, 0, 0, 0)
  firstMonth.setMonth(firstMonth.getMonth() + 1)
  for (let timestamp = firstMonth.getTime(); timestamp < endAt;) {
    timestamps.add(timestamp)
    const nextMonth = new Date(timestamp)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    timestamp = nextMonth.getTime()
  }
}

export function calculateInvestmentHistory(
  investment: Investment,
  movements: Movement[],
  startAt: number,
  endAt: number,
): InvestmentHistoryPoint[] {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt >= endAt) return []

  const contributions = movements
    .filter((movement) => movement.investmentId === investment.id && movement.direction === 'transfer')
    .map((movement) => ({ movement, timestamp: movementTimestamp(movement) }))
    .sort((left, right) => left.timestamp - right.timestamp)
  const hasVerification = hasVerifiedBalance(investment)
  const verifiedAt = hasVerification ? new Date(investment.verifiedAt).getTime() : Number.NaN
  const principalAtVerification = hasVerification
    ? typeof investment.verifiedPrincipal === 'number' && Number.isFinite(investment.verifiedPrincipal)
      ? investment.verifiedPrincipal
      : contributions
        .filter(({ timestamp }) => timestamp <= verifiedAt)
        .reduce((sum, { movement }) => sum + movement.amount, 0)
    : 0
  const contributionsAtVerification = hasVerification
    ? contributions
      .filter(({ timestamp }) => timestamp <= verifiedAt)
      .reduce((sum, { movement }) => sum + movement.amount, 0)
    : 0
  const historicalLots: InvestmentLot[] = hasVerification
    ? [
      ...(principalAtVerification > contributionsAtVerification
        ? [{ amount: principalAtVerification - contributionsAtVerification, principal: principalAtVerification - contributionsAtVerification, start: localTimestamp(investment.date, investment.openingTime) }]
        : []),
      ...contributions
        .filter(({ timestamp }) => timestamp <= verifiedAt)
        .map(({ movement, timestamp }) => ({ amount: movement.amount, principal: movement.amount, start: timestamp })),
    ]
    : buildLots(investment, movements)
  const timestamps = new Set<number>([startAt, endAt])
  addHistoryTimestamps(timestamps, startAt, endAt)
  for (const { timestamp } of contributions) {
    if (timestamp >= startAt && timestamp <= endAt) timestamps.add(timestamp)
  }
  if (hasVerification && verifiedAt >= startAt && verifiedAt <= endAt) timestamps.add(verifiedAt)

  const sortedTimestamps = [...timestamps].sort((left, right) => left - right)
  const timestampsPerDay = new Map<string, number>()
  for (const timestamp of sortedTimestamps) {
    const date = new Date(timestamp)
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    timestampsPerDay.set(dayKey, (timestampsPerDay.get(dayKey) ?? 0) + 1)
  }

  return sortedTimestamps.map((timestamp) => {
    let principal: number
    let earned: number
    if (hasVerification && timestamp >= verifiedAt) {
      const laterContributions = contributions
        .filter((item) => item.timestamp > verifiedAt && item.timestamp <= timestamp)
        .reduce((sum, { movement }) => sum + movement.amount, 0)
      principal = principalAtVerification + laterContributions
      earned = investment.verifiedBalance - principalAtVerification
    } else {
      const accrued = accruedAt(historicalLots, investment, timestamp)
      principal = accrued.principal
      earned = accrued.earned
    }

    const pointDate = new Date(timestamp)
    const dayKey = `${pointDate.getFullYear()}-${pointDate.getMonth()}-${pointDate.getDate()}`
    const dateLabel = pointDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '')
    const timeLabel = `${String(pointDate.getHours()).padStart(2, '0')}:${String(pointDate.getMinutes()).padStart(2, '0')}`
    return {
      timestamp,
      label: (timestampsPerDay.get(dayKey) ?? 0) > 1 ? `${dateLabel} ${timeLabel}` : dateLabel,
      principal,
      earned,
      total: principal + earned,
    }
  })
}

function hasVerifiedBalance(investment: Investment): investment is Investment & { verifiedBalance: number; verifiedAt: string } {
  return Number.isFinite(investment.verifiedAt ? new Date(investment.verifiedAt).getTime() : Number.NaN)
    && typeof investment.verifiedBalance === 'number'
    && Number.isFinite(investment.verifiedBalance)
    && investment.verifiedBalance >= 0
}

function movementTimestamp(movement: Movement): number {
  return localTimestamp(movement.date, movement.time)
}

function verifiedBalanceAt(
  investment: Investment & { verifiedBalance: number; verifiedAt: string },
  movements: Movement[],
  at: number,
): { principal: number; earned: number; currentValue: number } {
  const verifiedAt = new Date(investment.verifiedAt).getTime()
  const verifiedPrincipal = typeof investment.verifiedPrincipal === 'number'
    && Number.isFinite(investment.verifiedPrincipal)
    ? investment.verifiedPrincipal
    : movements
      .filter((movement) =>
        movement.investmentId === investment.id
        && movement.direction === 'transfer'
        && movementTimestamp(movement) <= verifiedAt,
      )
      .reduce((sum, movement) => sum + movement.amount, 0)
  const postCutContributions = movements
    .filter((movement) =>
      movement.investmentId === investment.id
      && movement.direction === 'transfer'
      && movementTimestamp(movement) > verifiedAt
      && movementTimestamp(movement) <= at,
    )
    .reduce((sum, movement) => sum + movement.amount, 0)
  const principal = verifiedPrincipal + postCutContributions
  const currentValue = investment.verifiedBalance + postCutContributions
  return { principal, earned: currentValue - principal, currentValue }
}

function verifiedTrend(
  investment: Investment & { verifiedBalance: number; verifiedAt: string },
  movements: Movement[],
  now: Date,
): InvestmentTrendPoint[] {
  const verifiedAt = new Date(investment.verifiedAt).getTime()
  const verifiedPrincipal = typeof investment.verifiedPrincipal === 'number'
    && Number.isFinite(investment.verifiedPrincipal)
    ? investment.verifiedPrincipal
    : movements
      .filter((movement) =>
        movement.investmentId === investment.id
        && movement.direction === 'transfer'
        && movementTimestamp(movement) <= verifiedAt,
      )
      .reduce((sum, movement) => sum + movement.amount, 0)
  const contributions = movements.filter(
    (movement) => movement.investmentId === investment.id && movement.direction === 'transfer',
  )
  const contributionsAtCut = contributions
    .filter((movement) => movementTimestamp(movement) <= verifiedAt)
    .reduce((sum, movement) => sum + movement.amount, 0)
  const untrackedPrincipal = Math.max(verifiedPrincipal - contributionsAtCut, 0)
  const openingAt = localTimestamp(investment.date, investment.openingTime)

  return Array.from({ length: 12 }, (_, index) => {
    const date = index === 11
      ? now
      : new Date(now.getFullYear(), now.getMonth() - 10 + index, 0, 23, 59, 59, 999)
    const timestamp = date.getTime()
    const label = date.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
    const balance = timestamp >= verifiedAt
      ? investment.verifiedBalance + contributions
        .filter((movement) => movementTimestamp(movement) > verifiedAt && movementTimestamp(movement) <= timestamp)
        .reduce((sum, movement) => sum + movement.amount, 0)
      : (timestamp >= openingAt ? untrackedPrincipal : 0) + contributions
        .filter((movement) => movementTimestamp(movement) <= timestamp)
        .reduce((sum, movement) => sum + movement.amount, 0)
    return { label, value: balance }
  })
}

function dateAfterMonths(now: Date, months: number): Date {
  const targetDay = now.getDate()
  const future = new Date(now)
  future.setDate(1)
  future.setMonth(future.getMonth() + months)
  const finalDay = new Date(future.getFullYear(), future.getMonth() + 1, 0).getDate()
  future.setDate(Math.min(targetDay, finalDay))
  return future
}

export function calculateInvestmentPerformance(
  investment: Investment,
  movements: Movement[],
  now = new Date(),
): InvestmentPerformance {
  const lots = buildLots(investment, movements)
  const timestamp = now.getTime()
  const verifiedAt = hasVerifiedBalance(investment) ? new Date(investment.verifiedAt).getTime() : Number.NaN
  const hasCurrentVerifiedBalance = hasVerifiedBalance(investment) && verifiedAt <= timestamp
  const current = hasCurrentVerifiedBalance
    ? verifiedBalanceAt(investment, movements, timestamp)
    : accruedAt(lots, investment, timestamp)
  const intervals = [
    { label: 'En 1 día', end: new Date(timestamp + DAY_MS) },
    { label: 'En 1 semana', end: new Date(timestamp + 7 * DAY_MS) },
    { label: 'En 1 mes', end: dateAfterMonths(now, 1) },
    { label: 'En 3 meses', end: dateAfterMonths(now, 3) },
    { label: 'En 6 meses', end: dateAfterMonths(now, 6) },
    { label: 'En 1 año', end: dateAfterMonths(now, 12) },
  ]
  const periods = intervals.map(({ label, end }) => ({
    label,
    amount: valueAfterYield(current.currentValue, investment.annualYield, timestamp, end.getTime()) - current.currentValue,
  }))
  const monthPoints: InvestmentTrendPoint[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1, 12)
    return {
      label: date.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
      value: accruedAt(lots, investment, date.getTime()).currentValue,
    }
  })
  const trend: InvestmentTrendPoint[] = hasCurrentVerifiedBalance
    ? verifiedTrend(investment, movements, now)
    : monthPoints

  const monthlyEstimate = periods.find((period) => period.label === 'En 1 mes')?.amount ?? 0

  return {
    ...current,
    monthlyEstimate,
    periods,
    trend,
  }
}

export function withCurrentInvestmentPerformance(
  investment: Investment,
  movements: Movement[],
  now = new Date(),
): Investment {
  const performance = calculateInvestmentPerformance(investment, movements, now)
  return {
    ...investment,
    value: performance.currentValue,
    growth: performance.earned,
    monthlyIncome: performance.monthlyEstimate,
  }
}
