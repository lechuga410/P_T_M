import { useChartTooltip } from './ChartTooltip'
import type { TooltipContent } from './ChartTooltip'
import type { Movement, PeriodBreakdown } from '../types'

interface MonthlyFlowChartProps {
  months: PeriodBreakdown[]
  movements: Movement[]
  now: Date
}

const currency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)

const signed = (amount: number) => `${amount >= 0 ? '+' : '−'}${currency(Math.abs(amount))}`

const GREEN = '#54aa85'
const ORANGE = '#e1a37f'
const BLUE = '#4c86c6'

export function MonthlyFlowChart({ months, movements, now }: MonthlyFlowChartProps) {
  const { containerRef, show, hide, tooltip } = useChartTooltip<HTMLDivElement>()
  const maxAmount = Math.max(...months.flatMap((item) => [item.income, item.expense]), 1)

  const contentFor = (month: PeriodBreakdown, index: number): TooltipContent => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months.length - 1 - index), 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const monthMovements = movements.filter((movement) => movement.date.startsWith(key) && (movement.direction === 'income' || movement.direction === 'expense'))
    const biggestExpense = monthMovements.filter((movement) => movement.direction === 'expense').sort((a, b) => b.amount - a.amount)[0]
    const incomeByActivity = new Map<string, number>()
    monthMovements.filter((movement) => movement.direction === 'income').forEach((movement) => {
      const activity = movement.incomeActivity?.trim() || 'Empleo'
      incomeByActivity.set(activity, (incomeByActivity.get(activity) ?? 0) + movement.amount)
    })
    const topActivity = [...incomeByActivity.entries()].sort((a, b) => b[1] - a[1])[0]
    const previous = months[index - 1]
    const savingsRate = month.income > 0 ? (month.net / month.income) * 100 : undefined
    const expenseChange = previous && previous.expense > 0 ? ((month.expense - previous.expense) / previous.expense) * 100 : undefined
    const isCurrent = index === months.length - 1
    const badges = [
      isCurrent ? 'Mes en curso' : undefined,
      month.income === 0 && month.expense === 0 ? 'Sin actividad' : month.net >= 0 ? 'Superávit' : 'Déficit',
    ].filter((badge): badge is string => badge !== undefined)

    return {
      title: date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
      subtitle: `${monthMovements.length} ${monthMovements.length === 1 ? 'movimiento' : 'movimientos'}`,
      valueLabel: 'Balance del mes',
      value: signed(month.net),
      rows: [
        { label: 'Ingresos', value: currency(month.income), color: GREEN },
        { label: 'Gastos', value: currency(month.expense), color: ORANGE },
        ...(savingsRate !== undefined ? [{ label: 'Ahorro del mes', value: `${savingsRate.toFixed(0)}%`, color: BLUE }] : []),
        ...(expenseChange !== undefined ? [{ label: 'Gastos vs. mes anterior', value: `${expenseChange >= 0 ? '▲' : '▼'} ${Math.abs(expenseChange).toFixed(0)}%`, color: expenseChange > 0 ? '#d4674f' : GREEN }] : []),
        ...(biggestExpense ? [{ label: `Mayor gasto · ${biggestExpense.title.slice(0, 22)}`, value: currency(biggestExpense.amount), color: '#d4674f' }] : []),
        ...(topActivity ? [{ label: `Principal ingreso · ${topActivity[0]}`, value: currency(topActivity[1]), color: GREEN }] : []),
      ],
      badges,
    }
  }

  return (
    <div className="flow-chart" ref={containerRef} style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
      {months.map((month, index) => {
        const content = contentFor(month, index)
        return (
          <div
            className="month-column"
            key={`${month.label}-${index}`}
            tabIndex={0}
            aria-label={`${content.title}: ingresos ${currency(month.income)}, gastos ${currency(month.expense)}`}
            onMouseEnter={show(content)}
            onMouseMove={show(content)}
            onMouseLeave={hide}
            onFocus={show(content)}
            onBlur={hide}
          >
            <div className="month-bars">
              <span className="flow-bar income-bar" style={{ height: `${Math.max((month.income / maxAmount) * 100, month.income ? 5 : 0)}%` }} />
              <span className="flow-bar expense-bar" style={{ height: `${Math.max((month.expense / maxAmount) * 100, month.expense ? 5 : 0)}%` }} />
            </div>
            <span className="month-label">{month.label}</span>
          </div>
        )
      })}
      {tooltip}
    </div>
  )
}