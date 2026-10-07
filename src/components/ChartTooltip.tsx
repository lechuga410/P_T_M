import { useCallback, useRef, useState } from 'react'
import type { FocusEvent, MouseEvent, ReactNode, RefObject } from 'react'

export interface TooltipRow {
  label: string
  value: string
  color?: string
}

export interface TooltipContent {
  title: string
  subtitle?: string
  value?: string
  valueLabel?: string
  rows?: TooltipRow[]
  badges?: string[]
}

interface TooltipState {
  x: number
  y: number
  width: number
  content: TooltipContent
}

export function useChartTooltip<T extends HTMLElement>() {
  const containerRef = useRef<T>(null) as RefObject<T>
  const [state, setState] = useState<TooltipState | null>(null)

  const show = useCallback((content: TooltipContent) => (event: MouseEvent<Element> | FocusEvent<Element>) => {
    const container = containerRef.current
    if (!container) return
    const box = container.getBoundingClientRect()
    let clientX: number
    let clientY: number
    if ('clientX' in event && (event.clientX !== 0 || event.clientY !== 0)) {
      clientX = event.clientX
      clientY = event.clientY
    } else {
      const target = event.currentTarget.getBoundingClientRect()
      clientX = target.left + target.width / 2
      clientY = target.top
    }
    setState({ x: clientX - box.left, y: clientY - box.top, width: box.width, content })
  }, [])

  const hide = useCallback(() => setState(null), [])

  const tooltip: ReactNode = state ? (
    <ChartTooltipCard x={state.x} y={state.y} width={state.width} content={state.content} />
  ) : null

  return { containerRef, show, hide, tooltip }
}

function ChartTooltipCard({ x, y, width, content }: { x: number; y: number; width: number; content: TooltipContent }) {
  const edge = 120
  const align = x < edge ? 'start' : width - x < edge ? 'end' : 'center'
  const shift = align === 'start' ? '-14px' : align === 'end' ? 'calc(-100% + 14px)' : '-50%'

  return (
    <div
      className={`chart-tooltip align-${align}`}
      role="tooltip"
      style={{ left: x, top: y, transform: `translate(${shift}, calc(-100% - 14px))` }}
    >
      <div className="chart-tooltip-head">
        <strong>{content.title}</strong>
        {content.subtitle ? <span>{content.subtitle}</span> : null}
      </div>
      {content.value ? (
        <div className="chart-tooltip-main">
          <small>{content.valueLabel}</small>
          <b>{content.value}</b>
        </div>
      ) : null}
      {content.rows?.length ? (
        <dl className="chart-tooltip-rows">
          {content.rows.map((row) => (
            <div key={row.label}>
              <dt>
                {row.color ? <i style={{ background: row.color }} /> : null}
                {row.label}
              </dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {content.badges?.length ? (
        <div className="chart-tooltip-badges">
          {content.badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
      ) : null}
    </div>
  )
}
