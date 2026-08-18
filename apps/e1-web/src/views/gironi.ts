import { esc } from '@playfusion/app-shell'
import type { CategoryGironi, EventDetail, GironiMap, Group } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface GironiData { event: EventDetail; gironi: GironiMap }

/** Pure move: return a new group set with `team` removed from wherever it is and appended to
 *  the group labelled `toLabel`. Trivial UI-state rearrangement (the split algorithm — the
 *  actual business logic — is server-side in the o3 draw). */
export function moveTeamAcrossGroups(groups: Group[], team: string, toLabel: string): Group[] {
  return groups.map((g) => ({
    label: g.label,
    teams: g.label === toLabel
      ? [...g.teams.filter((t) => t !== team), team]
      : g.teams.filter((t) => t !== team),
  }))
}

const hasTeams = (cg?: CategoryGironi): boolean => !!cg?.groups.some((g) => g.teams.length)

function catTabs(categorie: string[], sel: string): string {
  const tabs = categorie.map((c) =>
    `<button class="pf-wtab${c === sel ? ' pf-wtab--active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')
  return `<nav class="pf-wtabs" id="cattabs">${tabs}</nav>`
}

/** Content for the selected category: toolbar (groups count + draw + lock) and either the
 *  group columns with per-team move selects or a prompt to draw. */
export function renderGironiContent(cg: CategoryGironi | undefined): string {
  const locked = cg?.locked ?? false
  const count = cg?.groups.length || 2
  const dis = locked ? 'disabled' : ''
  const toolbar = `<div class="pf-card"><div class="pf-row" style="justify-content:flex-start;gap:var(--space-md)">
    <div class="pf-field" style="margin-bottom:0;width:150px"><label>Gironi</label>
      <input id="groupsCount" type="number" min="1" value="${count}" ${dis} /></div>
    <button class="pf-btn pf-btn--primary" id="draw" ${dis}>Sorteggia gironi</button>
    <label class="pf-switch"><input type="checkbox" id="lock" ${locked ? 'checked' : ''} /> Blocca gironi</label>
  </div></div>`

  if (!hasTeams(cg)) {
    return toolbar + `<div class="pf-card pf-muted">Nessun girone: premi "Sorteggia gironi" per comporli dalle squadre confermate, poi sposta le squadre.</div>`
  }
  const labels = cg!.groups.map((g) => g.label)
  const cols = cg!.groups.map((g) => {
    const rows = g.teams.length
      ? g.teams.map((t) => `<li class="pf-row" style="justify-content:space-between;padding:var(--space-xs) 0">
          <span>${esc(t)}</span>
          <select class="js-move" data-team="${esc(t)}" ${dis}>
            ${labels.map((l) => `<option value="${esc(l)}"${l === g.label ? ' selected' : ''}>${esc(l)}</option>`).join('')}
          </select></li>`).join('')
      : '<li class="pf-muted">Vuoto</li>'
    return `<div class="pf-card"><h3 class="pf-h4" style="margin-top:0">${esc(g.label)}</h3><ul style="list-style:none;margin:0;padding:0">${rows}</ul></div>`
  }).join('')
  return toolbar + `<div class="pf-stack">${cols}</div>`
}

export function renderGironi(data: GironiData, sel = data.event.categorie[0] ?? ''): string {
  const body = data.event.categorie.length
    ? `<div id="err"></div>${catTabs(data.event.categorie, sel)}<div id="content">${renderGironiContent(data.gironi[sel])}</div>`
    : `<div class="pf-card pf-muted">Aggiungi categorie all'evento per comporre i gironi.</div>`
  return workspaceShell(data.event, 'gironi', body)
}

export const gironiScreen: Screen<GironiData> = {
  load: async (ctx, p) => {
    const [event, gironi] = await Promise.all([ctx.client.o3.getEvent(p.id), ctx.client.o3.getGironi(p.id)])
    return { event, gironi }
  },
  render: (data) => renderGironi(data),
  mount(root, ctx: ViewCtx, data) {
    const id = data.event.sportEventId
    if (!data.event.categorie.length) return
    const gironi: GironiMap = { ...data.gironi }
    let sel = data.event.categorie[0] ?? ''
    const err = root.querySelector('#err')!
    const content = root.querySelector('#content')!
    const fail = (msg: string) => { err.innerHTML = inlineError(msg) }

    const wireTabs = () => root.querySelectorAll<HTMLButtonElement>('#cattabs [data-cat]').forEach((b) =>
      b.addEventListener('click', () => { sel = b.dataset.cat!; root.querySelector('#cattabs')!.outerHTML = catTabs(data.event.categorie, sel); wireTabs(); draw() }))

    function draw() {
      content.innerHTML = renderGironiContent(gironi[sel])
      const locked = gironi[sel]?.locked ?? false

      const drawBtn = content.querySelector<HTMLButtonElement>('#draw')
      if (drawBtn && !locked) drawBtn.addEventListener('click', async () => {
        drawBtn.disabled = true
        const n = Number((content.querySelector('#groupsCount') as HTMLInputElement).value) || 2
        try { gironi[sel] = await ctx.client.o3.drawGironi(id, sel, n); draw() }
        catch { fail('Sorteggio non riuscito. Riprova.'); drawBtn.disabled = false }
      })

      const lock = content.querySelector<HTMLInputElement>('#lock')
      lock?.addEventListener('change', async () => {
        const groups = gironi[sel]?.groups ?? []
        try { gironi[sel] = await ctx.client.o3.saveGironi(id, sel, groups, lock.checked) }
        catch { fail('Salvataggio non riuscito. Riprova.') }
        finally { draw() }
      })

      if (!locked) content.querySelectorAll<HTMLSelectElement>('.js-move').forEach((selEl) =>
        selEl.addEventListener('change', async () => {
          const groups = moveTeamAcrossGroups(gironi[sel]?.groups ?? [], selEl.dataset.team!, selEl.value)
          try { gironi[sel] = await ctx.client.o3.saveGironi(id, sel, groups, gironi[sel]?.locked ?? false); draw() }
          catch { fail('Spostamento non riuscito. Riprova.') }
        }))
    }
    wireTabs()
    draw()
  },
}
