// Fonts (self-hosted via npm, no external CDN). Imported here because every
// screen imports from this module, so importing it loads the type system once.
import '@fontsource-variable/archivo'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/spline-sans-mono'
import type { ScheduledMatch, StandingRow } from './mock/types'

export function renderOrganizerTopbar(active: string): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`
  return `<a class="pf-brand" href="/apps/organizer/dashboard.html">play<b>fusion</b><small>Organizer</small></a>
    <nav>
      ${link('/apps/organizer/dashboard.html', 'Eventi', 'dashboard')}
      <a href="/index.html">Esci demo</a>
    </nav>`
}

export function renderPublicTopbar(): string {
  return `<a class="pf-brand" href="/index.html">play<b>fusion</b></a>`
}

// Category tag: age bracket + registration capacity meter. Shared by E1 and E3.
export function renderCategoryTag(name: string, count: number, maxTeams: number): string {
  const full = count >= maxTeams
  const pct = maxTeams > 0 ? Math.min(100, Math.round((count / maxTeams) * 100)) : 0
  return `<li class="pf-cat${full ? ' pf-cat--full' : ''}">
    <span class="pf-cat__label">${name}</span>
    <div class="pf-cat__body">
      <div class="pf-cat__cap">${count}/${maxTeams} squadre${full ? ' · completa' : ''}</div>
      <div class="pf-cat__bar"><i style="width:${pct}%"></i></div>
    </div>
  </li>`
}

// Calendar rendering — grouped by day, matches sorted by time then field. Shared by E1 and E3.
export function renderCalendar(matches: ScheduledMatch[], catName: (id: string) => string): string {
  if (!matches.length) return `<p class="pf-muted">Nessuna partita in calendario.</p>`
  const days = [...new Set(matches.map(m => m.day))].sort()
  return days.map(day => {
    const rows = matches.filter(m => m.day === day)
      .sort((a, b) => a.time.localeCompare(b.time) || a.field.localeCompare(b.field))
      .map(m => `<li class="pf-match">
        <span class="pf-match__time">${m.time}</span>
        <span class="pf-match__field">${m.field}</span>
        <span class="pf-match__cat">${catName(m.categoryId)} · ${m.groupLabel}</span>
        <span class="pf-match__teams">${m.home} <b>vs</b> ${m.away}</span>
      </li>`).join('')
    return `<div class="pf-calday"><div class="pf-calday__head">${day}</div><ul class="pf-callist">${rows}</ul></div>`
  }).join('')
}

// Standings tables — grouped by category → girone; zero-point rows. Shared by E1 and E3.
export function renderStandings(rows: StandingRow[], catName: (id: string) => string): string {
  if (!rows.length) return `<p class="pf-muted">Nessuna classifica.</p>`
  const catIds: string[] = []
  for (const r of rows) if (!catIds.includes(r.categoryId)) catIds.push(r.categoryId)
  return catIds.map(catId => {
    const catRows = rows.filter(r => r.categoryId === catId)
    const groups: string[] = []
    for (const r of catRows) if (!groups.includes(r.groupLabel)) groups.push(r.groupLabel)
    return groups.map(g => {
      const gr = catRows.filter(r => r.groupLabel === g)
      const body = gr.map((r, i) => `<tr>
        <td>${i + 1}</td><td class="pf-stand__team">${r.team}</td>
        <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
        <td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${r.goalsFor - r.goalsAgainst}</td><td><b>${r.points}</b></td>
      </tr>`).join('')
      return `<div class="pf-stand">
        <div class="pf-stand__head"><span class="pf-cat__label">${catName(catId)}</span><span class="pf-mono">${g}</span></div>
        <div class="pf-tablewrap"><table class="pf-standings">
          <thead><tr><th>#</th><th>Squadra</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Pt</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </div>`
    }).join('')
  }).join('')
}

// Pill tab bar. Screens read data-key on click and re-render. Shared by calendar + standings views.
export function renderTabs(items: Array<{ key: string; label: string }>, activeKey: string): string {
  return `<div class="pf-tabs">${items.map(t =>
    `<button class="pf-tab" type="button" data-key="${t.key}"${t.key === activeKey ? ' aria-selected="true"' : ''}>${t.label}</button>`,
  ).join('')}</div>`
}
