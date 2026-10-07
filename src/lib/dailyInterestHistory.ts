import type { Investment, Movement } from '../types'
import { isInvestmentFlow, signedFlowAmount } from './investmentFlows'

export const DAILY_INTEREST_STORAGE_KEY = 'rastreo-patrimonial-daily-interest-v1'

const DAY_MS = 24 * 60 * 60 * 1000
const YEAR_MS = 365 * DAY_MS

export interface DailyInterestSnapshot {
  investmentId: string
  date: string
  openingBalance: number
  contributions: number
  interest: number
  closingBalance: number
  annualYield: number
  anchoredToConfirmation: boolean
}

function localTimestamp(date: string, time?: string): number {
  const timestamp = new Date(`${date}T${time || '12:00'}:00`).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function endOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime()
}

function accrueInterval(
  balance: number,
  start: number,
  end: number,
  annualYield: number,
  movements: Array<{ timestamp: number; amount: number }>,
): { balance: number; interest: number; contributions: number } {
  let currentBalance = balance
  let interest = 0
  let contributions = 0
  let cursor = start

  for (const movement of movements) {
    if (movement.timestamp <= cursor || movement.timestamp > end) continue
    const grownBalance = currentBalance * Math.pow(1 + annualYield / 100, (movement.timestamp - cursor) / YEAR_MS)
    interest += grownBalance - currentBalance
    currentBalance = grownBalance + movement.amount
    contributions += movement.amount
    cursor = movement.timestamp
  }

  const grownBalance = currentBalance * Math.pow(1 + annualYield / 100, Math.max(end - cursor, 0) / YEAR_MS)
  interest += grownBalance - currentBalance
  return { balance: grownBalance, interest, contributions }
}

export function loadDailyInterestHistory(): DailyInterestSnapshot[] {
  try {
    const serialized = localStorage.getItem(DAILY_INTEREST_STORAGE_KEY)
    if (!serialized) return []
    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed)) throw new Error('El historial diario guardado no tiene el formato esperado.')
    return parsed.filter((entry): entry is DailyInterestSnapshot =>
      Boolean(
        entry
        && typeof entry.investmentId === 'string'
        && typeof entry.date === 'string'
        && Number.isFinite(entry.openingBalance)
        && Number.isFinite(entry.contributions)
        && Number.isFinite(entry.interest)
        && Number.isFinite(entry.closingBalance)
        && Number.isFinite(entry.annualYield)
        && typeof entry.anchoredToConfirmation === 'boolean',
      ),
    )
  } catch (error) {
    console.error('No se pudo leer el historial permanente de intereses diarios.', error)
    return []
  }
}

