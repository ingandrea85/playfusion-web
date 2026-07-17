import { describe, expect, it } from 'vitest'
import { defaultTieBreak, criterionLabel } from './tiebreak'

describe('tiebreak defaults', () => {
  it('Calcio default is head-to-head, then goal difference, then goals for', () => {
    expect(defaultTieBreak('Calcio')).toEqual(['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'])
  })
  it('unknown sport falls back to goal difference then goals for', () => {
    expect(defaultTieBreak('Curling')).toEqual(['GOAL_DIFFERENCE', 'GOALS_FOR'])
  })
  it('every criterion has a non-empty Italian label', () => {
    for (const c of ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'] as const) {
      expect(criterionLabel(c).length).toBeGreaterThan(0)
    }
  })
})
