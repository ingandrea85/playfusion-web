import { renderOrganizerWorkspace, renderTabs, requireRole } from '../../shared/chrome'
import { getCategories, getCompetition, getGroupSlots, drawGroups, moveTeam, setGroupsLocked, getEvent } from '../../shared/mock/store'

requireRole(['OWNER', 'ORGANIZER'])  // setup is not for the director

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'settings')

const cats = getCategories(id)
let selCat = cats[0]?.id ?? ''

function gironiLabels(catId: string): string[] {
  const comp = getCompetition(catId)
  const n = !comp || comp.format === 'ROUND_ROBIN' ? 1 : Math.max(1, comp.groupsCount)
  return Array.from({ length: n }, (_, i) => `Girone ${String.fromCharCode(65 + i)}`)
}

function render(): void {
  document.getElementById('cattabs')!.innerHTML = renderTabs(cats.map(c => ({ key: c.id, label: c.name })), selCat)
  document.querySelectorAll<HTMLButtonElement>('#cattabs .pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; render() }))

  const comp = getCompetition(selCat)
  const locked = !!comp?.groupsLocked
  const labels = gironiLabels(selCat)
  const slots = getGroupSlots(id).filter(s => s.categoryId === selCat)
  const content = document.getElementById('content')!

  const toolbar = `<div class="pf-card"><div class="pf-row">
      <button class="pf-btn pf-btn--primary" id="draw" ${locked ? 'disabled' : ''}>Sorteggia gironi</button>
      <label class="pf-switch"><input type="checkbox" id="lock" ${locked ? 'checked' : ''} /> Blocca gironi</label>
    </div></div>`

  if (!slots.length) {
    content.innerHTML = toolbar + `<div class="pf-card pf-muted">Nessun girone: premi "Sorteggia gironi" per comporli automaticamente, poi sposta le squadre.</div>`
  } else {
    const cols = labels.map(lb => {
      const teams = slots.filter(s => s.groupLabel === lb)
      const rows = teams.map(t => `<li class="pf-row" style="justify-content:space-between;padding:var(--space-2) 0">
        <span class="pf-teamname">${t.team}</span>
        <select class="js-move" data-team="${t.team}" ${locked ? 'disabled' : ''}>
          ${labels.map(l => `<option value="${l}"${l === lb ? ' selected' : ''}>${l}</option>`).join('')}
        </select></li>`).join('')
      return `<div class="pf-card"><div class="pf-cat__label" style="margin-bottom:var(--space-3)">${lb}</div><ul style="list-style:none;margin:0;padding:0">${rows || '<li class="pf-muted">Vuoto</li>'}</ul></div>`
    }).join('')
    content.innerHTML = toolbar + `<div class="pf-catlist">${cols}</div>`
  }

  const draw = document.getElementById('draw') as HTMLButtonElement | null
  if (draw && !draw.disabled) draw.addEventListener('click', () => { drawGroups(id, selCat); render() })
  const lock = document.getElementById('lock') as HTMLInputElement
  lock.addEventListener('change', () => { setGroupsLocked(selCat, lock.checked); render() })
  document.querySelectorAll<HTMLSelectElement>('.js-move').forEach(sel =>
    sel.addEventListener('change', () => { moveTeam(id, selCat, sel.dataset.team!, sel.value); render() }))
}
render()
