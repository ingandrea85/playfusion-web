import { renderBracket, renderFinalStanding, renderTabs, categoryKeys } from '@playfusion/app-shell'
import type { CategoryFinalStanding, EventDetail, ScheduledMatchView } from '@playfusion/rest-client'
import type { Screen, ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface FinalsData { event: EventDetail; finals: ScheduledMatchView[]; ranking: CategoryFinalStanding[] }

const catName = (c: string): string => c
const rowsFor = (ranking: CategoryFinalStanding[], cat: string) => ranking.find((r) => r.categoryId === cat)?.rows ?? []

/** S12/S13: organizer Finali tab — the bracket + the progressive final ranking, per category. */
function finalsBody(data: FinalsData, selCat: string): string {
  const cats = categoryKeys(data.finals)
  if (!cats.length) return `<p class="pf-muted">Nessun tabellone: configura la <b>Fase finale</b> (tab Calendario) e genera il calendario.</p>`
  return `<div id="ft-cattabs">${renderTabs(cats.map((c) => ({ key: c, label: c })), selCat)}</div>
    <div id="fnbody">${finalsSection(data, selCat)}</div>`
}
function finalsSection(data: FinalsData, selCat: string): string {
  return `${renderBracket(data.finals.filter((f) => f.categoryId === selCat), catName)}
    <h3 class="pf-h4">Classifica finale</h3>
    ${renderFinalStanding(rowsFor(data.ranking, selCat))}`
}

export function renderFinalsView(data: FinalsData): string {
  return workspaceShell(data.event, 'finals', `<div class="pf-card"><h2 class="pf-h3">Finali</h2>${finalsBody(data, categoryKeys(data.finals)[0] ?? '')}</div>`)
}

export const finalsScreen: Screen<FinalsData> = {
  load: async (ctx, p) => {
    const [event, matches, ranking] = await Promise.all([ctx.client.o3.getEvent(p.id), ctx.client.o7.getMatches(p.id), ctx.client.o7.getFinalStandings(p.id)])
    return { event, finals: matches.filter((m) => m.phase === 'FINAL' || m.phase === 'FINAL_GROUP'), ranking }
  },
  render: renderFinalsView,
  mount(root, _ctx: ViewCtx, data) {
    const body = root.querySelector('#fnbody'); if (!body) return
    const catbar = root.querySelector('#ft-cattabs')!
    let selCat = categoryKeys(data.finals)[0] ?? ''
    function draw() {
      catbar.innerHTML = renderTabs(categoryKeys(data.finals).map((c) => ({ key: c, label: c })), selCat)
      catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
        b.addEventListener('click', () => { selCat = b.dataset.key!; draw() }))
      body!.innerHTML = finalsSection(data, selCat)
    }
    draw()
  },
}
