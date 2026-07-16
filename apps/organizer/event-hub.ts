import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, getRegistrations, getCategories, getCompetitions } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)
document.getElementById('title')!.textContent = event ? event.name : 'Evento non trovato'
document.getElementById('meta')!.textContent = event
  ? `${event.sport} · ${event.location} · ${event.startDate} ${event.startTime}→${event.endDate}` : ''

const regs = event ? getRegistrations(id) : []
const anyPaid = regs.some(r => r.paymentStatus === 'PAID')

const cats = getCategories(id)
const comps = getCompetitions(id)
const competitionConfigured = cats.length > 0 && cats.every(c => comps.some(k => k.categoryId === c.id))

type Step = { label: string; href?: string; done: boolean; disabled?: boolean }
const steps: Step[] = [
  { label: 'Crea evento da template', done: !!event },
  { label: 'Configura categorie', href: `/apps/organizer/categories.html?event=${id}`, done: true },
  { label: 'Apri iscrizioni', href: `/apps/organizer/registrations.html?event=${id}`, done: !!event?.registrationsOpen },
  { label: 'Conferma squadre', href: `/apps/organizer/inbox.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') },
  { label: 'Riscuoti quote', href: `/apps/organizer/payments.html?event=${id}`, done: anyPaid },
  { label: 'Configura competizione', href: `/apps/organizer/competition.html?event=${id}`, done: competitionConfigured },
  { label: 'Genera calendario', done: false, disabled: true },
  { label: 'Approva calendario', done: false, disabled: true },
  { label: 'Pubblica evento', done: false, disabled: true },
]

document.getElementById('steps')!.innerHTML = steps.map(s => {
  const inner = s.href && !s.disabled ? `<a href="${s.href}">${s.label}</a>` : `<span>${s.label}</span>`
  return `<li data-done="${s.done}" data-disabled="${s.disabled ? 'true' : 'false'}">${inner}</li>`
}).join('')
