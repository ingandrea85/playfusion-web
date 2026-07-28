import { renderOrganizerTopbar, requireRole } from '../../shared/chrome'
import { createEvent, canCreateEvent, getCurrentOrgId } from '../../shared/mock/store'

requireRole(['OWNER', 'ORGANIZER'])  // setup is not for the director
import { defaultTieBreak, criterionLabel } from '../../shared/mock/tiebreak'
import type { TieBreakCriterion } from '../../shared/mock/types'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const ALL: TieBreakCriterion[] = ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']
const sportInput = document.querySelector<HTMLInputElement>('input[name=sport]')!
// Ordered working list; `enabled` marks which criteria are active (in this order).
let policy: TieBreakCriterion[] = defaultTieBreak(sportInput.value)
let enabled = new Set(policy)
// Keep a stable ordered view of all criteria (active ones first, in policy order).
let ordered: TieBreakCriterion[] = [...policy, ...ALL.filter(c => !policy.includes(c))]

function collect(): TieBreakCriterion[] { return ordered.filter(c => enabled.has(c)) }

function renderEditor(): void {
  const host = document.getElementById('tiebreak')!
  host.innerHTML = `<ol class="pf-tblist">
    <li class="pf-tbrow pf-tbrow--fixed"><span class="pf-mono">1.</span> Punti <span class="pf-muted">(sempre, bloccato)</span></li>
    ${ordered.map((c, i) => `<li class="pf-tbrow">
      <label><input type="checkbox" data-c="${c}" ${enabled.has(c) ? 'checked' : ''}/> ${criterionLabel(c)}</label>
      <span class="pf-tbmove">
        <button type="button" class="pf-btn pf-btn--ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="pf-btn pf-btn--ghost" data-down="${i}" ${i === ordered.length - 1 ? 'disabled' : ''}>↓</button>
      </span>
    </li>`).join('')}
  </ol>`
  host.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', () => { const c = cb.dataset.c as TieBreakCriterion; if (cb.checked) enabled.add(c); else enabled.delete(c) }))
  host.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b =>
    b.addEventListener('click', () => { const i = Number(b.dataset.up); [ordered[i - 1], ordered[i]] = [ordered[i], ordered[i - 1]]; renderEditor() }))
  host.querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b =>
    b.addEventListener('click', () => { const i = Number(b.dataset.down); [ordered[i + 1], ordered[i]] = [ordered[i], ordered[i + 1]]; renderEditor() }))
}

sportInput.addEventListener('change', () => {
  policy = defaultTieBreak(sportInput.value)
  enabled = new Set(policy)
  ordered = [...policy, ...ALL.filter(c => !policy.includes(c))]
  renderEditor()
})

renderEditor()

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  if (!canCreateEvent(getCurrentOrgId())) {
    alert('Il piano Free consente 1 solo evento attivo. Passa a Pro per crearne altri.')
    location.href = '/apps/organizer/abbonamento.html'
    return
  }
  const f = ev.target as HTMLFormElement
  const data = new FormData(f)
  const event = createEvent({
    name: String(data.get('name')), sport: String(data.get('sport')), location: String(data.get('location')),
    startDate: String(data.get('startDate')), startTime: String(data.get('startTime')), endDate: String(data.get('endDate')),
    tieBreak: collect(),
    playbook: (data.get('playbook') as 'PB-1' | 'PB-2') ?? 'PB-1',
  })
  location.href = `/apps/organizer/event-hub.html?event=${event.id}`
})
