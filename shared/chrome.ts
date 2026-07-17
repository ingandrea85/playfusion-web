// Fonts (self-hosted via npm, no external CDN). Imported here because every
// screen imports from this module, so importing it loads the type system once.
import '@fontsource-variable/archivo'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/spline-sans-mono'
import type { ScheduledMatch, StandingRow, FinalMatch, TieBreakCriterion, TieOverride } from './mock/types'
import { rankStanding } from './mock/ranking'

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
export function renderCalendar(matches: ScheduledMatch[], catName: (id: string) => string, editable = false): string {
  if (!matches.length) return `<p class="pf-muted">Nessuna partita in calendario.</p>`
  const days = [...new Set(matches.map(m => m.day))].sort()
  return days.map(day => {
    const rows = matches.filter(m => m.day === day)
      .sort((a, b) => a.time.localeCompare(b.time) || a.field.localeCompare(b.field))
      .map(m => {
        const played = m.homeScore !== null && m.awayScore !== null
        const teams = played
          ? `${m.home} <b>${m.homeScore}–${m.awayScore}</b> ${m.away}`
          : `${m.home} <b>vs</b> ${m.away}`
        const actions = editable
          ? `<button class="pf-btn js-editmatch" data-match="${m.id}" style="margin-top:6px">Modifica</button>
             <button class="pf-btn js-resultmatch" data-match="${m.id}" style="margin-top:6px">Risultato</button>`
          : ''
        return `<li class="pf-match">
          <span class="pf-match__time">${m.time}</span>
          <span class="pf-match__field">${m.field}</span>
          <span class="pf-match__cat">${catName(m.categoryId)} · ${m.groupLabel}</span>
          <span class="pf-match__teams">${teams}</span>
          ${actions}
        </li>`
      }).join('')
    return `<div class="pf-calday"><div class="pf-calday__head">${day}</div><ul class="pf-callist">${rows}</ul></div>`
  }).join('')
}

// Standings tables — grouped by category → girone; zero-point rows. Shared by E1 and E3.
export function renderStandings(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[], overrides: TieOverride[], catName: (id: string) => string): string {
  if (!rows.length) return `<p class="pf-muted">Nessuna classifica.</p>`
  const catIds: string[] = []
  for (const r of rows) if (!catIds.includes(r.categoryId)) catIds.push(r.categoryId)
  return catIds.map(catId => {
    const catRows = rows.filter(r => r.categoryId === catId)
    const groups: string[] = []
    for (const r of catRows) if (!groups.includes(r.groupLabel)) groups.push(r.groupLabel)
    return groups.map(g => {
      const gm = matches.filter(m => m.categoryId === catId && m.groupLabel === g)
      const ov = overrides.filter(o => o.categoryId === catId && o.groupLabel === g).map(o => o.order)
      const { rows: gr, unresolved } = rankStanding(catRows.filter(r => r.groupLabel === g), gm, policy, ov)
      const tied = new Set(unresolved.flat())
      const body = gr.map((r, i) => `<tr>
        <td>${i + 1}${tied.has(r.team) ? ' <span class="pf-tiebadge" title="Parità da definire">≈</span>' : ''}</td>
        <td class="pf-stand__team">${r.team}</td>
        <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
        <td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${r.goalsFor - r.goalsAgainst}</td><td><b>${r.points}</b></td>
      </tr>`).join('')
      const note = unresolved.length ? `<p class="pf-muted pf-tienote">≈ parità da definire tra: ${unresolved.map(grp => grp.join(', ')).join(' · ')}</p>` : ''
      return `<div class="pf-stand">
        <div class="pf-stand__head"><span class="pf-cat__label">${catName(catId)}</span><span class="pf-mono">${g}</span></div>
        <div class="pf-tablewrap"><table class="pf-standings">
          <thead><tr><th>#</th><th>Squadra</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Pt</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>${note}
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

// Finals bracket — grouped by bracketLabel → round. Shows resolved teams, scores,
// a champion line, and (when editable) a result button per playable match.
export function renderBracket(finals: FinalMatch[], editable = false): string {
  if (!finals.length) return `<p class="pf-muted">Nessuna fase finale.</p>`
  const labels: string[] = []
  for (const f of finals) if (!labels.includes(f.bracketLabel)) labels.push(f.bracketLabel)
  return labels.map(lb => {
    const lf = finals.filter(f => f.bracketLabel === lb)
    const rounds: string[] = []
    for (const f of lf) if (!rounds.includes(f.round)) rounds.push(f.round)
    const roundsHtml = rounds.map(r => {
      const rows = lf.filter(f => f.round === r).sort((a, b) => a.order - b.order).map(m => {
        const home = m.homeResolved ?? m.home
        const away = m.awayResolved ?? m.away
        const played = m.homeScore !== null && m.awayScore !== null
        const score = played ? `<span class="pf-final__score pf-mono">${m.homeScore} – ${m.awayScore}</span>` : `<b>vs</b>`
        const canPlay = editable && m.homeResolved !== null && m.awayResolved !== null
        const btn = canPlay ? `<button class="pf-btn pf-btn--ghost" data-final="${m.id}">Risultato</button>` : ''
        return `<li class="pf-final">
          <span class="pf-final__meta pf-mono">${m.day} · ${m.time} · ${m.field}</span>
          <span class="pf-final__teams">${home} ${score} ${away}</span>
          ${btn}
        </li>`
      }).join('')
      return `<div class="pf-final-round"><div class="pf-final-round__head pf-mono">${r}</div><ul class="pf-finallist">${rows}</ul></div>`
    }).join('')
    const fin = lf.find(f => f.round === 'Finale')
    let champ = ''
    if (fin && fin.homeResolved !== null && fin.awayResolved !== null && fin.homeScore !== null && fin.awayScore !== null && fin.homeScore !== fin.awayScore) {
      const winner = fin.homeScore > fin.awayScore ? fin.homeResolved : fin.awayResolved
      champ = `<div class="pf-champion">🏆 Campione: <b>${winner}</b></div>`
    }
    return `<div class="pf-bracket"><div class="pf-bracket__head"><span class="pf-cat__label">${lb}</span></div>${roundsHtml}${champ}</div>`
  }).join('')
}

export function renderAdminTopbar(): string {
  return `<a class="pf-brand" href="/apps/admin/organizations.html">play<b>fusion</b><small>Admin</small></a>
    <nav>
      <a href="/apps/admin/organizations.html" aria-current="page">Organizzazioni</a>
      <a href="/index.html">Esci demo</a>
    </nav>`
}
