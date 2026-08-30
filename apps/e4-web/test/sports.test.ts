// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { SportProfile } from '@playfusion/rest-client'
import { renderSports } from '../src/views/sports'
import { renderSportEditor, collectSport } from '../src/views/sport-editor'

const sport = (over: Partial<SportProfile> = {}): SportProfile => ({
  id: 's1', name: 'Tennis', participants: 'both', scoreLabel: 'Set', points: { win: 2, draw: null, loss: 0 }, tieBreak: ['HEAD_TO_HEAD', 'SCORE_DIFFERENCE'], createdAt: 't', ...over,
})

describe('renderSports', () => {
  it('lists sports with participants/score/points and an edit link', () => {
    const html = renderSports([sport(), sport({ id: 's2', name: 'Calcio', participants: 'team', scoreLabel: 'Reti', points: { win: 3, draw: 1, loss: 0 } })])
    expect(html).toContain('Tennis'); expect(html).toContain('Entrambi'); expect(html).toContain('2 / – / 0')
    expect(html).toContain('Calcio'); expect(html).toContain('3 / 1 / 0')
    expect(html).toContain('#/sports/s1'); expect(html).toContain('data-del="s1"')
  })
  it('empty state', () => { expect(renderSports([])).toContain('Nessuno sport') })
})

describe('sport editor', () => {
  it('renders the form with the sport prefilled (no-draw checked for tennis)', () => {
    const html = renderSportEditor(sport())
    expect(html).toContain('Modifica sport')
    expect(html).toContain('value="Tennis"')
    expect(html).toMatch(/id="sp-nodraw"[^>]*checked/)
  })
  it('collectSport reads the form (no draws → draw null)', () => {
    const root = document.createElement('div'); root.innerHTML = renderSportEditor(sport())
    const got = collectSport(root)
    expect(got).toMatchObject({ name: 'Tennis', participants: 'both', scoreLabel: 'Set' })
    expect(got.points).toEqual({ win: 2, draw: null, loss: 0 })
    expect(got.tieBreak).toEqual(['HEAD_TO_HEAD', 'SCORE_DIFFERENCE'])
  })
  it('collectSport includes draw points when draws are allowed', () => {
    const root = document.createElement('div'); root.innerHTML = renderSportEditor(sport({ participants: 'team', points: { win: 3, draw: 1, loss: 0 } }))
    expect(collectSport(root).points).toEqual({ win: 3, draw: 1, loss: 0 })
  })
})
