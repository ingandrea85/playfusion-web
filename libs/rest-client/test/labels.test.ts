import { describe, it, expect } from 'vitest'
import { eventLabels } from '../src/labels'

describe('eventLabels (S5)', () => {
  it('defaults to team-football wording for legacy events (no snapshot)', () => {
    expect(eventLabels({})).toEqual({ participant: 'Squadra', participantPlural: 'Squadre', score: 'Reti' })
  })
  it('uses team wording when participantType is team', () => {
    const l = eventLabels({ participantType: 'team', sportProfile: { sportId: 's', name: 'Calcio', scoreLabel: 'Reti', points: { win: 3, draw: 1, loss: 0 }, tieBreak: [] } })
    expect(l).toMatchObject({ participant: 'Squadra', participantPlural: 'Squadre', score: 'Reti' })
  })
  it('swaps to player wording + the sport score label for individual events', () => {
    const l = eventLabels({ participantType: 'individual', sportProfile: { sportId: 't', name: 'Tennis', scoreLabel: 'Set', points: { win: 2, draw: null, loss: 0 }, tieBreak: [] } })
    expect(l).toEqual({ participant: 'Giocatore', participantPlural: 'Giocatori', score: 'Set' })
  })
  it('falls back to "Reti" when the snapshot has no scoreLabel', () => {
    expect(eventLabels({ participantType: 'individual' }).score).toBe('Reti')
  })
})
