import { renderStandings, renderTabs, categoryKeys, groupKeys, esc } from '@playfusion/app-shell'
import type { EventDetail, GroupStanding } from '@playfusion/rest-client'
import { eventLabels } from '@playfusion/rest-client'
import type { Screen, ViewCtx } from '../view.js'
import { inlineError } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface StandingsData { event: EventDetail; standings: GroupStanding[] }

const catName = (c: string): string => c

const filterStandings = (standings: GroupStanding[], selCat: string, selGir: string): GroupStanding[] =>
  standings.filter((g) => g.categoryId === selCat && (selGir === 'ALL' || g.groupLabel === selGir))

/** ISO instant → compact "YYYY-MM-DD HH:mm" (deterministic, no locale/TZ surprises). */
const fmtWhen = (iso: string): string => iso.slice(0, 16).replace('T', ' ')

/** S11: per-group tie block shown under the (shared, read-only) standings table — organizer only.
 *  An applied override shows an audit line; each still-unresolved set shows a note + a resolve
 *  panel (↑/↓ reorder, no drag&drop; interactivity wired in mount). */
function tieBlock(g: GroupStanding): string {
  const parts: string[] = []
  if (g.override) {
    parts.push(`<p class="pf-muted pf-tieaudit">Parità risolta manualmente: <b>${g.override.order.map(esc).join(' › ')}</b> — da ${esc(g.override.resolvedBy)} il ${esc(fmtWhen(g.override.resolvedAt))}</p>`)
  }
  for (const set of g.unresolved ?? []) {
    const items = set.map((t, i) => tieItem(t, i, set.length)).join('')
    parts.push(`<div class="pf-card pf-tiepanel" data-cat="${esc(g.categoryId)}" data-gir="${esc(g.groupLabel)}">
      <p class="pf-tienote">⚠ Parità da definire tra: <b>${set.map(esc).join(', ')}</b></p>
      <ol class="pf-tielist">${items}</ol>
      <div class="pf-row" style="gap:var(--space-sm);margin-top:var(--space-sm)">
        <button type="button" class="pf-btn pf-btn--primary js-tiesave">Salva ordine</button>
      </div>
    </div>`)
  }
  return parts.join('')
}

/** One reorderable team row: label + up/down arrows (disabled at the ends). */
function tieItem(team: string, i: number, n: number): string {
  return `<li class="pf-tieitem" data-team="${esc(team)}">
    <span class="pf-tieitem__name">${esc(team)}</span>
    <span class="pf-tieitem__moves">
      <button type="button" class="pf-btn pf-btn--ghost js-tieup" aria-label="Su"${i === 0 ? ' disabled' : ''}>↑</button>
      <button type="button" class="pf-btn pf-btn--ghost js-tiedown" aria-label="Giù"${i === n - 1 ? ' disabled' : ''}>↓</button>
    </span>
  </li>`
}

function standingsBody(groups: GroupStanding[], pl: string): string {
  if (!groups.length) return renderStandings([], catName, pl)
  // Render each group's shared table, then its (organizer-only) tie block.
  return groups.map((g) => renderStandings([g], catName, pl) + tieBlock(g)).join('')
}

/** Classifiche card with Category + Girone filter tabs (S23). `pl` = the participant noun (S5). */
function standingsCard(standings: GroupStanding[], selCat: string, selGir: string, pl: string): string {
  const gtabs = [{ key: 'ALL', label: 'Tutti' }, ...groupKeys(standings, selCat).map((g) => ({ key: g, label: g }))]
  return `<div class="pf-card"><h2 class="pf-h3">Classifiche</h2>
    <div id="st-cattabs">${renderTabs(categoryKeys(standings).map((c) => ({ key: c, label: c })), selCat)}</div>
    <div id="st-girtabs">${renderTabs(gtabs, selGir)}</div>
    <div id="st-err"></div>
    <div id="stbody">${standingsBody(filterStandings(standings, selCat, selGir), pl)}</div>
  </div>`
}

export function renderStandingsView(data: StandingsData): string {
  const pl = eventLabels(data.event).participant
  return workspaceShell(data.event, 'standings', standingsCard(data.standings, categoryKeys(data.standings)[0] ?? '', 'ALL', pl))
}

export const standingsScreen: Screen<StandingsData> = {
  load: async (ctx, p) => {
    const [event, standings] = await Promise.all([ctx.client.o3.getEvent(p.id), ctx.client.o7.getStandings(p.id)])
    return { event, standings }
  },
  render: renderStandingsView,
  mount(root, ctx: ViewCtx, data) {
    const stbody = root.querySelector('#stbody'); if (!stbody) return
    const catbar = root.querySelector('#st-cattabs')!
    const girbar = root.querySelector('#st-girtabs')!
    const err = root.querySelector('#st-err')!
    const eventId = data.event.sportEventId
    const pl = eventLabels(data.event).participant
    let selCat = categoryKeys(data.standings)[0] ?? ''
    let selGir = 'ALL'

    // S11: wire every tie-resolution panel currently in the body. Each panel owns a local `order`
    // (the <li> sequence); ↑/↓ swap neighbours and re-render; Salva persists via o7.setTieOverride.
    function wireTiePanels() {
      stbody!.querySelectorAll<HTMLElement>('.pf-tiepanel').forEach((panel) => {
        const list = panel.querySelector<HTMLOListElement>('.pf-tielist')!
        const cat = panel.dataset.cat!, gir = panel.dataset.gir!
        const order = (): string[] => [...list.querySelectorAll<HTMLElement>('.pf-tieitem')].map((li) => li.dataset.team!)
        const redraw = (teams: string[]) => {
          list.innerHTML = teams.map((t, i) => tieItem(t, i, teams.length)).join('')
          wire()
        }
        const move = (i: number, delta: number) => {
          const teams = order()
          const j = i + delta
          if (j < 0 || j >= teams.length) return
          ;[teams[i], teams[j]] = [teams[j]!, teams[i]!]
          redraw(teams)
        }
        function wire() {
          list.querySelectorAll<HTMLElement>('.pf-tieitem').forEach((li, i) => {
            li.querySelector<HTMLButtonElement>('.js-tieup')?.addEventListener('click', () => move(i, -1))
            li.querySelector<HTMLButtonElement>('.js-tiedown')?.addEventListener('click', () => move(i, +1))
          })
        }
        wire()
        panel.querySelector<HTMLButtonElement>('.js-tiesave')!.addEventListener('click', async (e) => {
          const btn = e.currentTarget as HTMLButtonElement
          btn.disabled = true
          try { await ctx.client.o7.setTieOverride(eventId, cat, gir, order()); ctx.refresh() }
          catch { err.innerHTML = inlineError('Salvataggio della parità non riuscito. Riprova.'); btn.disabled = false }
        })
      })
    }

    function draw() {
      catbar.innerHTML = renderTabs(categoryKeys(data.standings).map((c) => ({ key: c, label: c })), selCat)
      catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
        b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; draw() }))
      const gtabs = [{ key: 'ALL', label: 'Tutti' }, ...groupKeys(data.standings, selCat).map((g) => ({ key: g, label: g }))]
      girbar.innerHTML = renderTabs(gtabs, selGir)
      girbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
        b.addEventListener('click', () => { selGir = b.dataset.key!; draw() }))
      stbody!.innerHTML = standingsBody(filterStandings(data.standings, selCat, selGir), pl)
      wireTiePanels()
    }
    draw()
  },
}
