import { describe, it, expect } from 'vitest'
import { parseAndValidateDraft, monthKey, AiInvalidDraft } from '../src/validate.js'

const validDraft = {
  draft: {
    event: { name: 'Festa U10', sportId: 'rugby', participantType: 'team', format: 'festival',
             categorie: ['U10'], dates: { from: '2026-09-13', to: '2026-09-13' }, startTime: '09:00', playbook: 'PB-1' },
    groupsByCategory: { U10: { groups: [{ label: 'Pool A', teamCount: 6, field: 'Campo 1' }] } },
    schedule: { fields: ['Campo 1','Campo 2','Campo 3'], periods: 1, periodMinutes: 15, breakMinutes: 3,
                dailyStart: '09:00', groupsCount: 4, legs: 'SINGLE', finalsEnabled: false, festivalUsePools: true },
    rationale: '24 in 4 pool da 6', assumptions: ['niente finali'],
  },
}

describe('monthKey', () => {
  it('formats a date as YYYY-MM', () => {
    expect(monthKey(new Date('2026-09-13T10:00:00Z'))).toBe('2026-09')
    expect(monthKey(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01')
  })
})

describe('parseAndValidateDraft', () => {
  it('accepts a well-formed draft', () => {
    const out = parseAndValidateDraft(JSON.stringify(validDraft))
    expect(out.draft?.event.format).toBe('festival')
  })
  it('tolerates prose around the JSON (extracts the object)', () => {
    const out = parseAndValidateDraft('Ecco la bozza:\n' + JSON.stringify(validDraft) + '\nSpero vada bene.')
    expect(out.draft).toBeDefined()
  })
  it('returns openQuestions when the model asks for missing data', () => {
    const out = parseAndValidateDraft(JSON.stringify({ openQuestions: [{ field: 'fields', question: 'Quanti campi?' }] }))
    expect(out.openQuestions?.[0].field).toBe('fields')
    expect(out.draft).toBeUndefined()
  })
  it('rejects a festival draft that enables finals', () => {
    const bad = structuredClone(validDraft); bad.draft.schedule.finalsEnabled = true
    expect(() => parseAndValidateDraft(JSON.stringify(bad))).toThrow(AiInvalidDraft)
  })
  it('rejects a bracket draft that carries gironi', () => {
    const bad = structuredClone(validDraft)
    bad.draft.event.format = 'bracket'
    expect(() => parseAndValidateDraft(JSON.stringify(bad))).toThrow(AiInvalidDraft)
  })
  it('rejects an empty fields list', () => {
    const bad = structuredClone(validDraft); bad.draft.schedule.fields = []
    expect(() => parseAndValidateDraft(JSON.stringify(bad))).toThrow(AiInvalidDraft)
  })
  it('rejects non-JSON', () => {
    expect(() => parseAndValidateDraft('non ho capito')).toThrow(AiInvalidDraft)
  })
})
