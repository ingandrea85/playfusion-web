import { esc } from '@playfusion/app-shell'

// S16: pure HTML/SVG builders for the Panoramica dashboard band. No store, no DOM —
// each returns a markup string. Inline SVG + CSS bars (no chart library; self-hosted only).
// Colour language: blue = progress/done, grey = remaining, amber reserved for "behind".

/** SVG progress ring: grey track + blue arc via stroke-dasharray, big number in the centre. */
export function donut(pct: number, big: string, sub: string): string {
  const r = 46
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return `<div class="pf-donut">
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
      <circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--pf-chart-track)" stroke-width="14"/>
      <circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--color-action-primary)" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 56 56)"/>
    </svg>
    <div><div class="pf-donut__big">${esc(big)}</div><div class="pf-donut__sub">${esc(sub)}</div></div>
  </div>`
}

/** Labelled horizontal bars; `full`/`behind` add a colour modifier. `note` overrides the count text. */
export function capacityBars(rows: Array<{ label: string; value: number; max: number; note?: string; state?: 'full' | 'behind' }>): string {
  return `<div class="pf-capbars">${rows.map((r) => {
    const pct = r.max > 0 ? Math.min(100, Math.round((r.value / r.max) * 100)) : 0
    const mod = r.state ? ` pf-capbar__fill--${r.state}` : ''
    return `<div class="pf-capbar">
      <span class="pf-capbar__lab">${esc(r.label)}</span>
      <div class="pf-capbar__track"><div class="pf-capbar__fill${mod}" style="width:${pct}%"></div></div>
      <span class="pf-capbar__n">${esc(r.note ?? `${r.value}/${r.max}`)}</span>
    </div>`
  }).join('')}</div>`
}

/** Mini stacked columns, one per day: played (blue) rising to played/total, over a grey track. */
export function dayColumns(rows: Array<{ day: string; played: number; total: number }>): string {
  const cols = rows.map((r) => {
    const h = r.total ? Math.round((r.played / r.total) * 100) : 0
    const label = `${r.day.slice(8, 10)}/${r.day.slice(5, 7)}`
    return `<div class="pf-daycol"><div class="pf-daycol__track"><div class="pf-daycol__fill" style="height:${h}%"></div></div><span class="pf-daycol__lab">${esc(label)}<br>${r.played}/${r.total}</span></div>`
  }).join('')
  return `<div class="pf-daycols">${cols}</div>
    <div class="pf-charlegend"><span><i class="pf-dot pf-dot--blue"></i>Giocate</span><span><i class="pf-dot pf-dot--track"></i>Da giocare</span></div>`
}

/** Figure tiles: a big number/label over a small caption. */
export function statTiles(tiles: Array<{ big: string; label: string }>): string {
  return `<div class="pf-stattiles">${tiles.map((t) => `<div class="pf-stattile"><b>${esc(t.big)}</b><span>${esc(t.label)}</span></div>`).join('')}</div>`
}
