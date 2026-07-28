import type { TieBreakCriterion } from './types'

export const TIEBREAK_DEFAULTS: Record<string, TieBreakCriterion[]> = {
  Calcio: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
}

const GENERIC_DEFAULT: TieBreakCriterion[] = ['GOAL_DIFFERENCE', 'GOALS_FOR']

export function defaultTieBreak(sport: string): TieBreakCriterion[] {
  return TIEBREAK_DEFAULTS[sport] ?? GENERIC_DEFAULT
}

export function criterionLabel(c: TieBreakCriterion): string {
  return c === 'HEAD_TO_HEAD' ? 'Scontri diretti / avulsa'
    : c === 'GOAL_DIFFERENCE' ? 'Differenza reti'
    : 'Reti fatte'
}
