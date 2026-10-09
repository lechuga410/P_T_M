export type Currency = 'COP'

export type InvestmentStatus = 'real' | 'estimado'

export interface YieldChange {
  from: number
  rate: number
}

export interface Investment {
  id: string
  name: string
  institution: string
  type: string
  value: number
  growth: number
  monthlyIncome: number
  annualYield: number
  yieldHistory?: YieldChange[]
  status: InvestmentStatus
  accent: string
  date: string
  openingTime?: string
  verifiedBalance?: number
  verifiedAt?: string
  verifiedPrincipal?: number
}

export interface Movement {
  id: string
  title: string
  date: string
  time?: string
  amount: number
  direction: 'income' | 'expense' | 'transfer' | 'withdrawal'
  category: string
  incomeActivity?: string
  institution?: string
  account?: string
  annualYield?: number
  investmentId?: string
  relatedMovementId?: string
  sourceFile?: string
}

export interface PortfolioEvent {
  id: string
  title: string
  date: string
  amount: number
  direction: 'income' | 'expense' | 'transfer' | 'withdrawal'
  category: string
  source: 'movement' | 'investment'
}

export interface PeriodBreakdown {
  label: string
  income: number
  expense: number
  net: number
}

export interface PortfolioSummary {
  totalPatrimonio: number
  growth: number
  dailyIncome: number
  monthlyIncome: number
  invested: number
  available: number
  annualPerformance: number
}

export interface PortfolioProjection {
  current: number
  target: number
  gap: number
  monthlyContribution: number
  projectedValue: number
  monthsToTarget: number
}

export interface TrendPoint {
  label: string
  value: number
}
