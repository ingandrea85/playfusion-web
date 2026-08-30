import { describe, it, expect } from 'vitest'
import { renderPublicFormula } from '../src/views/formula'
import type { EventDetail, ScheduleConfig } from '@playfusion/rest-client'

const base = { fields: ['A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 2, legs: 'SINGLE' as const }
const ev = (over: Partial<EventDetail> = {}): EventDetail =>
  ({ sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published', playbook: 'PB-1', ...over })

describe('public formula (SP-B2)', () => {
  it('explains + previews a solo-tabellone event from the participant count', () => {
    const html = renderPublicFormula(ev({ format: 'bracket' }), base as ScheduleConfig, { U10: 8 })
    expect(html).toContain('Formula del torneo')
    expect(html).toContain('Eliminazione diretta')
    expect(html).toContain('Semifinali') // 8 players → SF present in the preview bracket
  })
  it('explains a GROUP_KNOCKOUT with the crossed qualifiers', () => {
    const cfg = { ...base, finalsType: 'GROUP_KNOCKOUT', finalsQualifiersPerGroup: 2 } as ScheduleConfig
    const html = renderPublicFormula(ev(), cfg, { U10: 8 })
    expect(html).toContain('Tabellone da 2 gironi')
    expect(html).toContain('1ª Girone A') // crossed seed placeholder in the preview
  })
  it('notes a custom format instead of drawing it', () => {
    const cfg = { ...base, byCategory: { U10: { ...base, finalsFormatId: 'fmt1' } } } as ScheduleConfig
    const html = renderPublicFormula(ev(), cfg, { U10: 8 })
    expect(html).toContain('Formato personalizzato')
  })
})
