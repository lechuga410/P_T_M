import type { Investment, Movement } from '../types'

export const WITHDRAWAL_CATEGORY = 'Retiro de inversión'
// Marcador: la cuenta "Dinero disponible" se crea al guardar si aún no existe.
export const AVAILABLE_ACCOUNT_ID = '__available__'
export const WITHDRAWAL_RECEIVED_CATEGORY = 'Retiro recibido'

// Aportes y retiros recibidos suman; retiros y gastos pagados desde la cuenta restan.
export const isInvestmentFlow = (movement: Movement, investment: Pick<Investment, 'id'>) =>
  movement.investmentId === investment.id
  && (movement.direction === 'transfer' || movement.direction === 'withdrawal' || movement.direction === 'expense')

export const signedFlowAmount = (movement: Movement) =>
  movement.direction === 'withdrawal' || movement.direction === 'expense' ? -movement.amount : movement.amount

export const affectsInvestment = (movement: Pick<Movement, 'direction' | 'investmentId'>) =>
  Boolean(movement.investmentId)
  && (movement.direction === 'transfer' || movement.direction === 'withdrawal' || movement.direction === 'expense')
