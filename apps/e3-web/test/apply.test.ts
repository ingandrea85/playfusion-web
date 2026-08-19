import { describe, it, expect } from 'vitest'
import { renderApply, openCategories, buildApplyInput } from '../src/views/apply'

const ev = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10', 'U12', 'U14'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published' as const, playbook: 'PB-1' as const }
const win = {
  sportEventId: 'e1',
  state: 'Open' as const,
  categories: [
    { categoria: 'U10', cap: 8, count: 3, remaining: 5 },
    { categoria: 'U12', cap: 4, count: 4, remaining: 0 }, // full
  ],
}

describe('e3 apply', () => {
  it('openCategories keeps categories with remaining capacity, drops full ones', () => {
    // U10 has room, U12 is full, U14 has no cap entry (treated as open).
    expect(openCategories(ev, win)).toEqual(['U10', 'U14'])
  })

  it('renders every category with its fill count; full ones are shown but disabled', () => {
    const html = renderApply(ev, win, true)
    expect(html).toContain('name="participantRef"')
    expect(html).toContain('<option value="U10"') // open
    expect(html).toContain('<option value="U14"') // open (no cap)
    expect(html).toMatch(/<option value="U12"[^>]*disabled/) // full → shown but disabled
    expect(html).toContain('3/8')       // U10 count/cap
    expect(html).toContain('completa')  // U12 marked full
    expect(html).toContain('data-apply')
  })

  it('shows a "all full" notice instead of the form when no category has room', () => {
    const allFull = { ...win, categories: [
      { categoria: 'U10', cap: 4, count: 4, remaining: 0 },
      { categoria: 'U12', cap: 4, count: 4, remaining: 0 },
      { categoria: 'U14', cap: 2, count: 2, remaining: 0 },
    ] }
    const html = renderApply(ev, allFull, true)
    expect(html).not.toContain('data-apply')
    expect(html).toContain('complete')
  })

  it('shows a magic-link notice instead of the form when no token is present', () => {
    const html = renderApply(ev, win, false)
    expect(html).not.toContain('data-apply')
    expect(html).toContain('link')
  })

  it('buildApplyInput assembles a trimmed ApplyRegistrationInput', () => {
    expect(buildApplyInput('e1', { participantRef: '  Team A  ', categoria: 'U10' })).toEqual({
      participantRef: 'Team A',
      sportEventId: 'e1',
      categoria: 'U10',
    })
  })
})
