import { describe, expect, it } from 'vitest'
import { donut, capacityBars, stackedStatusBar, dayColumns, statTiles } from '../apps/organizer/dashboard-charts'

describe('donut', () => {
  it('renders the arc with a dashoffset matching the percentage', () => {
    // r=46 → circumference 289.03; 70% → offset 289.03*0.30 = 86.71
    const html = donut(70, '70%', '42 / 60 partite giocate')
    expect(html).toContain('stroke-dasharray="289.03"')
    expect(html).toContain('stroke-dashoffset="86.71"')
    expect(html).toContain('70%')
    expect(html).toContain('42 / 60 partite giocate')
  })
  it('clamps out-of-range pct (0 → full offset, 100 → zero offset)', () => {
    expect(donut(0, '0%', '')).toContain('stroke-dashoffset="289.03"')
    expect(donut(100, '100%', '')).toContain('stroke-dashoffset="0.00"')
  })
})

describe('capacityBars', () => {
  it('applies full/behind modifiers and clamps width to 100%', () => {
    const html = capacityBars([
      { label: 'U10', value: 16, max: 16, state: 'full' },
      { label: 'Campo B', value: 16, max: 30, note: '16/30 · indietro', state: 'behind' },
      { label: 'U14', value: 20, max: 16 }, // over capacity → clamp 100%
    ])
    expect(html).toContain('pf-capbar__fill--full')
    expect(html).toContain('pf-capbar__fill--behind')
    expect(html).toContain('16/30 · indietro')
    expect(html).toContain('width:100%') // clamped
  })
})

describe('stackedStatusBar', () => {
  it('splits paid/unpaid proportionally with labels', () => {
    const html = stackedStatusBar(22, 10) // 22/32 = 68.75%
    expect(html).toContain('width:68.75%')
    expect(html).toContain('Pagate <b>22</b>')
    expect(html).toContain('Da incassare <b>10</b>')
  })
})

describe('dayColumns', () => {
  it('formats the day as DD/MM and fills by completion', () => {
    const html = dayColumns([{ day: '2026-09-01', played: 12, total: 30 }])
    expect(html).toContain('01/09')
    expect(html).toContain('12/30')
    expect(html).toContain('height:40%') // 12/30
  })
})

describe('statTiles', () => {
  it('renders one tile per entry', () => {
    const html = statTiles([{ big: '60/60', label: 'Partite' }, { big: '🏆 Aquile', label: 'Campione' }])
    expect(html).toContain('60/60')
    expect(html).toContain('🏆 Aquile')
    expect(html.match(/pf-stattile/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
