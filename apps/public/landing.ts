import { renderPublicTopbar, renderCategoryTag } from '../../shared/chrome'
import { getCategories, getEvent, getRegistrations, getSchedule } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)
const direct = event?.playbook === 'PB-2'

const open = !!event?.registrationsOpen
document.getElementById('eyebrow')!.textContent =
  event ? (direct ? event.sport : `${event.sport} · Iscrizioni ${open ? 'aperte' : 'chiuse'}`) : 'Evento'
document.getElementById('title')!.textContent = event?.name ?? 'Evento non trovato'
document.getElementById('meta')!.textContent = event
  ? `${event.startDate} → ${event.endDate} · ore ${event.startTime} · ${event.location}` : ''
const counts: Record<string, number> = {}
for (const r of getRegistrations(id)) counts[r.categoryId] = (counts[r.categoryId] ?? 0) + 1
document.getElementById('cats')!.innerHTML =
  getCategories(id).map(c => renderCategoryTag(c.name, counts[c.id] ?? 0, c.maxTeams)).join('')
document.getElementById('participants')!.setAttribute('href', `/apps/public/participants.html?event=${id}`)

const published = getSchedule(id)?.status === 'PUBLISHED'
document.getElementById('cta')!.innerHTML = `
  ${direct
    ? `<p class="pf-muted">Iscrizioni gestite dall'organizzatore.</p>`
    : (open
      ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
      : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`)}
  ${published ? `<a class="pf-btn pf-btn--lg" style="margin-left:var(--space-2)" href="/apps/public/calendar.html?event=${id}">Calendario</a>
    <a class="pf-btn pf-btn--lg" style="margin-left:var(--space-2)" href="/apps/public/standings.html?event=${id}">Classifiche</a>
    <a class="pf-btn pf-btn--lg" style="margin-left:var(--space-2)" href="/apps/public/bracket.html?event=${id}">Tabellone</a>` : ''}`
