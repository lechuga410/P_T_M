const colombianGroupedAmount = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/
const ungroupedAmount = /^(\d+)(?:([,.])(\d{1,2}))?$/

export function parseCopAmount(input: string): number | undefined {
  const value = input
    .trim()
    .replace(/^COP/i, '')
    .replace(/^\$/, '')
    .replace(/[\s\u00a0]/g, '')

  if (!value) return undefined

  const groupedMatch = value.match(colombianGroupedAmount)
  if (groupedMatch) {
    const integer = groupedMatch[1].replace(/\./g, '')
    const amount = Number(`${integer}.${groupedMatch[2] ?? '0'}`)
    return Number.isFinite(amount) ? amount : undefined
  }

  const ungroupedMatch = value.match(ungroupedAmount)
  if (!ungroupedMatch) return undefined

  const amount = Number(`${ungroupedMatch[1]}.${ungroupedMatch[3] ?? '0'}`)
  return Number.isFinite(amount) ? amount : undefined
}
