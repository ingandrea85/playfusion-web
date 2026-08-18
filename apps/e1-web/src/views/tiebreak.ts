import type { TieBreakCriterion } from '@playfusion/rest-client'

/** All tie-break criteria, in the canonical default order. Points always rank first and
 *  are not part of this list (they are a fixed, non-toggleable row in the editor). */
export const ALL_CRITERIA: TieBreakCriterion[] = ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']

const DEFAULTS: Record<string, TieBreakCriterion[]> = {
  Calcio: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
}
const GENERIC_DEFAULT: TieBreakCriterion[] = ['GOAL_DIFFERENCE', 'GOALS_FOR']

/** The default active tie-break policy for a sport (falls back to a generic goal-based order). */
export function defaultTieBreak(sport: string): TieBreakCriterion[] {
  return DEFAULTS[sport] ?? GENERIC_DEFAULT
}

/** Human label for a criterion (Italian, matches the mockup). */
export function criterionLabel(c: TieBreakCriterion): string {
  return c === 'HEAD_TO_HEAD' ? 'Scontri diretti / avulsa'
    : c === 'GOAL_DIFFERENCE' ? 'Differenza reti'
      : 'Reti fatte'
}
