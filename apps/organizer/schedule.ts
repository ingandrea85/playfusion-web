import { renderOrganizerTopbar, renderCalendar } from '../../shared/chrome'
import {
  getCategories, getSchedule, getScheduledMatches,
  generateSchedule, approveSchedule, publishSchedule,
} from '../../shared/mock/store'
import type { ScheduleConfig } from '../../shared/mock/types'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const schedule = () => getSchedule(id)!
let fields = [...schedule().config.fields]

function locked(): boolean { const s = schedule().status; return s === 'APPROVED' || s === 'PUBLISHED' }

function renderConfig(): void {
  const cfg = schedule().config
  const dis = locked() ? 'disabled' : ''
  const fieldRows = fields.map((f, i) =>
    `<div class="pf-row" style="gap:var(--space-2);margin-bottom:var(--space-2)">
       <input class="js-field" data-i="${i}" value="${f}" ${dis} style="flex:1;padding:11px var(--space-3);border:1px solid var(--color-border-strong);border-radius:var(--radius-2);font:inherit" />
       ${locked() ? '' : `<button type="button" class="pf-btn js-rmfield" data-i="${i}">×</button>`}
     </div>`).join('')
  document.getElementById('config')!.innerHTML = `
    <h2>Configurazione</h2>
    <label class="pf-field"><span>Campi</span></label>
    <div id="fieldlist">${fieldRows}</div>
    ${locked() ? '' : `<button type="button" class="pf-btn" id="addfield">+ Aggiungi campo</button>`}
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3);margin-top:var(--space-4)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>N. tempi</label><input id="periods" type="number" min="1" value="${cfg.periods}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Durata tempo (min)</label><input id="periodMinutes" type="number" min="1" value="${cfg.periodMinutes}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Pausa (min)</label><input id="breakMinutes" type="number" min="0" value="${cfg.breakMinutes}" ${dis} /></div>
    </div>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Inizio giornata</label><input id="dailyStart" type="time" value="${cfg.dailyStart}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Slot per giornata</label><input id="slotsPerDay" type="number" min="1" value="${cfg.slotsPerDay}" ${dis} /></div>
    </div>
    ${locked() ? '<p class="pf-muted">Calendario approvato: configurazione bloccata.</p>'
      : '<button class="pf-btn pf-btn--primary" id="generate" style="margin-top:var(--space-3)">Genera calendario</button>'}`

  if (!locked()) {
    document.querySelectorAll<HTMLInputElement>('.js-field').forEach(inp =>
      inp.addEventListener('change', () => { fields[Number(inp.dataset.i)] = inp.value.trim() }))
    document.querySelectorAll<HTMLButtonElement>('.js-rmfield').forEach(btn =>
      btn.addEventListener('click', () => { fields.splice(Number(btn.dataset.i), 1); renderConfig() }))
    document.getElementById('addfield')!.addEventListener('click', () => { fields.push(`Campo ${fields.length + 1}`); renderConfig() })
    document.getElementById('generate')!.addEventListener('click', () => {
      const cfgNew: ScheduleConfig = {
        fields: fields.filter(Boolean),
        periods: Number((document.getElementById('periods') as HTMLInputElement).value),
        periodMinutes: Number((document.getElementById('periodMinutes') as HTMLInputElement).value),
        breakMinutes: Number((document.getElementById('breakMinutes') as HTMLInputElement).value),
        dailyStart: (document.getElementById('dailyStart') as HTMLInputElement).value,
        slotsPerDay: Number((document.getElementById('slotsPerDay') as HTMLInputElement).value),
      }
      generateSchedule(id, cfgNew)
      render()
    })
  }
}

function renderActions(): void {
  const s = schedule().status
  const el = document.getElementById('actions')!
  if (s === 'NONE') { el.innerHTML = '<p class="pf-muted">Genera il calendario per procedere.</p>'; return }
  el.innerHTML = `
    <div class="pf-row">
      <div><span class="pf-eyebrow">Stato calendario</span><h2 style="margin-top:4px">${{ GENERATED: 'Generato', APPROVED: 'Approvato', PUBLISHED: 'Pubblicato' }[s]}</h2></div>
      <div style="display:flex;gap:var(--space-2)">
        <button class="pf-btn pf-btn--primary" id="approve" ${s === 'GENERATED' ? '' : 'disabled'}>Approva</button>
        <button class="pf-btn pf-btn--primary" id="publish" ${s === 'APPROVED' ? '' : 'disabled'}>Pubblica</button>
      </div>
    </div>`
  const approve = document.getElementById('approve') as HTMLButtonElement
  const publish = document.getElementById('publish') as HTMLButtonElement
  if (!approve.disabled) approve.addEventListener('click', () => { approveSchedule(id); render() })
  if (!publish.disabled) publish.addEventListener('click', () => { publishSchedule(id); render() })
}

function render(): void {
  renderConfig()
  renderActions()
  document.getElementById('calendar')!.innerHTML =
    schedule().status === 'NONE' ? '' : renderCalendar(getScheduledMatches(id), catName)
}
render()
