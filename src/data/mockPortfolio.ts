import type { Investment, Movement, PortfolioSummary, TrendPoint } from '../types'

export const summary: PortfolioSummary = {
  totalPatrimonio: 16820000,
  growth: 2639000,
  dailyIncome: 132000,
  monthlyIncome: 647000,
  invested: 14900000,
  available: 1920000,
  annualPerformance: 18.6,
}

export const investments: Investment[] = [
  {
    id: 'nu-cajita',
    name: 'Cajita Nu',
    institution: 'Nu',
    type: 'Rendimiento fijo',
    value: 8400000,
    growth: 1265000,
    monthlyIncome: 211000,
    annualYield: 9.3,
    status: 'real',
    accent: '#3b82f6',
    date: '2024-08-15',
  },
  {
    id: 'nu-meta',
    name: 'Meta ahorro',
    institution: 'Nu',
    type: 'Ahorro objetivo',
    value: 3100000,
    growth: 480000,
    monthlyIncome: 98000,
    annualYield: 7.1,
    status: 'estimado',
    accent: '#22c55e',
    date: '2025-01-10',
  },
  {
    id: 'banco-cta',
    name: 'Cuenta corriente',
    institution: 'Banco Davivienda',
    type: 'Disponible',
    value: 1920000,
    growth: 0,
    monthlyIncome: 0,
    annualYield: 0,
    status: 'real',
    accent: '#a78bfa',
    date: '2025-09-01',
  },
  {
    id: 'inversion-otros',
    name: 'Inversión adicional',
    institution: 'Bursátil',
    type: 'Portafolio variable',
    value: 1600000,
    growth: 430000,
    monthlyIncome: 76000,
    annualYield: 12.4,
    status: 'estimado',
    accent: '#f59e0b',
    date: '2025-06-12',
  },
]

export const movements: Movement[] = [
  { id: 'm1', title: 'Aporte mensual', date: '2026-09-01', amount: 1100000, direction: 'income', category: 'Aporte' },
  { id: 'm2', title: 'Rendimiento Nu', date: '2026-09-02', amount: 240000, direction: 'income', category: 'Rendimiento' },
  { id: 'm3', title: 'Retiro de emergencia', date: '2026-09-05', amount: -350000, direction: 'expense', category: 'Retiro' },
  { id: 'm4', title: 'Comisión', date: '2026-09-07', amount: -18000, direction: 'expense', category: 'Comisión' },
  { id: 'm5', title: 'Ingreso extra', date: '2026-09-10', amount: 600000, direction: 'income', category: 'Ingreso' },
]

export const trend: TrendPoint[] = [
  { label: 'Ene', value: 11.2 },
  { label: 'Feb', value: 12.1 },
  { label: 'Mar', value: 12.9 },
  { label: 'Abr', value: 13.8 },
  { label: 'May', value: 14.7 },
  { label: 'Jun', value: 15.4 },
  { label: 'Jul', value: 16.1 },
  { label: 'Ago', value: 17.0 },
  { label: 'Sep', value: 18.6 },
]