export function appendDailyInterestSnapshots(
  investments: Investment[],
  movements: Movement[],
  existing: DailyInterestSnapshot[],
  now = new Date(),
): DailyInterestSnapshot[] {
  const snapshots = new Map(existing.map((snapshot) => [`${snapshot.investmentId}:${snapshot.date}`, snapshot]))
  const lastCompletedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const lastCompletedEnd = endOfLocalDay(lastCompletedDate)

  for (const investment of investments) {
    if (investment.annualYield <= 0) continue
    const investmentMovements = movements
      .filter((movement) => isInvestmentFlow(movement, investment))
      .map((movement) => ({ timestamp: localTimestamp(movement.date, movement.time), amount: signedFlowAmount(movement) }))
      .sort((left, right) => left.timestamp - right.timestamp)
    const investmentSnapshots = [...snapshots.values()]
      .filter((snapshot) => snapshot.investmentId === investment.id)
      .sort((left, right) => left.date.localeCompare(right.date))
    const openingAt = localTimestamp(investment.date, investment.openingTime)
    const verifiedAt = investment.verifiedAt ? new Date(investment.verifiedAt).getTime() : Number.NaN
    const hasVerifiedBalance = typeof investment.verifiedBalance === 'number'
      && Number.isFinite(investment.verifiedBalance)
      && investment.verifiedBalance >= 0
      && Number.isFinite(verifiedAt)
    const firstRecordedDate = investmentSnapshots[0]?.date

    if (firstRecordedDate && openingAt < new Date(`${firstRecordedDate}T00:00:00`).getTime()) {
      const contributionsAtVerification = hasVerifiedBalance
        ? investmentMovements
          .filter((movement) => movement.timestamp <= verifiedAt)
          .reduce((sum, movement) => sum + movement.amount, 0)
        : 0
      const principalAtVerification = hasVerifiedBalance
        ? typeof investment.verifiedPrincipal === 'number' && Number.isFinite(investment.verifiedPrincipal)
          ? investment.verifiedPrincipal
          : contributionsAtVerification
        : 0
      const recordedContributions = investmentMovements.reduce((sum, movement) => sum + movement.amount, 0)
      let historicalBalance = hasVerifiedBalance
        ? Math.max(principalAtVerification - contributionsAtVerification, 0)
        : Math.max(investment.value - recordedContributions, 0)
      const openingContributions = investmentMovements
        .filter((movement) => movement.timestamp <= openingAt)
        .reduce((sum, movement) => sum + movement.amount, 0)
      historicalBalance += openingContributions
      const investmentOpeningDate = new Date(`${investment.date}T12:00:00`)

      for (
        let date = new Date(investmentOpeningDate.getFullYear(), investmentOpeningDate.getMonth(), investmentOpeningDate.getDate());
        formatLocalDate(date) < firstRecordedDate;
        date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      ) {
        const dateKey = formatLocalDate(date)
        const key = `${investment.id}:${dateKey}`
        if (snapshots.has(key)) continue
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
        const dayEnd = endOfLocalDay(date)
        const intervalStart = Math.max(openingAt, dayStart)
        if (dayEnd <= intervalStart) continue

        const openedOnThisDay = dateKey === formatLocalDate(new Date(openingAt))
        const openingBalance = openedOnThisDay
          ? Math.max(historicalBalance - openingContributions, 0)
          : historicalBalance
        let dailyInterest = 0
        let dailyContributions = openedOnThisDay ? openingContributions : 0
        const hasCutInDay = hasVerifiedBalance && verifiedAt > intervalStart && verifiedAt <= dayEnd

        if (hasCutInDay && typeof investment.verifiedBalance === 'number') {
          const beforeCut = accrueInterval(
            historicalBalance,
            intervalStart,
            verifiedAt,
            investment.annualYield,
            investmentMovements.filter((movement) => movement.timestamp > intervalStart && movement.timestamp <= verifiedAt),
          )
          dailyInterest += beforeCut.interest
          dailyContributions += beforeCut.contributions
          historicalBalance = investment.verifiedBalance
          const afterCut = accrueInterval(
            historicalBalance,
            verifiedAt,
            dayEnd,
            investment.annualYield,
            investmentMovements.filter((movement) => movement.timestamp > verifiedAt && movement.timestamp <= dayEnd),
          )
          dailyInterest += afterCut.interest
          dailyContributions += afterCut.contributions
          historicalBalance = afterCut.balance
        } else {
          const accrued = accrueInterval(
            historicalBalance,
            intervalStart,
            dayEnd,
            investment.annualYield,
            investmentMovements.filter((movement) => movement.timestamp > intervalStart && movement.timestamp <= dayEnd),
          )
          dailyInterest = accrued.interest
          dailyContributions += accrued.contributions
          historicalBalance = accrued.balance
        }

        if (historicalBalance > 0) {
          snapshots.set(key, {
            investmentId: investment.id,
            date: dateKey,
            openingBalance,
            contributions: dailyContributions,
            interest: dailyInterest,
            closingBalance: historicalBalance,
            annualYield: investment.annualYield,
            anchoredToConfirmation: hasCutInDay,
          })
        }
      }
    }

    const refreshedSnapshots = [...snapshots.values()]
      .filter((snapshot) => snapshot.investmentId === investment.id)
      .sort((left, right) => left.date.localeCompare(right.date))
    const lastSnapshot = refreshedSnapshots.at(-1)
    let balance: number
    let anchorTimestamp: number

    if (lastSnapshot) {
      balance = lastSnapshot.closingBalance
      anchorTimestamp = endOfLocalDay(new Date(`${lastSnapshot.date}T12:00:00`))
    } else if (hasVerifiedBalance && typeof investment.verifiedBalance === 'number') {
      balance = investment.verifiedBalance
      anchorTimestamp = verifiedAt
    } else {
      const totalContributions = investmentMovements.reduce((sum, movement) => sum + movement.amount, 0)
      balance = Math.max(investment.value - totalContributions, 0)
      anchorTimestamp = openingAt
    }

    if (anchorTimestamp > lastCompletedEnd) continue
    const anchorDate = new Date(anchorTimestamp)
    const firstDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())

    for (let date = firstDate; date.getTime() <= lastCompletedEnd;) {
      const dateKey = formatLocalDate(date)
      const snapshotKey = `${investment.id}:${dateKey}`
      const dayEnd = endOfLocalDay(date)
      if (snapshots.has(snapshotKey)) {
        date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
        continue
      }

      const intervalStart = Math.max(anchorTimestamp, new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime())
      if (dayEnd <= intervalStart) {
        date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
        continue
      }

      const openingBalance = balance
      let dailyInterest = 0
      let dailyContributions = 0
      let anchoredToConfirmation = false
      const hasConfirmationInDay = hasVerifiedBalance
        && verifiedAt > intervalStart
        && verifiedAt <= dayEnd

      if (hasConfirmationInDay && typeof investment.verifiedBalance === 'number') {
        const beforeCut = accrueInterval(
          balance,
          intervalStart,
          verifiedAt,
          investment.annualYield,
          investmentMovements.filter((movement) => movement.timestamp > intervalStart && movement.timestamp <= verifiedAt),
        )
        dailyInterest += beforeCut.interest
        dailyContributions += beforeCut.contributions
        balance = investment.verifiedBalance
        anchoredToConfirmation = true
        const afterCut = accrueInterval(
          balance,
          verifiedAt,
          dayEnd,
          investment.annualYield,
          investmentMovements.filter((movement) => movement.timestamp > verifiedAt && movement.timestamp <= dayEnd),
        )
        dailyInterest += afterCut.interest
        dailyContributions += afterCut.contributions
        balance = afterCut.balance
      } else {
        const accrued = accrueInterval(
          balance,
          intervalStart,
          dayEnd,
          investment.annualYield,
          investmentMovements.filter((movement) => movement.timestamp > intervalStart && movement.timestamp <= dayEnd),
        )
        dailyInterest = accrued.interest
        dailyContributions = accrued.contributions
        balance = accrued.balance
      }

      if (balance > 0) {
        snapshots.set(snapshotKey, {
          investmentId: investment.id,
          date: dateKey,
          openingBalance,
          contributions: dailyContributions,
          interest: dailyInterest,
          closingBalance: balance,
          annualYield: investment.annualYield,
          anchoredToConfirmation,
        })
      }

      anchorTimestamp = dayEnd
      date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    }
  }

  return [...snapshots.values()].sort((left, right) =>
    left.date.localeCompare(right.date) || left.investmentId.localeCompare(right.investmentId),
  )
}

