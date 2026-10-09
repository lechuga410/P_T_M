import type { Investment, YieldChange } from '../types'

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

type YieldSchedule = Pick<Investment, 'annualYield' | 'yieldHistory'>

function sortedHistory(schedule: YieldSchedule): YieldChange[] {
  return [...(schedule.yieldHistory ?? [])].sort((left, right) => left.from - right.from)
}

export function rateAt(schedule: YieldSchedule, timestamp: number): number {
  const history = sortedHistory(schedule)
  if (!history.length) return schedule.annualYield
  let rate = history[0].rate
  for (const change of history) {
    if (change.from <= timestamp) rate = change.rate
  }
  return rate
}

export function hasAnyYield(schedule: YieldSchedule): boolean {
  return schedule.annualYield > 0 || (schedule.yieldHistory ?? []).some((change) => change.rate > 0)
}

// Cada tasa solo aplica al tramo de tiempo en que estuvo vigente.
export function growBalance(amount: number, schedule: YieldSchedule, start: number, end: number): number {
  if (amount <= 0 || end <= start) return amount
  const breakpoints = sortedHistory(schedule).map((change) => change.from).filter((from) => from > start && from < end)
  let value = amount
  let cursor = start
  for (const point of [...breakpoints, end]) {
    const rate = rateAt(schedule, cursor)
    if (rate > 0) value *= Math.pow(1 + rate / 100, (point - cursor) / YEAR_MS)
    cursor = point
  }
  return Number.isFinite(value) ? value : amount
}

export function withYieldChange(investment: Investment, rate: number, changedAt: number): Investment {
  if (rate === investment.annualYield) return investment
  const history = investment.yieldHistory?.length
    ? investment.yieldHistory.filter((change) => change.from < changedAt)
    : [{ from: 0, rate: investment.annualYield }]
  return { ...investment, annualYield: rate, yieldHistory: [...history, { from: changedAt, rate }] }
}