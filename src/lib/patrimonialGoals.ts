export const PATRIMONIAL_GOALS_STORAGE_KEY = 'rastreo-patrimonial-goals-v1'

export interface PatrimonialGoal {
  id: string
  targetAmount: number
  createdAt: string
  achievedAt?: string
}

export function loadPatrimonialGoals(): PatrimonialGoal[] {
  try {
    const stored = localStorage.getItem(PATRIMONIAL_GOALS_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('El historial de metas guardado no tiene el formato esperado.')
    return parsed.filter((goal): goal is PatrimonialGoal =>
      Boolean(
        goal
        && typeof goal.id === 'string'
        && Number.isFinite(goal.targetAmount)
        && goal.targetAmount > 0
        && typeof goal.createdAt === 'string'
        && (!goal.achievedAt || typeof goal.achievedAt === 'string'),
      ),
    )
  } catch (error) {
    console.error('No se pudo leer el historial local de metas.', error)
    return []
  }
}

export function createPatrimonialGoal(targetAmount: number): PatrimonialGoal {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    targetAmount,
    createdAt: new Date().toISOString(),
  }
}

export function completeReachedGoals(goals: PatrimonialGoal[], totalPatrimonio: number, achievedAt = new Date().toISOString()): PatrimonialGoal[] {
  return goals.map((goal) =>
    !goal.achievedAt && totalPatrimonio >= goal.targetAmount
      ? { ...goal, achievedAt }
      : goal,
  )
}