export function estimateInvestmentBalanceNow(
  investment: Investment,
  movements: Movement[],
  snapshots: DailyInterestSnapshot[],
  now = new Date(),
): number {
  const contributions = movements
    .filter((movement) => isInvestmentFlow(movement, investment))
    .map((movement) => ({ timestamp: localTimestamp(movement.date, movement.time), amount: signedFlowAmount(movement) }))
    .sort((left, right) => left.timestamp - right.timestamp)
  const lastSnapshot = snapshots
    .filter((snapshot) => snapshot.investmentId === investment.id)
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1)
  let balance: number
  let anchorTimestamp: number

  if (lastSnapshot) {
    balance = lastSnapshot.closingBalance
    anchorTimestamp = endOfLocalDay(new Date(`${lastSnapshot.date}T12:00:00`))
  } else if (
    typeof investment.verifiedBalance === 'number'
    && Number.isFinite(investment.verifiedBalance)
    && investment.verifiedBalance >= 0
    && investment.verifiedAt
    && Number.isFinite(new Date(investment.verifiedAt).getTime())
  ) {
    balance = investment.verifiedBalance
    anchorTimestamp = new Date(investment.verifiedAt).getTime()
  } else {
    const totalContributions = contributions.reduce((sum, movement) => sum + movement.amount, 0)
    balance = Math.max(investment.value - totalContributions, 0)
    anchorTimestamp = localTimestamp(investment.date, investment.openingTime)
  }

  const verifiedAt = investment.verifiedAt ? new Date(investment.verifiedAt).getTime() : Number.NaN
  const hasNewerConfirmation = typeof investment.verifiedBalance === 'number'
    && Number.isFinite(investment.verifiedBalance)
    && investment.verifiedBalance >= 0
    && Number.isFinite(verifiedAt)
    && verifiedAt > anchorTimestamp

  if (hasNewerConfirmation && typeof investment.verifiedBalance === 'number') {
    balance = investment.verifiedBalance
    anchorTimestamp = verifiedAt
    if (verifiedAt > now.getTime()) return balance
  }

  return accrueInterval(
    balance,
    anchorTimestamp,
    now.getTime(),
    investment.annualYield,
    contributions.filter((movement) => movement.timestamp > anchorTimestamp && movement.timestamp <= now.getTime()),
  ).balance
}

export function buildDailyInterestProjection(
  balance: number,
  annualYield: number,
  years = [2, 3, 4, 5, 10, 20, 30],
): Array<{ years: number; balance: number }> {
  return years.map((year) => ({
    years: year,
    balance: balance * Math.pow(1 + annualYield / 100, year),
  }))
}
